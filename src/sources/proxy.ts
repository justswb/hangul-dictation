/**
 * 개발 프록시(dev-proxy)를 통해 실제 제공자 API에 붙는 OpSource (T27).
 *
 * `dev-proxy`의 `/ask`는 ndjson 한 줄씩 `{"t":"text","v":"..."}` /
 * `{"t":"error",...}` / `{"t":"done"}`을 낸다. `text`의 `v`는 보드 op
 * NDJSON 조각이라 T18 파서(`createNdjsonParser`)에 그대로 흘려보내고,
 * 파서가 완성된 줄을 인식할 때마다 `op` 이벤트로 옮긴다.
 */
import type { AppErrorKind, AskRequest, OpEvent, OpSource } from '../contracts/op-source.ts';
import type { Op } from '../contracts/ops.ts';
import { createNdjsonParser } from '../ops/ndjson.ts';

const ERROR_KINDS = new Set<AppErrorKind>(['network', 'auth', 'rate_limit', 'server', 'refusal', 'stream_cut']);

type ProxyLine = { t: 'text'; v: string } | { t: 'error'; kind?: string } | { t: 'done' };

function parseProxyLine(line: string): ProxyLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { t } = value as Record<string, unknown>;
  if (t === 'text') {
    const { v } = value as Record<string, unknown>;
    return typeof v === 'string' ? { t: 'text', v } : null;
  }
  if (t === 'error') {
    const { kind } = value as Record<string, unknown>;
    return { t: 'error', kind: typeof kind === 'string' ? kind : undefined };
  }
  if (t === 'done') return { t: 'done' };
  return null;
}

function toErrorKind(kind: string | undefined): AppErrorKind {
  return kind !== undefined && ERROR_KINDS.has(kind as AppErrorKind) ? (kind as AppErrorKind) : 'server';
}

export function createProxyOpSource({ baseUrl, provider }: { baseUrl: string; provider: string }): OpSource {
  let controller: AbortController | null = null;

  function cancel(): void {
    controller?.abort();
  }

  async function* start(req: AskRequest): AsyncIterable<OpEvent> {
    const ac = new AbortController();
    controller = ac;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, question: req.question, history: req.history, pageSummary: req.pageSummary }),
        signal: ac.signal,
      });
    } catch {
      if (ac.signal.aborted) return;
      yield { type: 'error', error: { kind: 'network' } };
      return;
    }

    if (!res.ok || !res.body) {
      yield { type: 'error', error: { kind: 'network' } };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let pending: Op[] = [];
    const parser = createNdjsonParser({
      onOp: (op) => pending.push(op),
      onInvalid: () => {
        // 잘못된 op 줄은 무시한다 (docs/errors.md).
      },
    });

    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch {
          if (ac.signal.aborted) return;
          yield { type: 'error', error: { kind: 'network' } };
          return;
        }

        if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');
          if (line.trim() === '') continue;

          const proxyLine = parseProxyLine(line);
          if (proxyLine === null) continue;

          if (proxyLine.t === 'text') {
            pending = [];
            parser.push(proxyLine.v);
            for (const op of pending) yield { type: 'op', op };
          } else if (proxyLine.t === 'error') {
            yield { type: 'error', error: { kind: toErrorKind(proxyLine.kind) } };
            return;
          } else {
            yield { type: 'done' };
            return;
          }
        }

        if (chunk.done) return;
      }
    } finally {
      reader.releaseLock();
    }
  }

  return { start, cancel };
}

/**
 * dev-proxy `/ask`를 호출해 ndjson 스트림을 소비하는 얇은 클라이언트 (T31).
 *
 * `src/sources/proxy.ts`(T27)와 같은 프록시 envelope(`t:"text"|"error"|"done"`)을
 * 다루지만, 브라우저 전용 API(fetch 스트림)만 재사용하고 타이밍 계측이 필요해
 * 별도로 둔다. op 줄 파싱·검증은 `src/ops/ndjson.ts`의 `createNdjsonParser`를
 * 그대로 쓴다.
 */
import type { AppErrorKind } from '../src/contracts/op-source.ts';
import type { Op } from '../src/contracts/ops.ts';
import { createNdjsonParser } from '../src/ops/ndjson.ts';

export type Turn = { question: string; ops: string[] };

const ERROR_KINDS = new Set<AppErrorKind>(['network', 'auth', 'rate_limit', 'server', 'refusal', 'stream_cut']);

function toErrorKind(kind: string | undefined): AppErrorKind {
  return kind !== undefined && ERROR_KINDS.has(kind as AppErrorKind) ? (kind as AppErrorKind) : 'server';
}

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

/** 질문 하나에 대한 응답 원본과 계측값. */
export type AskResult = {
  /** 프록시가 낸 원본 ndjson 줄 (t:text/error/done), 순서대로. */
  rawLines: string[];
  /** 유효한 op의 NDJSON 줄 (검증 통과), 순서대로. */
  opLines: string[];
  /** 파싱된 op, opLines와 같은 순서. */
  ops: Op[];
  /** 검증에 실패한 줄과 사유. */
  invalid: { line: string; reason: string }[];
  /** 요청 시작부터 첫 유효 op가 파싱될 때까지(ms). op가 없으면 null. */
  firstOpMs: number | null;
  /** 요청 시작부터 스트림이 끝날 때까지(ms). */
  totalMs: number;
  /** 프록시가 error를 냈으면 그 종류, 아니면 null. */
  errorKind: AppErrorKind | null;
};

export type AskProxyOptions = {
  baseUrl: string;
  provider: string;
  question: string;
  history: Turn[];
  pageSummary: string;
  /** 계측용 시계. 기본은 Date.now. */
  now?: () => number;
  /** 테스트 주입용 fetch. 기본은 전역 fetch. */
  fetchImpl?: typeof fetch;
};

/** dev-proxy `/ask`에 질문 하나를 보내고 스트림을 끝까지 소비한다. */
export async function askProxy({
  baseUrl,
  provider,
  question,
  history,
  pageSummary,
  now = Date.now,
  fetchImpl = fetch,
}: AskProxyOptions): Promise<AskResult> {
  const start = now();
  const rawLines: string[] = [];
  const opLines: string[] = [];
  const ops: Op[] = [];
  const invalid: { line: string; reason: string }[] = [];
  let firstOpMs: number | null = null;
  let errorKind: AppErrorKind | null = null;

  const parser = createNdjsonParser({
    onOp: (op) => {
      // JSON.stringify(op)는 session.ts의 toLine()과 같은 방식으로 재구성한
      // 정규화된 한 줄이다 (원본 바이트와 다를 수 있으나 값은 동일하다).
      opLines.push(JSON.stringify(op));
      ops.push(op);
      if (firstOpMs === null) firstOpMs = now() - start;
    },
    onInvalid: (line, reason) => {
      invalid.push({ line, reason });
    },
  });

  const res = await fetchImpl(`${baseUrl}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, question, history, pageSummary }),
  });

  if (!res.ok || !res.body) {
    return { rawLines, opLines, ops, invalid, firstOpMs: null, totalMs: now() - start, errorKind: 'network' };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (line.trim() === '') continue;

        rawLines.push(line);
        const proxyLine = parseProxyLine(line);
        if (proxyLine === null) continue;
        if (proxyLine.t === 'text') {
          parser.push(proxyLine.v);
        } else if (proxyLine.t === 'error') {
          errorKind = toErrorKind(proxyLine.kind);
        }
      }

      if (chunk.done) break;
    }
  } finally {
    reader.releaseLock();
  }

  parser.end();
  return { rawLines, opLines, ops, invalid, firstOpMs, totalMs: now() - start, errorKind };
}

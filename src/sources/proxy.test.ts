import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskRequest, OpEvent } from '../contracts/op-source.ts';
import { createProxyOpSource } from './proxy.ts';

const req: AskRequest = { question: 'q', history: [], pageSummary: '' };

/** lines를 한 chunk마다 하나씩 흘려보내는 가짜 fetch Response를 만든다. */
function fakeResponse(lines: string[], { ok = true }: { ok?: boolean } = {}): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= lines.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${lines[i]}\n`));
      i += 1;
    },
  });
  return { ok, body } as unknown as Response;
}

/** chunks를 있는 그대로(줄바꿈을 붙이지 않고) 흘려보내는 가짜 fetch Response를 만든다. */
function fakeRawResponse(chunks: string[], { ok = true }: { ok?: boolean } = {}): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
  return { ok, body } as unknown as Response;
}

async function collect(iterable: AsyncIterable<OpEvent>): Promise<OpEvent[]> {
  const events: OpEvent[] = [];
  for await (const ev of iterable) events.push(ev);
  return events;
}

describe('createProxyOpSource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('text 줄의 op 조각을 파싱해 op 이벤트로 옮기고 마지막은 done', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse([
        JSON.stringify({ t: 'text', v: '{"op":"plan","lines":1}\n' }),
        JSON.stringify({ t: 'text', v: '{"op":"write","id":"a","text":"hi","size":"body"}\n' }),
        JSON.stringify({ t: 'done' }),
      ]),
    );

    const source = createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: 'claude' });
    const events = await collect(source.start(req));

    expect(events).toEqual([
      { type: 'op', op: { op: 'plan', lines: 1 } },
      { type: 'op', op: { op: 'write', id: 'a', text: 'hi', size: 'body' } },
      { type: 'done' },
    ]);
  });

  it('한 op 조각이 여러 text 줄에 걸쳐 와도(청크 분할) 하나의 op로 합쳐진다', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse([
        JSON.stringify({ t: 'text', v: '{"op":"write","id":"a",' }),
        JSON.stringify({ t: 'text', v: '"text":"hi","size":"body"}\n' }),
        JSON.stringify({ t: 'done' }),
      ]),
    );

    const source = createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: 'claude' });
    const events = await collect(source.start(req));

    expect(events).toEqual([{ type: 'op', op: { op: 'write', id: 'a', text: 'hi', size: 'body' } }, { type: 'done' }]);
  });

  it('error 줄을 받으면 error 이벤트를 내고 끝낸다', async () => {
    fetchMock.mockResolvedValue(fakeResponse([JSON.stringify({ t: 'error', kind: 'server' })]));

    const source = createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: 'claude' });
    const events = await collect(source.start(req));

    expect(events).toEqual([{ type: 'error', error: { kind: 'server' } }]);
  });

  it('fetch 자체가 실패하면 network 오류를 낸다', async () => {
    fetchMock.mockRejectedValue(new Error('연결 실패'));

    const source = createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: 'claude' });
    const events = await collect(source.start(req));

    expect(events).toEqual([{ type: 'error', error: { kind: 'network' } }]);
  });

  it('cancel()은 진행 중인 요청의 AbortController를 abort한다', async () => {
    let capturedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      capturedSignal = init.signal ?? undefined;
      return new Promise(() => {
        // 응답이 오지 않는 상태를 흉내낸다.
      });
    });

    const source = createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: 'claude' });
    void collect(source.start(req));
    await Promise.resolve();

    expect(capturedSignal?.aborted).toBe(false);
    source.cancel();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('마지막 줄에 줄바꿈이 없어도 정상 처리한다', async () => {
    fetchMock.mockResolvedValue(
      fakeRawResponse([
        `${JSON.stringify({ t: 'text', v: '{"op":"plan","lines":1}\n' })}\n`,
        // 마지막 청크에 줄바꿈이 없다.
        JSON.stringify({ t: 'done' }),
      ]),
    );

    const source = createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: 'claude' });
    const events = await collect(source.start(req));

    expect(events).toEqual([{ type: 'op', op: { op: 'plan', lines: 1 } }, { type: 'done' }]);
  });

  it('done/error 없이 스트림이 끝나면 stream_cut 오류 1개를 낸다', async () => {
    fetchMock.mockResolvedValue(
      fakeRawResponse([`${JSON.stringify({ t: 'text', v: '{"op":"plan","lines":1}\n' })}\n`]),
    );

    const source = createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: 'claude' });
    const events = await collect(source.start(req));

    expect(events).toEqual([
      { type: 'op', op: { op: 'plan', lines: 1 } },
      { type: 'error', error: { kind: 'stream_cut' } },
    ]);
  });
});

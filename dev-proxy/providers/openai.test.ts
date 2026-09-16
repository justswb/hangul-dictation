import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { streamText, toTextChunks, type OpenAIStream } from './openai.ts';
import { toEvents } from '../stream.ts';
import type { AskBody } from '../build-messages.ts';

const req: AskBody = { provider: 'openai', question: 'q', history: [], pageSummary: '' };

function textDelta(delta: string): ResponseStreamEvent {
  return { type: 'response.output_text.delta', delta } as ResponseStreamEvent;
}

function fakeStream(events: ResponseStreamEvent[], abort = vi.fn()): OpenAIStream {
  return {
    controller: { abort },
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

/** `streamText`의 `client` 자리에 넣을, `responses.create`만 흉내 낸 가짜 클라이언트. */
function fakeClient(stream: OpenAIStream) {
  const create = vi.fn(async () => stream);
  return { client: { responses: { create } } as unknown as Parameters<typeof streamText>[2], create };
}

describe('openai toTextChunks', () => {
  it('텍스트 델타 조각을 순서대로 낸다', async () => {
    const stream = fakeStream([textDelta('안'), textDelta('녕'), { type: 'response.completed' } as ResponseStreamEvent]);

    const chunks = [];
    for await (const chunk of toTextChunks(stream)) chunks.push(chunk);

    expect(chunks).toEqual(['안', '녕']);
  });

  it('signal이 중단되면 stream.controller.abort()를 호출한다', async () => {
    const abort = vi.fn();
    const controller = new AbortController();
    let resolveSecond: (() => void) | undefined;

    const stream: OpenAIStream = {
      controller: { abort },
      async *[Symbol.asyncIterator]() {
        yield textDelta('처음');
        await new Promise<void>((resolve) => {
          resolveSecond = resolve;
        });
      },
    };

    const gen = toTextChunks(stream, controller.signal);
    const first = await gen.next();
    expect(first.value).toBe('처음');

    controller.abort();
    expect(abort).toHaveBeenCalledTimes(1);

    resolveSecond?.();
    await gen.return(undefined);
  });
});

describe('openai streamText', () => {
  const originalModel = process.env.OPENAI_MODEL;

  afterEach(() => {
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
    vi.restoreAllMocks();
  });

  it('가짜 OpenAI 스트림 → text 이벤트 순서, done', async () => {
    process.env.OPENAI_MODEL = 'gpt-test';
    const { client } = fakeClient(fakeStream([textDelta('안'), textDelta('녕')]));

    const events = [];
    for await (const ev of toEvents(streamText(req, undefined, client))) events.push(ev);

    expect(events).toEqual([
      { t: 'text', v: '안' },
      { t: 'text', v: '녕' },
      { t: 'done' },
    ]);
  });

  it('OPENAI_MODEL 없음 → error 이벤트, 서버 로그에 "OPENAI_MODEL 미설정"', async () => {
    delete process.env.OPENAI_MODEL;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, create } = fakeClient(fakeStream([]));

    const events = [];
    for await (const ev of toEvents(streamText(req, undefined, client))) events.push(ev);

    expect(events).toEqual([{ t: 'error', kind: 'server' }]);
    expect(create).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('OPENAI_MODEL 미설정');
  });
});

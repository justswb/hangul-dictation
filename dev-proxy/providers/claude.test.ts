import { describe, expect, it, vi } from 'vitest';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources';
import { toTextChunks, type AnthropicStream } from './claude.ts';
import { toEvents } from '../stream.ts';

function textDelta(text: string): RawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text },
  } as RawMessageStreamEvent;
}

function fakeStream(events: RawMessageStreamEvent[], abort = vi.fn()): AnthropicStream {
  return {
    abort,
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

describe('claude toTextChunks', () => {
  it('텍스트 델타 조각을 순서대로 낸다', async () => {
    const stream = fakeStream([textDelta('안'), textDelta('녕'), { type: 'message_stop' } as RawMessageStreamEvent]);

    const chunks = [];
    for await (const chunk of toTextChunks(stream)) chunks.push(chunk);

    expect(chunks).toEqual(['안', '녕']);
  });

  it('stream.ts의 toEvents와 합치면 text 이벤트 순서 + done을 낸다', async () => {
    const stream = fakeStream([textDelta('안'), textDelta('녕')]);

    const events = [];
    for await (const ev of toEvents(toTextChunks(stream))) events.push(ev);

    expect(events).toEqual([
      { t: 'text', v: '안' },
      { t: 'text', v: '녕' },
      { t: 'done' },
    ]);
  });

  it('스트림이 던지면 그대로 던진다 (toEvents가 error(server)로 바꾼다)', async () => {
    const stream: AnthropicStream = {
      abort: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield textDelta('일부');
        throw new Error('네트워크 끊김');
      },
    };

    const events = [];
    for await (const ev of toEvents(toTextChunks(stream))) events.push(ev);

    expect(events).toEqual([{ t: 'text', v: '일부' }, { t: 'error', kind: 'server' }]);
  });

  it('signal이 중단되면 stream.abort()를 호출한다', async () => {
    const abort = vi.fn();
    const controller = new AbortController();
    let resolveSecond: (() => void) | undefined;

    const stream: AnthropicStream = {
      abort,
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

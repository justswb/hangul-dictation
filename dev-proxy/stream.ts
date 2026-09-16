/**
 * Anthropic 메시지 스트림 → ndjson 이벤트 변환 (T27).
 *
 * `client.messages.stream(...)`이 돌려주는 것과 같은 모양(비동기 반복 가능 +
 * abort())만 있으면 되므로, 테스트에서는 실제 SDK 대신 가짜 스트림을 넣는다.
 */
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources';

/** 응답 이벤트 한 줄. 오류 세부 매핑은 T30에서 다룬다. */
export type ProxyEvent = { t: 'text'; v: string } | { t: 'error'; kind: 'server' } | { t: 'done' };

/** client.messages.stream()이 돌려주는 것 중 여기서 쓰는 부분만. */
export interface AnthropicStream extends AsyncIterable<RawMessageStreamEvent> {
  abort(): void;
}

/**
 * SDK 스트림의 텍스트 델타만 `text` 이벤트로 옮기고, 끝나면 `done`,
 * 도중에 오류가 나면 `error`를 낸다. signal이 중단되면 제공자 스트림도 취소한다.
 */
export async function* streamToEvents(stream: AnthropicStream, signal?: AbortSignal): AsyncGenerator<ProxyEvent> {
  const onAbort = (): void => stream.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { t: 'text', v: event.delta.text };
      }
    }
    yield { t: 'done' };
  } catch {
    yield { t: 'error', kind: 'server' };
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

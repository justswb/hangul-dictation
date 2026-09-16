/**
 * Claude 제공자 (T27, T28에서 `providers/`로 분리). Anthropic 공식 SDK의
 * `client.messages.stream(...)`으로 스트리밍 텍스트를 생성한다.
 *
 * T30(이슈 #36): 거절 응답은 스트리밍 `message_delta` 이벤트의
 * `delta.stop_reason === 'refusal'`로 온다
 * (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` 2079~2100,
 * 2256행) — 텍스트가 아니므로 공통 오류(`ProviderError('refusal')`)로 던져
 * `dev-proxy/stream.ts`가 `error` 이벤트로 바꾸게 한다. SDK 자체 재시도는
 * `dev-proxy/errors.ts`의 재시도와 합쳐 과도해지지 않도록 `maxRetries: 0`으로 끈다
 * (옵션 근거: `node_modules/@anthropic-ai/sdk/src/client.ts` 510, 606행).
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources';
import { MAX_TOKENS, MODEL, SYSTEM_PROMPT_PATH, THINKING } from '../config.ts';
import { buildMessages, type AskBody } from '../build-messages.ts';
import { ProviderError } from '../errors.ts';

function readSystemPrompt(): string {
  try {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
  } catch {
    return '';
  }
}

/** `client.messages.stream()`이 돌려주는 것 중 여기서 쓰는 부분만. */
export interface AnthropicStream extends AsyncIterable<RawMessageStreamEvent> {
  abort(): void;
}

/**
 * SDK 스트림의 텍스트 델타만 순서대로 낸다. signal이 중단되면 제공자 스트림도 취소한다.
 * 도중에 스트림이 던지면 그대로 던진다(호출자가 오류로 다룬다).
 */
export async function* toTextChunks(stream: AnthropicStream, signal?: AbortSignal): AsyncGenerator<string> {
  const onAbort = (): void => stream.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      } else if (event.type === 'message_delta' && event.delta.stop_reason === 'refusal') {
        throw new ProviderError('refusal');
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function* streamText(
  req: AskBody,
  signal?: AbortSignal,
  client: Anthropic = new Anthropic({ maxRetries: 0 }),
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: THINKING,
    system: readSystemPrompt(),
    messages: buildMessages(req),
  });

  yield* toTextChunks(stream, signal);
}

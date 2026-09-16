/**
 * Claude 제공자 (T27, T28에서 `providers/`로 분리). Anthropic 공식 SDK의
 * `client.messages.stream(...)`으로 스트리밍 텍스트를 생성한다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources';
import { MAX_TOKENS, MODEL, SYSTEM_PROMPT_PATH, THINKING } from '../config.ts';
import { buildMessages, type AskBody } from '../build-messages.ts';

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
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function* streamText(
  req: AskBody,
  signal?: AbortSignal,
  client: Anthropic = new Anthropic(),
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

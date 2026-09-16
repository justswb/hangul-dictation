/**
 * OpenAI 제공자 (T28). 공식 SDK(`openai`)의 Responses API 스트리밍을 사용한다.
 *
 * 근거: `node_modules/openai/README.md`의 "Usage"·"Streaming responses" 절.
 * README는 "The primary API for interacting with OpenAI models is the
 * [Responses API]"라고 명시하고, Chat Completions는 "The previous standard
 * (supported indefinitely)"로 소개한다. 스트리밍은
 * `client.responses.create({ ..., stream: true })`로 시작해 `for await`로
 * `ResponseStreamEvent`를 순회하는 방식을 예시로 든다
 * (README 60~103, 233~252줄; https://platform.openai.com/docs/api-reference/responses).
 * 텍스트 델타는 `type: 'response.output_text.delta'`, `delta: string` 형태의
 * `ResponseTextDeltaEvent`로 온다 (`node_modules/openai/resources/responses/responses.d.ts`).
 */
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { SYSTEM_PROMPT_PATH } from '../config.ts';
import { buildMessages, type AskBody } from '../build-messages.ts';

function readSystemPrompt(): string {
  try {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
  } catch {
    return '';
  }
}

/** `client.responses.create({ stream: true })`이 돌려주는 것 중 여기서 쓰는 부분만. */
export interface OpenAIStream extends AsyncIterable<ResponseStreamEvent> {
  controller: { abort(): void };
}

/**
 * SDK 스트림의 텍스트 델타만 순서대로 낸다. signal이 중단되면 제공자 스트림도 취소한다.
 * 도중에 스트림이 던지면 그대로 던진다(호출자가 오류로 다룬다).
 */
export async function* toTextChunks(stream: OpenAIStream, signal?: AbortSignal): AsyncGenerator<string> {
  const onAbort = (): void => stream.controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield event.delta;
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function* streamText(
  req: AskBody,
  signal?: AbortSignal,
  client: OpenAI = new OpenAI(),
): AsyncGenerator<string> {
  const model = process.env.OPENAI_MODEL;
  if (!model) {
    console.error('OPENAI_MODEL 미설정');
    throw new Error('OPENAI_MODEL 미설정');
  }

  const stream = await client.responses.create({
    model,
    instructions: readSystemPrompt(),
    input: buildMessages(req),
    stream: true,
  });

  yield* toTextChunks(stream, signal);
}

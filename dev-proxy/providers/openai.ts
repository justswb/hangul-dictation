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
 *
 * T30(이슈 #36):
 * - 거절 텍스트는 `response.refusal.delta`/`response.refusal.done` 이벤트로 온다
 *   (`responses.d.ts` 5925~5980행) — 텍스트가 아니므로 `ProviderError('refusal')`로
 *   던져 `dev-proxy/stream.ts`가 `error` 이벤트로 바꾸게 한다.
 * - T28 리뷰 결함 수정: 스트림 루프가 `response.output_text.delta` 외 이벤트를 모두
 *   무시해서, 스트림이 텍스트 델타 없이 `error`(`ResponseErrorEvent`, 2408~2429행)·
 *   `response.failed`(`ResponseFailedEvent`, 2433~2446행)·`response.incomplete`
 *   (`ResponseIncompleteEvent`, 3266~3279행)로 끝나도 제너레이터가 그냥 끝나 버려
 *   서버가 `done`을 보내는 문제가 있었다. 이제 이 세 이벤트를 만나면 공통 오류로
 *   던진다. `ResponseError.code`(2367~2375행, 고정된 값 목록)로 판별 가능한
 *   범위에서 `rate_limit`/`refusal`로 나누고, 그 밖에는 `server`로 기본 처리한다
 *   (메시지 문자열이 아니라 구조화된 `code` 값으로만 판별).
 * - SDK 자체 재시도는 `dev-proxy/errors.ts`의 재시도와 합쳐 과도해지지 않도록
 *   `maxRetries: 0`으로 끈다(옵션 근거: `node_modules/openai/src/client.ts` 394, 504행).
 * - `OPENAI_MODEL` 미설정처럼 다시 시도해도 똑같이 실패하는 오류는
 *   `ProviderError({ retryable: false })`로 표시해 `withRetry`가 재시도하지 않게 한다.
 */
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { SYSTEM_PROMPT_PATH } from '../config.ts';
import { buildMessages, type AskBody } from '../build-messages.ts';
import { ProviderError, type AppErrorKind } from '../errors.ts';

/** OpenAI 최상위 `error` 이벤트·`response.failed`의 `Response.error.code` 분류. */
const RATE_LIMIT_ERROR_CODES: ReadonlySet<string> = new Set(['rate_limit_exceeded']);
const REFUSAL_ERROR_CODES: ReadonlySet<string> = new Set(['bio_policy', 'misalignment_policy_violation']);

function classifyResponseErrorCode(code: string | null | undefined): AppErrorKind {
  if (code && RATE_LIMIT_ERROR_CODES.has(code)) return 'rate_limit';
  if (code && REFUSAL_ERROR_CODES.has(code)) return 'refusal';
  return 'server';
}

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
      } else if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') {
        throw new ProviderError('refusal');
      } else if (event.type === 'error') {
        // 실제 SDK는 서버 전송 이벤트(SSE) `error`를 받으면 스트림을 소비하기도
        // 전에 스스로 `APIError`를 던지도록 구현돼 있어(공식 SDK 내부 파서), 이
        // 분기가 실행되는 경우는 거의 없다. 그래도 방어적으로 남겨 둔다(예: 다른
        // SDK 버전이나 테스트에서 이 이벤트를 직접 흘려보내는 경우).
        throw new ProviderError(classifyResponseErrorCode(event.code));
      } else if (event.type === 'response.failed') {
        throw new ProviderError(classifyResponseErrorCode(event.response.error?.code));
      } else if (event.type === 'response.incomplete') {
        const reason = event.response.incomplete_details?.reason;
        throw new ProviderError(reason === 'content_filter' ? 'refusal' : 'server');
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function* streamText(
  req: AskBody,
  signal?: AbortSignal,
  client: OpenAI = new OpenAI({ maxRetries: 0 }),
): AsyncGenerator<string> {
  const model = process.env.OPENAI_MODEL;
  if (!model) {
    console.error('OPENAI_MODEL 미설정');
    // 설정 오류는 다시 시도해도 똑같이 실패하므로 재시도 대상에서 뺀다.
    throw new ProviderError('server', 'OPENAI_MODEL 미설정', { retryable: false });
  }

  const stream = await client.responses.create({
    model,
    instructions: readSystemPrompt(),
    input: buildMessages(req),
    stream: true,
  });

  yield* toTextChunks(stream, signal);
}

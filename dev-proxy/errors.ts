/**
 * 제공자별 SDK 오류(Anthropic/OpenAI) → 공통 오류 유형(AppErrorKind) 변환, 그리고
 * 첫 텍스트 이벤트 전 오류에 대한 재시도 (T30, 이슈 #36).
 *
 * 판별은 각 SDK가 던지는 오류 클래스·HTTP 상태 코드로만 한다 (메시지 문자열 비교 금지).
 * 확인 근거:
 * - `node_modules/@anthropic-ai/sdk/src/core/error.ts`, `node_modules/openai/src/core/error.ts`:
 *   양쪽 SDK 모두 `APIError.generate(status, ...)`에서 401→`AuthenticationError`,
 *   403→`PermissionDeniedError`, 429→`RateLimitError`, 5xx→`InternalServerError`로 분기하고,
 *   `status`·`headers`가 없으면(연결 실패) `APIConnectionError`를 던진다.
 *   `APIConnectionTimeoutError`는 `APIConnectionError`를 상속한다.
 *   두 클래스 모두 각 SDK의 최상위 진입점(`node_modules/@anthropic-ai/sdk/index.d.ts`,
 *   `node_modules/openai/index.d.ts`)에서 그대로 내보낸다.
 * - `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`: `StopReason`에
 *   `'refusal'`이 있고(2256행), 스트리밍 `message_delta` 이벤트의
 *   `RawMessageDeltaEvent.delta.stop_reason`으로 온다(2079~2100행).
 * - `node_modules/openai/resources/responses/responses.d.ts`: 거절 텍스트는
 *   `response.refusal.delta`/`response.refusal.done` 이벤트로 오고(5925~5980행),
 *   최상위 `error` 이벤트(`ResponseErrorEvent`, 2408행)·`response.failed`
 *   (`ResponseFailedEvent`, 2433행)·`response.incomplete`(`ResponseIncompleteEvent`,
 *   3266행)는 스트림이 텍스트 델타 없이 끝나는 실패 상황을 나타낸다. 이 부분은
 *   `dev-proxy/providers/openai.ts`가 판별해 `ProviderError`로 던진다.
 * - 두 SDK 모두 클라이언트 생성자 옵션 `maxRetries`(기본 2)로 자체 재시도 횟수를
 *   조절한다(`node_modules/@anthropic-ai/sdk/src/client.ts`,
 *   `node_modules/openai/src/client.ts`). 여기서 하는 재시도와 합쳐 과도해지지
 *   않도록 `dev-proxy/providers/*.ts`가 클라이언트를 `maxRetries: 0`으로 만든다.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/** 프록시가 클라이언트에 보내는 공통 오류 유형. */
export type AppErrorKind = 'auth' | 'rate_limit' | 'network' | 'server' | 'refusal' | 'stream_cut';

/**
 * 제공자가 SDK 오류가 아닌 공통 상황(거절, 스트림 중단 등)을 나타낼 때 던지는 오류.
 * `classifyProviderError`가 이 오류를 만나면 `kind`를 그대로 쓴다.
 *
 * `retryable`은 재시도 가능 여부를 명시적으로 못 박고 싶을 때만 쓴다(예: 설정
 * 오류처럼 다시 해 봐야 똑같이 실패하는 경우 `false`). 지정하지 않으면
 * `withRetry`가 `kind`·(있다면) 원인 오류의 상태 코드로 알아서 판단한다.
 */
export class ProviderError extends Error {
  readonly kind: AppErrorKind;
  readonly retryable?: boolean;

  constructor(kind: AppErrorKind, message?: string, options?: { cause?: unknown; retryable?: boolean }) {
    super(message ?? kind, options);
    this.kind = kind;
    this.retryable = options?.retryable;
  }
}

/** 첫 텍스트 이벤트 전에 한해 재시도할 수 있는 오류 유형(그 안에서도 `isRetryable`로 한 번 더 거른다). */
const RETRYABLE_KINDS: ReadonlySet<AppErrorKind> = new Set(['network', 'rate_limit', 'server']);

/**
 * 오류를 공통 유형으로 분류한다. 판별 기준은 상단 주석의 확인 근거 참고.
 * 어느 것에도 해당하지 않는 오류(비SDK 예외 포함)는 `server`로 취급한다.
 */
export function classifyProviderError(err: unknown): AppErrorKind {
  if (err instanceof ProviderError) return err.kind;

  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof OpenAI.AuthenticationError ||
    err instanceof OpenAI.PermissionDeniedError
  ) {
    return 'auth';
  }

  if (err instanceof Anthropic.RateLimitError || err instanceof OpenAI.RateLimitError) {
    return 'rate_limit';
  }

  // APIConnectionTimeoutError는 APIConnectionError를 상속하므로 함께 잡힌다.
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return 'network';
  }

  return 'server';
}

/**
 * `kind`가 재시도 대상 종류이더라도, 다시 시도해 봐야 똑같이 실패할 오류는 걸러낸다.
 * - `ProviderError`가 `retryable`을 명시했으면 그 값을 그대로 따른다(예: 설정 누락).
 * - `server`로 분류된 SDK 오류 중 상태 코드가 4xx(401/403/429는 이미 auth/rate_limit로
 *   따로 분류되므로 여기 오지 않는다)인 것은 요청 자체가 잘못된 것이므로 재시도하지 않는다.
 *   5xx나 상태 코드가 없는 연결 오류는 그대로 재시도 대상이다.
 */
function isRetryable(err: unknown, kind: AppErrorKind): boolean {
  if (err instanceof ProviderError && err.retryable !== undefined) return err.retryable;
  if (!RETRYABLE_KINDS.has(kind)) return false;

  if (kind === 'server') {
    const status = (err as { status?: unknown } | null | undefined)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return false;
  }

  return true;
}

/** `ms` 동안 기다리되, `signal`이 중단되면 즉시 끝낸다(재시도를 멈출 수 있도록). 정상 종료 시 abort 리스너를 해제해 남기지 않는다. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 첫 텍스트 조각이 나오기 전에 생긴, 재시도해 볼 만한 `network`·`rate_limit`·`server`
 * 오류만 `delaysMs.length`번까지 재시도한다(제공자 SDK 자체 재시도는 꺼 둔 상태를
 * 전제로 한다. `isRetryable` 참고).
 *
 * 텍스트를 이미 하나라도 낸 뒤에 오류가 나면 재시도하지 않는다. 이때 오류가 거절
 * (`refusal`)이면 그 자체가 최종 응답이므로 `refusal`로 그대로 던지고(Claude는 거절을
 * 스트림 끝 `message_delta`로 알려 주므로 보통 텍스트 뒤에 온다), 그 밖의 오류는
 * `stream_cut`으로 바꿔 던진다.
 *
 * `signal`이 중단되면 대기를 즉시 끝내고 재시도 없이 마지막 오류를 던진다.
 */
export async function* withRetry(
  makeStream: () => AsyncIterable<string>,
  signal?: AbortSignal,
  delaysMs: readonly number[] = [500, 1000],
): AsyncGenerator<string> {
  let attempt = 0;

  for (;;) {
    let hadText = false;
    try {
      for await (const chunk of makeStream()) {
        hadText = true;
        yield chunk;
      }
      return;
    } catch (err) {
      if (hadText) {
        if (classifyProviderError(err) === 'refusal') throw err;
        throw new ProviderError('stream_cut', undefined, { cause: err });
      }

      const kind = classifyProviderError(err);
      const nextDelay = delaysMs[attempt];
      if (!isRetryable(err, kind) || nextDelay === undefined || signal?.aborted) {
        throw err;
      }

      await delay(nextDelay, signal);
      if (signal?.aborted) throw err;
      attempt += 1;
    }
  }
}

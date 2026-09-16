/**
 * 텍스트 조각 스트림 → ndjson 이벤트 변환 (T27; T28에서 제공자 중립으로 일반화;
 * T30에서 오류 세부 매핑을 `errors.ts`에 위임).
 *
 * 제공자별 SDK 스트림 → 텍스트 조각 변환은 `dev-proxy/providers/*.ts`가 맡는다.
 * 이 파일은 그 결과(`AsyncIterable<string>`)를 받아 `text`/`done`/`error` 이벤트로
 * 바꾸는, 제공자에 의존하지 않는 공통 로직만 담당한다. 오류를 어떤 `kind`로 볼지는
 * `errors.ts`의 `classifyProviderError`가 정한다(재시도·`stream_cut` 판단은
 * `server.ts`가 연결하는 `withRetry`가 미리 처리한다).
 */
import { classifyProviderError, type AppErrorKind } from './errors.ts';

/** 응답 이벤트 한 줄. */
export type ProxyEvent = { t: 'text'; v: string } | { t: 'error'; kind: AppErrorKind } | { t: 'done' };

/**
 * 텍스트 조각을 `text` 이벤트로 옮기고, 끝나면 `done`, 도중에 오류가 나면 `error`를 낸다.
 */
export async function* toEvents(chunks: AsyncIterable<string>): AsyncGenerator<ProxyEvent> {
  try {
    for await (const chunk of chunks) {
      yield { t: 'text', v: chunk };
    }
    yield { t: 'done' };
  } catch (err) {
    yield { t: 'error', kind: classifyProviderError(err) };
  }
}

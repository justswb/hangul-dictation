/**
 * 제공자 공통 인터페이스 (T28). `dev-proxy/providers/*.ts` 각 파일은 이 시그니처를
 * 만족하는 `streamText`를 내보낸다. 서버(`server.ts`)는 `req.provider` 값으로 어느
 * `streamText`를 쓸지 고른 뒤, 공통 변환 함수(`stream.ts`의 `toEvents`)로 ndjson
 * 이벤트를 만든다.
 */
import type { AskBody } from '../build-messages.ts';

/**
 * 요청을 받아 텍스트 조각을 순서대로 내는 비동기 반복자를 돌려준다.
 * `signal`이 중단되면 내부 제공자 스트림도 취소해야 한다.
 * 도중에 오류가 나면(제공자 스트림이 던지면) 예외를 던진다 — `stream.ts`의
 * `toEvents`가 이를 `error` 이벤트로 바꾼다.
 */
export type StreamText = (req: AskBody, signal?: AbortSignal) => AsyncIterable<string>;

import type { Op } from './ops.ts';

/** 제공자와 무관한 공통 오류 종류 (docs/errors.md). */
export type AppErrorKind = 'network' | 'auth' | 'rate_limit' | 'server' | 'refusal' | 'stream_cut';

/** 공통 오류. message는 로그용이며 키·요청 본문을 담지 않는다. */
export type AppError = { kind: AppErrorKind; message?: string };

/** 대화 이력 한 턴: 질문과 실제로 그려진 op의 NDJSON 줄. */
export type Turn = { question: string; ops: string[] };

/** AI에 보내는 요청. */
export type AskRequest = { question: string; history: Turn[]; pageSummary: string };

/** OpSource가 내보내는 이벤트. done 또는 error 뒤에는 이벤트가 없다. */
export type OpEvent =
  | { type: 'op'; op: Op }
  | { type: 'error'; error: AppError }
  | { type: 'done' };

/** op 스트림 공급자. 구현: 가짜 스트림 / 개발 프록시 / Tauri. */
export interface OpSource {
  /** 요청을 시작하고 이벤트를 순서대로 내보낸다. */
  start(req: AskRequest): AsyncIterable<OpEvent>;
  /** 진행 중 요청을 취소한다. 이후 이벤트는 없다. */
  cancel(): void;
}

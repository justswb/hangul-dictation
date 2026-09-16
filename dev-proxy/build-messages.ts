/**
 * /ask 요청 → 메시지 배열 구성 (T27, T28에서 제공자 중립 타입으로 일반화).
 * 실제 SDK 호출과 분리된 순수 함수라 테스트하기 쉽다.
 *
 * 반환 타입 `ChatMessage`는 Anthropic의 `MessageParam`, OpenAI Responses API의
 * `EasyInputMessage`(둘 다 `{ role, content: string }` 형태를 허용) 양쪽에 구조적으로
 * 대입 가능하다.
 */

/** 대화 이력 한 턴: 질문과 그 턴에서 실제로 그려진 op의 NDJSON 줄. */
export type Turn = { question: string; ops: string[] };

/** /ask 요청 본문. */
export type AskBody = {
  provider: string;
  question: string;
  history: Turn[];
  pageSummary: string;
};

/** 제공자 중립 메시지 한 개. */
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * 이력 턴마다 user(질문) + assistant(ops 줄들)를 만들고,
 * 마지막 user 메시지는 `pageSummary + "\n[질문]\n" + question`으로 구성한다.
 */
export function buildMessages(body: Pick<AskBody, 'question' | 'history' | 'pageSummary'>): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const turn of body.history) {
    messages.push({ role: 'user', content: turn.question });
    // ops가 비어 있으면(오류·중단으로 아무것도 못 그린 턴) assistant content가
    // 빈 문자열이 되어 Anthropic API가 400으로 거부한다. 시스템 프롬프트 규칙
    // "첫 줄은 plan"과도 맞는 유효한 NDJSON 한 줄로 채운다.
    const content = turn.ops.length > 0 ? turn.ops.join('\n') : '{"op":"plan","lines":0}';
    messages.push({ role: 'assistant', content });
  }

  messages.push({ role: 'user', content: `${body.pageSummary}\n[질문]\n${body.question}` });

  return messages;
}

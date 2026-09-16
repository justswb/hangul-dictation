/**
 * /ask 요청 → Anthropic 메시지 배열 구성 (T27). 실제 SDK 호출과 분리된 순수 함수라 테스트하기 쉽다.
 */
import type { MessageParam } from '@anthropic-ai/sdk/resources';

/** 대화 이력 한 턴: 질문과 그 턴에서 실제로 그려진 op의 NDJSON 줄. */
export type Turn = { question: string; ops: string[] };

/** /ask 요청 본문. */
export type AskBody = {
  provider: string;
  question: string;
  history: Turn[];
  pageSummary: string;
};

/**
 * 이력 턴마다 user(질문) + assistant(ops 줄들)를 만들고,
 * 마지막 user 메시지는 `pageSummary + "\n[질문]\n" + question`으로 구성한다.
 */
export function buildMessages(body: Pick<AskBody, 'question' | 'history' | 'pageSummary'>): MessageParam[] {
  const messages: MessageParam[] = [];

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

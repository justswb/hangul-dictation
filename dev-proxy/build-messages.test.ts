import { describe, expect, it } from 'vitest';
import { buildMessages } from './build-messages.ts';

describe('buildMessages', () => {
  it('이력 1턴 + 새 질문이면 user/assistant/user 순서로 만든다', () => {
    const messages = buildMessages({
      question: '이제 UDP는?',
      pageSummary: '[보드] TCP 3-way handshake',
      history: [{ question: 'TCP 핸드셰이크를 설명해 줘', ops: ['{"op":"plan","lines":3}', '{"op":"write","id":"a","text":"SYN","size":"body"}'] }],
    });

    expect(messages).toEqual([
      { role: 'user', content: 'TCP 핸드셰이크를 설명해 줘' },
      {
        role: 'assistant',
        content: '{"op":"plan","lines":3}\n{"op":"write","id":"a","text":"SYN","size":"body"}',
      },
      { role: 'user', content: '[보드] TCP 3-way handshake\n[질문]\n이제 UDP는?' },
    ]);
  });

  it('이력이 없으면 마지막 user 메시지 하나뿐이다', () => {
    const messages = buildMessages({ question: 'TCP란?', pageSummary: '', history: [] });

    expect(messages).toEqual([{ role: 'user', content: '\n[질문]\nTCP란?' }]);
  });

  it('ops가 빈 턴(오류·중단으로 못 그린 턴)이어도 assistant content가 비어 있지 않다', () => {
    const messages = buildMessages({
      question: '다음 질문',
      pageSummary: '',
      history: [{ question: '실패한 질문', ops: [] }],
    });

    const assistantMessage = messages.find((m) => m.role === 'assistant');
    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.content).not.toBe('');
    expect(assistantMessage?.content).toBe('{"op":"plan","lines":0}');
  });
});

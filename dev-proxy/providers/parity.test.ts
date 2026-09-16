/**
 * 두 제공자(Claude, OpenAI)가 같은 /ask 요청에 대해 실제 SDK로 넘기는 메시지
 * 배열이 같은 순서(user/assistant/user)로 구성되는지 확인한다 (T28).
 * `streamText`가 내부에서 호출하는 SDK 클라이언트만 가짜로 바꿔, 실제로 SDK에
 * 전달되는 인자를 가로챈다.
 */
import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { streamText as claudeStreamText } from './claude.ts';
import { streamText as openaiStreamText } from './openai.ts';
import type { AskBody } from '../build-messages.ts';

const req: AskBody = {
  provider: 'claude',
  question: '이제 UDP는?',
  pageSummary: '[보드] TCP 3-way handshake',
  history: [
    {
      question: 'TCP 핸드셰이크를 설명해 줘',
      ops: ['{"op":"plan","lines":1}', '{"op":"write","id":"a","text":"SYN","size":"body"}'],
    },
  ],
};

function emptyAsyncIterable() {
  return {
    async *[Symbol.asyncIterator]() {
      /* 이 테스트는 SDK로 넘어가는 인자만 본다 */
    },
  };
}

describe('두 제공자의 메시지 구성 순서', () => {
  it('같은 입력이면 user/assistant/user 순서와 내용이 같다', async () => {
    const claudeStream = vi.fn((params: { messages: unknown }) => {
      void params;
      return { ...emptyAsyncIterable(), abort: vi.fn() };
    });
    const claudeClient = { messages: { stream: claudeStream } } as unknown as Anthropic;

    const openaiCreate = vi.fn(async (params: { input: unknown }) => {
      void params;
      return { ...emptyAsyncIterable(), controller: { abort: vi.fn() } };
    });
    const openaiClient = { responses: { create: openaiCreate } } as unknown as OpenAI;

    process.env.OPENAI_MODEL = 'gpt-test';
    try {
      // 두 스트림 모두 즉시 끝나므로 소비만 하면 된다.
      for await (const _ of claudeStreamText(req, undefined, claudeClient)) void _;
      for await (const _ of openaiStreamText(req, undefined, openaiClient)) void _;
    } finally {
      delete process.env.OPENAI_MODEL;
    }

    const claudeMessages = claudeStream.mock.calls[0]?.[0].messages;
    const openaiMessages = openaiCreate.mock.calls[0]?.[0].input;

    const expected = [
      { role: 'user', content: 'TCP 핸드셰이크를 설명해 줘' },
      {
        role: 'assistant',
        content: '{"op":"plan","lines":1}\n{"op":"write","id":"a","text":"SYN","size":"body"}',
      },
      { role: 'user', content: '[보드] TCP 3-way handshake\n[질문]\n이제 UDP는?' },
    ];

    expect(claudeMessages).toEqual(expected);
    expect(openaiMessages).toEqual(expected);
  });
});

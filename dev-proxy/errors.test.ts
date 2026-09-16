import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ProviderError, classifyProviderError, withRetry } from './errors.ts';

/** 텍스트 하나도 못 내고 바로 던지는 가짜 스트림 (제너레이터가 아니어서 `require-yield`를 피한다). */
function failingStream(err: unknown): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      return { next: () => Promise.reject(err) };
    },
  };
}

/** 소비만 하고 값은 무시한다. */
async function drain(iterable: AsyncIterable<string>): Promise<void> {
  for await (const _chunk of iterable) void _chunk;
}

describe('classifyProviderError', () => {
  it.each([
    ['claude 401 → auth', new Anthropic.AuthenticationError(401, {}, 'x', new Headers()), 'auth'],
    ['claude 403 → auth', new Anthropic.PermissionDeniedError(403, {}, 'x', new Headers()), 'auth'],
    ['openai 401 → auth', new OpenAI.AuthenticationError(401, {}, 'x', new Headers()), 'auth'],
    ['openai 403 → auth', new OpenAI.PermissionDeniedError(403, {}, 'x', new Headers()), 'auth'],
    ['claude 429 → rate_limit', new Anthropic.RateLimitError(429, {}, 'x', new Headers()), 'rate_limit'],
    ['openai 429 → rate_limit', new OpenAI.RateLimitError(429, {}, 'x', new Headers()), 'rate_limit'],
    ['claude 연결 실패 → network', new Anthropic.APIConnectionError({ message: 'x' }), 'network'],
    ['claude 타임아웃 → network', new Anthropic.APIConnectionTimeoutError(), 'network'],
    ['openai 연결 실패 → network', new OpenAI.APIConnectionError({ message: 'x' }), 'network'],
    ['openai 타임아웃 → network', new OpenAI.APIConnectionTimeoutError(), 'network'],
    ['claude 5xx → server', new Anthropic.InternalServerError(500, {}, 'x', new Headers()), 'server'],
    ['openai 5xx → server', new OpenAI.InternalServerError(500, {}, 'x', new Headers()), 'server'],
    ['claude 기타 API 오류(400) → server', new Anthropic.BadRequestError(400, {}, 'x', new Headers()), 'server'],
    ['openai 기타 API 오류(400) → server', new OpenAI.BadRequestError(400, {}, 'x', new Headers()), 'server'],
    ['비SDK 예외 → server', new Error('무언가 잘못됨'), 'server'],
    ['ProviderError(refusal) → refusal', new ProviderError('refusal'), 'refusal'],
    ['ProviderError(stream_cut) → stream_cut', new ProviderError('stream_cut'), 'stream_cut'],
  ] as const)('%s', (_label, err, kind) => {
    expect(classifyProviderError(err)).toBe(kind);
  });
});

describe('withRetry', () => {
  it('첫 텍스트 전 500 두 번 후 성공 → 재시도 후 정상 텍스트', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const makeStream = () => {
        calls += 1;
        if (calls <= 2) {
          return failingStream(new Anthropic.InternalServerError(500, {}, 'x', new Headers()));
        }
        return (async function* () {
          yield '안';
          yield '녕';
        })();
      };

      const iterator = withRetry(makeStream, undefined, [500, 1000]);
      const collected: string[] = [];
      const done = (async () => {
        for await (const chunk of iterator) collected.push(chunk);
      })();

      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
      await done;

      expect(collected).toEqual(['안', '녕']);
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('텍스트 1개 후 예외 → 재시도 없이 stream_cut으로 던진다', async () => {
    let calls = 0;
    const makeStream = () => {
      calls += 1;
      return (async function* () {
        yield '일부';
        throw new Error('네트워크 끊김');
      })();
    };

    const iterator = withRetry(makeStream);
    const collected: string[] = [];
    let caught: unknown;
    try {
      for await (const chunk of iterator) collected.push(chunk);
    } catch (err) {
      caught = err;
    }

    expect(collected).toEqual(['일부']);
    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).kind).toBe('stream_cut');
    expect(calls).toBe(1);
  });

  it('auth·refusal 등 재시도 불가 오류는 재시도 없이 그대로 던진다', async () => {
    let calls = 0;
    const makeStream = () => {
      calls += 1;
      return failingStream(new Anthropic.AuthenticationError(401, {}, 'x', new Headers()));
    };

    const iterator = withRetry(makeStream);
    let caught: unknown;
    try {
      await drain(iterator);
    } catch (err) {
      caught = err;
    }

    expect(classifyProviderError(caught)).toBe('auth');
    expect(calls).toBe(1);
  });

  it('재시도 대기 중 signal이 중단되면 더 재시도하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const controller = new AbortController();
      const makeStream = () => {
        calls += 1;
        return failingStream(new Anthropic.InternalServerError(500, {}, 'x', new Headers()));
      };

      const iterator = withRetry(makeStream, controller.signal, [500, 1000]);
      let caught: unknown;
      const done = (async () => {
        try {
          await drain(iterator);
        } catch (err) {
          caught = err;
        }
      })();

      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      await done;

      expect(calls).toBe(1);
      expect(classifyProviderError(caught)).toBe('server');
    } finally {
      vi.useRealTimers();
    }
  });
});

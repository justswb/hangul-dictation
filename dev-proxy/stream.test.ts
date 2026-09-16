import { describe, expect, it } from 'vitest';
import { toEvents } from './stream.ts';

async function* chunks(values: string[]): AsyncGenerator<string> {
  for (const v of values) yield v;
}

describe('toEvents', () => {
  it('텍스트 조각을 text 이벤트 순서대로 내고 마지막은 done', async () => {
    const events = [];
    for await (const ev of toEvents(chunks(['안', '녕']))) events.push(ev);

    expect(events).toEqual([
      { t: 'text', v: '안' },
      { t: 'text', v: '녕' },
      { t: 'done' },
    ]);
  });

  it('스트림이 던지면 error(server) 이벤트를 낸다', async () => {
    async function* throwing(): AsyncGenerator<string> {
      yield '일부';
      throw new Error('네트워크 끊김');
    }

    const events = [];
    for await (const ev of toEvents(throwing())) events.push(ev);

    expect(events).toEqual([{ t: 'text', v: '일부' }, { t: 'error', kind: 'server' }]);
  });
});

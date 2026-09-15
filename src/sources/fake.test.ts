import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskRequest, OpEvent } from '../contracts/op-source.ts';
import { createFakeOpSource } from './fake.ts';

function readFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/ops/${name}`, import.meta.url)), 'utf8');
}

const req: AskRequest = { question: 'q', history: [], pageSummary: '' };

async function collect(iterable: AsyncIterable<OpEvent>): Promise<OpEvent[]> {
  const events: OpEvent[] = [];
  const done = (async () => {
    for await (const ev of iterable) events.push(ev);
  })();
  await vi.runAllTimersAsync();
  await done;
  return events;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createFakeOpSource', () => {
  it('tcp.ndjson: op 이벤트 수는 expected ops 수와 같고 마지막은 done', async () => {
    const source = createFakeOpSource({ load: () => Promise.resolve(readFixture('tcp.ndjson')) });
    const events = await collect(source.start(req));
    const opEvents = events.filter((ev) => ev.type === 'op');
    expect(opEvents).toHaveLength(8);
    expect(events[events.length - 1]).toEqual({ type: 'done' });
  });

  it('첫 op는 firstDelayMs 전에는 오지 않는다', async () => {
    const source = createFakeOpSource({
      load: () => Promise.resolve(readFixture('tcp.ndjson')),
      firstDelayMs: 800,
      lineDelayMs: 150,
    });
    const events: OpEvent[] = [];
    const done = (async () => {
      for await (const ev of source.start(req)) events.push(ev);
    })();

    await vi.advanceTimersByTimeAsync(799);
    expect(events).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'op', op: { op: 'plan', lines: 6 } });

    await vi.runAllTimersAsync();
    await done;
  });

  it('두 번째 op 뒤 cancel()하면 이후 이벤트가 없다', async () => {
    const source = createFakeOpSource({ load: () => Promise.resolve(readFixture('tcp.ndjson')) });
    const iterator = source.start(req)[Symbol.asyncIterator]();

    async function next(): Promise<IteratorResult<OpEvent>> {
      const pending = iterator.next();
      await vi.runAllTimersAsync();
      return pending;
    }

    const first = await next();
    const second = await next();
    expect(first.value).toEqual({ type: 'op', op: { op: 'plan', lines: 6 } });
    expect(second.value?.type).toBe('op');

    source.cancel();

    const third = await next();
    expect(third.done).toBe(true);
  });

  it('load()가 실패하면 error 이벤트 1개만 나온다', async () => {
    const source = createFakeOpSource({ load: () => Promise.reject(new Error('boom')) });
    const events = await collect(source.start(req));
    expect(events).toEqual([{ type: 'error', error: { kind: 'network' } }]);
  });

  it('cancel() 후 같은 인스턴스로 다시 start()하면 정상적으로 op·done을 낸다', async () => {
    const source = createFakeOpSource({ load: () => Promise.resolve(readFixture('tcp.ndjson')) });

    const firstEvents = await collect(source.start(req));
    expect(firstEvents[firstEvents.length - 1]).toEqual({ type: 'done' });

    source.cancel();

    const secondEvents = await collect(source.start(req));
    const opEvents = secondEvents.filter((ev) => ev.type === 'op');
    expect(opEvents).toHaveLength(8);
    expect(secondEvents[secondEvents.length - 1]).toEqual({ type: 'done' });
  });

  it('첫 스트림 진행 중 두 번째 start()를 호출하면 첫 스트림은 더 이상 이벤트를 내지 않는다', async () => {
    const source = createFakeOpSource({ load: () => Promise.resolve(readFixture('tcp.ndjson')) });

    const firstEvents: OpEvent[] = [];
    const firstDone = (async () => {
      for await (const ev of source.start(req)) firstEvents.push(ev);
    })();

    // 첫 스트림의 첫 op(firstDelayMs=800ms)만 받은 뒤, 아직 끝나기 전에 두 번째 start() 호출
    await vi.advanceTimersByTimeAsync(800);
    expect(firstEvents).toHaveLength(1);

    const secondEvents = await collect(source.start(req));

    // 첫 스트림은 새 세대가 시작된 뒤로 이벤트가 늘지 않아야 한다 (done도 없음)
    expect(firstEvents).toHaveLength(1);
    await firstDone;
    expect(firstEvents).toHaveLength(1);

    // 두 번째 스트림은 정상적으로 처음부터 전체를 흘려보낸다
    const secondOps = secondEvents.filter((ev) => ev.type === 'op');
    expect(secondOps).toHaveLength(8);
    expect(secondEvents[secondEvents.length - 1]).toEqual({ type: 'done' });
  });
});

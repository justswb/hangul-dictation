import { describe, expect, it } from 'vitest';
import { createScheduler } from './scheduler.ts';
import type { DrawStroke, Point } from '../contracts/stroke.ts';

function pathLength(points: Point[]): number {
  if (points.length === 0) return 0;
  const [first, ...rest] = points;
  if (!first) return 0;
  let prev = first;
  let total = 0;
  for (const point of rest) {
    total += Math.hypot(point.x - prev.x, point.y - prev.y);
    prev = point;
  }
  return total;
}

function makeStroke(points: Point[], groupId = 'g1'): DrawStroke {
  return { color: 'black', width: 2, groupId, points };
}

describe('createScheduler', () => {
  it('길이 900 획 1개에 tick(500) → completed 0, partial 누적 길이 ≈ 450', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 900, y: 0 }])], 'g1');

    const result = scheduler.tick(500);

    expect(result.completed).toHaveLength(0);
    if (!result.partial) throw new Error('partial이 없다');
    expect(pathLength(result.partial.points)).toBeCloseTo(450, 5);
  });

  it('이어서 tick(600) → completed 1, partial null', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 900, y: 0 }])], 'g1');

    scheduler.tick(500);
    const result = scheduler.tick(600);

    expect(result.completed).toHaveLength(1);
    expect(result.partial).toBeNull();
  });

  it('획 2개 큐, tick(큰 값) → completed 2', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue(
      [
        makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }]),
        makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }]),
      ],
      'g1',
    );

    const result = scheduler.tick(10_000);

    expect(result.completed).toHaveLength(2);
    expect(result.partial).toBeNull();
  });

  it('빈 큐 tick → completed 0, partial null', () => {
    const scheduler = createScheduler({ speed: 900 });

    const result = scheduler.tick(500);

    expect(result.completed).toHaveLength(0);
    expect(result.partial).toBeNull();
  });

  it('그룹 A 획 2개, 그룹 B 획 1개 → 끝까지 tick → 콜백 순서 A, B, idle', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue(
      [
        makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }], 'A'),
        makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }], 'A'),
      ],
      'A',
    );
    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }], 'B')], 'B');

    const result = scheduler.tick(10_000);

    expect(result.completed).toHaveLength(3);
    expect(result.groupsDone).toEqual(['A', 'B']);
    expect(result.idle).toBe(true);
    expect(result.partial).toBeNull();
  });

  it('그룹 A 첫 획 절반에서 stop() → 반환된 부분 획 존재, 이후 tick 결과 없음, A 완료 콜백 없음', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue(
      [
        makeStroke([{ x: 0, y: 0 }, { x: 900, y: 0 }], 'A'),
        makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }], 'A'),
      ],
      'A',
    );

    scheduler.tick(500); // 절반 진행

    const finalized = scheduler.stop();
    if (!finalized) throw new Error('finalized가 없다');
    expect(pathLength(finalized.points)).toBeCloseTo(450, 5);

    const result = scheduler.tick(10_000);
    expect(result.completed).toHaveLength(0);
    expect(result.partial).toBeNull();
    expect(result.groupsDone).not.toContain('A');
    expect(result.idle).toBe(true);
  });

  it('clear() 후 tick → 결과 없음', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 900, y: 0 }])], 'g1');

    scheduler.tick(500); // 절반 진행
    scheduler.clear();

    const result = scheduler.tick(10_000);
    expect(result.completed).toHaveLength(0);
    expect(result.partial).toBeNull();
    expect(result.groupsDone).toHaveLength(0);
    expect(result.idle).toBe(true);
  });

  it('stop() 후 새 enqueue → 정상 진행', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 900, y: 0 }])], 'g1');
    scheduler.tick(500);
    scheduler.stop();

    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }])], 'g2');
    const result = scheduler.tick(10_000);

    expect(result.completed).toHaveLength(1);
    expect(result.groupsDone).toEqual(['g2']);
    expect(result.idle).toBe(true);
  });

  it('대기 상태에서 빈 그룹 enqueue → 다음 tick에서 groupsDone에 포함, idle true', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue([], 'X');

    const result = scheduler.tick(500);

    expect(result.completed).toHaveLength(0);
    expect(result.groupsDone).toEqual(['X']);
    expect(result.idle).toBe(true);
  });

  it('그룹 A 진행 중 빈 그룹 X를 추가 → A가 끝난 뒤 이어서 X도 완료(순서 A, X)', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 300, y: 0 }], 'A')], 'A');
    scheduler.enqueue([], 'X');

    const result = scheduler.tick(10_000);

    expect(result.completed).toHaveLength(1);
    expect(result.groupsDone).toEqual(['A', 'X']);
    expect(result.idle).toBe(true);
  });

  it('isIdle()은 tick과 무관하게 현재 큐/진행 상태를 즉시 반영한다', () => {
    const scheduler = createScheduler({ speed: 900 });
    expect(scheduler.isIdle()).toBe(true);

    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 900, y: 0 }])], 'g1');
    expect(scheduler.isIdle()).toBe(false);

    scheduler.tick(500);
    expect(scheduler.isIdle()).toBe(false);

    scheduler.tick(600);
    expect(scheduler.isIdle()).toBe(true);
  });

  it('진행 중인 획이 없을 때 stop() → null 반환, 큐는 비워진다', () => {
    const scheduler = createScheduler({ speed: 900 });
    scheduler.enqueue([makeStroke([{ x: 0, y: 0 }, { x: 900, y: 0 }])], 'g1');

    const finalized = scheduler.stop();

    expect(finalized).toBeNull();
    const result = scheduler.tick(10_000);
    expect(result.completed).toHaveLength(0);
  });
});

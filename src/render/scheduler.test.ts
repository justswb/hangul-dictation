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
});

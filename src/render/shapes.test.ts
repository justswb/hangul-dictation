import { describe, expect, it } from 'vitest';
import type { Rect } from '../contracts/layout.ts';
import type { Point, StrokeStyle } from '../contracts/stroke.ts';
import { ellipseStrokes, rectStrokes } from './shapes.ts';

const style: StrokeStyle = { color: 'blue', width: 4, groupId: 'g1' };

const EPS = 1e-6;

function expectInsideRect(point: Point, rect: Rect): void {
  expect(point.x).toBeGreaterThanOrEqual(rect.x - EPS);
  expect(point.x).toBeLessThanOrEqual(rect.x + rect.w + EPS);
  expect(point.y).toBeGreaterThanOrEqual(rect.y - EPS);
  expect(point.y).toBeLessThanOrEqual(rect.y + rect.h + EPS);
}

describe('rectStrokes', () => {
  const rect: Rect = { x: 0, y: 0, w: 100, h: 50 };

  it('4획을 위→오른쪽→아래→왼쪽 순으로 반환한다', () => {
    const strokes = rectStrokes(rect, style);
    expect(strokes).toHaveLength(4);

    expect(strokes[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(strokes[1]?.points).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(strokes[2]?.points).toEqual([
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
    expect(strokes[3]?.points).toEqual([
      { x: 0, y: 50 },
      { x: 0, y: 0 },
    ]);
  });

  it('모든 점이 rect 안에 있다', () => {
    const strokes = rectStrokes(rect, style);
    for (const stroke of strokes) {
      for (const point of stroke.points) {
        expectInsideRect(point, rect);
      }
    }
  });

  it('style 값이 모든 획에 복사된다', () => {
    const strokes = rectStrokes(rect, style);
    for (const stroke of strokes) {
      expect(stroke.color).toBe(style.color);
      expect(stroke.width).toBe(style.width);
      expect(stroke.groupId).toBe(style.groupId);
    }
  });
});

describe('ellipseStrokes', () => {
  const rect: Rect = { x: 10, y: 20, w: 80, h: 40 };

  it('획 1개, 점 49개를 반환한다', () => {
    const strokes = ellipseStrokes(rect, style);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.points).toHaveLength(49);
  });

  it('위쪽 중앙에서 시작해 시계 방향으로 닫힌 곡선을 그린다', () => {
    const strokes = ellipseStrokes(rect, style);
    const points = strokes[0]?.points ?? [];
    const first = points[0]!;
    const second = points[1]!;
    const last = points[points.length - 1]!;

    expect(first.x).toBeCloseTo(rect.x + rect.w / 2, 10);
    expect(first.y).toBeCloseTo(rect.y, 10);
    expect(second.x).toBeGreaterThan(first.x);
    expect(last).toEqual(first);
  });

  it('모든 점이 rect 안에 있다', () => {
    const strokes = ellipseStrokes(rect, style);
    for (const point of strokes[0]?.points ?? []) {
      expectInsideRect(point, rect);
    }
  });

  it('style 값이 획에 복사된다', () => {
    const strokes = ellipseStrokes(rect, style);
    expect(strokes[0]?.color).toBe(style.color);
    expect(strokes[0]?.width).toBe(style.width);
    expect(strokes[0]?.groupId).toBe(style.groupId);
  });
});

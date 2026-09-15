import { describe, expect, it } from 'vitest';
import type { Rect } from '../contracts/layout.ts';
import type { Point, StrokeStyle } from '../contracts/stroke.ts';
import { arrowStrokes, markStrokes } from './marks.ts';

const style: StrokeStyle = { color: 'red', width: 3, groupId: 'g1' };

const EPS = 1e-6;

function expectInsideRect(point: Point, rect: Rect): void {
  expect(point.x).toBeGreaterThanOrEqual(rect.x - EPS);
  expect(point.x).toBeLessThanOrEqual(rect.x + rect.w + EPS);
  expect(point.y).toBeGreaterThanOrEqual(rect.y - EPS);
  expect(point.y).toBeLessThanOrEqual(rect.y + rect.h + EPS);
}

describe('arrowStrokes', () => {
  it('3획을 반환하고 촉 끝점이 예상 각도에 맞는다', () => {
    const strokes = arrowStrokes({ x: 0, y: 0 }, { x: 100, y: 0 }, style);
    expect(strokes).toHaveLength(3);

    expect(strokes[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);

    const angle = (28 * Math.PI) / 180;
    const expectedX = 100 - 20 * Math.cos(angle);
    const expectedY = 20 * Math.sin(angle);

    const head1 = strokes[1]!.points[1]!;
    const head2 = strokes[2]!.points[1]!;

    expect(head1.x).toBeCloseTo(expectedX, 6);
    expect(Math.abs(head1.y)).toBeCloseTo(expectedY, 6);
    expect(head2.x).toBeCloseTo(expectedX, 6);
    expect(Math.abs(head2.y)).toBeCloseTo(expectedY, 6);
    // 두 촉은 서로 반대 방향(y 부호 반대)이어야 한다.
    expect(head1.y).toBeCloseTo(-head2.y, 6);
  });

  it('몸통 길이 30이면 촉 길이는 9다', () => {
    const strokes = arrowStrokes({ x: 0, y: 0 }, { x: 30, y: 0 }, style);
    const to = strokes[0]!.points[1]!;
    const head = strokes[1]!.points[1]!;
    const headLength = Math.hypot(head.x - to.x, head.y - to.y);
    expect(headLength).toBeCloseTo(9, 6);
  });

  it('몸통 길이 100(> 20/0.3)이면 촉 길이는 20으로 상한된다', () => {
    const strokes = arrowStrokes({ x: 0, y: 0 }, { x: 100, y: 0 }, style);
    const to = strokes[0]!.points[1]!;
    const head = strokes[1]!.points[1]!;
    const headLength = Math.hypot(head.x - to.x, head.y - to.y);
    expect(headLength).toBeCloseTo(20, 6);
  });

  it('style 값이 모든 획에 복사된다', () => {
    const strokes = arrowStrokes({ x: 0, y: 0 }, { x: 100, y: 0 }, style);
    for (const stroke of strokes) {
      expect(stroke.color).toBe(style.color);
      expect(stroke.width).toBe(style.width);
      expect(stroke.groupId).toBe(style.groupId);
    }
  });
});

describe('markStrokes - underline', () => {
  const bbox: Rect = { x: 10, y: 20, w: 80, h: 40 };

  it('1획, 왼→오, y = bbox.y + bbox.h + 6', () => {
    const strokes = markStrokes('underline', bbox, style);
    expect(strokes).toHaveLength(1);
    const points = strokes[0]?.points ?? [];
    expect(points).toHaveLength(2);
    expect(points[0]?.x).toBeLessThan(points[1]?.x ?? 0);
    expect(points[0]?.y).toBeCloseTo(bbox.y + bbox.h + 6, 10);
    expect(points[1]?.y).toBeCloseTo(bbox.y + bbox.h + 6, 10);
  });

  it('style 값이 획에 복사된다', () => {
    const strokes = markStrokes('underline', bbox, style);
    expect(strokes[0]?.color).toBe(style.color);
    expect(strokes[0]?.width).toBe(style.width);
    expect(strokes[0]?.groupId).toBe(style.groupId);
  });
});

describe('markStrokes - circle', () => {
  const bbox: Rect = { x: 10, y: 20, w: 80, h: 40 };
  const expanded: Rect = { x: 0, y: 10, w: 100, h: 60 };

  it('획 1개, 점들이 사방 10px 넓힌 사각형 안에 있다', () => {
    const strokes = markStrokes('circle', bbox, style);
    expect(strokes).toHaveLength(1);
    for (const point of strokes[0]?.points ?? []) {
      expectInsideRect(point, expanded);
    }
  });
});

describe('markStrokes - check', () => {
  const bbox: Rect = { x: 10, y: 20, w: 80, h: 40 };

  it('1획 3점, 두 번째 점의 y가 가장 크고 bbox 오른쪽에 위치한다', () => {
    const strokes = markStrokes('check', bbox, style);
    expect(strokes).toHaveLength(1);
    const points = strokes[0]?.points ?? [];
    expect(points).toHaveLength(3);

    const [p0, p1, p2] = points as [Point, Point, Point];
    expect(p1.y).toBeGreaterThan(p0.y);
    expect(p1.y).toBeGreaterThan(p2.y);

    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(bbox.x + bbox.w - EPS);
    }
  });

  it('style 값이 획에 복사된다', () => {
    const strokes = markStrokes('check', bbox, style);
    expect(strokes[0]?.color).toBe(style.color);
    expect(strokes[0]?.width).toBe(style.width);
    expect(strokes[0]?.groupId).toBe(style.groupId);
  });
});

/** 보드 좌표 사각형 계산 (T21, T22). 순수 함수만 둔다. */
import type { Rect } from '../contracts/layout.ts';
import type { Point } from '../contracts/stroke.ts';

/** 사각형의 오른쪽 x. */
export function right(rect: Rect): number {
  return rect.x + rect.w;
}

/** 사각형의 아래쪽 y. */
export function bottom(rect: Rect): number {
  return rect.y + rect.h;
}

/** 두 사각형이 실제로 겹치는지 (변만 닿으면 겹침이 아니다). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

/** 두 사각형이 겹치는 가로 폭. 겹치지 않으면 0. */
export function overlapWidth(a: Rect, b: Rect): number {
  if (!overlaps(a, b)) return 0;
  return Math.min(right(a), right(b)) - Math.max(a.x, b.x);
}

/**
 * `rect` 안의 `from`에서 `to` 방향으로 뻗은 선분이 `rect` 경계와 만나는 점 (T22).
 * `from`이 `rect` 안에 있다고 가정한다 (그렇지 않으면 결과가 정의되지 않는다).
 */
export function segmentExitPoint(from: Point, to: Point, rect: Rect): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  const txCandidate =
    dx > 0 ? (right(rect) - from.x) / dx : dx < 0 ? (rect.x - from.x) / dx : Number.POSITIVE_INFINITY;
  const tyCandidate =
    dy > 0 ? (bottom(rect) - from.y) / dy : dy < 0 ? (rect.y - from.y) / dy : Number.POSITIVE_INFINITY;

  const t = Math.min(txCandidate, tyCandidate);

  return { x: from.x + dx * t, y: from.y + dy * t };
}

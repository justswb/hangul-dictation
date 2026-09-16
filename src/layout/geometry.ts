/** 보드 좌표 사각형 계산 (T21). 순수 함수만 둔다. */
import type { Rect } from '../contracts/layout.ts';

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

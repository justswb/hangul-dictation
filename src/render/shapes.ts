import type { Rect } from '../contracts/layout.ts';
import type { DrawStroke, Point, StrokeStyle } from '../contracts/stroke.ts';

const ELLIPSE_SEGMENTS = 48;

/**
 * 사각형 4획.
 * 순서: 위(왼→오) → 오른쪽(위→아래) → 아래(오→왼) → 왼쪽(아래→위).
 */
export function rectStrokes(rect: Rect, style: StrokeStyle): DrawStroke[] {
  const { x, y, w, h } = rect;
  const topLeft: Point = { x, y };
  const topRight: Point = { x: x + w, y };
  const bottomRight: Point = { x: x + w, y: y + h };
  const bottomLeft: Point = { x, y: y + h };

  const segments: Point[][] = [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ];

  return segments.map((points) => ({ ...style, points }));
}

/**
 * 타원 1획.
 * 위쪽 중앙에서 시작해 시계 방향으로 점 48개 + 닫는 점(마지막 = 첫 점) = 49점.
 */
export function ellipseStrokes(rect: Rect, style: StrokeStyle): DrawStroke[] {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  // theta = 0 (위쪽 중앙)을 별도로 계산해, 닫는 점을 부동소수점 오차 없이
  // 첫 점과 정확히 같게 만든다.
  const first: Point = { x: cx, y: cy - ry };
  const points: Point[] = [first];
  for (let i = 1; i < ELLIPSE_SEGMENTS; i += 1) {
    const theta = (i / ELLIPSE_SEGMENTS) * 2 * Math.PI;
    points.push({ x: cx + rx * Math.sin(theta), y: cy - ry * Math.cos(theta) });
  }
  points.push({ ...first });

  return [{ ...style, points }];
}

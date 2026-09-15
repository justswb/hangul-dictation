import type { Rect } from '../contracts/layout.ts';
import type { DrawStroke, Point, StrokeStyle } from '../contracts/stroke.ts';
import { ellipseStrokes } from './shapes.ts';

const ARROWHEAD_ANGLE = (28 * Math.PI) / 180;
const ARROWHEAD_MAX_LEN = 20;
const ARROWHEAD_LEN_RATIO = 0.3;
const MARK_EXPAND = 10;
const UNDERLINE_GAP = 6;
const CHECK_SIZE_RATIO = 0.6;

/**
 * 화살표 3획.
 * 순서: 몸통(from→to) → 촉 왼쪽(to에서 뒤쪽 -28°) → 촉 오른쪽(to에서 뒤쪽 +28°).
 * 촉 길이 = min(20, 몸통길이 × 0.3).
 */
export function arrowStrokes(from: Point, to: Point, style: StrokeStyle): DrawStroke[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bodyLength = Math.hypot(dx, dy);
  const headLength = Math.min(ARROWHEAD_MAX_LEN, bodyLength * ARROWHEAD_LEN_RATIO);
  const bodyAngle = Math.atan2(dy, dx);
  const backAngle = bodyAngle + Math.PI;

  const headPoint = (offset: number): Point => {
    const angle = backAngle + offset;
    return {
      x: to.x + headLength * Math.cos(angle),
      y: to.y + headLength * Math.sin(angle),
    };
  };

  return [
    { ...style, points: [from, to] },
    { ...style, points: [to, headPoint(-ARROWHEAD_ANGLE)] },
    { ...style, points: [to, headPoint(ARROWHEAD_ANGLE)] },
  ];
}

function underlineStrokes(bbox: Rect, style: StrokeStyle): DrawStroke[] {
  const y = bbox.y + bbox.h + UNDERLINE_GAP;
  return [
    {
      ...style,
      points: [
        { x: bbox.x, y },
        { x: bbox.x + bbox.w, y },
      ],
    },
  ];
}

function circleStrokes(bbox: Rect, style: StrokeStyle): DrawStroke[] {
  const expanded: Rect = {
    x: bbox.x - MARK_EXPAND,
    y: bbox.y - MARK_EXPAND,
    w: bbox.w + MARK_EXPAND * 2,
    h: bbox.h + MARK_EXPAND * 2,
  };
  return ellipseStrokes(expanded, style);
}

/**
 * 체크 표시 1획, 3점.
 * bbox 오른쪽 옆에 세로 bbox.h × 0.6 크기의 대칭 V자를 그린다 (왼쪽 위 → 아래 → 오른쪽 위).
 * V자는 bbox의 세로 중앙에 맞춘다 (판단: 티켓에 세로 정렬 지정 없음).
 */
function checkStrokes(bbox: Rect, style: StrokeStyle): DrawStroke[] {
  const size = bbox.h * CHECK_SIZE_RATIO;
  const x0 = bbox.x + bbox.w;
  const centerY = bbox.y + bbox.h / 2;
  const top = centerY - size / 2;
  const bottom = centerY + size / 2;

  const leftTop: Point = { x: x0, y: top };
  const bottomPoint: Point = { x: x0 + size / 2, y: bottom };
  const rightTop: Point = { x: x0 + size, y: top };

  return [{ ...style, points: [leftTop, bottomPoint, rightTop] }];
}

/** 강조 획: underline(밑줄) · circle(동그라미) · check(체크). */
export function markStrokes(
  kind: 'underline' | 'circle' | 'check',
  bbox: Rect,
  style: StrokeStyle,
): DrawStroke[] {
  switch (kind) {
    case 'underline':
      return underlineStrokes(bbox, style);
    case 'circle':
      return circleStrokes(bbox, style);
    case 'check':
      return checkStrokes(bbox, style);
  }
}

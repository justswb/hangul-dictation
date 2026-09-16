/**
 * mark op의 배치 (T22).
 *
 * - `markStrokes(style, target.bbox, ...)`로 강조 획을 만든다. 색 기본값은 red.
 * - `target` id가 페이지에 없으면 `null`을 반환한다.
 * - `page.cursorY`는 바꾸지 않는다.
 */
import type { PageState, PlacedElement } from '../contracts/layout.ts';
import type { MarkOp } from '../contracts/ops.ts';
import { markStrokes } from '../render/marks.ts';
import { MARK_DEFAULT_COLOR, STROKE_WIDTH } from './constants.ts';

/**
 * mark op 하나를 배치한다. 순수 함수 — 입력 `page`는 변경하지 않는다.
 * `target` id가 페이지에 없으면 `null`을 반환한다.
 */
export function layoutMark(op: MarkOp, page: PageState): { placed: PlacedElement; page: PageState } | null {
  const targetElement = page.elements.find((element) => element.id === op.target);
  if (!targetElement) return null;

  const color = op.color ?? MARK_DEFAULT_COLOR;
  const id = `mark:${op.target}:${op.style}`;
  const style = { color, width: STROKE_WIDTH.note, groupId: id };

  const strokes = markStrokes(op.style, targetElement.bbox, style);

  const xs = strokes.flatMap((stroke) => stroke.points.map((p) => p.x));
  const ys = strokes.flatMap((stroke) => stroke.points.map((p) => p.y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const placed: PlacedElement = {
    id,
    kind: 'mark',
    bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    strokes,
  };

  return {
    placed,
    page: {
      elements: [...page.elements, placed],
      cursorY: page.cursorY,
    },
  };
}

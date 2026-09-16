/**
 * arrow op의 배치 (T22).
 *
 * - `from`·`to` bbox 중심을 잇는 직선을 각 bbox 경계에서 자르고, 양 끝을
 *   `ARROW_END_GAP`만큼 더 띄운다.
 * - `label`이 있으면 note 크기 텍스트를 선분 중점 위에 가운데 정렬한다.
 * - `from`·`to` id가 페이지에 없으면 `null`을 반환한다.
 * - `page.cursorY`는 바꾸지 않는다.
 */
import type { PageState, PlacedElement } from '../contracts/layout.ts';
import type { ArrowOp } from '../contracts/ops.ts';
import type { DrawStroke, Point } from '../contracts/stroke.ts';
import { arrowStrokes } from '../render/marks.ts';
import { measureText, textToStrokes } from '../render/text.ts';
import { ARROW_END_GAP, ARROW_LABEL_GAP, ARROW_LABEL_TEXT_SIZE, DEFAULT_COLOR, STROKE_WIDTH, TEXT_HEIGHT } from './constants.ts';
import { segmentExitPoint } from './geometry.ts';

/** bbox 중심점. */
function center(bbox: { x: number; y: number; w: number; h: number }): Point {
  return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
}

/** `at`에서 `awayFrom` 반대 방향(즉 `awayFrom`→`at` 방향)으로 `dist`만큼 더 밀어낸 점. */
function pushAway(at: Point, from: Point, dist: number): Point {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return at;
  return { x: at.x + (dx / length) * dist, y: at.y + (dy / length) * dist };
}

/**
 * arrow op 하나를 배치한다. 순수 함수 — 입력 `page`는 변경하지 않는다.
 * `from`·`to` id가 페이지에 없으면 `null`을 반환한다.
 */
export function layoutArrow(op: ArrowOp, page: PageState): { placed: PlacedElement; page: PageState } | null {
  const fromElement = page.elements.find((element) => element.id === op.from);
  const toElement = page.elements.find((element) => element.id === op.to);
  if (!fromElement || !toElement) return null;

  const fromCenter = center(fromElement.bbox);
  const toCenter = center(toElement.bbox);

  const fromExit = segmentExitPoint(fromCenter, toCenter, fromElement.bbox);
  const toExit = segmentExitPoint(toCenter, fromCenter, toElement.bbox);

  const start = pushAway(fromExit, fromCenter, ARROW_END_GAP);
  const end = pushAway(toExit, toCenter, ARROW_END_GAP);

  const id = `arrow:${op.from}>${op.to}`;
  const style = { color: DEFAULT_COLOR, width: STROKE_WIDTH.body, groupId: id };

  const strokes: DrawStroke[] = arrowStrokes(start, end, style);

  let minX = Math.min(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxX = Math.max(start.x, end.x);
  let maxY = Math.max(start.y, end.y);

  if (op.label) {
    const height = TEXT_HEIGHT[ARROW_LABEL_TEXT_SIZE];
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const textWidth = measureText(op.label, height);
    const labelX = midpoint.x - textWidth / 2;
    const labelY = midpoint.y - ARROW_LABEL_GAP - height;

    const label = textToStrokes(op.label, {
      x: labelX,
      y: labelY,
      height,
      color: DEFAULT_COLOR,
      width: STROKE_WIDTH[ARROW_LABEL_TEXT_SIZE],
    });

    for (const stroke of label.strokes) strokes.push({ ...stroke, groupId: id });

    minX = Math.min(minX, labelX);
    minY = Math.min(minY, labelY);
    maxX = Math.max(maxX, labelX + textWidth);
    maxY = Math.max(maxY, labelY + height);
  }

  const placed: PlacedElement = {
    id,
    kind: 'arrow',
    bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    strokes,
    text: op.label,
  };

  return {
    placed,
    page: {
      elements: [...page.elements, placed],
      cursorY: page.cursorY,
    },
  };
}

/**
 * box op의 상대 배치 + 겹침 해소 (T21).
 *
 * - 크기는 라벨 텍스트 폭·높이에 안쪽 여백을 더해 정한다.
 * - `place`가 없으면 왼쪽 여백에서 `page.cursorY`부터, 있으면 참조 요소 기준으로 놓는다.
 *   참조 id가 페이지에 없으면 `null`을 반환한다.
 * - 기존 요소와 겹치면 오른쪽으로 밀고, 보드 오른쪽 여백을 넘으면 다음 줄로 내린다.
 * - 도형 획과 라벨 획의 `groupId`는 모두 `op.id`다.
 * - 입력 `page`는 변경하지 않고 새 `PageState`를 반환한다.
 */
import type { PageState, PlacedElement, Rect } from '../contracts/layout.ts';
import { BOARD } from '../contracts/layout.ts';
import type { BoxOp } from '../contracts/ops.ts';
import type { DrawStroke } from '../contracts/stroke.ts';
import { ellipseStrokes, rectStrokes } from '../render/shapes.ts';
import { measureText, textToStrokes } from '../render/text.ts';
import {
  BOX_CURSOR_GAP,
  BOX_GAP_X,
  BOX_GAP_Y,
  BOX_PADDING_X,
  BOX_PADDING_Y,
  BOX_TEXT_SIZE,
  DEFAULT_COLOR,
  MARGIN,
  OVERLAP_GAP,
  STROKE_WIDTH,
  TEXT_HEIGHT,
} from './constants.ts';
import { bottom, overlapWidth, right } from './geometry.ts';

/** 보드에서 요소가 놓일 수 있는 오른쪽 한계 x. */
export const BOX_RIGHT_LIMIT = BOARD.w - MARGIN;

/** 페이지에서 가장 아래쪽 요소의 bottom. 요소가 없으면 `MARGIN`. */
function lowestBottom(page: PageState): number {
  let lowest = MARGIN;
  for (const element of page.elements) lowest = Math.max(lowest, bottom(element.bbox));
  return lowest;
}

/**
 * 기존 요소와 겹치지 않는 위치를 찾는다. 겹치면 오른쪽으로 `겹친 폭 + OVERLAP_GAP` 만큼
 * 밀고, 오른쪽 한계를 넘으면 왼쪽 여백에서 가장 아래 요소 아래로 내린다(그 줄은 비어 있어
 * 더 이상 겹치지 않는다).
 */
function resolveOverlap(rect: Rect, page: PageState): Rect {
  let current = rect;

  // 요소 수만큼 미는 것으로 충분하고, 그 뒤엔 반드시 줄을 내린다.
  for (let step = 0; step <= page.elements.length; step += 1) {
    let shift = 0;
    for (const element of page.elements) {
      shift = Math.max(shift, overlapWidth(current, element.bbox));
    }
    if (shift === 0) return current;

    const nextX = current.x + shift + OVERLAP_GAP;
    if (nextX + current.w > BOX_RIGHT_LIMIT) {
      return { ...current, x: MARGIN, y: lowestBottom(page) + BOX_GAP_Y };
    }
    current = { ...current, x: nextX };
  }

  return { ...current, x: MARGIN, y: lowestBottom(page) + BOX_GAP_Y };
}

/** `place`를 풀어 시작 위치를 정한다. 참조 id가 없으면 `null`. */
function startPosition(op: BoxOp, page: PageState): { x: number; y: number } | null {
  if (!op.place) return { x: MARGIN, y: page.cursorY };

  const ref = page.elements.find((element) => element.id === op.place?.of);
  if (!ref) return null;

  if (op.place.rel === 'right_of') return { x: right(ref.bbox) + BOX_GAP_X, y: ref.bbox.y };
  return { x: ref.bbox.x, y: bottom(ref.bbox) + BOX_GAP_Y };
}

/**
 * box op 하나를 배치한다. 순수 함수 — 입력 `page`는 변경하지 않는다.
 * 참조 id가 페이지에 없으면 `null`을 반환한다.
 */
export function layoutBox(op: BoxOp, page: PageState): { placed: PlacedElement; page: PageState } | null {
  const height = TEXT_HEIGHT[BOX_TEXT_SIZE];
  const width = STROKE_WIDTH[BOX_TEXT_SIZE];
  const color = DEFAULT_COLOR;

  const textWidth = measureText(op.text, height);
  const start = startPosition(op, page);
  if (!start) return null;

  const bbox = resolveOverlap(
    { x: start.x, y: start.y, w: textWidth + 2 * BOX_PADDING_X, h: height + 2 * BOX_PADDING_Y },
    page,
  );

  const style = { color, width, groupId: op.id };
  const shape = op.shape === 'ellipse' ? ellipseStrokes(bbox, style) : rectStrokes(bbox, style);

  // 라벨은 도형 안에서 가운데 정렬. textToStrokes의 y는 글자 칸 위쪽 좌표다.
  const label = textToStrokes(op.text, {
    x: bbox.x + (bbox.w - textWidth) / 2,
    y: bbox.y + (bbox.h - height) / 2,
    height,
    color,
    width,
  });

  const strokes: DrawStroke[] = [
    ...shape,
    ...label.strokes.map((stroke) => ({ ...stroke, groupId: op.id })),
  ];

  const placed: PlacedElement = { id: op.id, kind: 'box', bbox, strokes, text: op.text };

  return {
    placed,
    page: {
      elements: [...page.elements, placed],
      cursorY: Math.max(page.cursorY, bottom(bbox) + BOX_CURSOR_GAP),
    },
  };
}

/**
 * layoutOp 디스패처 + 쓰기 전 지우기·넘침 처리 (T23).
 *
 * - `plan`은 남은 줄 수보다 예상 줄 수가 많으면 미리 페이지를 비운다 (쓰기 전 지우기).
 * - `write`·`box`는 배치 결과가 아래 여백을 넘으면 빈 페이지에서 다시 배치한다 (넘침).
 * - `arrow`·`mark`는 참조가 없으면 아무것도 배치하지 않는다.
 * - 모든 함수는 순수 — 입력 `page`는 변경하지 않는다.
 */
import { BOARD, type LayoutResult, type PageState, type PlacedElement } from '../contracts/layout.ts';
import type { Op } from '../contracts/ops.ts';
import { layoutArrow } from './arrow.ts';
import { layoutBox } from './box.ts';
import { LINE_HEIGHT_RATIO, MARGIN, TEXT_HEIGHT } from './constants.ts';
import { layoutWrite } from './flow.ts';
import { layoutMark } from './mark.ts';

/** 흐름 배치가 넘어서면 안 되는 y (보드 아래 여백). */
export const BOTTOM_LIMIT = BOARD.h - MARGIN;

/** 요소가 없고 커서가 위 여백에 있는 새 페이지. */
export function emptyPage(): PageState {
  return { elements: [], cursorY: MARGIN };
}

/** 현재 커서 아래에 body 크기로 더 쓸 수 있는 줄 수 (음수면 0). */
export function remainingLines(page: PageState): number {
  const lineHeight = TEXT_HEIGHT.body * LINE_HEIGHT_RATIO;
  return Math.max(0, Math.floor((BOTTOM_LIMIT - page.cursorY) / lineHeight));
}

/** 배치 결과가 아래 여백을 넘는가. */
function overflows(placed: PlacedElement): boolean {
  return placed.bbox.y + placed.bbox.h > BOTTOM_LIMIT;
}

/** 한 요소를 배치하는 함수 (참조가 없으면 null). */
type Placer = (page: PageState) => { placed: PlacedElement; page: PageState } | null;

/** 아무것도 배치하지 않은 결과. */
function nothing(clearBefore: boolean, page: PageState): LayoutResult {
  return { clearBefore, placed: [], page };
}

/**
 * 흐름 요소(write·box)를 배치하고, 넘치면 빈 페이지에서 다시 배치한다.
 * 이미 빈 페이지였다면 넘쳐도 그대로 둔다 (지울 것이 없다).
 */
function placeWithOverflow(place: Placer, page: PageState): LayoutResult {
  const first = place(page);
  const hadElements = page.elements.length > 0;

  if (first && !(hadElements && overflows(first.placed))) {
    return { clearBefore: false, placed: [first.placed], page: first.page };
  }
  if (!first) {
    // 참조 id를 찾지 못했다 (box의 place). 페이지를 건드리지 않는다.
    return nothing(false, page);
  }

  const retry = place(emptyPage());
  // 빈 페이지에는 참조 요소가 없어 재배치가 실패할 수 있다. 이때 보드를 지우면
  // 아무것도 그리지 않은 채 기존 내용만 사라지므로, 지우지 않고 op를 무시한다
  // (docs/board-ops.md: 없는 id를 참조한 op는 무시).
  if (!retry) return nothing(false, page);
  return { clearBefore: true, placed: [retry.placed], page: retry.page };
}

/** 참조 요소가 필요한 요소(arrow·mark)를 배치한다. 참조가 없으면 아무것도 배치하지 않는다. */
function placeReferencing(place: Placer, page: PageState): LayoutResult {
  const result = place(page);
  if (!result) return nothing(false, page);
  return { clearBefore: false, placed: [result.placed], page: result.page };
}

/**
 * op 하나를 현재 페이지에 적용한다. 순수 함수 — 입력 `page`는 변경하지 않는다.
 * `clearBefore`가 true면 `placed`를 그리기 전에 보드를 지운다.
 */
export function layoutOp(op: Op, page: PageState): LayoutResult {
  switch (op.op) {
    case 'plan': {
      const needsClear = page.elements.length > 0 && op.lines > remainingLines(page);
      return needsClear ? nothing(true, emptyPage()) : nothing(false, page);
    }
    case 'newpage': {
      const needsClear = page.elements.length > 0;
      return needsClear ? nothing(true, emptyPage()) : nothing(false, page);
    }
    case 'write':
      return placeWithOverflow((p) => layoutWrite(op, p), page);
    case 'box':
      return placeWithOverflow((p) => layoutBox(op, p), page);
    case 'arrow':
      return placeReferencing((p) => layoutArrow(op, p), page);
    case 'mark':
      return placeReferencing((p) => layoutMark(op, p), page);
  }
}

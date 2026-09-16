import { describe, expect, it } from 'vitest';
import { BOARD, type PageState, type PlacedElement } from '../contracts/layout.ts';
import type { ArrowOp, BoxOp, MarkOp, WriteOp } from '../contracts/ops.ts';
import { BOTTOM_LIMIT, emptyPage, layoutOp, remainingLines } from './index.ts';
import { LINE_HEIGHT_RATIO, MARGIN, TEXT_HEIGHT } from './constants.ts';

const BODY_LINE = TEXT_HEIGHT.body * LINE_HEIGHT_RATIO;

/** placed가 정확히 하나일 때 그 요소를 꺼낸다. */
function only(placed: PlacedElement[]): PlacedElement {
  expect(placed).toHaveLength(1);
  const first = placed[0];
  if (!first) throw new Error('배치된 요소가 없다');
  return first;
}

function element(id: string, bbox: PlacedElement['bbox']): PlacedElement {
  return { id, kind: 'box', bbox, strokes: [] };
}

/** 요소가 하나 있고 커서가 `cursorY`인 페이지. */
function pageAt(cursorY: number): PageState {
  return { elements: [element('a', { x: MARGIN, y: MARGIN, w: 100, h: 40 })], cursorY };
}

/** `lines` 줄이 남도록 커서를 둔 페이지. */
function pageWithRemaining(lines: number): PageState {
  return pageAt(BOTTOM_LIMIT - lines * BODY_LINE - 0.5);
}

const write = (text: string, overrides: Partial<WriteOp> = {}): WriteOp => ({
  op: 'write',
  id: 'w1',
  text,
  size: 'body',
  ...overrides,
});

describe('emptyPage', () => {
  it('요소가 없고 cursorY는 MARGIN', () => {
    expect(emptyPage()).toEqual({ elements: [], cursorY: MARGIN });
  });

  it('호출마다 새 객체를 준다', () => {
    const page = emptyPage();
    page.elements.push(element('x', { x: 0, y: 0, w: 1, h: 1 }));
    expect(emptyPage().elements).toHaveLength(0);
  });
});

describe('remainingLines', () => {
  it('빈 페이지는 (보드 높이 − 여백 − MARGIN) / 줄높이를 내림한 값', () => {
    expect(remainingLines(emptyPage())).toBe(Math.floor((BOARD.h - MARGIN - MARGIN) / BODY_LINE));
  });

  it('커서를 내리면 남은 줄이 준다', () => {
    expect(remainingLines(pageWithRemaining(3))).toBe(3);
  });

  it('커서가 하단을 넘으면 0 (음수 아님)', () => {
    expect(remainingLines(pageAt(BOTTOM_LIMIT + 500))).toBe(0);
  });
});

describe('layoutOp plan', () => {
  it('요소가 있고 남은 줄 3인 페이지에 lines=5면 clearBefore true + 빈 페이지', () => {
    const page = pageWithRemaining(3);
    const result = layoutOp({ op: 'plan', lines: 5 }, page);
    expect(result.clearBefore).toBe(true);
    expect(result.placed).toEqual([]);
    expect(result.page).toEqual(emptyPage());
  });

  it('같은 페이지에 lines=2면 clearBefore false + 페이지 그대로', () => {
    const page = pageWithRemaining(3);
    const result = layoutOp({ op: 'plan', lines: 2 }, page);
    expect(result.clearBefore).toBe(false);
    expect(result.placed).toEqual([]);
    expect(result.page).toBe(page);
  });

  it('남은 줄과 같으면 지우지 않는다', () => {
    const result = layoutOp({ op: 'plan', lines: 3 }, pageWithRemaining(3));
    expect(result.clearBefore).toBe(false);
  });

  it('빈 페이지에는 lines=99여도 clearBefore false', () => {
    const result = layoutOp({ op: 'plan', lines: 99 }, emptyPage());
    expect(result.clearBefore).toBe(false);
    expect(result.placed).toEqual([]);
  });
});

describe('layoutOp newpage', () => {
  it('요소가 있으면 clearBefore true + 빈 페이지', () => {
    const result = layoutOp({ op: 'newpage' }, pageWithRemaining(3));
    expect(result.clearBefore).toBe(true);
    expect(result.placed).toEqual([]);
    expect(result.page).toEqual(emptyPage());
  });

  it('이미 빈 페이지면 clearBefore false', () => {
    const result = layoutOp({ op: 'newpage' }, emptyPage());
    expect(result.clearBefore).toBe(false);
    expect(result.page).toEqual(emptyPage());
  });
});

describe('layoutOp write', () => {
  it('여유가 있으면 clearBefore false, 커서에서 배치', () => {
    const page = pageWithRemaining(10);
    const result = layoutOp(write('가나다'), page);
    expect(result.clearBefore).toBe(false);
    const placed = only(result.placed);
    expect(placed.bbox.y).toBe(page.cursorY);
    expect(result.page.elements).toContain(placed);
  });

  it('하단 근처에서 긴 write는 clearBefore true, 새 bbox.y = MARGIN', () => {
    const page = pageWithRemaining(1);
    const result = layoutOp(write('가나다라마 바사아자차 카타파하 '.repeat(20)), page);
    expect(result.clearBefore).toBe(true);
    const placed = only(result.placed);
    expect(placed.bbox.y).toBe(MARGIN);
    expect(result.page.elements).toEqual([placed]);
  });

  it('빈 페이지에서는 넘쳐도 clearBefore false', () => {
    const tall = { op: 'write', id: 'w1', text: '가'.repeat(400), size: 'title' } as const;
    const result = layoutOp(tall, emptyPage());
    expect(result.clearBefore).toBe(false);
    expect(result.placed).toHaveLength(1);
  });

  it('입력 페이지를 변경하지 않는다', () => {
    const page = pageWithRemaining(10);
    const before = { elements: [...page.elements], cursorY: page.cursorY };
    layoutOp(write('가나다'), page);
    expect(page).toEqual(before);
  });
});

describe('layoutOp box', () => {
  it('place 없는 box는 커서에서 배치', () => {
    const op: BoxOp = { op: 'box', id: 'b1', text: '주어', shape: 'rect' };
    const result = layoutOp(op, emptyPage());
    expect(result.clearBefore).toBe(false);
    expect(only(result.placed).id).toBe('b1');
  });

  it('하단 근처의 box는 clearBefore true, 새 bbox.y = MARGIN', () => {
    const op: BoxOp = { op: 'box', id: 'b1', text: '주어', shape: 'rect' };
    const result = layoutOp(op, pageAt(BOTTOM_LIMIT - 10));
    expect(result.clearBefore).toBe(true);
    expect(only(result.placed).bbox.y).toBe(MARGIN);
  });

  it('참조 id가 없으면 placed 0개, 페이지 그대로', () => {
    const op: BoxOp = { op: 'box', id: 'b2', text: '목적어', shape: 'rect', place: { rel: 'right_of', of: 'none' } };
    const page = pageWithRemaining(5);
    const result = layoutOp(op, page);
    expect(result.placed).toEqual([]);
    expect(result.clearBefore).toBe(false);
    expect(result.page).toBe(page);
  });
});

describe('layoutOp arrow·mark', () => {
  const twoBoxes: PageState = {
    elements: [
      element('a', { x: 100, y: 200, w: 100, h: 60 }),
      element('b', { x: 400, y: 200, w: 100, h: 60 }),
    ],
    cursorY: 300,
  };

  it('참조가 있으면 arrow를 배치한다', () => {
    const op: ArrowOp = { op: 'arrow', from: 'a', to: 'b' };
    const result = layoutOp(op, twoBoxes);
    expect(result.clearBefore).toBe(false);
    expect(result.placed).toHaveLength(1);
    expect(result.page.cursorY).toBe(twoBoxes.cursorY);
  });

  it('clear 후 이전 id를 참조하는 arrow는 placed 0개', () => {
    const cleared = layoutOp({ op: 'newpage' }, twoBoxes);
    expect(cleared.clearBefore).toBe(true);
    const result = layoutOp({ op: 'arrow', from: 'a', to: 'b' }, cleared.page);
    expect(result.placed).toEqual([]);
    expect(result.clearBefore).toBe(false);
    expect(result.page).toBe(cleared.page);
  });

  it('참조가 있으면 mark를 배치한다', () => {
    const op: MarkOp = { op: 'mark', target: 'a', style: 'underline' };
    const result = layoutOp(op, twoBoxes);
    expect(result.placed).toHaveLength(1);
  });

  it('clear 후 이전 id를 참조하는 mark는 placed 0개', () => {
    const op: MarkOp = { op: 'mark', target: 'a', style: 'circle' };
    const result = layoutOp(op, emptyPage());
    expect(result.placed).toEqual([]);
  });
});

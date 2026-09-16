import { describe, expect, it } from 'vitest';
import type { PageState, PlacedElement } from '../contracts/layout.ts';
import type { MarkOp } from '../contracts/ops.ts';
import { layoutMark } from './mark.ts';
import { MARGIN } from './constants.ts';

function elementAt(id: string, bbox: PlacedElement['bbox']): PlacedElement {
  return { id, kind: 'box', bbox, strokes: [] };
}

function mark(target: string, style: MarkOp['style'], overrides: Partial<MarkOp> = {}): MarkOp {
  return { op: 'mark', target, style, ...overrides };
}

function pageWith(...elements: PlacedElement[]): PageState {
  return { elements, cursorY: MARGIN };
}

/** 배치가 성공했다고 보고 결과를 꺼낸다. */
function place(op: MarkOp, page: PageState): { placed: PlacedElement; page: PageState } {
  const result = layoutMark(op, page);
  if (!result) throw new Error(`배치 실패: ${op.target}`);
  return result;
}

describe('layoutMark', () => {
  it('underline: 획 y = target bottom + 6', () => {
    const target = elementAt('t', { x: 100, y: 200, w: 120, h: 40 });
    const page = pageWith(target);

    const { placed } = place(mark('t', 'underline'), page);

    expect(placed.strokes[0]!.points[0]!.y).toBe(240 + 6);
    expect(placed.strokes[0]!.points[1]!.y).toBe(240 + 6);
  });

  it('색 기본값은 red', () => {
    const target = elementAt('t', { x: 100, y: 200, w: 120, h: 40 });
    const page = pageWith(target);

    const { placed } = place(mark('t', 'underline'), page);

    expect(placed.strokes.every((s) => s.color === 'red')).toBe(true);
  });

  it('color를 지정하면 그 색을 쓴다', () => {
    const target = elementAt('t', { x: 100, y: 200, w: 120, h: 40 });
    const page = pageWith(target);

    const { placed } = place(mark('t', 'circle', { color: 'blue' }), page);

    expect(placed.strokes.every((s) => s.color === 'blue')).toBe(true);
  });

  it('groupId와 id가 "mark:target:style"이다', () => {
    const target = elementAt('t', { x: 100, y: 200, w: 120, h: 40 });
    const page = pageWith(target);

    const { placed } = place(mark('t', 'check'), page);

    expect(placed.id).toBe('mark:t:check');
    expect(placed.strokes.every((s) => s.groupId === 'mark:t:check')).toBe(true);
  });

  it('없는 id를 참조하면 null', () => {
    expect(layoutMark(mark('nope', 'underline'), emptyPage())).toBeNull();
  });

  it('cursorY를 바꾸지 않는다', () => {
    const target = elementAt('t', { x: 100, y: 200, w: 120, h: 40 });
    const page = pageWith(target);

    const { page: nextPage } = place(mark('t', 'underline'), page);

    expect(nextPage.cursorY).toBe(page.cursorY);
  });

  it('입력 page를 변경하지 않는다', () => {
    const target = elementAt('t', { x: 100, y: 200, w: 120, h: 40 });
    const page = pageWith(target);

    place(mark('t', 'underline'), page);

    expect(page.elements).toEqual([target]);
  });
});

function emptyPage(): PageState {
  return { elements: [], cursorY: MARGIN };
}

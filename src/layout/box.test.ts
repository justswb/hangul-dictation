import { describe, expect, it } from 'vitest';
import type { PageState, PlacedElement } from '../contracts/layout.ts';
import type { BoxOp } from '../contracts/ops.ts';
import { measureText, textToStrokes } from '../render/text.ts';
import { BOX_RIGHT_LIMIT, layoutBox } from './box.ts';
import {
  BOX_CURSOR_GAP,
  BOX_GAP_X,
  BOX_GAP_Y,
  BOX_PADDING_X,
  BOX_PADDING_Y,
  MARGIN,
  OVERLAP_GAP,
  STROKE_WIDTH,
  TEXT_HEIGHT,
} from './constants.ts';
import { bottom, overlaps, right } from './geometry.ts';

const BODY = TEXT_HEIGHT.body;

function emptyPage(): PageState {
  return { elements: [], cursorY: MARGIN };
}

function box(id: string, text: string, overrides: Partial<BoxOp> = {}): BoxOp {
  return { op: 'box', id, text, shape: 'rect', ...overrides };
}

/** 배치가 성공했다고 보고 결과를 꺼낸다. */
function place(op: BoxOp, page: PageState): { placed: PlacedElement; page: PageState } {
  const result = layoutBox(op, page);
  if (!result) throw new Error(`배치 실패: ${op.id}`);
  return result;
}

describe('layoutBox 크기', () => {
  it('폭·높이는 텍스트 크기에 안쪽 여백을 더한 값이다', () => {
    const { placed } = place(box('c', '고양이'), emptyPage());

    expect(placed.bbox.w).toBe(measureText('고양이', BODY) + 2 * BOX_PADDING_X);
    expect(placed.bbox.h).toBe(BODY + 2 * BOX_PADDING_Y);
  });

  it('라벨을 도형 안 가운데에 놓는다', () => {
    const { placed } = place(box('c', '고양이'), emptyPage());
    // 같은 글자를 안쪽 여백 위치에 직접 그린 것과 획 좌표가 같아야 한다.
    const expected = textToStrokes('고양이', {
      x: placed.bbox.x + BOX_PADDING_X,
      y: placed.bbox.y + BOX_PADDING_Y,
      height: BODY,
      color: 'black',
      width: STROKE_WIDTH.body,
    });
    // 앞 4획은 사각형 테두리다.
    const labelStrokes = placed.strokes.slice(4).map((s) => s.points);

    expect(labelStrokes).toEqual(expected.strokes.map((s) => s.points));
  });

  it('모든 획의 groupId가 op.id다', () => {
    const { placed } = place(box('c', '고양이', { shape: 'ellipse' }), emptyPage());

    expect(placed.strokes.length).toBeGreaterThan(1);
    expect(placed.strokes.every((s) => s.groupId === 'c')).toBe(true);
  });

  it('shape에 따라 획 종류가 달라진다', () => {
    const rect = place(box('c', '가'), emptyPage()).placed;
    const ellipse = place(box('c', '가', { shape: 'ellipse' }), emptyPage()).placed;
    // rect는 2점짜리 변 4획, ellipse는 49점짜리 1획으로 시작한다.
    expect(rect.strokes.slice(0, 4).every((s) => s.points.length === 2)).toBe(true);
    expect(ellipse.strokes[0]?.points.length).toBe(49);
  });
});

describe('layoutBox 위치', () => {
  it('place가 없으면 x = MARGIN, y = cursorY', () => {
    const { placed } = place(box('c', '고양이'), emptyPage());

    expect(placed.bbox.x).toBe(60);
    expect(placed.bbox.x).toBe(MARGIN);
    expect(placed.bbox.y).toBe(MARGIN);
  });

  it('right_of는 참조 요소 오른쪽에 같은 y로 놓는다', () => {
    const first = place(box('c', '고양이'), emptyPage());
    const second = place(box('s', '동물', { place: { rel: 'right_of', of: 'c' } }), first.page);

    expect(second.placed.bbox.x).toBe(right(first.placed.bbox) + BOX_GAP_X);
    expect(second.placed.bbox.y).toBe(first.placed.bbox.y);
  });

  it('below는 참조 요소 아래에 같은 x로 놓는다', () => {
    const first = place(box('c', '고양이'), emptyPage());
    const second = place(box('d', '개', { place: { rel: 'below', of: 'c' } }), first.page);

    expect(second.placed.bbox.x).toBe(first.placed.bbox.x);
    expect(second.placed.bbox.y).toBe(bottom(first.placed.bbox) + BOX_GAP_Y);
  });

  it('없는 id를 참조하면 null', () => {
    expect(layoutBox(box('s', '동물', { place: { rel: 'right_of', of: 'nope' } }), emptyPage())).toBeNull();
  });

  it('cursorY를 box 아래로 내린다', () => {
    const { placed, page } = place(box('c', '고양이'), emptyPage());

    expect(page.cursorY).toBe(bottom(placed.bbox) + BOX_CURSOR_GAP);
  });

  it('cursorY는 줄어들지 않는다', () => {
    const start: PageState = { elements: [], cursorY: MARGIN };
    const first = place(box('c', '고양이'), start);
    const second = place(box('d', '개', { place: { rel: 'below', of: 'c' } }), first.page);
    const third = place(box('e', '새', { place: { rel: 'right_of', of: 'c' } }), second.page);

    expect(third.page.cursorY).toBe(second.page.cursorY);
  });
});

describe('layoutBox 겹침 해소', () => {
  it('오른쪽 자리에 이미 요소가 있으면 겹치지 않게 오른쪽으로 민다', () => {
    const first = place(box('c', '고양이'), emptyPage());
    // c 오른쪽 자리를 미리 차지하는 요소.
    const blockerX = right(first.placed.bbox) + BOX_GAP_X;
    const blocker: PlacedElement = {
      id: 'blocker',
      kind: 'box',
      bbox: { x: blockerX, y: first.placed.bbox.y, w: 200, h: first.placed.bbox.h },
      strokes: [],
    };
    const page: PageState = { elements: [...first.page.elements, blocker], cursorY: first.page.cursorY };

    const second = place(box('s', '동물', { place: { rel: 'right_of', of: 'c' } }), page);

    expect(overlaps(second.placed.bbox, blocker.bbox)).toBe(false);
    expect(overlaps(second.placed.bbox, first.placed.bbox)).toBe(false);
    expect(second.placed.bbox.x).toBe(blockerX + 200 + OVERLAP_GAP);
    expect(second.placed.bbox.y).toBe(first.placed.bbox.y);
  });

  it('오른쪽 여백을 넘으면 왼쪽 여백에서 가장 아래 요소 아래로 내린다', () => {
    const first = place(box('c', '고양이'), emptyPage());
    const blocker: PlacedElement = {
      id: 'blocker',
      kind: 'box',
      bbox: {
        x: right(first.placed.bbox) + BOX_GAP_X,
        y: first.placed.bbox.y,
        w: BOX_RIGHT_LIMIT - (right(first.placed.bbox) + BOX_GAP_X),
        h: first.placed.bbox.h,
      },
      strokes: [],
    };
    const page: PageState = { elements: [...first.page.elements, blocker], cursorY: first.page.cursorY };

    const second = place(box('s', '동물', { place: { rel: 'right_of', of: 'c' } }), page);

    expect(second.placed.bbox.x).toBe(MARGIN);
    expect(second.placed.bbox.y).toBe(Math.max(bottom(first.placed.bbox), bottom(blocker.bbox)) + BOX_GAP_Y);
    expect(overlaps(second.placed.bbox, blocker.bbox)).toBe(false);
  });
});

describe('layoutBox 순수성', () => {
  it('입력 page를 변경하지 않는다', () => {
    const page = emptyPage();
    place(box('c', '고양이'), page);

    expect(page.elements).toEqual([]);
    expect(page.cursorY).toBe(MARGIN);
  });
});

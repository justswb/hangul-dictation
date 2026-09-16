import { describe, expect, it } from 'vitest';
import type { PageState, PlacedElement } from '../contracts/layout.ts';
import type { ArrowOp } from '../contracts/ops.ts';
import { measureText, textToStrokes } from '../render/text.ts';
import { layoutArrow } from './arrow.ts';
import { ARROW_END_GAP, ARROW_LABEL_GAP, MARGIN, STROKE_WIDTH, TEXT_HEIGHT } from './constants.ts';

function elementAt(id: string, bbox: PlacedElement['bbox']): PlacedElement {
  return { id, kind: 'box', bbox, strokes: [] };
}

function arrow(from: string, to: string, overrides: Partial<ArrowOp> = {}): ArrowOp {
  return { op: 'arrow', from, to, ...overrides };
}

function pageWith(...elements: PlacedElement[]): PageState {
  return { elements, cursorY: MARGIN };
}

/** 배치가 성공했다고 보고 결과를 꺼낸다. */
function place(op: ArrowOp, page: PageState): { placed: PlacedElement; page: PageState } {
  const result = layoutArrow(op, page);
  if (!result) throw new Error(`배치 실패: ${op.from}>${op.to}`);
  return result;
}

describe('layoutArrow 좌표', () => {
  it('가로로 나란한 두 box: 시작 x = 왼쪽 box right + 6, 끝 x = 오른쪽 box left - 6', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const right = elementAt('b', { x: 400, y: 200, w: 100, h: 60 });
    const page = pageWith(left, right);

    const { placed } = place(arrow('a', 'b'), page);
    const body = placed.strokes[0]!.points;

    expect(body[0]!.x).toBe(left.bbox.x + left.bbox.w + ARROW_END_GAP);
    expect(body[1]!.x).toBe(right.bbox.x - ARROW_END_GAP);
    // 같은 y 중심선을 지나므로 y는 두 bbox의 중심과 같다.
    expect(body[0]!.y).toBeCloseTo(230);
    expect(body[1]!.y).toBeCloseTo(230);
  });

  it('세로로 놓인 두 box: 시작 y = 위 box bottom + 6', () => {
    const top = elementAt('a', { x: 100, y: 100, w: 80, h: 40 });
    const bottomBox = elementAt('b', { x: 100, y: 300, w: 80, h: 40 });
    const page = pageWith(top, bottomBox);

    const { placed } = place(arrow('a', 'b'), page);
    const body = placed.strokes[0]!.points;

    expect(body[0]!.y).toBe(top.bbox.y + top.bbox.h + ARROW_END_GAP);
    expect(body[1]!.y).toBe(bottomBox.bbox.y - ARROW_END_GAP);
  });

  it('label이 있으면 획에 텍스트가 포함되고, 텍스트가 선분보다 위에 있다', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const right = elementAt('b', { x: 400, y: 200, w: 100, h: 60 });
    const page = pageWith(left, right);

    const withoutLabel = place(arrow('a', 'b'), page).placed;
    const withLabel = place(arrow('a', 'b', { label: '설명' }), page).placed;

    expect(withLabel.strokes.length).toBeGreaterThan(withoutLabel.strokes.length);

    const body = withLabel.strokes[0]!.points;
    const midY = (body[0]!.y + body[1]!.y) / 2;
    const labelStrokes = withLabel.strokes.slice(withoutLabel.strokes.length);
    const labelMaxY = Math.max(...labelStrokes.flatMap((s) => s.points.map((p) => p.y)));

    expect(labelMaxY).toBeLessThan(midY - ARROW_LABEL_GAP + 0.001);

    // 같은 텍스트를 선분 중점 위 가운데 정렬 위치에 직접 그린 것과 획 좌표가 같아야 한다.
    const noteHeight = TEXT_HEIGHT.note;
    const midX = (body[0]!.x + body[1]!.x) / 2;
    const textWidth = measureText('설명', noteHeight);
    const expected = textToStrokes('설명', {
      x: midX - textWidth / 2,
      y: midY - ARROW_LABEL_GAP - noteHeight,
      height: noteHeight,
      color: 'black',
      width: STROKE_WIDTH.note,
    });

    expect(labelStrokes.map((s) => s.points)).toEqual(expected.strokes.map((s) => s.points));
  });

  it('수평 화살표: bbox.h > 0이고 모든 획의 모든 점이 bbox 안에 들어온다 (화살촉이 몸통보다 옆으로 벌어짐)', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const right = elementAt('b', { x: 400, y: 200, w: 100, h: 60 });
    const page = pageWith(left, right);

    const { placed } = place(arrow('a', 'b'), page);

    expect(placed.bbox.h).toBeGreaterThan(0);
    for (const stroke of placed.strokes) {
      for (const p of stroke.points) {
        expect(p.x).toBeGreaterThanOrEqual(placed.bbox.x - 1e-9);
        expect(p.x).toBeLessThanOrEqual(placed.bbox.x + placed.bbox.w + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(placed.bbox.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(placed.bbox.y + placed.bbox.h + 1e-9);
      }
    }
  });

  it('수직 화살표: bbox.w > 0 (화살촉이 몸통보다 옆으로 벌어짐)', () => {
    const top = elementAt('a', { x: 100, y: 100, w: 80, h: 40 });
    const bottomBox = elementAt('b', { x: 100, y: 300, w: 80, h: 40 });
    const page = pageWith(top, bottomBox);

    const { placed } = place(arrow('a', 'b'), page);

    expect(placed.bbox.w).toBeGreaterThan(0);
    for (const stroke of placed.strokes) {
      for (const p of stroke.points) {
        expect(p.x).toBeGreaterThanOrEqual(placed.bbox.x - 1e-9);
        expect(p.x).toBeLessThanOrEqual(placed.bbox.x + placed.bbox.w + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(placed.bbox.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(placed.bbox.y + placed.bbox.h + 1e-9);
      }
    }
  });

  it('groupId와 id가 "arrow:from>to"다', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const right = elementAt('b', { x: 400, y: 200, w: 100, h: 60 });
    const page = pageWith(left, right);

    const { placed } = place(arrow('a', 'b'), page);

    expect(placed.id).toBe('arrow:a>b');
    expect(placed.strokes.every((s) => s.groupId === 'arrow:a>b')).toBe(true);
  });

  it('없는 id를 참조하면 null', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const page = pageWith(left);

    expect(layoutArrow(arrow('a', 'nope'), page)).toBeNull();
    expect(layoutArrow(arrow('nope', 'a'), page)).toBeNull();
  });

  it('from과 to가 같으면 null (판단: 중심이 겹쳐 NaN이 되는 것을 막는 방어)', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const page = pageWith(left);

    expect(layoutArrow(arrow('a', 'a'), page)).toBeNull();
  });

  it('cursorY를 바꾸지 않는다', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const right = elementAt('b', { x: 400, y: 200, w: 100, h: 60 });
    const page = pageWith(left, right);

    const { page: nextPage } = place(arrow('a', 'b'), page);

    expect(nextPage.cursorY).toBe(page.cursorY);
  });

  it('입력 page를 변경하지 않는다', () => {
    const left = elementAt('a', { x: 100, y: 200, w: 100, h: 60 });
    const right = elementAt('b', { x: 400, y: 200, w: 100, h: 60 });
    const page = pageWith(left, right);

    place(arrow('a', 'b'), page);

    expect(page.elements).toEqual([left, right]);
  });
});

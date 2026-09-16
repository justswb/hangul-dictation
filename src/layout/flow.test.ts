import { describe, expect, it } from 'vitest';
import { BOARD } from '../contracts/layout.ts';
import type { PageState } from '../contracts/layout.ts';
import type { WriteOp } from '../contracts/ops.ts';
import { measureText } from '../render/text.ts';
import { CONTENT_WIDTH, layoutWrite, wrapText } from './flow.ts';
import { LINE_HEIGHT_RATIO, MARGIN, STROKE_WIDTH, TEXT_HEIGHT } from './constants.ts';

function emptyPage(): PageState {
  return { elements: [], cursorY: MARGIN };
}

function write(text: string, overrides: Partial<WriteOp> = {}): WriteOp {
  return { op: 'write', id: 'w1', text, size: 'body', ...overrides };
}

/** 획들이 실제로 몇 개의 서로 다른 y 줄에 놓였는지 센다. */
function strokeLineTops(strokes: { points: { y: number }[] }[]): number[] {
  const tops = new Set<number>();
  for (const stroke of strokes) for (const p of stroke.points) tops.add(Math.round(p.y));
  return [...tops].sort((a, b) => a - b);
}

describe('wrapText', () => {
  it('폭 안에 들어가면 한 줄로 둔다', () => {
    expect(wrapText('가나 다라', 44, CONTENT_WIDTH)).toEqual(['가나 다라']);
  });

  it('폭을 넘으면 공백 위치에서 나눈다', () => {
    const lines = wrapText('가나다 라마바 사아자', 44, measureText('가나다 라마바', 44));
    expect(lines).toEqual(['가나다 라마바', '사아자']);
  });

  it('어절 하나가 폭보다 길면 글자 단위로 자른다', () => {
    const height = 44;
    const word = '가'.repeat(10);
    const maxWidth = measureText('가가가', height);
    const lines = wrapText(word, height, maxWidth);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(word);
    for (const line of lines) expect(measureText(line, height)).toBeLessThanOrEqual(maxWidth);
  });

  it('빈 텍스트도 한 줄로 본다', () => {
    expect(wrapText('', 44, CONTENT_WIDTH)).toEqual(['']);
  });
});

describe('layoutWrite', () => {
  it('빈 페이지의 짧은 body는 여백 위치에 한 줄로 놓인다', () => {
    const { placed, page } = layoutWrite(write('안녕하세요'), emptyPage());

    expect(placed.kind).toBe('text');
    expect(placed.bbox.x).toBe(MARGIN);
    expect(placed.bbox.y).toBe(60);
    expect(placed.bbox.h).toBe(TEXT_HEIGHT.body * LINE_HEIGHT_RATIO);
    expect(placed.bbox.w).toBeCloseTo(measureText('안녕하세요', TEXT_HEIGHT.body));
    expect(page.cursorY).toBe(placed.bbox.y + placed.bbox.h);
  });

  it('폭을 넘는 긴 문장은 공백에서 두 줄 이상으로 나뉜다', () => {
    const height = TEXT_HEIGHT.body;
    // 한 줄 폭을 확실히 넘도록 어절을 반복한다.
    const text = Array.from({ length: 20 }, (_, i) => `어절${i}`).join(' ');
    expect(measureText(text, height)).toBeGreaterThan(CONTENT_WIDTH);

    const lines = wrapText(text, height, CONTENT_WIDTH);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // 줄바꿈 위치가 공백이었다: 각 줄에 공백이 다시 붙으면 원문과 같다.
    expect(lines.join(' ')).toBe(text);
    for (const line of lines) expect(measureText(line, height)).toBeLessThanOrEqual(CONTENT_WIDTH);

    const { placed } = layoutWrite(write(text), emptyPage());
    expect(placed.bbox.h).toBe(lines.length * height * LINE_HEIGHT_RATIO);
    expect(placed.bbox.w).toBeLessThanOrEqual(CONTENT_WIDTH);
    // 획이 실제로 여러 줄에 걸쳐 있다.
    const tops = strokeLineTops(placed.strokes);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(height);
  });

  it('write 2개를 연속 배치하면 두 번째가 첫 번째 아래에서 시작한다', () => {
    const first = layoutWrite(write('첫 줄', { id: 'a', size: 'title' }), emptyPage());
    const second = layoutWrite(write('둘째 줄', { id: 'b' }), first.page);

    expect(second.placed.bbox.y).toBe(first.placed.bbox.y + first.placed.bbox.h);
    expect(second.page.elements.map((e) => e.id)).toEqual(['a', 'b']);
    expect(second.page.cursorY).toBe(second.placed.bbox.y + second.placed.bbox.h);
  });

  it('입력 page 객체를 변경하지 않는다', () => {
    const page = emptyPage();
    const snapshot = JSON.stringify(page);

    const result = layoutWrite(write('변경 금지'), page);

    expect(JSON.stringify(page)).toBe(snapshot);
    expect(page.elements).toHaveLength(0);
    expect(result.page).not.toBe(page);
    expect(result.page.elements).not.toBe(page.elements);
  });

  it('모든 획의 groupId가 op.id다', () => {
    const text = Array.from({ length: 20 }, (_, i) => `어절${i}`).join(' ');
    const { placed } = layoutWrite(write(text, { id: 'op-42' }), emptyPage());

    expect(placed.strokes.length).toBeGreaterThan(0);
    for (const stroke of placed.strokes) expect(stroke.groupId).toBe('op-42');
  });

  it('크기별 높이·굵기와 기본 색을 쓴다', () => {
    const title = layoutWrite(write('제목', { size: 'title' }), emptyPage());
    expect(title.placed.bbox.h).toBe(TEXT_HEIGHT.title * LINE_HEIGHT_RATIO);
    expect(title.placed.strokes[0]?.width).toBe(STROKE_WIDTH.title);
    expect(title.placed.strokes[0]?.color).toBe('black');

    const note = layoutWrite(write('각주', { size: 'note', color: 'red' }), emptyPage());
    expect(note.placed.bbox.h).toBe(TEXT_HEIGHT.note * LINE_HEIGHT_RATIO);
    expect(note.placed.strokes[0]?.width).toBe(STROKE_WIDTH.note);
    expect(note.placed.strokes[0]?.color).toBe('red');
  });

  it('쓸 수 있는 폭은 보드에서 좌우 여백을 뺀 값이다', () => {
    expect(CONTENT_WIDTH).toBe(BOARD.w - 2 * MARGIN);
  });
});

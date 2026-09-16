/**
 * write op의 흐름 배치 (T20).
 *
 * - 위치는 항상 왼쪽 여백(`MARGIN`)에서 시작하고 세로는 `page.cursorY`부터 쓴다.
 * - 쓸 수 있는 폭(`BOARD.w − 2 × MARGIN`)을 넘으면 공백 기준 어절 단위로 줄을 나눈다.
 *   어절 하나가 그 폭보다 길면 그 어절만 글자 단위로 자른다.
 * - 여러 줄이어도 결과는 요소 하나이며, 모든 획의 `groupId`는 `op.id`다.
 * - 입력 `page`는 변경하지 않고 새 `PageState`를 반환한다.
 */
import type { PageState, PlacedElement } from '../contracts/layout.ts';
import { BOARD } from '../contracts/layout.ts';
import type { WriteOp } from '../contracts/ops.ts';
import type { DrawStroke } from '../contracts/stroke.ts';
import { measureText, textToStrokes } from '../render/text.ts';
import { DEFAULT_COLOR, LINE_HEIGHT_RATIO, MARGIN, STROKE_WIDTH, TEXT_HEIGHT } from './constants.ts';

/** 흐름 배치가 쓸 수 있는 가로 폭(px). */
export const CONTENT_WIDTH = BOARD.w - 2 * MARGIN;

/**
 * 한 어절이 `maxWidth`보다 길 때 글자 단위로 자른다.
 * 글자 하나가 이미 `maxWidth`를 넘어도 그 글자만으로 한 줄을 만든다(무한 루프 방지).
 */
function splitLongWord(word: string, height: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = '';

  for (const ch of word) {
    if (piece !== '' && measureText(piece + ch, height) > maxWidth) {
      pieces.push(piece);
      piece = ch;
    } else {
      piece += ch;
    }
  }

  if (piece !== '') pieces.push(piece);
  return pieces;
}

/**
 * 텍스트를 공백 기준 어절 단위로 줄바꿈한다. 연속 공백은 하나로 합쳐지고 줄 앞뒤 공백은
 * 사라진다. 빈 텍스트는 빈 줄 하나로 본다(높이가 0이 되지 않게).
 */
export function wrapText(text: string, height: number, maxWidth: number): string[] {
  const words = text.split(' ').filter((word) => word !== '');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (measureText(candidate, height) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current !== '') lines.push(current);

    if (measureText(word, height) <= maxWidth) {
      current = word;
      continue;
    }

    const pieces = splitLongWord(word, height, maxWidth);
    lines.push(...pieces.slice(0, -1));
    current = pieces[pieces.length - 1] ?? '';
  }

  if (current !== '') lines.push(current);
  if (lines.length === 0) lines.push('');
  return lines;
}

/**
 * write op 하나를 배치한다. 순수 함수 — 입력 `page`는 변경하지 않는다.
 */
export function layoutWrite(op: WriteOp, page: PageState): { placed: PlacedElement; page: PageState } {
  const height = TEXT_HEIGHT[op.size];
  const width = STROKE_WIDTH[op.size];
  const color = op.color ?? DEFAULT_COLOR;
  const lineHeight = height * LINE_HEIGHT_RATIO;

  const x = MARGIN;
  const y = page.cursorY;
  const lines = wrapText(op.text, height, CONTENT_WIDTH);

  const strokes: DrawStroke[] = [];
  let maxLineWidth = 0;

  lines.forEach((line, index) => {
    const result = textToStrokes(line, { x, y: y + index * lineHeight, height, color, width });
    // 한 op에서 나온 획은 모두 같은 그룹이다 (textToStrokes는 글자 단위 groupId를 붙인다).
    for (const stroke of result.strokes) strokes.push({ ...stroke, groupId: op.id });
    maxLineWidth = Math.max(maxLineWidth, result.width);
  });

  const placed: PlacedElement = {
    id: op.id,
    kind: 'text',
    bbox: { x, y, w: maxLineWidth, h: lines.length * lineHeight },
    strokes,
    text: op.text,
  };

  return {
    placed,
    page: {
      elements: [...page.elements, placed],
      cursorY: y + placed.bbox.h,
    },
  };
}

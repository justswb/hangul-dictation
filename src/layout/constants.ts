/** 흐름 레이아웃 상수 (T20). 초기값이며, 데모를 보며 조정할 수 있다. */
import type { TextSize } from '../contracts/ops.ts';
import type { Color } from '../contracts/stroke.ts';

/** 보드 네 변의 여백(px). */
export const MARGIN = 60;

/** 텍스트 크기별 글자 칸 높이(px). */
export const TEXT_HEIGHT: Record<TextSize, number> = {
  title: 64,
  body: 44,
  note: 32,
};

/** 텍스트 크기별 획 굵기(px). */
export const STROKE_WIDTH: Record<TextSize, number> = {
  title: 5,
  body: 4,
  note: 3,
};

/** 줄 간격 = 글자 높이 × 이 비율. */
export const LINE_HEIGHT_RATIO = 1.4;

/** 색이 지정되지 않은 op의 기본 색. */
export const DEFAULT_COLOR: Color = 'black';

/** 도식 상수 (T21). */

/** box 안쪽 좌우 여백(px). */
export const BOX_PADDING_X = 24;

/** box 안쪽 위아래 여백(px). */
export const BOX_PADDING_Y = 16;

/** `right_of` 배치 시 참조 요소 오른쪽과의 간격(px). */
export const BOX_GAP_X = 80;

/** `below` 배치(및 줄 넘김) 시 위쪽 요소 아래와의 간격(px). */
export const BOX_GAP_Y = 60;

/** 겹침을 풀 때 겹친 폭에 더하는 여유(px). */
export const OVERLAP_GAP = 20;

/** box 배치 후 `cursorY`가 box 아래로 두는 간격(px). */
export const BOX_CURSOR_GAP = 20;

/** box 라벨의 텍스트 크기. */
export const BOX_TEXT_SIZE: TextSize = 'body';

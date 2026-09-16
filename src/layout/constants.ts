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

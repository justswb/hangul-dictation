import type { DrawStroke } from './stroke.ts';

/** 보드 논리 크기. 캔버스는 이 비율을 유지해 스케일한다. */
export const BOARD = { w: 1600, h: 1000 } as const;

/** 보드 좌표 사각형. */
export type Rect = { x: number; y: number; w: number; h: number };

/** 배치된 요소 종류. */
export type ElementKind = 'text' | 'box' | 'arrow' | 'mark';

/** 배치가 끝난 요소: 위치와 그릴 획. */
export type PlacedElement = {
  /** op의 id (arrow·mark는 레이아웃이 만든 id). */
  id: string;
  kind: ElementKind;
  bbox: Rect;
  strokes: DrawStroke[];
  /** 요약에 쓰는 텍스트 (있을 때만). */
  text?: string;
};

/** 현재 페이지 상태. 레이아웃 함수는 이 값을 변경하지 않고 새 값을 반환한다. */
export type PageState = {
  /** 배치 순서대로의 요소. */
  elements: PlacedElement[];
  /** 다음 흐름 배치의 y. */
  cursorY: number;
};

/** layoutOp 결과. clearBefore면 placed를 그리기 전에 보드를 지운다. */
export type LayoutResult = { clearBefore: boolean; placed: PlacedElement[]; page: PageState };

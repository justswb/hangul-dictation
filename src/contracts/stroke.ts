/** 2D 점. 좌표계(0–1 박스, 글자 높이 단위, 보드 좌표)는 쓰는 곳에서 정한다. */
export type Point = { x: number; y: number };

/** 획: 쓰는 방향 순서의 점 배열. */
export type Stroke = Point[];

/** 라틴 글리프: 글자 높이 = 1 단위의 획과 전진 폭. */
export type Glyph = { strokes: Stroke[]; advance: number };

/** 마커 색. */
export type Color = 'black' | 'blue' | 'red';

/** 획 렌더 속성. groupId는 같은 op에서 나온 획을 묶는다. */
export type StrokeStyle = { color: Color; width: number; groupId: string };

/** 보드 좌표 획 + 렌더 속성. 애니메이터가 그리는 단위. */
export type DrawStroke = StrokeStyle & { points: Point[] };

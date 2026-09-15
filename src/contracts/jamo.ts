/**
 * 한글 자모 획 데이터 (`src/glyphs/hangul/jamo/<글자>.json`).
 * 좌표는 0–1 박스, x 오른쪽, y 아래. 획은 필순, 점은 쓰는 방향 순서.
 */
export type JamoData = {
  /** 호환 자모 한 글자 (예: "ㄱ", "ㅏ"). */
  char: string;
  /** 획 목록. 각 획은 [x, y] 점 배열. */
  strokes: [number, number][][];
};

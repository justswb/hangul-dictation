/**
 * 텍스트(한 줄) → 획 변환.
 *
 * - 한글 음절: `composeSyllable` 결과(0–1 칸)를 `height × height`로 확대.
 * - ASCII 32–126: Hershey 글리프(대문자 높이 = 1 단위)를 `0.75 × height`로 확대,
 *   칸 아래쪽(기준선)에 정렬한다.
 * - 공백: 획 없이 `0.35 × height`만큼 전진한다.
 * - 그 외 문자(한글 음절도 ASCII도 아님): 이번 티켓에서는 건너뛴다(T14).
 */
import type { DrawStroke, Point, Stroke } from '../contracts/stroke.ts';
import { composeSyllable } from '../glyphs/hangul/compose.ts';
import { parseJhf } from '../glyphs/latin/hershey.ts';
import hersheyFont from '../../assets/hershey/futural.jhf?raw';

/** 한글 음절 사이 간격 = height 비율. (판단: ASCII·공백 옆에는 추가 간격을 두지 않는다 — 각자 전진폭이 이미 분리 역할을 한다.) */
const LETTER_GAP_RATIO = 0.08;
/** ASCII 글리프 확대 비율. */
const LATIN_SCALE_RATIO = 0.75;
/** 공백 전진 비율. */
const SPACE_RATIO = 0.35;

const ASCII_FIRST_CODE = 32;
const ASCII_LAST_CODE = 126;

const latinGlyphs = parseJhf(hersheyFont);

export type TextToStrokesOptions = {
  /** 첫 글자 칸의 왼쪽 위 x. */
  x: number;
  /** 첫 글자 칸의 왼쪽 위 y. */
  y: number;
  /** 글자 칸 높이(px). */
  height: number;
  /** 획 색. */
  color: DrawStroke['color'];
  /** 획 굵기(px). */
  width: number;
};

export type TextToStrokesResult = {
  strokes: DrawStroke[];
  /** 전체 텍스트가 차지하는 가로 폭(px). */
  width: number;
};

function placeStroke(stroke: Stroke, originX: number, originY: number, scale: number): Point[] {
  return stroke.map((p) => ({ x: originX + p.x * scale, y: originY + p.y * scale }));
}

/**
 * 텍스트 한 줄 → 획.
 * `(x, y)` = 첫 글자 칸의 왼쪽 위. 지원하지 않는 문자는 건너뛴다(칸도, 간격도 없음).
 */
export function textToStrokes(
  text: string,
  { x, y, height, color, width }: TextToStrokesOptions,
): TextToStrokesResult {
  const strokes: DrawStroke[] = [];
  let cursorX = x;
  let lastWasGlyph = false;
  let charIndex = 0;

  for (const ch of text) {
    if (ch === ' ') {
      cursorX += SPACE_RATIO * height;
      lastWasGlyph = false;
      continue;
    }

    const syllable = composeSyllable(ch);
    if (syllable) {
      if (lastWasGlyph) cursorX += LETTER_GAP_RATIO * height;
      const groupId = `char-${charIndex}`;
      for (const stroke of syllable) {
        strokes.push({ color, width, groupId, points: placeStroke(stroke, cursorX, y, height) });
      }
      cursorX += height;
      lastWasGlyph = true;
      charIndex++;
      continue;
    }

    const code = ch.codePointAt(0) ?? -1;
    const glyph = code >= ASCII_FIRST_CODE && code <= ASCII_LAST_CODE ? latinGlyphs.get(ch) : undefined;
    if (glyph) {
      if (lastWasGlyph) cursorX += LETTER_GAP_RATIO * height;
      const scale = LATIN_SCALE_RATIO * height;
      const originY = y + height - scale; // 기준선(글리프 y=1)이 칸 아래쪽(y+height)에 오도록.
      const groupId = `char-${charIndex}`;
      for (const stroke of glyph.strokes) {
        strokes.push({ color, width, groupId, points: placeStroke(stroke, cursorX, originY, scale) });
      }
      cursorX += glyph.advance * scale;
      lastWasGlyph = true;
      charIndex++;
      continue;
    }

    // 지원하지 않는 문자: 칸도 간격도 만들지 않고 건너뛴다(T14에서 처리).
  }

  return { strokes, width: cursorX - x };
}

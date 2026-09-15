/**
 * 텍스트(한 줄) → 획 변환.
 *
 * - 한글 음절: `composeSyllable` 결과(0–1 칸)를 `height × height`로 확대.
 * - ASCII 32–126: Hershey 글리프(대문자 높이 = 1 단위)를 `0.75 × height`로 확대,
 *   칸 아래쪽(기준선)에 정렬한다.
 * - 공백: 획 없이 `0.35 × height`만큼 전진한다.
 * - 한글 자모 단독(ㄱ, ㅏ 등): `getJamo` 결과(0–1 칸)를 `height × height`로 확대(한글 음절과 동일한 칸).
 * - 그 외 미지원 문자(한자, 이모지 등): Hershey `?` 글리프로 대체해 ASCII와 같은 규칙으로 배치한다.
 *   같은 문자에 대해서는 `console.warn`을 1회만 남긴다.
 */
import type { DrawStroke, Point, Stroke } from '../contracts/stroke.ts';
import { composeSyllable } from '../glyphs/hangul/compose.ts';
import { getJamo } from '../glyphs/hangul/jamo.ts';
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
const FALLBACK_CHAR = '?';

/** 미지원 문자 중 이미 경고를 남긴 문자 집합(중복 경고 방지, 모듈 수준). */
const warnedUnsupportedChars = new Set<string>();

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

function placeTupleStroke(stroke: [number, number][], originX: number, originY: number, scale: number): Point[] {
  return stroke.map(([x, y]) => ({ x: originX + x * scale, y: originY + y * scale }));
}

/**
 * 텍스트 한 줄 → 획.
 * `(x, y)` = 첫 글자 칸의 왼쪽 위. 미지원 문자는 `?` 글리프로 대체한다(칸·간격은 ASCII와 동일).
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

    const jamo = getJamo(ch);
    if (jamo) {
      if (lastWasGlyph) cursorX += LETTER_GAP_RATIO * height;
      const groupId = `char-${charIndex}`;
      for (const stroke of jamo.strokes) {
        strokes.push({ color, width, groupId, points: placeTupleStroke(stroke, cursorX, y, height) });
      }
      cursorX += height;
      lastWasGlyph = true;
      charIndex++;
      continue;
    }

    // 미지원 문자: Hershey `?` 글리프로 대체(같은 문자는 경고 1회만).
    if (!warnedUnsupportedChars.has(ch)) {
      warnedUnsupportedChars.add(ch);
      console.warn(`textToStrokes: 지원하지 않는 문자 "${ch}"를 '?'로 대체합니다.`);
    }
    const fallbackGlyph = latinGlyphs.get(FALLBACK_CHAR);
    if (fallbackGlyph) {
      if (lastWasGlyph) cursorX += LETTER_GAP_RATIO * height;
      const scale = LATIN_SCALE_RATIO * height;
      const originY = y + height - scale;
      const groupId = `char-${charIndex}`;
      for (const stroke of fallbackGlyph.strokes) {
        strokes.push({ color, width, groupId, points: placeStroke(stroke, cursorX, originY, scale) });
      }
      cursorX += fallbackGlyph.advance * scale;
      lastWasGlyph = true;
      charIndex++;
    }
  }

  return { strokes, width: cursorX - x };
}

/**
 * 텍스트 한 줄의 가로 폭(px)만 계산한다. `textToStrokes`와 같은 배치 경로를 공유하므로
 * (내부적으로 `textToStrokes`를 호출) 두 값은 항상 일치한다.
 */
export function measureText(text: string, height: number): number {
  return textToStrokes(text, { x: 0, y: 0, height, color: 'black', width: 0 }).width;
}

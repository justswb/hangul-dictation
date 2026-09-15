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
 *
 * `textToStrokes`와 `measureText`는 글자별 종류·전진폭을 계산하는 `layoutChars` 순회를
 * 공유한다. `measureText`는 그 순회에서 전진폭만 누적할 뿐 획의 최종 좌표(점)는 만들지
 * 않는다 — `placeStroke`/`placeTupleStroke` 호출은 `textToStrokes`의 emit 콜백 안에서만
 * 일어난다.
 */
import type { DrawStroke, Glyph, Point, Stroke } from '../contracts/stroke.ts';
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
const fallbackGlyph: Glyph = (() => {
  const glyph = latinGlyphs.get(FALLBACK_CHAR);
  if (!glyph) throw new Error(`hershey: 대체 글리프 "${FALLBACK_CHAR}"를 찾을 수 없음`);
  return glyph;
})();

/** 미지원 문자 중 이미 경고를 남긴 문자 집합(중복 경고 방지, 모듈 수준). */
const warnedUnsupportedChars = new Set<string>();

function warnUnsupportedOnce(ch: string): void {
  if (warnedUnsupportedChars.has(ch)) return;
  warnedUnsupportedChars.add(ch);
  console.warn(`textToStrokes: 지원하지 않는 문자 "${ch}"를 '?'로 대체합니다.`);
}

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

/** 글자 한 칸의 종류·전진폭·(있다면) 배치용 원본 획 데이터. */
type CharPlan =
  | { kind: 'syllable'; advance: number; strokes: Stroke[] }
  | { kind: 'jamo'; advance: number; strokes: [number, number][][] }
  | { kind: 'latin'; advance: number; glyph: Glyph };

/**
 * 글자 하나를 분류하고 전진폭을 계산한다. 미지원 문자는 `?` 대체 글리프로 취급하며,
 * 이 시점에 (처음 등장할 때만) `console.warn`을 남긴다. 공백은 이 함수가 다루지 않는다
 * (호출부에서 먼저 분기).
 */
function planChar(ch: string, height: number): CharPlan {
  const syllable = composeSyllable(ch);
  if (syllable) return { kind: 'syllable', advance: height, strokes: syllable };

  const code = ch.codePointAt(0) ?? -1;
  const asciiGlyph = code >= ASCII_FIRST_CODE && code <= ASCII_LAST_CODE ? latinGlyphs.get(ch) : undefined;
  if (asciiGlyph) return { kind: 'latin', advance: asciiGlyph.advance * LATIN_SCALE_RATIO * height, glyph: asciiGlyph };

  const jamo = getJamo(ch);
  if (jamo) return { kind: 'jamo', advance: height, strokes: jamo.strokes };

  warnUnsupportedOnce(ch);
  return { kind: 'latin', advance: fallbackGlyph.advance * LATIN_SCALE_RATIO * height, glyph: fallbackGlyph };
}

/**
 * 텍스트 한 줄을 순회하며 각 글자 칸의 전진폭(간격 포함)을 계산한다.
 * `emit`이 주어지면 글자 칸마다(공백 제외) `(plan, cursorX)`로 호출한다 — `cursorX`는
 * 그 칸이 시작하는 위치(0부터, 간격 반영 후)다. 반환값은 전체 텍스트의 가로 폭.
 */
function layoutChars(text: string, height: number, emit?: (plan: CharPlan, cursorX: number) => void): number {
  let cursorX = 0;
  let lastWasGlyph = false;

  for (const ch of text) {
    if (ch === ' ') {
      cursorX += SPACE_RATIO * height;
      lastWasGlyph = false;
      continue;
    }

    if (lastWasGlyph) cursorX += LETTER_GAP_RATIO * height;
    const plan = planChar(ch, height);
    emit?.(plan, cursorX);
    cursorX += plan.advance;
    lastWasGlyph = true;
  }

  return cursorX;
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
  let charIndex = 0;

  const totalWidth = layoutChars(text, height, (plan, cursorX) => {
    const groupId = `char-${charIndex}`;
    const originX = x + cursorX;

    if (plan.kind === 'syllable') {
      for (const stroke of plan.strokes) {
        strokes.push({ color, width, groupId, points: placeStroke(stroke, originX, y, height) });
      }
    } else if (plan.kind === 'jamo') {
      for (const stroke of plan.strokes) {
        strokes.push({ color, width, groupId, points: placeTupleStroke(stroke, originX, y, height) });
      }
    } else {
      const scale = LATIN_SCALE_RATIO * height;
      const originY = y + height - scale; // 기준선(글리프 y=1)이 칸 아래쪽(y+height)에 오도록.
      for (const stroke of plan.glyph.strokes) {
        strokes.push({ color, width, groupId, points: placeStroke(stroke, originX, originY, scale) });
      }
    }

    charIndex++;
  });

  return { strokes, width: totalWidth };
}

/**
 * 텍스트 한 줄의 가로 폭(px)만 계산한다. `textToStrokes`와 같은 `layoutChars` 순회를
 * 공유하므로 두 값은 항상 일치하며, 획의 최종 좌표(점)는 만들지 않는다.
 */
export function measureText(text: string, height: number): number {
  return layoutChars(text, height);
}

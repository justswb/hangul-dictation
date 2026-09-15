/**
 * 자모 획 데이터 조회. 기본 자모는 JSON 그대로, 파생 자모(된소리·겹받침·복합모음)는
 * 기본 자모를 박스에 배치해 생성한다.
 */
import type { JamoData } from '../../contracts/jamo';

type Box = [number, number, number, number];

const modules = import.meta.glob<{ default: JamoData }>('./jamo/*.json', { eager: true });

const BASE = new Map<string, JamoData>();
for (const mod of Object.values(modules)) {
  BASE.set(mod.default.char, mod.default);
}

const LEFT: Box = [0, 0, 0.5, 1];
const RIGHT: Box = [0.5, 0, 0.5, 1];
const HORIZONTAL: Box = [0, 0.45, 0.7, 0.55];
const VERTICAL: Box = [0.7, 0, 0.3, 1];

/** 파생 자모: 글자 → [앞 자모, 뒤 자모, 앞 박스, 뒤 박스]. */
const DERIVED: Record<string, [string, string, Box, Box]> = {};
for (const s of ['ㄲㄱㄱ', 'ㄸㄷㄷ', 'ㅃㅂㅂ', 'ㅆㅅㅅ', 'ㅉㅈㅈ', 'ㄳㄱㅅ', 'ㄵㄴㅈ', 'ㄶㄴㅎ', 'ㄺㄹㄱ', 'ㄻㄹㅁ', 'ㄼㄹㅂ', 'ㄽㄹㅅ', 'ㄾㄹㅌ', 'ㄿㄹㅍ', 'ㅀㄹㅎ', 'ㅄㅂㅅ']) {
  const [c, a, b] = Array.from(s) as [string, string, string];
  DERIVED[c] = [a, b, LEFT, RIGHT];
}
for (const s of ['ㅘㅗㅏ', 'ㅙㅗㅐ', 'ㅚㅗㅣ', 'ㅝㅜㅓ', 'ㅞㅜㅔ', 'ㅟㅜㅣ', 'ㅢㅡㅣ']) {
  const [c, a, b] = Array.from(s) as [string, string, string];
  DERIVED[c] = [a, b, HORIZONTAL, VERTICAL];
}

/** 파생 자모 글자 목록 (23개). */
export const DERIVED_JAMO: readonly string[] = Object.keys(DERIVED);

/** 획들을 박스 `[bx, by, bw, bh]`에 배치한다. */
export function placeInBox(strokes: [number, number][][], [bx, by, bw, bh]: Box): [number, number][][] {
  return strokes.map((stroke) => stroke.map(([x, y]) => [bx + x * bw, by + y * bh] as [number, number]));
}

/** 자모 획 데이터. 모르는 문자는 `null`. */
export function getJamo(char: string): JamoData | null {
  const base = BASE.get(char);
  if (base) return { char: base.char, strokes: placeInBox(base.strokes, [0, 0, 1, 1]) };
  const rule = DERIVED[char];
  if (!rule) return null;
  const [a, b, boxA, boxB] = rule;
  const ja = BASE.get(a);
  const jb = BASE.get(b);
  if (!ja || !jb) return null;
  return { char, strokes: [...placeInBox(ja.strokes, boxA), ...placeInBox(jb.strokes, boxB)] };
}

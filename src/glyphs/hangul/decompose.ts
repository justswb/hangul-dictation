/**
 * 한글 완성형 음절(U+AC00–U+D7A3)을 초성·중성·종성 호환 자모로 분해한다.
 * 완성형 음절이 아니면 `null`.
 */
export type Decomposed = {
  /** 초성 호환 자모 (예: "ㄱ"). */
  cho: string;
  /** 중성 호환 자모 (예: "ㅏ"). */
  jung: string;
  /** 종성 호환 자모. 종성이 없으면 `null`. */
  jong: string | null;
};

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
] as const;

// 인덱스 0은 "종성 없음"에 해당하며 사용하지 않는다. 실제 종성은 인덱스 1부터.
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

export function decompose(ch: string): Decomposed | null {
  if (ch.length !== 1) return null;
  const code = ch.codePointAt(0);
  if (code === undefined) return null;
  if (code < HANGUL_BASE || code > HANGUL_LAST) return null;

  const offset = code - HANGUL_BASE;
  const choIndex = Math.floor(offset / 588);
  const jungIndex = Math.floor((offset % 588) / 28);
  const jongIndex = offset % 28;

  return {
    cho: CHO[choIndex]!,
    jung: JUNG[jungIndex]!,
    jong: jongIndex === 0 ? null : JONG[jongIndex]!,
  };
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { composeSyllable } from '../glyphs/hangul/compose.ts';
import { getJamo } from '../glyphs/hangul/jamo.ts';
import { parseJhf } from '../glyphs/latin/hershey.ts';
import { measureText, textToStrokes } from './text.ts';

const OPTS = { x: 10, y: 20, height: 80, color: 'black' as const, width: 4 };

// text.ts와 별개로 폰트를 직접 파싱해 advance('A')를 구한다(0.75 배율을 실제로 검증하기 위함).
const FONT_PATH = fileURLToPath(new URL('../../assets/hershey/futural.jhf', import.meta.url));
const latinGlyphs = parseJhf(readFileSync(FONT_PATH, 'utf8'));
const ADVANCE_A = latinGlyphs.get('A')?.advance ?? Number.NaN;

describe('textToStrokes', () => {
  it("획 수 = composeSyllable('가') 획 수", () => {
    const expected = composeSyllable('가');
    expect(expected).not.toBeNull();
    const { strokes } = textToStrokes('가', OPTS);
    expect(strokes).toHaveLength(expected?.length ?? -1);
  });

  it("width('가나') ≈ 2 × height + 0.08 × height", () => {
    const { width } = textToStrokes('가나', OPTS);
    expect(width).toBeCloseTo(2 * OPTS.height + 0.08 * OPTS.height, 5);
  });

  it("width('A') = 0.75 × height × advance('A')", () => {
    const { width } = textToStrokes('A', OPTS);
    expect(width).toBeCloseTo(0.75 * OPTS.height * ADVANCE_A, 5);
  });

  it('모든 점이 [x, x+width] × [y, y+height] 안', () => {
    const text = '안녕하세요 TCP';
    const { strokes, width } = textToStrokes(text, OPTS);
    for (const stroke of strokes) {
      for (const p of stroke.points) {
        expect(p.x).toBeGreaterThanOrEqual(OPTS.x - 1e-6);
        expect(p.x).toBeLessThanOrEqual(OPTS.x + width + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(OPTS.y - 1e-6);
        expect(p.y).toBeLessThanOrEqual(OPTS.y + OPTS.height + 1e-6);
      }
    }
  });

  it('공백은 획 없이 0.35 × height만큼 전진한다', () => {
    const withSpace = textToStrokes('A A', OPTS);
    const withoutSpace = textToStrokes('AA', OPTS);
    // 'AA'는 글자 사이 간격(0.08h)이 들어가지만 'A A'는 공백(0.35h)이 그 자리를 대신한다.
    expect(withSpace.width - withoutSpace.width).toBeCloseTo((0.35 - 0.08) * OPTS.height, 5);
  });

  it('공백만 있는 텍스트의 폭 = 0.35 × height', () => {
    const { strokes, width } = textToStrokes(' ', OPTS);
    expect(strokes).toHaveLength(0);
    expect(width).toBeCloseTo(0.35 * OPTS.height, 5);
  });

  it.each(['안녕 TCP', 'ㄱㄴ', '漢A', ''])("measureText(%j) === textToStrokes(%j).width", (text) => {
    expect(measureText(text, OPTS.height)).toBeCloseTo(textToStrokes(text, OPTS).width, 5);
  });

  it("'漢' 획 = '?' 획", () => {
    const hanja = textToStrokes('漢', OPTS);
    const fallback = textToStrokes('?', OPTS);
    expect(hanja.strokes).toEqual(fallback.strokes);
  });

  it("'ㄱ' 획 수 = getJamo('ㄱ') 획 수", () => {
    const expected = getJamo('ㄱ');
    expect(expected).not.toBeNull();
    const { strokes } = textToStrokes('ㄱ', OPTS);
    expect(strokes).toHaveLength(expected?.strokes.length ?? -1);
  });

  it('자모 단독의 모든 점이 [x, x+height] × [y, y+height] 안', () => {
    const { strokes } = textToStrokes('ㄱㅏ', OPTS);
    for (const stroke of strokes) {
      for (const p of stroke.points) {
        expect(p.x).toBeGreaterThanOrEqual(OPTS.x - 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(OPTS.y - 1e-6);
        expect(p.y).toBeLessThanOrEqual(OPTS.y + OPTS.height + 1e-6);
      }
    }
  });

  // 모듈 수준 경고 기록이 테스트 간에 공유되므로, 다른 테스트와 겹치지 않는 고유한
  // 미지원 문자('龍')를 사용해 격리한다.
  it('같은 미지원 문자가 반복돼도 console.warn은 1회만 호출된다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    textToStrokes('龍龍', OPTS);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

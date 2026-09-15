import { describe, expect, it } from 'vitest';
import { composeSyllable } from '../glyphs/hangul/compose.ts';
import { textToStrokes } from './text.ts';

const OPTS = { x: 10, y: 20, height: 80, color: 'black' as const, width: 4 };

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
    const glyphs = textToStrokes('A', OPTS);
    // advance('A')를 역산: width = 0.75*height*advance 이므로 advance = width/(0.75*height).
    const advance = glyphs.width / (0.75 * OPTS.height);
    const again = textToStrokes('A', { ...OPTS, height: OPTS.height * 2 });
    expect(again.width).toBeCloseTo(0.75 * OPTS.height * 2 * advance, 5);
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

  it('지원하지 않는 문자는 건너뛴다(칸도 간격도 없음)', () => {
    const withUnsupported = textToStrokes('A漢A', OPTS);
    const without = textToStrokes('AA', OPTS);
    expect(withUnsupported.width).toBeCloseTo(without.width, 5);
    expect(withUnsupported.strokes.length).toBe(without.strokes.length);
  });
});

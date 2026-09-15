import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseJhf } from './hershey.ts';

const FONT_PATH = fileURLToPath(new URL('../../../assets/hershey/futural.jhf', import.meta.url));
const glyphs = parseJhf(readFileSync(FONT_PATH, 'utf8'));

describe('parseJhf', () => {
  it('ASCII 32–126(95자) 글리프를 모두 만든다', () => {
    expect(glyphs.size).toBe(95);
    for (let code = 32; code <= 126; code++) {
      expect(glyphs.has(String.fromCharCode(code))).toBe(true);
    }
  });

  it("' '는 획이 없고 전진 폭만 있다", () => {
    const space = glyphs.get(' ');
    expect(space).toBeDefined();
    expect(space?.strokes).toHaveLength(0);
    expect(space?.advance).toBeGreaterThan(0);
  });

  it("'A'는 모든 점의 y가 0–1 범위(±0.05)다", () => {
    const a = glyphs.get('A');
    expect(a).toBeDefined();
    for (const stroke of a?.strokes ?? []) {
      for (const point of stroke) {
        expect(point.y).toBeGreaterThanOrEqual(-0.05);
        expect(point.y).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it("'O'는 획이 1개 이상이고 점이 10개 이상이다", () => {
    const o = glyphs.get('O');
    expect(o).toBeDefined();
    expect((o?.strokes.length ?? 0)).toBeGreaterThanOrEqual(1);
    const totalPoints = o?.strokes.reduce((sum, stroke) => sum + stroke.length, 0) ?? 0;
    expect(totalPoints).toBeGreaterThanOrEqual(10);
  });

  it("'-'는 획이 1개다", () => {
    const dash = glyphs.get('-');
    expect(dash).toBeDefined();
    expect(dash?.strokes).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { composeSyllable } from './compose';
import { getJamo } from './jamo';

const count = (c: string) => getJamo(c)!.strokes.length;

describe('composeSyllable', () => {
  it('가: 획 수 = ㄱ + ㅏ, 모든 점 0–1, 초성 x < 0.55', () => {
    const s = composeSyllable('가')!;
    expect(s.length).toBe(count('ㄱ') + count('ㅏ'));
    for (const p of s.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    for (const p of s.slice(0, count('ㄱ')).flat()) expect(p.x).toBeLessThan(0.55);
  });

  it('고: 초성 y < 0.55', () => {
    const s = composeSyllable('고')!;
    for (const p of s.slice(0, count('ㄱ')).flat()) expect(p.y).toBeLessThan(0.55);
  });

  it('각: 종성 y > 0.6', () => {
    const s = composeSyllable('각')!;
    expect(s.length).toBe(count('ㄱ') * 2 + count('ㅏ'));
    for (const p of s.slice(count('ㄱ') + count('ㅏ')).flat()) expect(p.y).toBeGreaterThan(0.6);
  });

  it('복합 모음·겹받침도 조합하고 모든 점이 0–1', () => {
    for (const ch of ['과', '곽', '뷁', '읽']) {
      const s = composeSyllable(ch);
      expect(s).not.toBeNull();
      for (const p of s!.flat()) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('A → null', () => {
    expect(composeSyllable('A')).toBeNull();
  });
});

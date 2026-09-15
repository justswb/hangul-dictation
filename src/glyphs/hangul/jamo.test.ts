import { describe, expect, it } from 'vitest';
import { DERIVED_JAMO, getJamo, placeInBox } from './jamo';
import { validateJamo } from './validate';

describe('getJamo', () => {
  it('기본 자모는 JSON 그대로', () => {
    expect(getJamo('ㄱ')?.char).toBe('ㄱ');
    expect(getJamo('ㅏ')).not.toBeNull();
  });

  it('ㄲ 획 수 = ㄱ 획 수 × 2, 앞쪽 획의 x ≤ 0.5', () => {
    const g = getJamo('ㄱ')!;
    const gg = getJamo('ㄲ')!;
    expect(gg.strokes.length).toBe(g.strokes.length * 2);
    for (const stroke of gg.strokes.slice(0, g.strokes.length)) {
      for (const [x] of stroke) expect(x).toBeLessThanOrEqual(0.5);
    }
  });

  it('ㅘ 첫 획들 = ㅗ를 가로 부분 박스로 변환한 결과', () => {
    const o = getJamo('ㅗ')!;
    const wa = getJamo('ㅘ')!;
    expect(wa.strokes.slice(0, o.strokes.length)).toEqual(placeInBox(o.strokes, [0, 0.45, 0.7, 0.55]));
    expect(wa.strokes.length).toBe(o.strokes.length + getJamo('ㅏ')!.strokes.length);
  });

  it('파생 자모 23개 전부 validateJamo 통과', () => {
    expect(DERIVED_JAMO.length).toBe(23);
    for (const c of DERIVED_JAMO) {
      const data = getJamo(c);
      expect(data, c).not.toBeNull();
      expect(validateJamo(data), c).toEqual([]);
    }
  });

  it('반환값을 바꿔도 캐시와 파생 자모가 오염되지 않음', () => {
    const before = getJamo('ㄱ')!;
    const beforeGG = getJamo('ㄲ')!;
    const g = getJamo('ㄱ')!;
    g.strokes[0]![0]![0] = 0.99;
    g.strokes.push([[0, 0], [1, 1]]);
    expect(getJamo('ㄱ')).toEqual(before);
    expect(getJamo('ㄲ')).toEqual(beforeGG);
  });

  it('모르는 문자는 null', () => {
    expect(getJamo('A')).toBeNull();
  });
});

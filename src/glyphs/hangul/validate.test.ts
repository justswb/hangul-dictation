import { describe, expect, it } from 'vitest';
import { validateJamo } from './validate.ts';

describe('validateJamo', () => {
  it('정상 데이터는 빈 배열을 돌려준다', () => {
    const data = {
      char: 'ㄱ',
      strokes: [
        [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.9, 0.9],
        ],
      ],
    };

    expect(validateJamo(data)).toEqual([]);
  });

  it('좌표가 0–1 범위를 벗어나면 오류 1개', () => {
    const data = {
      char: 'ㄱ',
      strokes: [
        [
          [0.1, 0.1],
          [1.2, 0.1],
          [0.9, 0.9],
        ],
      ],
    };

    expect(validateJamo(data)).toHaveLength(1);
  });

  it('점 1개짜리 획이 있으면 오류 1개', () => {
    const data = {
      char: 'ㄱ',
      strokes: [[[0.1, 0.1]]],
    };

    expect(validateJamo(data)).toHaveLength(1);
  });

  it('strokes가 빈 배열이면 오류 1개', () => {
    const data = {
      char: 'ㄱ',
      strokes: [],
    };

    expect(validateJamo(data)).toHaveLength(1);
  });

  it('같은 획 안에 연속 중복 점이 있으면 오류 1개', () => {
    const data = {
      char: 'ㄱ',
      strokes: [
        [
          [0.1, 0.1],
          [0.1, 0.1],
          [0.9, 0.9],
        ],
      ],
    };

    expect(validateJamo(data)).toHaveLength(1);
  });

  it('char가 2글자 이상이면 오류를 낸다', () => {
    const data = {
      char: '가나',
      strokes: [
        [
          [0.1, 0.1],
          [0.9, 0.9],
        ],
      ],
    };

    expect(validateJamo(data).length).toBeGreaterThan(0);
  });

  it('연속하지 않는 중복 점은 허용한다', () => {
    const data = {
      char: 'ㄱ',
      strokes: [
        [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.1, 0.1],
        ],
      ],
    };

    expect(validateJamo(data)).toEqual([]);
  });

  it('객체가 아닌 입력은 오류를 낸다', () => {
    expect(validateJamo(null).length).toBeGreaterThan(0);
    expect(validateJamo('ㄱ').length).toBeGreaterThan(0);
    expect(validateJamo([]).length).toBeGreaterThan(0);
  });
});

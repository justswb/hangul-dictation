import type { Glyph, Point, Stroke } from '../../contracts/stroke.ts';

/** JHF 좌표 원점 문자('R' = 82). 좌표값 = 문자 코드 − 이 값. */
const CHAR_ORIGIN = 'R'.charCodeAt(0);

/** Simplex 대문자 윗선(y). 실측(futural.jhf 'A' 정점 = −12/9)이 티켓 표기와 일치해 그대로 사용. */
const CAP_TOP = -12;
/** Simplex 기준선(y). */
const BASELINE = 9;
/** 대문자 높이(BASELINE − CAP_TOP) = 1 로 정규화하는 스케일. */
const SCALE = BASELINE - CAP_TOP;

/** parseJhf가 만들어내는 글리프 범위: ASCII 32(' ')–126('~'), 95자. */
const FIRST_CODE = 32;
const LAST_CODE = 126;

/**
 * Hershey JHF 텍스트를 파싱해 ASCII 32–126(95자) 글리프 맵을 만든다.
 *
 * 레코드 형식: 5자리 글리프 번호 + 3자리 정점 수 + (정점 수)×2 글자의 좌표 쌍.
 * 좌표 쌍 `" R"`(스페이스+'R')은 펜 들기(획 구분)를 뜻한다. 첫 쌍은 그리지 않는
 * 좌/우 경계값이다. 레코드는 줄 경계와 무관하게 이어질 수 있으므로(정점 수가
 * 많으면 다음 줄로 계속) 개행을 제거한 뒤 하나의 문자 스트림으로 순차 소비한다.
 * 파일에 96개 이상의 레코드가 있어도 처음 95개(ASCII 32–126)만 사용한다.
 */
export function parseJhf(text: string): Map<string, Glyph> {
  const stream = text.replace(/[\r\n]/g, '');
  const glyphs = new Map<string, Glyph>();
  let pos = 0;

  for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
    pos += 5; // 글리프 번호. 순서(줄 순서)만 쓰고 값 자체는 쓰지 않는다.

    const countField = stream.slice(pos, pos + 3);
    pos += 3;
    const count = Number.parseInt(countField, 10);
    if (Number.isNaN(count)) {
      throw new Error(`hershey: 문자 코드 ${code}의 정점 수를 읽을 수 없음: "${countField}"`);
    }

    const raw: Array<[number, number] | null> = [];
    for (let i = 0; i < count; i++) {
      const a = stream[pos];
      const b = stream[pos + 1];
      pos += 2;
      if (a === undefined || b === undefined) {
        throw new Error(`hershey: 문자 코드 ${code} 데이터가 파일 끝에서 잘림`);
      }
      raw.push(a === ' ' && b === 'R' ? null : [a.charCodeAt(0) - CHAR_ORIGIN, b.charCodeAt(0) - CHAR_ORIGIN]);
    }

    const bounds = raw[0];
    if (!bounds) {
      throw new Error(`hershey: 문자 코드 ${code}에 경계 쌍이 없음`);
    }
    const [left, right] = bounds;

    const strokes: Stroke[] = [];
    let current: Point[] = [];
    for (let i = 1; i < raw.length; i++) {
      const vertex = raw[i];
      if (vertex === undefined) continue;
      if (vertex === null) {
        if (current.length > 0) {
          strokes.push(current);
          current = [];
        }
        continue;
      }
      const [x, y] = vertex;
      current.push({ x: (x - left) / SCALE, y: (y - CAP_TOP) / SCALE });
    }
    if (current.length > 0) strokes.push(current);

    glyphs.set(String.fromCharCode(code), { strokes, advance: (right - left) / SCALE });
  }

  return glyphs;
}

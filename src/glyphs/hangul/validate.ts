/**
 * 자모 획 데이터(`JamoData`, {@link ../../contracts/jamo.ts}) 스키마 검사기.
 *
 * 규칙:
 * - `char`는 1글자 문자열.
 * - `strokes`는 1개 이상.
 * - 각 획은 점 2개 이상.
 * - 모든 좌표는 0–1 범위.
 * - 같은 획 안에서 연속 중복 점 없음.
 */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 자모 데이터를 검사해 오류 메시지 목록을 돌려준다. 정상이면 빈 배열. */
export function validateJamo(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push('데이터는 객체여야 합니다.');
    return errors;
  }

  const record = data as Record<string, unknown>;

  if (typeof record.char !== 'string' || Array.from(record.char).length !== 1) {
    errors.push('char는 1글자 문자열이어야 합니다.');
  }

  if (!Array.isArray(record.strokes)) {
    errors.push('strokes는 배열이어야 합니다.');
    return errors;
  }

  if (record.strokes.length < 1) {
    errors.push('strokes는 1개 이상이어야 합니다.');
  }

  record.strokes.forEach((stroke: unknown, strokeIndex: number) => {
    if (!Array.isArray(stroke)) {
      errors.push(`strokes[${strokeIndex}]는 점 배열이어야 합니다.`);
      return;
    }

    if (stroke.length < 2) {
      errors.push(`strokes[${strokeIndex}]는 점 2개 이상이어야 합니다.`);
    }

    let previous: [number, number] | null = null;

    stroke.forEach((point: unknown, pointIndex: number) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !isFiniteNumber(point[0]) ||
        !isFiniteNumber(point[1])
      ) {
        errors.push(`strokes[${strokeIndex}][${pointIndex}]는 [x, y] 좌표여야 합니다.`);
        previous = null;
        return;
      }

      const [x, y] = point as [number, number];

      if (x < 0 || x > 1 || y < 0 || y > 1) {
        errors.push(
          `strokes[${strokeIndex}][${pointIndex}] 좌표가 0–1 범위를 벗어났습니다: [${x}, ${y}]`,
        );
      }

      if (previous !== null && previous[0] === x && previous[1] === y) {
        errors.push(`strokes[${strokeIndex}][${pointIndex}]가 이전 점과 연속 중복됩니다.`);
      }

      previous = [x, y];
    });
  });

  return errors;
}

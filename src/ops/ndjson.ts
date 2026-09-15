import type { Color } from '../contracts/stroke.ts';
import type { ArrowOp, BoxOp, MarkOp, Op, Place, TextSize, WriteOp } from '../contracts/ops.ts';

/** 파싱된 op 하나를 전달받는다. */
export type OnOp = (op: Op) => void;

/** 검증에 실패한 원본 줄과 사유를 전달받는다. */
export type OnInvalid = (line: string, reason: string) => void;

/** NDJSON 줄 파서. push()로 청크를 흘려보내고 end()로 마무리한다. */
export interface NdjsonParser {
  /** 청크를 버퍼에 쌓고 완성된 줄마다 파싱·검증한다. 줄은 청크 경계에서 끊겨도 된다. */
  push(chunk: string): void;
  /** 줄바꿈 없이 남은 마지막 줄을 처리한다. */
  end(): void;
}

const COLORS = new Set<Color>(['black', 'blue', 'red']);
const SIZES = new Set<TextSize>(['title', 'body', 'note']);
const SHAPES = new Set<BoxOp['shape']>(['rect', 'ellipse']);
const MARK_STYLES = new Set<MarkOp['style']>(['underline', 'circle', 'check']);
const PLACE_RELS = new Set<Place['rel']>(['right_of', 'below']);

type ValidateResult = { ok: true; op: Op } | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePlace(value: unknown): { ok: true; place: Place } | { ok: false; reason: string } {
  if (!isPlainObject(value)) return { ok: false, reason: 'place가 객체가 아님' };
  const { rel, of } = value;
  if (typeof rel !== 'string' || !PLACE_RELS.has(rel as Place['rel'])) {
    return { ok: false, reason: 'place.rel 값 오류' };
  }
  if (!isNonEmptyString(of)) return { ok: false, reason: 'place.of 누락' };
  return { ok: true, place: { rel: rel as Place['rel'], of } };
}

function validateOp(value: unknown): ValidateResult {
  if (!isPlainObject(value)) return { ok: false, reason: '최상위 값이 객체가 아님' };
  const { op } = value;
  if (typeof op !== 'string') return { ok: false, reason: 'op 필드 누락' };

  switch (op) {
    case 'plan': {
      const { lines } = value;
      if (typeof lines !== 'number' || !Number.isInteger(lines) || lines <= 0) {
        return { ok: false, reason: 'lines는 양의 정수여야 함' };
      }
      return { ok: true, op: { op: 'plan', lines } };
    }
    case 'write': {
      const { id, text, size, color } = value;
      if (!isNonEmptyString(id)) return { ok: false, reason: 'id 누락' };
      if (!isNonEmptyString(text)) return { ok: false, reason: 'text 누락' };
      if (typeof size !== 'string' || !SIZES.has(size as TextSize)) {
        return { ok: false, reason: 'size 값 오류' };
      }
      const result: WriteOp = { op: 'write', id, text, size: size as TextSize };
      if (color !== undefined) {
        if (typeof color !== 'string' || !COLORS.has(color as Color)) {
          return { ok: false, reason: 'color 값 오류' };
        }
        result.color = color as Color;
      }
      return { ok: true, op: result };
    }
    case 'box': {
      const { id, text, shape, place } = value;
      if (!isNonEmptyString(id)) return { ok: false, reason: 'id 누락' };
      if (!isNonEmptyString(text)) return { ok: false, reason: 'text 누락' };
      if (typeof shape !== 'string' || !SHAPES.has(shape as BoxOp['shape'])) {
        return { ok: false, reason: 'shape 값 오류' };
      }
      const result: BoxOp = { op: 'box', id, text, shape: shape as BoxOp['shape'] };
      if (place !== undefined) {
        const placeResult = validatePlace(place);
        if (!placeResult.ok) return placeResult;
        result.place = placeResult.place;
      }
      return { ok: true, op: result };
    }
    case 'arrow': {
      const { from, to, label } = value;
      if (!isNonEmptyString(from)) return { ok: false, reason: 'from 누락' };
      if (!isNonEmptyString(to)) return { ok: false, reason: 'to 누락' };
      const result: ArrowOp = { op: 'arrow', from, to };
      if (label !== undefined) {
        if (!isNonEmptyString(label)) return { ok: false, reason: 'label 값 오류' };
        result.label = label;
      }
      return { ok: true, op: result };
    }
    case 'mark': {
      const { target, style, color } = value;
      if (!isNonEmptyString(target)) return { ok: false, reason: 'target 누락' };
      if (typeof style !== 'string' || !MARK_STYLES.has(style as MarkOp['style'])) {
        return { ok: false, reason: 'style 값 오류' };
      }
      const result: MarkOp = { op: 'mark', target, style: style as MarkOp['style'] };
      if (color !== undefined) {
        if (typeof color !== 'string' || !COLORS.has(color as Color)) {
          return { ok: false, reason: 'color 값 오류' };
        }
        result.color = color as Color;
      }
      return { ok: true, op: result };
    }
    case 'newpage':
      return { ok: true, op: { op: 'newpage' } };
    default:
      return { ok: false, reason: `알 수 없는 op: ${op}` };
  }
}

/** NDJSON(줄 단위 JSON) 스트림 파서를 만든다. docs/board-ops.md 기준으로 각 줄을 검증한다. */
export function createNdjsonParser({ onOp, onInvalid }: { onOp: OnOp; onInvalid: OnInvalid }): NdjsonParser {
  let buffer = '';

  function processLine(line: string): void {
    if (line.trim() === '') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      onInvalid(line, 'JSON 파싱 실패');
      return;
    }

    const result = validateOp(parsed);
    if (!result.ok) {
      onInvalid(line, result.reason);
      return;
    }
    onOp(result.op);
  }

  function consumeCompleteLines(): void {
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      let line = buffer.slice(0, newlineIndex);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      buffer = buffer.slice(newlineIndex + 1);
      processLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  }

  function push(chunk: string): void {
    buffer += chunk;
    consumeCompleteLines();
  }

  function end(): void {
    if (buffer.length === 0) return;
    let line = buffer;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    buffer = '';
    processLine(line);
  }

  return { push, end };
}

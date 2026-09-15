import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Op } from '../contracts/ops.ts';
import { createNdjsonParser } from './ndjson.ts';

type Expected = { ops: Op[]; invalidLines: number };

function readFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/ops/${name}`, import.meta.url)), 'utf8');
}

function readExpected(name: string): Expected {
  return JSON.parse(readFixture(`${name}.expected.json`)) as Expected;
}

function run(content: string): { ops: Op[]; invalidLines: number } {
  const ops: Op[] = [];
  let invalidLines = 0;
  const parser = createNdjsonParser({
    onOp: (op) => ops.push(op),
    onInvalid: () => {
      invalidLines += 1;
    },
  });
  parser.push(content);
  parser.end();
  return { ops, invalidLines };
}

function runCharByChar(content: string): { ops: Op[]; invalidLines: number } {
  const ops: Op[] = [];
  let invalidLines = 0;
  const parser = createNdjsonParser({
    onOp: (op) => ops.push(op),
    onInvalid: () => {
      invalidLines += 1;
    },
  });
  for (const ch of content) parser.push(ch);
  parser.end();
  return { ops, invalidLines };
}

describe('createNdjsonParser', () => {
  it('tcp.ndjson 전체를 한 번에 push하면 expected 파일과 일치한다', () => {
    const expected = readExpected('tcp');
    const result = run(readFixture('tcp.ndjson'));
    expect(result).toEqual({ ops: expected.ops, invalidLines: expected.invalidLines });
    expect(result.ops).toHaveLength(8);
    expect(result.invalidLines).toBe(0);
  });

  it('tcp.ndjson을 1글자씩 push해도 결과가 동일하다', () => {
    const expected = readExpected('tcp');
    const result = runCharByChar(readFixture('tcp.ndjson'));
    expect(result).toEqual({ ops: expected.ops, invalidLines: expected.invalidLines });
  });

  it('invalid.ndjson의 invalid 개수와 op가 expected와 일치한다', () => {
    const expected = readExpected('invalid');
    const result = run(readFixture('invalid.ndjson'));
    expect(result).toEqual({ ops: expected.ops, invalidLines: expected.invalidLines });
    expect(result.invalidLines).toBe(6);
    expect(result.ops).toHaveLength(2);
    // 알 수 없는 필드("extra")는 버리고 알려진 필드만 담아 전달한다.
    expect(result.ops[1]).toEqual({ op: 'write', id: 't3', text: '정상 줄', size: 'body' });
  });

  it('invalid.ndjson을 1글자씩 push해도 결과가 동일하다', () => {
    const expected = readExpected('invalid');
    const result = runCharByChar(readFixture('invalid.ndjson'));
    expect(result).toEqual({ ops: expected.ops, invalidLines: expected.invalidLines });
  });

  it('```만 있는 줄은 예외 없이 invalid로 처리된다', () => {
    expect(() => run('```\n')).not.toThrow();
    const result = run('```\n');
    expect(result.ops).toHaveLength(0);
    expect(result.invalidLines).toBe(1);
  });

  it('빈 줄과 공백만 있는 줄은 무시하고 invalid로 세지 않는다', () => {
    const result = run('\n   \n{"op":"newpage"}\n\t\n');
    expect(result.invalidLines).toBe(0);
    expect(result.ops).toEqual([{ op: 'newpage' }]);
  });

  it('줄이 청크 경계나 \\r\\n에서 끊겨도 올바르게 처리된다', () => {
    const ops: Op[] = [];
    const parser = createNdjsonParser({ onOp: (op) => ops.push(op), onInvalid: () => {} });
    parser.push('{"op":"pla');
    parser.push('n","lines":3}\r\n{"op":"newpage"}\r');
    parser.push('\n');
    parser.end();
    expect(ops).toEqual([
      { op: 'plan', lines: 3 },
      { op: 'newpage' },
    ]);
  });

  it('마지막 줄에 줄바꿈이 없으면 end() 호출 후에 처리된다', () => {
    const ops: Op[] = [];
    const parser = createNdjsonParser({ onOp: (op) => ops.push(op), onInvalid: () => {} });
    parser.push('{"op":"newpage"}');
    expect(ops).toHaveLength(0);
    parser.end();
    expect(ops).toEqual([{ op: 'newpage' }]);
  });

  it('end()를 여러 번 호출해도 중복 처리되지 않는다', () => {
    const ops: Op[] = [];
    const parser = createNdjsonParser({ onOp: (op) => ops.push(op), onInvalid: () => {} });
    parser.push('{"op":"newpage"}');
    parser.end();
    parser.end();
    expect(ops).toEqual([{ op: 'newpage' }]);
  });

  it.each([
    ['{"op":"unknown"}', '알 수 없는 op'],
    ['{"op":"write","id":"a","size":"title"}', 'write: text 누락'],
    ['{"op":"write","id":"a","text":"","size":"title"}', 'write: text 빈 문자열'],
    ['{"op":"box","id":"a","text":"t","shape":"triangle"}', 'box: shape 값 오류'],
    ['{"op":"plan","lines":0}', 'plan: 0은 양의 정수 아님'],
    ['{"op":"plan","lines":1.5}', 'plan: 정수 아님'],
    ['{"op":"plan","lines":"3"}', 'plan: 문자열 lines'],
    ['{"op":"mark","target":"a","style":"blink"}', 'mark: style 값 오류'],
    ['{"op":"arrow","from":"a"}', 'arrow: to 누락'],
    ['not json', '유효하지 않은 JSON'],
    ['[1,2,3]', '최상위가 배열'],
    ['"plan"', '최상위가 문자열'],
  ])('%s -> invalid (%s)', (line) => {
    const result = run(`${line}\n`);
    expect(result.ops).toHaveLength(0);
    expect(result.invalidLines).toBe(1);
  });

  it('color, place 선택 필드가 올바르면 결과에 포함된다', () => {
    const write = run('{"op":"write","id":"a","text":"t","size":"title","color":"blue"}\n');
    expect(write.ops).toEqual([{ op: 'write', id: 'a', text: 't', size: 'title', color: 'blue' }]);

    const box = run('{"op":"box","id":"b","text":"t","shape":"rect","place":{"rel":"below","of":"a"}}\n');
    expect(box.ops).toEqual([{ op: 'box', id: 'b', text: 't', shape: 'rect', place: { rel: 'below', of: 'a' } }]);
  });

  it('color, place 선택 필드 값이 잘못되면 줄 전체가 invalid 처리된다', () => {
    const badColor = run('{"op":"write","id":"a","text":"t","size":"title","color":"green"}\n');
    expect(badColor.ops).toHaveLength(0);
    expect(badColor.invalidLines).toBe(1);

    const badPlace = run('{"op":"box","id":"b","text":"t","shape":"rect","place":{"rel":"under","of":"a"}}\n');
    expect(badPlace.ops).toHaveLength(0);
    expect(badPlace.invalidLines).toBe(1);

    const missingOf = run('{"op":"box","id":"b","text":"t","shape":"rect","place":{"rel":"below"}}\n');
    expect(missingOf.ops).toHaveLength(0);
    expect(missingOf.invalidLines).toBe(1);
  });

  it('newpage는 알려지지 않은 추가 필드를 무시하고 op만 전달한다', () => {
    const result = run('{"op":"newpage","extra":"ignored"}\n');
    expect(result.ops).toEqual([{ op: 'newpage' }]);
  });
});

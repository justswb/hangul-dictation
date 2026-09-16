import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Op } from '../src/contracts/ops.ts';
import { createNdjsonParser } from '../src/ops/ndjson.ts';

function readPrompt(): string {
  return readFileSync(fileURLToPath(new URL('./system.md', import.meta.url)), 'utf8');
}

/** 프롬프트 안 ```ndjson 코드블록만 추출한다. */
function extractNdjsonBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```ndjson\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

function parse(ndjson: string): { ops: Op[]; invalidLines: number } {
  const ops: Op[] = [];
  let invalidLines = 0;
  const parser = createNdjsonParser({
    onOp: (op) => ops.push(op),
    onInvalid: () => {
      invalidLines += 1;
    },
  });
  parser.push(ndjson);
  parser.end();
  return { ops, invalidLines };
}

describe('prompts/system.md', () => {
  const markdown = readPrompt();
  const blocks = extractNdjsonBlocks(markdown);

  it('예시 코드블록이 하나 이상 존재한다', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('실제 출력 규칙 설명에 코드펜스를 쓰지 말라는 안내가 있다', () => {
    expect(markdown).toMatch(/코드펜스/);
  });

  it('모든 예시 블록의 NDJSON 줄에 invalid가 없다', () => {
    for (const block of blocks) {
      const { invalidLines } = parse(block);
      expect(invalidLines).toBe(0);
    }
  });

  it('예시 블록에 등장하는 op 종류가 6종(plan/write/box/arrow/mark/newpage)을 모두 포함한다', () => {
    const allOps = blocks.flatMap((block) => parse(block).ops);
    const kinds = new Set(allOps.map((op) => op.op));
    expect(kinds).toEqual(new Set(['plan', 'write', 'box', 'arrow', 'mark', 'newpage']));
  });

  it('각 예시 블록의 첫 줄은 plan op다', () => {
    for (const block of blocks) {
      const { ops } = parse(block);
      expect(ops[0]?.op).toBe('plan');
    }
  });
});

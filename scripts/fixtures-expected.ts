// 실행: node scripts/fixtures-expected.ts (Node 24 타입 스트리핑, TS 컴파일 없이 바로 실행)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Op } from '../src/contracts/ops.ts';
import { createNdjsonParser } from '../src/ops/ndjson.ts';

type Expected = { ops: Op[]; invalidLines: number };

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'ops');

function buildExpected(content: string): Expected {
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

const ndjsonFiles = readdirSync(fixturesDir).filter((file) => file.endsWith('.ndjson'));

for (const file of ndjsonFiles) {
  const name = basename(file, '.ndjson');
  const content = readFileSync(join(fixturesDir, file), 'utf8');
  const expected = buildExpected(content);
  const outPath = join(fixturesDir, `${name}.expected.json`);
  writeFileSync(outPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
  console.log(`wrote ${outPath} (ops=${expected.ops.length}, invalidLines=${expected.invalidLines})`);
}

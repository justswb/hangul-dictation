/**
 * `src/glyphs/hangul/jamo/*.json` 전체를 검사한다.
 * 오류가 있으면 파일명과 메시지를 출력하고 exit 1.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJamo } from '../src/glyphs/hangul/validate.ts';

const jamoDir = fileURLToPath(new URL('../src/glyphs/hangul/jamo/', import.meta.url));

function main(): void {
  if (!existsSync(jamoDir)) {
    console.log(`검사할 자모 파일이 없습니다: ${jamoDir}`);
    return;
  }

  const files = readdirSync(jamoDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log(`검사할 자모 파일이 없습니다: ${jamoDir}`);
    return;
  }

  let hasError = false;

  for (const file of files) {
    const filePath = join(jamoDir, file);
    let data: unknown;

    try {
      data = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (err) {
      hasError = true;
      console.error(`${file}: JSON 파싱 실패 - ${(err as Error).message}`);
      continue;
    }

    const errors = validateJamo(data);
    for (const message of errors) {
      hasError = true;
      console.error(`${file}: ${message}`);
    }
  }

  if (hasError) {
    process.exit(1);
  }

  console.log(`${files.length}개 자모 파일 검사 통과`);
}

main();

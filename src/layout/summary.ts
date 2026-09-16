/**
 * 페이지 요약 생성 (AI 컨텍스트용) (T24).
 *
 * - 배치 순서대로 `id | 종류 | 텍스트` 한 줄씩.
 * - mark 요소는 제외.
 * - 텍스트는 줄바꿈을 공백으로 바꾸고 40자(코드포인트 기준) 초과 시 잘라서 `…`.
 * - 빈 페이지면 "(비어 있음)".
 */
import type { PageState } from '../contracts/layout.ts';
import { remainingLines } from './index.ts';

const TEXT_LIMIT = 40;

function normalizeText(text: string | undefined): string {
  if (!text) return '';
  const flattened = text.replace(/\r\n|\r|\n/g, ' ');
  const chars = Array.from(flattened);
  if (chars.length <= TEXT_LIMIT) return flattened;
  return chars.slice(0, TEXT_LIMIT).join('') + '…';
}

/** 현재 페이지 상태를 AI 컨텍스트용 텍스트 요약으로 변환한다. */
export function summarizePage(page: PageState): string {
  const lines = ['[보드]'];
  const visible = page.elements.filter((el) => el.kind !== 'mark');

  if (visible.length === 0) {
    lines.push('(비어 있음)');
  } else {
    for (const el of visible) {
      lines.push(`${el.id} | ${el.kind} | ${normalizeText(el.text)}`);
    }
  }

  lines.push(`남은 줄: ${remainingLines(page)}`);
  return lines.join('\n');
}

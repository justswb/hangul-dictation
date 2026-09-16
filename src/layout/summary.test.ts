import { describe, expect, it } from 'vitest';
import type { PageState, PlacedElement } from '../contracts/layout.ts';
import { remainingLines } from './index.ts';
import { summarizePage } from './summary.ts';

function el(id: string, kind: PlacedElement['kind'], text?: string): PlacedElement {
  return { id, kind, bbox: { x: 0, y: 0, w: 0, h: 0 }, strokes: [], text };
}

function pageWith(elements: PlacedElement[], cursorY = 100): PageState {
  return { elements, cursorY };
}

describe('summarizePage', () => {
  it('요소를 배치 순서대로 id | 종류 | 텍스트로 나열하고 mark는 제외한다', () => {
    const page = pageWith([
      el('t1', 'text', 'TCP 3-way handshake'),
      el('c', 'box', 'Client'),
      el('s', 'box', 'Server'),
      el('arrow:c>s', 'arrow', 'SYN'),
      el('hl1', 'mark'),
    ]);

    const expected = [
      '[보드]',
      't1 | text | TCP 3-way handshake',
      'c | box | Client',
      's | box | Server',
      'arrow:c>s | arrow | SYN',
      `남은 줄: ${remainingLines(page)}`,
    ].join('\n');

    expect(summarizePage(page)).toBe(expected);
  });

  it('빈 페이지면 (비어 있음)을 출력한다', () => {
    const page = pageWith([]);

    expect(summarizePage(page)).toBe(['[보드]', '(비어 있음)', `남은 줄: ${remainingLines(page)}`].join('\n'));
  });

  it('텍스트가 없는 요소는 빈칸으로 남긴다', () => {
    const page = pageWith([el('c', 'box')]);

    expect(summarizePage(page)).toBe(['[보드]', 'c | box | ', `남은 줄: ${remainingLines(page)}`].join('\n'));
  });

  it('줄바꿈은 공백으로 바꾼다', () => {
    const page = pageWith([el('t1', 'text', '첫 줄\n둘째 줄')]);

    expect(summarizePage(page)).toContain('t1 | text | 첫 줄 둘째 줄');
  });

  it('45자 텍스트는 40자로 자르고 …을 붙인다', () => {
    const long = 'A'.repeat(45);
    const page = pageWith([el('t1', 'text', long)]);

    const expectedText = 'A'.repeat(40) + '…';
    expect(summarizePage(page)).toContain(`t1 | text | ${expectedText}`);
  });

  it('정확히 40자인 텍스트는 자르지 않는다', () => {
    const exact = 'B'.repeat(40);
    const page = pageWith([el('t1', 'text', exact)]);

    expect(summarizePage(page)).toContain(`t1 | text | ${exact}`);
  });
});

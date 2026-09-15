/**
 * 한글 음절 조합: 초성·중성·종성 자모 획을 템플릿 박스에 배치해 0–1 음절 칸 좌표 획을 만든다.
 */
import type { Stroke } from '../../contracts/stroke';
import { decompose } from './decompose';
import { getJamo } from './jamo';

type Box = [number, number, number, number];
type Template = { cho: Box; jung: Box; jong?: Box };

const VERTICAL_VOWELS = new Set(Array.from('ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'));
const HORIZONTAL_VOWELS = new Set(Array.from('ㅗㅛㅜㅠㅡ'));

/** 템플릿 6종: [받침 없음, 받침] × 세로·가로·복합. */
const TEMPLATES = {
  vertical: [
    { cho: [0.05, 0.1, 0.5, 0.8], jung: [0.55, 0.05, 0.4, 0.9] },
    { cho: [0.05, 0.05, 0.5, 0.45], jung: [0.55, 0.02, 0.4, 0.6], jong: [0.15, 0.62, 0.7, 0.33] },
  ],
  horizontal: [
    { cho: [0.2, 0.05, 0.6, 0.5], jung: [0.05, 0.55, 0.9, 0.4] },
    { cho: [0.2, 0.03, 0.6, 0.35], jung: [0.05, 0.38, 0.9, 0.25], jong: [0.15, 0.65, 0.7, 0.32] },
  ],
  compound: [
    { cho: [0.08, 0.08, 0.45, 0.4], jung: [0.02, 0.02, 0.96, 0.96] },
    { cho: [0.08, 0.04, 0.45, 0.28], jung: [0.02, 0.02, 0.96, 0.62], jong: [0.15, 0.66, 0.7, 0.3] },
  ],
} satisfies Record<string, [Template, Template]>;

function place(char: string, [bx, by, bw, bh]: Box): Stroke[] | null {
  const jamo = getJamo(char);
  if (!jamo) return null;
  return jamo.strokes.map((s) => s.map(([x, y]) => ({ x: bx + x * bw, y: by + y * bh })));
}

/** 음절 → 0–1 칸 좌표 획(초성 → 중성 → 종성). 한글 음절이 아니면 `null`. */
export function composeSyllable(ch: string): Stroke[] | null {
  const d = decompose(ch);
  if (!d) return null;
  const kind = VERTICAL_VOWELS.has(d.jung) ? 'vertical' : HORIZONTAL_VOWELS.has(d.jung) ? 'horizontal' : 'compound';
  const t: Template = TEMPLATES[kind][d.jong ? 1 : 0];
  const cho = place(d.cho, t.cho);
  const jung = place(d.jung, t.jung);
  if (!cho || !jung) return null;
  const out = [...cho, ...jung];
  if (d.jong && t.jong) {
    const jong = place(d.jong, t.jong);
    if (!jong) return null;
    out.push(...jong);
  }
  return out;
}

/**
 * 글자 목록 디버그 페이지.
 *
 * `src/glyphs/hangul/jamo/*.json`(실제 자모 데이터)을 격자로 렌더한다.
 * 아직 실제 데이터가 없으므로(T04 시점), 실제 디렉터리가 비어 있으면
 * `fixtures/jamo/*.json`으로 자동 대체한다. `?fixtures=1` 쿼리로 강제할 수도 있다.
 * 둘 다 없으면 "데이터 없음"을 표시한다.
 */
import type { JamoData } from '../src/contracts/jamo.ts';

declare global {
  interface Window {
    __ready?: boolean;
  }
}

const CELL_SIZE = 160;
const CANVAS_SIZE = 140;
const STROKE_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#469990',
];

type GlyphModule = { default: JamoData };

/** 경로 정렬 순으로 (경로, 자모 데이터) 목록을 돌려준다. */
function loadGlyphEntries(): [string, JamoData][] {
  const real = import.meta.glob<GlyphModule>('../src/glyphs/hangul/jamo/*.json', { eager: true });
  const fixtures = import.meta.glob<GlyphModule>('../fixtures/jamo/*.json', { eager: true });

  const params = new URLSearchParams(window.location.search);
  const forceFixtures = params.get('fixtures') === '1';

  const realEntries = Object.entries(real);
  const source = forceFixtures || realEntries.length === 0 ? fixtures : real;

  return Object.entries(source)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, mod]) => [path, mod.default]);
}

function drawGlyph(canvas: HTMLCanvasElement, jamo: JamoData): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // 0-1 박스 테두리.
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, CANVAS_SIZE - 1, CANVAS_SIZE - 1);

  jamo.strokes.forEach((stroke, strokeIndex) => {
    if (stroke.length === 0) return;

    const color = STROKE_COLORS[strokeIndex % STROKE_COLORS.length] ?? '#111';
    let startPx: [number, number] | null = null;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    stroke.forEach(([x, y], pointIndex) => {
      const px = x * CANVAS_SIZE;
      const py = y * CANVAS_SIZE;
      if (pointIndex === 0) {
        ctx.moveTo(px, py);
        startPx = [px, py];
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();

    if (startPx === null) return;
    const [startX, startY] = startPx as [number, number];

    // 시작점 표시.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(startX, startY, 4, 0, Math.PI * 2);
    ctx.fill();

    // 획 번호(1부터), 시작점 옆에 표시.
    ctx.fillStyle = '#111';
    ctx.font = '12px sans-serif';
    ctx.fillText(String(strokeIndex + 1), startX + 6, startY - 6);
  });
}

function render(): void {
  const root = document.querySelector<HTMLDivElement>('#root');
  if (!root) throw new Error('#root를 찾을 수 없다.');

  const entries = loadGlyphEntries();

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '데이터 없음';
    root.appendChild(empty);
    window.__ready = true;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';
  root.appendChild(grid);

  for (const [path, jamo] of entries) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.style.width = `${CELL_SIZE}px`;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    cell.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = jamo.char || path;
    cell.appendChild(label);

    grid.appendChild(cell);
    drawGlyph(canvas, jamo);
  }

  window.__ready = true;
}

render();

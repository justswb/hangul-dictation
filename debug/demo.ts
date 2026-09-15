import { createScheduler } from '../src/render/scheduler.ts';
import { createAnimator } from '../src/render/animator.ts';
import { textToStrokes } from '../src/render/text.ts';

declare global {
  interface Window {
    __ready?: boolean;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#board');
if (!canvas) throw new Error('#board 캔버스를 찾을 수 없다.');

const params = new URLSearchParams(window.location.search);
const instant = params.get('instant') === '1';
const text = params.get('text') ?? '안녕하세요 TCP';

const HEIGHT = 80;
const MARGIN_X = 40;
const MARGIN_Y = 60;

const { strokes, width } = textToStrokes(text, {
  x: MARGIN_X,
  y: MARGIN_Y,
  height: HEIGHT,
  color: 'black',
  width: 4,
});

canvas.width = Math.max(1, Math.ceil(width + MARGIN_X * 2));
canvas.height = HEIGHT + MARGIN_Y * 2;

const scheduler = createScheduler({ speed: 900 });
const animator = createAnimator(canvas, scheduler, { instant });

if (!instant) {
  animator.onIdle(() => {
    window.__ready = true;
  });
}

animator.enqueue(strokes, 'demo');

if (instant) {
  window.__ready = true;
}

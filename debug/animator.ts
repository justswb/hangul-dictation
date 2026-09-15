import { createScheduler } from '../src/render/scheduler.ts';
import { createAnimator } from '../src/render/animator.ts';
import type { DrawStroke } from '../src/contracts/stroke.ts';

declare global {
  interface Window {
    __ready?: boolean;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#board');
if (!canvas) throw new Error('#board 캔버스를 찾을 수 없다.');

const params = new URLSearchParams(window.location.search);
const instant = params.get('instant') === '1';

const scheduler = createScheduler({ speed: 900 });
const animator = createAnimator(canvas, scheduler, { instant });

// 디버그용 임의 획 몇 개 (기역 비슷한 모양 + 세로/가로 획).
const strokes: DrawStroke[] = [
  {
    color: 'black',
    width: 6,
    groupId: 'sample',
    points: [
      { x: 60, y: 60 },
      { x: 220, y: 60 },
    ],
  },
  {
    color: 'blue',
    width: 6,
    groupId: 'sample',
    points: [
      { x: 220, y: 60 },
      { x: 220, y: 180 },
      { x: 120, y: 260 },
    ],
  },
  {
    color: 'red',
    width: 6,
    groupId: 'sample',
    points: [
      { x: 60, y: 220 },
      { x: 260, y: 220 },
    ],
  },
];

animator.enqueue(strokes, 'sample');

window.__ready = true;

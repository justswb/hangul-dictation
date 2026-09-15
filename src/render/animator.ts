import type { Animator } from '../contracts/animator.ts';
import type { DrawStroke } from '../contracts/stroke.ts';
import type { Scheduler } from './scheduler.ts';

/** createAnimator 옵션. instant면 enqueue 즉시 전부 그린다. */
export type AnimatorOptions = { instant?: boolean };

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke): void {
  const [first, ...rest] = stroke.points;
  if (!first) return;

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of rest) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.restore();
}

/** 캔버스에 획을 순서대로 그리는 애니메이터. 현재는 enqueue만 동작한다. */
export function createAnimator(canvas: HTMLCanvasElement, scheduler: Scheduler, options: AnimatorOptions = {}): Animator {
  const { instant = false } = options;

  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) throw new Error('캔버스 2D 컨텍스트를 가져올 수 없다.');
  const ctx: CanvasRenderingContext2D = rawCtx;

  // 완성된 획을 누적하는 오프스크린 캔버스. 매 프레임 다시 그리지 않기 위해 사용.
  const completedLayer = document.createElement('canvas');
  completedLayer.width = canvas.width;
  completedLayer.height = canvas.height;
  const rawCompletedCtx = completedLayer.getContext('2d');
  if (!rawCompletedCtx) throw new Error('오프스크린 2D 컨텍스트를 가져올 수 없다.');
  const completedCtx: CanvasRenderingContext2D = rawCompletedCtx;

  let partialStroke: DrawStroke | null = null;

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(completedLayer, 0, 0);
    if (partialStroke) drawStroke(ctx, partialStroke);
  }

  function advance(dtMs: number): void {
    const { completed, partial } = scheduler.tick(dtMs);
    for (const stroke of completed) drawStroke(completedCtx, stroke);
    partialStroke = partial;
  }

  let lastTimestamp: number | null = null;
  function loop(timestamp: number): void {
    const dtMs = lastTimestamp === null ? 0 : timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    advance(dtMs);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    enqueue(strokes: DrawStroke[], groupId: string): void {
      scheduler.enqueue(strokes, groupId);
      if (instant) {
        // 큐에 쌓인 모든 획을 한 번에 완성 처리한다.
        advance(Infinity);
        render();
      }
    },
    stop(): void {
      // T17에서 구현
    },
    clear(): void {
      // T17에서 구현
    },
    onGroupDone(cb: (groupId: string) => void): void {
      void cb;
      // T17에서 구현
    },
    onIdle(cb: () => void): void {
      void cb;
      // T17에서 구현
    },
  };
}

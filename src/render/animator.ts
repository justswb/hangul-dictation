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

/** 캔버스에 획을 순서대로 그리는 애니메이터. */
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
  // 마지막으로 onIdle을 통지한 상태(중복 통지를 막기 위해 전이 시점만 잡는다).
  let idleNotified = true;
  const groupDoneCallbacks: Array<(groupId: string) => void> = [];
  const idleCallbacks: Array<() => void> = [];

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(completedLayer, 0, 0);
    if (partialStroke) drawStroke(ctx, partialStroke);
  }

  function notifyGroupsDone(groupsDone: string[]): void {
    for (const groupId of groupsDone) {
      for (const cb of groupDoneCallbacks) cb(groupId);
    }
  }

  // idle 상태로 "전이"하는 순간에만 onIdle을 호출한다.
  function notifyIdle(isIdle: boolean): void {
    if (isIdle) {
      if (!idleNotified) {
        idleNotified = true;
        for (const cb of idleCallbacks) cb();
      }
    } else {
      idleNotified = false;
    }
  }

  function advance(dtMs: number): void {
    const { completed, partial, groupsDone } = scheduler.tick(dtMs);
    for (const stroke of completed) drawStroke(completedCtx, stroke);
    partialStroke = partial;
    // onGroupDone 콜백이 그 안에서 enqueue할 수 있으므로, idle 여부는 콜백을 모두
    // 실행한 뒤 스케줄러의 현재 상태로 다시 확인한다(tick 시점의 값을 그대로 쓰지 않는다).
    notifyGroupsDone(groupsDone);
    notifyIdle(scheduler.isIdle());
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
    // 같은 groupId로 연달아 enqueue하면 스케줄러 큐 안에서 하나의 그룹으로 합쳐지고,
    // 그 groupId의 마지막 조각까지 끝났을 때만 onGroupDone이 통지된다(빈 배열도 그 그룹의
    // 조각 하나로 취급되어 차례가 오면 그림 없이 완료 신호만 낸다).
    enqueue(strokes: DrawStroke[], groupId: string): void {
      scheduler.enqueue(strokes, groupId);
      // 빈 그룹이라도 스케줄러 큐에 마커가 남아 처리를 기다리므로 항상 busy로 표시한다.
      idleNotified = false;
      if (instant) {
        // 큐에 쌓인 모든 획을 한 번에 완성 처리한다.
        advance(Infinity);
        render();
      }
    },
    stop(): void {
      const finalized = scheduler.stop();
      if (finalized) drawStroke(completedCtx, finalized);
      partialStroke = null;
      render();
      notifyIdle(scheduler.isIdle());
    },
    clear(): void {
      scheduler.clear();
      partialStroke = null;
      completedCtx.clearRect(0, 0, completedLayer.width, completedLayer.height);
      render();
      notifyIdle(scheduler.isIdle());
    },
    onGroupDone(cb: (groupId: string) => void): void {
      groupDoneCallbacks.push(cb);
    },
    onIdle(cb: () => void): void {
      idleCallbacks.push(cb);
    },
  };
}

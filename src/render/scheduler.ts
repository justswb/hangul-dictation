import type { DrawStroke, Point } from '../contracts/stroke.ts';

/** createScheduler 옵션. speed는 초당 이동 거리(px/s). */
export type SchedulerOptions = { speed?: number };

/**
 * 한 틱의 결과.
 * - completed: 이번 틱에 새로 완성된 획
 * - partial: 그리는 중인 획(앞부분만 자른 점 목록)
 * - groupsDone: 이번 틱에 마지막 획까지 완성되어 끝난 groupId 목록 (완료 순서대로)
 * - idle: 이번 틱 이후 큐가 비고 진행 중인 획도 없는지 여부
 */
export type TickResult = {
  completed: DrawStroke[];
  partial: DrawStroke | null;
  groupsDone: string[];
  idle: boolean;
};

/** 획을 큐 순서대로 시간에 따라 진행시키는 순수 스케줄러. */
export interface Scheduler {
  /** 획 묶음을 큐에 추가한다. groupId는 각 획에 그대로 적용된다. */
  enqueue(strokes: DrawStroke[], groupId: string): void;
  /** dtMs(ms)만큼 시간을 진행시키고 결과를 반환한다. */
  tick(dtMs: number): TickResult;
  /**
   * 진행 중인 획을 현재 지점에서 멈춘 모양 그대로 확정해 반환하고 큐를 비운다.
   * 진행 중인 획이 없으면(그리기 시작 전이거나 큐가 비어 있으면) null을 반환한다.
   * 반환된 획은 groupsDone 대상이 아니다(중간에 끊긴 그룹이므로).
   */
  stop(): DrawStroke | null;
  /** 큐를 비운다. (캔버스를 지우는 것은 호출하는 쪽의 책임이다.) */
  clear(): void;
}

/** 점 배열의 총 길이(점 간 거리 합). */
function pathLength(points: Point[]): number {
  if (points.length === 0) return 0;
  const [first, ...rest] = points;
  if (!first) return 0;
  let prev = first;
  let total = 0;
  for (const point of rest) {
    total += Math.hypot(point.x - prev.x, point.y - prev.y);
    prev = point;
  }
  return total;
}

/** points를 시작점부터 dist 거리만큼 자른 점 목록. dist는 pathLength(points)보다 작아야 한다. */
function takeDistance(points: Point[], dist: number): Point[] {
  if (points.length === 0) return [];
  const [first, ...rest] = points;
  if (!first) return [];

  const result: Point[] = [first];
  let remaining = dist;
  let prev = first;
  for (const point of rest) {
    const segLen = Math.hypot(point.x - prev.x, point.y - prev.y);
    if (segLen <= remaining) {
      result.push(point);
      remaining -= segLen;
      prev = point;
    } else {
      const t = segLen === 0 ? 0 : remaining / segLen;
      result.push({ x: prev.x + (point.x - prev.x) * t, y: prev.y + (point.y - prev.y) * t });
      break;
    }
  }
  return result;
}

type QueueItem = { stroke: DrawStroke; length: number };

export function createScheduler({ speed = 900 }: SchedulerOptions = {}): Scheduler {
  const queue: QueueItem[] = [];
  // 큐 맨 앞 획(진행 중인 획)에 이미 그려진 거리.
  let drawnLength = 0;

  function enqueue(strokes: DrawStroke[], groupId: string): void {
    for (const stroke of strokes) {
      const tagged: DrawStroke = { ...stroke, groupId };
      queue.push({ stroke: tagged, length: pathLength(stroke.points) });
    }
  }

  function tick(dtMs: number): TickResult {
    let distance = speed * (dtMs / 1000);
    const completed: DrawStroke[] = [];
    const groupsDone: string[] = [];

    while (distance > 0 && queue.length > 0) {
      const item = queue[0];
      if (!item) break;
      const remaining = item.length - drawnLength;
      if (remaining <= distance) {
        completed.push(item.stroke);
        distance -= remaining;
        queue.shift();
        drawnLength = 0;
        const next = queue[0];
        if (!next || next.stroke.groupId !== item.stroke.groupId) {
          groupsDone.push(item.stroke.groupId);
        }
      } else {
        drawnLength += distance;
        distance = 0;
      }
    }

    let partial: DrawStroke | null = null;
    const head = queue[0];
    if (head && drawnLength > 0) {
      partial = { ...head.stroke, points: takeDistance(head.stroke.points, drawnLength) };
    }

    const idle = queue.length === 0 && drawnLength === 0;

    return { completed, partial, groupsDone, idle };
  }

  function stop(): DrawStroke | null {
    const head = queue[0];
    let finalized: DrawStroke | null = null;
    if (head && drawnLength > 0) {
      finalized = { ...head.stroke, points: takeDistance(head.stroke.points, drawnLength) };
    }
    queue.length = 0;
    drawnLength = 0;
    return finalized;
  }

  function clear(): void {
    queue.length = 0;
    drawnLength = 0;
  }

  return { enqueue, tick, stop, clear };
}

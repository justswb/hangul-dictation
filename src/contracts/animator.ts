import type { DrawStroke } from './stroke.ts';

/** 획을 큐 순서대로 그리는 애니메이터. */
export interface Animator {
  /** 획 묶음을 큐에 추가한다. groupId는 완료 알림 단위. */
  enqueue(strokes: DrawStroke[], groupId: string): void;
  /** 진행 중 획을 현재 지점에서 확정하고 큐를 비운다. */
  stop(): void;
  /** 큐를 비우고 보드를 지운다. */
  clear(): void;
  /** 그룹의 마지막 획이 완성되면 호출된다 (stop으로 끊긴 그룹은 제외). */
  onGroupDone(cb: (groupId: string) => void): void;
  /** 큐가 비고 진행 중 획이 없어지면 호출된다. */
  onIdle(cb: () => void): void;
}

import type { Color } from './stroke.ts';

/** 보드 명령 (docs/board-ops.md). AI가 NDJSON 한 줄에 하나씩 출력한다. */

/** 텍스트 크기. */
export type TextSize = 'title' | 'body' | 'note';

/** 응답 첫 줄: 이번 답의 예상 줄 수. */
export type PlanOp = { op: 'plan'; lines: number };

/** 텍스트 한 줄 (흐름 배치). */
export type WriteOp = { op: 'write'; id: string; text: string; size: TextSize; color?: Color };

/** 도식 노드의 상대 위치. */
export type Place = { rel: 'right_of' | 'below'; of: string };

/** 라벨이 든 도형. */
export type BoxOp = { op: 'box'; id: string; text: string; shape: 'rect' | 'ellipse'; place?: Place };

/** 두 요소를 잇는 화살표. */
export type ArrowOp = { op: 'arrow'; from: string; to: string; label?: string };

/** 기존 요소 강조. */
export type MarkOp = { op: 'mark'; target: string; style: 'underline' | 'circle' | 'check'; color?: Color };

/** 새 페이지. */
export type NewPageOp = { op: 'newpage' };

/** 보드 명령 전체. */
export type Op = PlanOp | WriteOp | BoxOp | ArrowOp | MarkOp | NewPageOp;

/**
 * 세션: OpSource → 레이아웃 → 애니메이터 연결 (T26).
 *
 * - 전송하면 `thinking`, op 이벤트마다 배치해서 애니메이터 큐에 넣고, 첫 획부터 `writing`.
 * - 이력에는 이번 턴에 실제로 그려진 op만 NDJSON 한 줄씩 남는다
 *   (`plan`·`newpage`는 그릴 획이 없으므로 받은 즉시 기록).
 * - 중단·지우기는 사용자 입력 경로에서만 애니메이터를 건드린다
 *   (`onGroupDone` 콜백 안에서 stop/clear를 부르면 알림 순서가 꼬인다).
 */
import type { Animator } from './contracts/animator.ts';
import type { AppError, AppErrorKind, OpSource, Turn } from './contracts/op-source.ts';
import type { PageState } from './contracts/layout.ts';
import type { Op } from './contracts/ops.ts';
import { emptyPage, layoutOp } from './layout/index.ts';
import { summarizePage } from './layout/summary.ts';
import type { ShellState } from './ui/shell.ts';

/** 세션이 쓰는 셸의 일부. 인증 오류일 때 제공자 화면을 연다. */
export type SessionShell = {
  setState(state: ShellState): void;
  setError(msg: string | null): void;
  onProvider(): void;
};

export type Session = {
  /** 질문을 보낸다. 이미 진행 중이면 무시한다. */
  send(question: string): void;
  /** 진행 중인 요청을 중단한다. */
  stop(): void;
  /** 보드·페이지·이력을 모두 비운다. */
  clear(): void;
  /** 현재 대화 이력 (읽기용 복사본). */
  getHistory(): Turn[];
  /** 현재 페이지 상태. */
  getPage(): PageState;
};

/** 오류 종류별 사용자 문구 (docs/errors.md). */
export const ERROR_TEXT: Record<AppErrorKind, string> = {
  network: '연결에 실패했어요. 잠시 후 다시 시도해 주세요.',
  server: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  rate_limit: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  auth: '인증에 실패했어요. 제공자와 키를 확인해 주세요.',
  refusal: '답변할 수 없는 질문이에요.',
  stream_cut: '응답이 중간에 끊겼어요. 받은 내용까지만 그렸어요.',
};

/** 진행 중인 한 턴의 상태. */
type ActiveTurn = {
  id: number;
  question: string;
  /** 이미 그려진(또는 그릴 획이 없는) op의 NDJSON 줄. */
  recorded: string[];
  /** 아직 다 그려지지 않은 그룹: groupId → NDJSON 줄. */
  pending: Map<string, string>;
  /** 스트림이 done/error로 끝났는가. */
  streamEnded: boolean;
  /** 이미 마무리했는가 (중복 방지). */
  finished: boolean;
  /** 첫 획을 큐에 넣었는가 (writing 전환 시점). */
  started: boolean;
};

function toLine(op: Op): string {
  return JSON.stringify(op);
}

export function createSession({
  source,
  animator,
  shell,
}: {
  source: OpSource;
  animator: Animator;
  shell: SessionShell;
}): Session {
  let page: PageState = emptyPage();
  const history: Turn[] = [];
  let turn: ActiveTurn | null = null;
  let turnSeq = 0;

  function groupIdFor(turnId: number, index: number): string {
    return `t${turnId}:${index}`;
  }

  /** 턴을 이력에 남기고 idle로 돌아간다. */
  function finishTurn(): void {
    if (!turn || turn.finished) return;
    turn.finished = true;
    history.push({ question: turn.question, ops: [...turn.recorded] });
    turn = null;
    shell.setState('idle');
  }

  /** 스트림이 끝났고 그릴 그룹도 남지 않았으면 마무리한다. */
  function maybeFinish(): void {
    if (!turn || !turn.streamEnded) return;
    if (turn.pending.size > 0) return;
    finishTurn();
  }

  animator.onGroupDone((groupId) => {
    if (!turn) return;
    const line = turn.pending.get(groupId);
    if (line === undefined) return;
    turn.pending.delete(groupId);
    turn.recorded.push(line);
    // 여기서는 애니메이터를 건드리지 않는다 (알림 순서 보호).
    maybeFinish();
  });

  animator.onIdle(() => {
    maybeFinish();
  });

  function handleOp(active: ActiveTurn, op: Op, index: number): void {
    const result = layoutOp(op, page);
    page = result.page;

    // clearBefore는 placed 유무와 무관하게 먼저 처리한다
    // (plan·newpage는 placed가 비어 있지만 보드를 지워야 한다).
    if (result.clearBefore) {
      animator.clear();
      // 큐에 남아 있던 그룹은 그려지지 않으므로 이력에서 뺀다.
      active.pending.clear();
    }

    const line = toLine(op);
    const strokes = result.placed.flatMap((el) => el.strokes);

    if (op.op === 'plan' || op.op === 'newpage') {
      // 그릴 획이 없는 op는 받은 즉시 기록한다.
      active.recorded.push(line);
      return;
    }

    const groupId = groupIdFor(active.id, index);
    active.pending.set(groupId, line);
    animator.enqueue(strokes, groupId);
    if (!active.started) {
      active.started = true;
      shell.setState('writing');
    }
  }

  function handleError(error: AppError): void {
    shell.setError(ERROR_TEXT[error.kind]);
    if (error.kind === 'auth') shell.onProvider();
  }

  async function consume(active: ActiveTurn): Promise<void> {
    const req = { question: active.question, history: [...history], pageSummary: summarizePage(page) };
    let index = 0;
    try {
      for await (const event of source.start(req)) {
        if (turn !== active) return;
        if (event.type === 'op') {
          handleOp(active, event.op, index);
          index += 1;
        } else if (event.type === 'error') {
          handleError(event.error);
          break;
        } else {
          break;
        }
      }
    } catch {
      if (turn !== active) return;
      handleError({ kind: 'network' });
    }
    if (turn !== active) return;
    // 쓰던 획은 끝까지 그린 뒤 idle이 된다.
    active.streamEnded = true;
    maybeFinish();
  }

  function send(question: string): void {
    if (turn) return;
    turnSeq += 1;
    const active: ActiveTurn = {
      id: turnSeq,
      question,
      recorded: [],
      pending: new Map(),
      streamEnded: false,
      finished: false,
      started: false,
    };
    turn = active;
    shell.setError(null);
    shell.setState('thinking');
    void consume(active);
  }

  function stop(): void {
    if (!turn) return;
    source.cancel();
    animator.stop();
    // 끊긴 그룹은 onGroupDone이 오지 않으므로 이력에 남지 않는다.
    finishTurn();
  }

  function clear(): void {
    if (turn) {
      source.cancel();
      animator.stop();
      turn.finished = true;
      turn = null;
    }
    animator.clear();
    page = emptyPage();
    history.length = 0;
    shell.setError(null);
    shell.setState('idle');
  }

  return {
    send,
    stop,
    clear,
    getHistory: () => history.map((t) => ({ question: t.question, ops: [...t.ops] })),
    getPage: () => page,
  };
}

import { describe, expect, it, vi } from 'vitest';
import type { Animator } from './contracts/animator.ts';
import type { DrawStroke } from './contracts/stroke.ts';
import type { OpEvent, OpSource } from './contracts/op-source.ts';
import type { Op } from './contracts/ops.ts';
import { ERROR_TEXT, createSession, type SessionShell } from './session.ts';

/** 콜백을 직접 부를 수 있는 가짜 애니메이터. */
function createFakeAnimator() {
  const enqueued: Array<{ strokes: DrawStroke[]; groupId: string }> = [];
  const calls: string[] = [];
  const groupDone: Array<(groupId: string) => void> = [];
  const idle: Array<() => void> = [];

  const animator: Animator = {
    enqueue(strokes, groupId) {
      enqueued.push({ strokes, groupId });
      calls.push(`enqueue:${groupId}`);
    },
    stop() {
      calls.push('stop');
      // 실제 애니메이터도 큐를 비우므로 남은 그룹은 완료 알림이 오지 않는다.
      enqueued.length = 0;
    },
    clear() {
      calls.push('clear');
      enqueued.length = 0;
    },
    onGroupDone(cb) {
      groupDone.push(cb);
    },
    onIdle(cb) {
      idle.push(cb);
    },
  };

  return {
    animator,
    enqueued,
    calls,
    /** 큐에 든 그룹을 순서대로 완료 처리하고 마지막에 idle을 알린다. */
    finishAll() {
      for (const { groupId } of enqueued.splice(0)) {
        for (const cb of groupDone) cb(groupId);
      }
      for (const cb of idle) cb();
    },
    /** 그룹 하나만 완료 처리한다. */
    finishNext() {
      const next = enqueued.shift();
      if (!next) return;
      for (const cb of groupDone) cb(next.groupId);
    },
  };
}

/** 이벤트를 밖에서 밀어 넣는 가짜 OpSource. */
function createFakeSource() {
  let push: ((event: OpEvent) => void) | null = null;
  let end: (() => void) | null = null;
  const cancel = vi.fn(() => {
    end?.();
  });

  const queue: OpEvent[] = [];
  let waiter: (() => void) | null = null;
  let done = false;

  async function* start(): AsyncIterable<OpEvent> {
    while (true) {
      while (queue.length > 0) {
        const event = queue.shift();
        if (event) yield event;
      }
      if (done) return;
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }
  }

  push = (event: OpEvent) => {
    queue.push(event);
    waiter?.();
    waiter = null;
  };
  end = () => {
    done = true;
    waiter?.();
    waiter = null;
  };

  const source: OpSource = { start, cancel };
  return {
    source,
    cancel,
    /** 이벤트를 하나 보내고 세션이 처리할 때까지 기다린다. */
    async emit(event: OpEvent) {
      push?.(event);
      await flush();
    },
  };
}

/** 마이크로태스크 큐를 비운다. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function createFakeShell() {
  const states: string[] = [];
  const shell: SessionShell = {
    setState: vi.fn((state) => {
      states.push(state);
    }),
    setError: vi.fn(),
    onProvider: vi.fn(),
  };
  return { shell, states };
}

const PLAN: Op = { op: 'plan', lines: 3 };
const OPS: Op[] = [
  { op: 'write', id: 'a', text: '가', size: 'title' },
  { op: 'write', id: 'b', text: '나', size: 'body' },
  { op: 'write', id: 'c', text: '다', size: 'body' },
];

function setup() {
  const fakeAnimator = createFakeAnimator();
  const fakeSource = createFakeSource();
  const { shell, states } = createFakeShell();
  const session = createSession({ source: fakeSource.source, animator: fakeAnimator.animator, shell });
  return { ...fakeAnimator, ...fakeSource, shell, states, session };
}

describe('createSession', () => {
  it('op 3개 + done이면 enqueue 3회, 모두 완료된 뒤 idle, 이력 턴 1개(plan + op 3줄)', async () => {
    const t = setup();

    t.session.send('TCP가 뭐야');
    await flush();
    expect(t.states).toEqual(['thinking']);

    await t.emit({ type: 'op', op: PLAN });
    for (const op of OPS) await t.emit({ type: 'op', op });

    expect(t.enqueued).toHaveLength(3);
    expect(t.states).toEqual(['thinking', 'writing']);

    await t.emit({ type: 'done' });
    // 아직 그리는 중이면 idle이 아니다.
    expect(t.states).toEqual(['thinking', 'writing']);

    t.finishAll();
    expect(t.states).toEqual(['thinking', 'writing', 'idle']);

    expect(t.session.getHistory()).toEqual([
      {
        question: 'TCP가 뭐야',
        ops: [PLAN, ...OPS].map((op) => JSON.stringify(op)),
      },
    ]);
  });

  it('두 번째 op 처리 중 중단하면 cancel·stop을 부르고 이력에 첫 그룹만 남는다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();
    await t.emit({ type: 'op', op: OPS[0] as Op });
    await t.emit({ type: 'op', op: OPS[1] as Op });

    t.finishNext(); // 첫 그룹만 다 그렸다

    t.session.stop();
    await flush();

    expect(t.cancel).toHaveBeenCalledTimes(1);
    expect(t.calls).toContain('stop');
    expect(t.states.at(-1)).toBe('idle');
    expect(t.session.getHistory()).toEqual([{ question: '질문', ops: [JSON.stringify(OPS[0])] }]);
  });

  it('clearBefore면 해당 enqueue보다 clear()가 먼저 호출된다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();
    // 페이지를 채운 뒤 newpage를 보내면 layoutOp가 clearBefore를 돌려준다.
    await t.emit({ type: 'op', op: OPS[0] as Op });
    t.finishNext();
    await t.emit({ type: 'op', op: { op: 'newpage' } });
    await t.emit({ type: 'op', op: OPS[1] as Op });

    const clearIndex = t.calls.indexOf('clear');
    const lastEnqueue = t.calls.lastIndexOf(`enqueue:${t.enqueued.at(-1)?.groupId ?? ''}`);
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeLessThan(lastEnqueue);
  });

  it('넘침 write처럼 자신이 clearBefore를 내는 op도 clear() 다음에 enqueue된다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();

    // 페이지가 찰 때까지 본문 줄을 계속 보낸다. 넘치는 순간 layoutOp가
    // clearBefore를 돌려주므로, 그 op의 enqueue보다 clear가 먼저여야 한다.
    let overflowed = false;
    for (let i = 0; i < 40 && !overflowed; i += 1) {
      await t.emit({ type: 'op', op: { op: 'write', id: `w${i}`, text: `줄 ${i}`, size: 'body' } });
      t.finishNext();
      overflowed = t.calls.includes('clear');
    }

    expect(overflowed).toBe(true);
    const clearIndex = t.calls.indexOf('clear');
    // clear 바로 다음 호출이 넘친 op의 enqueue다 (그 사이에 다른 호출이 없다).
    expect(t.calls[clearIndex + 1]).toMatch(/^enqueue:/);
    // 넘친 op는 빈 페이지에 다시 배치되어 그 한 줄만 남는다.
    expect(t.session.getPage().elements).toHaveLength(1);
  });

  it('clearBefore면 아직 그려지지 않은 그룹의 이력 줄은 버려진다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();

    // 첫 op는 그리는 중(완료 알림 없음) 상태로 두고 newpage를 받는다.
    await t.emit({ type: 'op', op: OPS[0] as Op });
    await t.emit({ type: 'op', op: { op: 'newpage' } });

    expect(t.calls).toEqual([`enqueue:t1:0`, 'clear']);

    await t.emit({ type: 'done' });
    t.finishAll();

    // 그려지다 지워진 첫 op는 이력에 없고, newpage 줄만 남는다.
    expect(t.session.getHistory()).toEqual([
      { question: '질문', ops: [JSON.stringify({ op: 'newpage' })] },
    ]);
  });

  it('지우기는 이력과 페이지를 비운다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();
    await t.emit({ type: 'op', op: OPS[0] as Op });
    await t.emit({ type: 'done' });
    t.finishAll();
    expect(t.session.getHistory()).toHaveLength(1);
    expect(t.session.getPage().elements.length).toBeGreaterThan(0);

    t.session.clear();

    expect(t.session.getHistory()).toHaveLength(0);
    expect(t.session.getPage().elements).toEqual([]);
    expect(t.calls).toContain('clear');
  });

  it('진행 중 지우기는 중단한 뒤 비운다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();
    await t.emit({ type: 'op', op: OPS[0] as Op });

    t.session.clear();
    await flush();

    expect(t.cancel).toHaveBeenCalledTimes(1);
    expect(t.calls).toContain('stop');
    expect(t.session.getHistory()).toHaveLength(0);
    expect(t.session.getPage().elements).toEqual([]);
  });

  it('오류 이벤트는 문구를 띄우고 그리던 획을 끝낸 뒤 idle이 된다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();
    await t.emit({ type: 'op', op: OPS[0] as Op });
    await t.emit({ type: 'error', error: { kind: 'stream_cut' } });

    expect(t.shell.setError).toHaveBeenLastCalledWith(ERROR_TEXT.stream_cut);
    expect(t.states.at(-1)).toBe('writing');

    t.finishAll();
    expect(t.states.at(-1)).toBe('idle');
    expect(t.session.getHistory()).toEqual([{ question: '질문', ops: [JSON.stringify(OPS[0])] }]);
  });

  it('인증 오류는 제공자 화면을 연다', async () => {
    const t = setup();

    t.session.send('질문');
    await flush();
    await t.emit({ type: 'error', error: { kind: 'auth' } });

    expect(t.shell.setError).toHaveBeenLastCalledWith(ERROR_TEXT.auth);
    expect(t.shell.onProvider).toHaveBeenCalledTimes(1);
  });

  it('두 번째 턴 요청에는 첫 턴 이력과 페이지 요약이 실린다', async () => {
    const t = setup();
    const startSpy = vi.spyOn(t.source, 'start');

    t.session.send('첫 질문');
    await flush();
    await t.emit({ type: 'op', op: OPS[0] as Op });
    await t.emit({ type: 'done' });
    t.finishAll();

    t.session.send('둘째 질문');
    await flush();

    const req = startSpy.mock.calls.at(-1)?.[0];
    expect(req?.question).toBe('둘째 질문');
    expect(req?.history).toHaveLength(1);
    expect(req?.pageSummary).toContain('가');
  });
});

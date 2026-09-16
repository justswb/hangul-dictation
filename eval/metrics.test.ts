import { describe, expect, it } from 'vitest';
import type { Op } from '../src/contracts/ops.ts';
import { emptyPage, layoutOp } from '../src/layout/index.ts';
import { applyOps, computeQuestionMetrics, percentile, referencesExistingId, summarize } from './metrics.ts';

function write(id: string, text: string): Op {
  return { op: 'write', id, text, size: 'body' };
}

describe('applyOps', () => {
  it('write 두 줄에서 cursorY 증가량을 body 줄 높이로 나눠 누적한다', () => {
    const { actualLinesUsed } = applyOps([write('a', '안녕'), write('b', '반가워')], emptyPage());
    expect(actualLinesUsed).toBeCloseTo(2, 5);
  });

  it('clearBefore로 페이지가 지워지면 그 시점부터 다시 센다', () => {
    const { actualLinesUsed } = applyOps(
      [write('a', '첫줄'), { op: 'newpage' }, write('b', '둘째줄')],
      emptyPage(),
    );
    expect(actualLinesUsed).toBeCloseTo(1, 5);
  });
});

describe('referencesExistingId', () => {
  it('arrow.from/to가 기존 id를 가리키면 true', () => {
    expect(referencesExistingId([{ op: 'arrow', from: 'a', to: 'x' }], new Set(['a', 'b']))).toBe(true);
  });

  it('mark.target이 기존 id를 가리키면 true', () => {
    expect(referencesExistingId([{ op: 'mark', target: 'b', style: 'circle' }], new Set(['a', 'b']))).toBe(true);
  });

  it('box.place.of가 기존 id를 가리키면 true', () => {
    const op: Op = { op: 'box', id: 'c', text: 't', shape: 'rect', place: { rel: 'right_of', of: 'a' } };
    expect(referencesExistingId([op], new Set(['a']))).toBe(true);
  });

  it('아무것도 기존 id를 가리키지 않으면 false', () => {
    expect(referencesExistingId([write('c', 'x')], new Set(['a']))).toBe(false);
  });
});

describe('computeQuestionMetrics', () => {
  it('plan.lines 대비 실제 사용 줄 수 오차를 계산한다', () => {
    const ops: Op[] = [{ op: 'plan', lines: 3 }, write('a', '한줄'), write('b', '두줄')];
    const { metrics } = computeQuestionMetrics({
      question: 'q',
      isFollowup: false,
      ops,
      invalidCount: 0,
      firstOpMs: 120,
      errorKind: null,
      pageBefore: emptyPage(),
    });

    expect(metrics.firstLineIsPlan).toBe(true);
    expect(metrics.planLines).toBe(3);
    expect(metrics.actualLinesUsed).toBeCloseTo(2, 5);
    expect(metrics.planLineError).toBeCloseTo(-1, 5);
  });

  it('28자 초과 write 비율을 계산한다', () => {
    const long = 'a'.repeat(29);
    const short = 'a'.repeat(10);
    const ops: Op[] = [write('a', long), write('b', short)];
    const { metrics } = computeQuestionMetrics({
      question: 'q',
      isFollowup: false,
      ops,
      invalidCount: 0,
      firstOpMs: null,
      errorKind: null,
      pageBefore: emptyPage(),
    });

    expect(metrics.writeCount).toBe(2);
    expect(metrics.overlongWriteCount).toBe(1);
    expect(metrics.overlongWriteRatio).toBeCloseTo(0.5, 5);
  });

  it('유효 줄 비율은 유효 op 수 / (유효 + 무효)', () => {
    const ops: Op[] = [write('a', 'x')];
    const { metrics } = computeQuestionMetrics({
      question: 'q',
      isFollowup: false,
      ops,
      invalidCount: 1,
      firstOpMs: null,
      errorKind: null,
      pageBefore: emptyPage(),
    });

    expect(metrics.totalLines).toBe(2);
    expect(metrics.validRatio).toBeCloseTo(0.5, 5);
  });

  it('후속 질문에서 기존 id를 참조했는지 표시한다', () => {
    const before = layoutOp(write('a', '기존'), emptyPage()).page;
    const ops: Op[] = [{ op: 'mark', target: 'a', style: 'circle' }];
    const { metrics } = computeQuestionMetrics({
      question: 'q',
      isFollowup: true,
      ops,
      invalidCount: 0,
      firstOpMs: null,
      errorKind: null,
      pageBefore: before,
    });

    expect(metrics.referencedExistingId).toBe(true);
  });

  it('후속 질문이 아니면 referencedExistingId는 null', () => {
    const { metrics } = computeQuestionMetrics({
      question: 'q',
      isFollowup: false,
      ops: [],
      invalidCount: 0,
      firstOpMs: null,
      errorKind: null,
      pageBefore: emptyPage(),
    });

    expect(metrics.referencedExistingId).toBeNull();
  });
});

describe('percentile', () => {
  it('nearest-rank로 p50/p90을 계산한다', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 90)).toBe(90);
  });

  it('값이 없으면 null', () => {
    expect(percentile([], 50)).toBeNull();
  });
});

describe('summarize', () => {
  it('전체 지표를 집계한다', () => {
    const base = {
      question: 'q',
      totalLines: 1,
      validLines: 1,
      validRatio: 1,
      planLines: null,
      actualLinesUsed: 0,
      planLineError: null,
      overlongWriteCount: 0,
      writeCount: 0,
      overlongWriteRatio: 0,
      errorKind: null,
    };
    const summary = summarize([
      { ...base, isFollowup: false, firstOpMs: 100, firstLineIsPlan: true, referencedExistingId: null },
      { ...base, isFollowup: true, firstOpMs: 200, firstLineIsPlan: false, referencedExistingId: true, errorKind: 'network' },
      { ...base, isFollowup: true, firstOpMs: null, firstLineIsPlan: false, referencedExistingId: false },
    ]);

    expect(summary.count).toBe(3);
    expect(summary.firstOpMsP50).toBe(100);
    expect(summary.followupCount).toBe(2);
    expect(summary.followupReferenceRatio).toBeCloseTo(0.5, 5);
    expect(summary.firstLineIsPlanRatio).toBeCloseTo(1 / 3, 5);
    expect(summary.errorCounts).toEqual({ network: 1 });
  });
});

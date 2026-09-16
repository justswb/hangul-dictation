/**
 * 질문 하나에 대한 응답 지표 계산 (T31, 이슈 #37).
 *
 * 페이지 상태는 실제 `layoutOp`로 계산한다. 순수 함수 — 입력을 바꾸지 않는다.
 */
import { LINE_HEIGHT_RATIO, TEXT_HEIGHT } from '../src/layout/constants.ts';
import type { PageState } from '../src/contracts/layout.ts';
import type { Op } from '../src/contracts/ops.ts';
import { emptyPage, layoutOp } from '../src/layout/index.ts';
import type { AppErrorKind } from '../src/contracts/op-source.ts';

const BODY_LINE_HEIGHT = TEXT_HEIGHT.body * LINE_HEIGHT_RATIO;
const WRITE_LINE_LIMIT = 28;

/** 질문 하나를 페이지에 적용한 결과. */
export type ApplyResult = {
  page: PageState;
  /** 이번 질문 동안 실제로 그려진 줄 수 (cursorY 증가량 ÷ body 줄 높이 누적). */
  actualLinesUsed: number;
};

/**
 * ops를 순서대로 layoutOp에 적용한다. 넘침·plan으로 페이지가 지워지면(`clearBefore`)
 * 지워지기 전까지 쌓인 줄은 버려지므로, 그 시점부터 다시 센다.
 */
export function applyOps(ops: Op[], page: PageState): ApplyResult {
  let current = page;
  let actualLinesUsed = 0;

  for (const op of ops) {
    const result = layoutOp(op, current);
    if (result.clearBefore) {
      // 지워지기 전 내용은 화면에 남지 않으므로 그만큼은 버리고, 지운 뒤 이번
      // op로 새로 놓인 만큼만 새 페이지 기준으로 센다.
      const delta = result.page.cursorY - emptyPage().cursorY;
      actualLinesUsed = delta > 0 ? delta / BODY_LINE_HEIGHT : 0;
    } else {
      const delta = result.page.cursorY - current.cursorY;
      if (delta > 0) actualLinesUsed += delta / BODY_LINE_HEIGHT;
    }
    current = result.page;
  }

  return { page: current, actualLinesUsed };
}

/** arrow.from/to, mark.target, box.place.of 중 하나라도 주어진 id 집합을 가리키는가. */
export function referencesExistingId(ops: Op[], existingIds: ReadonlySet<string>): boolean {
  for (const op of ops) {
    if (op.op === 'arrow') {
      if (existingIds.has(op.from) || existingIds.has(op.to)) return true;
    } else if (op.op === 'mark') {
      if (existingIds.has(op.target)) return true;
    } else if (op.op === 'box' && op.place) {
      if (existingIds.has(op.place.of)) return true;
    }
  }
  return false;
}

/** 질문 하나에 대한 지표. */
export type QuestionMetrics = {
  question: string;
  isFollowup: boolean;
  /** 요청 → 첫 op 도착(ms). op가 없으면 null. */
  firstOpMs: number | null;
  /** 비어 있지 않은 전체 줄 수 (유효 op + 무효 줄). */
  totalLines: number;
  /** 유효한 op 줄 수. */
  validLines: number;
  /** validLines / totalLines (totalLines가 0이면 0). */
  validRatio: number;
  /** 첫 (비어 있지 않은) 줄이 plan인가. */
  firstLineIsPlan: boolean;
  /** 응답에 담긴 첫 plan.lines 값. plan이 없으면 null. */
  planLines: number | null;
  /** cursorY 증가량 ÷ body 줄 높이로 계산한 실제 사용 줄 수. */
  actualLinesUsed: number;
  /** actualLinesUsed - planLines. planLines가 없으면 null. */
  planLineError: number | null;
  /** 28자 초과 write 줄 수. */
  overlongWriteCount: number;
  /** write 줄 수 (0이면 overlongWriteRatio는 0). */
  writeCount: number;
  overlongWriteRatio: number;
  /** 후속 질문일 때만: 직전까지 있던 id를 참조했는가. 후속이 아니면 null. */
  referencedExistingId: boolean | null;
  /** 프록시가 error를 냈으면 그 종류. */
  errorKind: AppErrorKind | null;
};

export function computeQuestionMetrics({
  question,
  isFollowup,
  ops,
  invalidCount,
  firstOpMs,
  errorKind,
  pageBefore,
}: {
  question: string;
  isFollowup: boolean;
  ops: Op[];
  invalidCount: number;
  firstOpMs: number | null;
  errorKind: AppErrorKind | null;
  pageBefore: PageState;
}): { metrics: QuestionMetrics; page: PageState } {
  const validLines = ops.length;
  const totalLines = validLines + invalidCount;
  const validRatio = totalLines > 0 ? validLines / totalLines : 0;

  const firstOp = ops[0];
  const firstLineIsPlan = firstOp !== undefined && firstOp.op === 'plan';
  const planOp = ops.find((op) => op.op === 'plan');
  const planLines = planOp && planOp.op === 'plan' ? planOp.lines : null;

  const writeOps = ops.filter((op) => op.op === 'write');
  const overlongWriteCount = writeOps.filter((op) => op.op === 'write' && [...op.text].length > WRITE_LINE_LIMIT).length;
  const writeCount = writeOps.length;
  const overlongWriteRatio = writeCount > 0 ? overlongWriteCount / writeCount : 0;

  const existingIds = new Set(pageBefore.elements.map((el) => el.id));
  const referencedExistingId = isFollowup ? referencesExistingId(ops, existingIds) : null;

  const { page, actualLinesUsed } = applyOps(ops, pageBefore);
  const planLineError = planLines !== null ? actualLinesUsed - planLines : null;

  return {
    metrics: {
      question,
      isFollowup,
      firstOpMs,
      totalLines,
      validLines,
      validRatio,
      firstLineIsPlan,
      planLines,
      actualLinesUsed,
      planLineError,
      overlongWriteCount,
      writeCount,
      overlongWriteRatio,
      referencedExistingId,
      errorKind,
    },
    page,
  };
}

/** 오름차순 정렬된 값에서 p분위수를 구한다 (nearest-rank, 값이 없으면 null). */
export function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedValues.length);
  const index = Math.min(sortedValues.length, Math.max(1, rank)) - 1;
  return sortedValues[index] ?? null;
}

/** 전체 질문 지표를 요약한다. */
export type SummaryMetrics = {
  count: number;
  firstOpMsP50: number | null;
  firstOpMsP90: number | null;
  avgValidRatio: number;
  firstLineIsPlanRatio: number;
  avgOverlongWriteRatio: number;
  followupCount: number;
  followupReferenceRatio: number | null;
  errorCounts: Record<string, number>;
};

export function summarize(all: QuestionMetrics[]): SummaryMetrics {
  const firstOpTimes = all
    .map((m) => m.firstOpMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const avg = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

  const followups = all.filter((m) => m.isFollowup);
  const followupReferenced = followups.filter((m) => m.referencedExistingId === true);

  const errorCounts: Record<string, number> = {};
  for (const m of all) {
    if (m.errorKind) errorCounts[m.errorKind] = (errorCounts[m.errorKind] ?? 0) + 1;
  }

  return {
    count: all.length,
    firstOpMsP50: percentile(firstOpTimes, 50),
    firstOpMsP90: percentile(firstOpTimes, 90),
    avgValidRatio: avg(all.map((m) => m.validRatio)),
    firstLineIsPlanRatio: all.length === 0 ? 0 : all.filter((m) => m.firstLineIsPlan).length / all.length,
    avgOverlongWriteRatio: avg(all.map((m) => m.overlongWriteRatio)),
    followupCount: followups.length,
    followupReferenceRatio: followups.length === 0 ? null : followupReferenced.length / followups.length,
    errorCounts,
  };
}

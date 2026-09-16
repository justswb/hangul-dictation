/**
 * 평가 스크립트: 형식 준수·첫 op 지연 (T31, 이슈 #37).
 *
 * 실행 중인 dev-proxy(`/ask`)에 `eval/questions.txt`의 질문을 순서대로 보내고,
 * 실제 `layoutOp`로 페이지 상태를 갱신하며 지표를 모아
 * `eval/results/<provider>-<YYYYMMDD-HHmm>.json`·`.md`로 남긴다.
 *
 * 사용법: node eval/run.ts --provider claude|openai [--n 30] [--base http://localhost:8787]
 * 실제 API 호출 비용이 들므로, 이 스크립트를 직접 실행하는 것은 리드의 승인 후로 미룬다
 * (T32). 테스트는 가짜 프록시 서버로 스크립트 동작만 검증한다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PageState } from '../src/contracts/layout.ts';
import { emptyPage } from '../src/layout/index.ts';
import { summarizePage } from '../src/layout/summary.ts';
import { computeQuestionMetrics, summarize, type QuestionMetrics, type SummaryMetrics } from './metrics.ts';
import { askProxy, type Turn } from './proxy-client.ts';

const EVAL_DIR = fileURLToPath(new URL('.', import.meta.url));

/** 질문 파일의 한 줄. `isFollowup`이면 원문에서 `>`와 공백을 뗀 텍스트다. */
type QuestionLine = { text: string; isFollowup: boolean };

/** 이어지는 대화 한 다발: 첫 질문 + 뒤따르는 `>` 후속 질문들. */
type Chain = QuestionLine[];

/** questions.txt 내용을 줄 단위로 나누고, `>`로 시작하는 줄을 앞 질문에 이어붙인다. */
export function parseQuestions(text: string): Chain[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const chains: Chain[] = [];
  for (const line of lines) {
    if (line.startsWith('>')) {
      const followup: QuestionLine = { text: line.slice(1).trim(), isFollowup: true };
      const last = chains[chains.length - 1];
      if (last) last.push(followup);
      else chains.push([{ ...followup, isFollowup: false }]);
    } else {
      chains.push([{ text: line, isFollowup: false }]);
    }
  }
  return chains;
}

/** 질문 다발 목록에서 처음 n개 "질문"(줄) 만큼만 남긴다. 다발 중간을 자르면 그 다발은 거기까지만 남는다. */
export function takeFirstN(chains: Chain[], n: number): Chain[] {
  const result: Chain[] = [];
  let remaining = n;
  for (const chain of chains) {
    if (remaining <= 0) break;
    const kept = chain.slice(0, remaining);
    if (kept.length > 0) result.push(kept);
    remaining -= kept.length;
  }
  return result;
}

/** 질문 하나에 대한 원본 응답 + 지표. */
export type QuestionRecord = {
  question: string;
  isFollowup: boolean;
  metrics: QuestionMetrics;
  raw: {
    rawLines: string[];
    opLines: string[];
    invalid: { line: string; reason: string }[];
    firstOpMs: number | null;
    totalMs: number;
    errorKind: string | null;
  };
};

export type EvalReport = {
  provider: string;
  baseUrl: string;
  startedAt: string;
  questions: QuestionRecord[];
  summary: SummaryMetrics;
};

export type RunEvalOptions = {
  provider: string;
  baseUrl: string;
  chains: Chain[];
  now?: () => number;
  fetchImpl?: typeof fetch;
  /** 결과 파일 이름에 쓸 시각 (기본 현재 시각). */
  startedAt?: Date;
};

/** 다발 하나(대화 하나)를 순서대로 실행해 질문별 기록을 낸다. */
async function runChain({
  chain,
  provider,
  baseUrl,
  now,
  fetchImpl,
}: {
  chain: Chain;
  provider: string;
  baseUrl: string;
  now: () => number;
  fetchImpl: typeof fetch;
}): Promise<QuestionRecord[]> {
  let page: PageState = emptyPage();
  const history: Turn[] = [];
  const records: QuestionRecord[] = [];

  for (const { text: question, isFollowup } of chain) {
    const pageBefore = page;
    const result = await askProxy({
      baseUrl,
      provider,
      question,
      history,
      pageSummary: summarizePage(page),
      now,
      fetchImpl,
    });

    const { metrics, page: pageAfter } = computeQuestionMetrics({
      question,
      isFollowup,
      ops: result.ops,
      invalidCount: result.invalid.length,
      firstOpMs: result.firstOpMs,
      errorKind: result.errorKind,
      pageBefore,
    });
    page = pageAfter;
    history.push({ question, ops: result.opLines });

    records.push({
      question,
      isFollowup,
      metrics,
      raw: {
        rawLines: result.rawLines,
        opLines: result.opLines,
        invalid: result.invalid,
        firstOpMs: result.firstOpMs,
        totalMs: result.totalMs,
        errorKind: result.errorKind,
      },
    });
  }

  return records;
}

/** 질문 다발들을 순서대로(다발 간에는 독립된 대화로) 실행해 보고서를 만든다. */
export async function runEval({
  provider,
  baseUrl,
  chains,
  now = Date.now,
  fetchImpl = fetch,
  startedAt = new Date(),
}: RunEvalOptions): Promise<EvalReport> {
  const questions: QuestionRecord[] = [];
  for (const chain of chains) {
    const records = await runChain({ chain, provider, baseUrl, now, fetchImpl });
    questions.push(...records);
  }

  const summary = summarize(questions.map((q) => q.metrics));

  return { provider, baseUrl, startedAt: startedAt.toISOString(), questions, summary };
}

/** `YYYYMMDD-HHmm` 형식 (로컬 시각). */
export function formatTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}${m}${d}-${hh}${mm}`;
}

function fmt(value: number | null, digits = 0): string {
  return value === null ? '-' : value.toFixed(digits);
}

/** 요약 표를 마크다운으로 렌더링한다. */
export function renderMarkdown(report: EvalReport): string {
  const { summary } = report;
  const lines: string[] = [];
  lines.push(`# 평가 결과: ${report.provider}`);
  lines.push('');
  lines.push(`- 실행 시각: ${report.startedAt}`);
  lines.push(`- 프록시: ${report.baseUrl}`);
  lines.push(`- 질문 수: ${summary.count} (후속 ${summary.followupCount})`);
  lines.push('');
  lines.push('## 요약');
  lines.push('');
  lines.push('| 지표 | 값 |');
  lines.push('|---|---|');
  lines.push(`| 첫 op 지연 p50(ms) | ${fmt(summary.firstOpMsP50)} |`);
  lines.push(`| 첫 op 지연 p90(ms) | ${fmt(summary.firstOpMsP90)} |`);
  lines.push(`| 평균 유효 줄 비율 | ${fmt(summary.avgValidRatio, 3)} |`);
  lines.push(`| 첫 줄이 plan인 비율 | ${fmt(summary.firstLineIsPlanRatio, 3)} |`);
  lines.push(`| 평균 28자 초과 write 비율 | ${fmt(summary.avgOverlongWriteRatio, 3)} |`);
  lines.push(
    `| 후속 질문 중 기존 id 참조 비율 | ${summary.followupReferenceRatio === null ? '-' : fmt(summary.followupReferenceRatio, 3)} |`,
  );
  const errorSummary =
    Object.entries(summary.errorCounts)
      .map(([kind, count]) => `${kind}:${count}`)
      .join(', ') || '없음';
  lines.push(`| 오류 종류별 개수 | ${errorSummary} |`);
  lines.push('');
  lines.push('## 질문별');
  lines.push('');
  lines.push('| # | 후속 | 질문 | 첫 op(ms) | 유효 줄 비율 | 첫 줄 plan | plan 오차 | 28자 초과 write | 오류 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  report.questions.forEach((q, i) => {
    const m = q.metrics;
    lines.push(
      `| ${i + 1} | ${m.isFollowup ? 'Y' : ''} | ${m.question.replace(/\|/g, '\\|')} | ${fmt(m.firstOpMs)} | ${fmt(m.validRatio, 3)} | ${m.firstLineIsPlan ? 'Y' : ''} | ${m.planLineError === null ? '-' : fmt(m.planLineError, 2)} | ${m.overlongWriteCount}/${m.writeCount} | ${m.errorKind ?? ''} |`,
    );
  });
  lines.push('');
  return lines.join('\n');
}

function parseArgs(argv: string[]): { provider: string; baseUrl: string; n: number | null } {
  let provider: string | null = null;
  let baseUrl = 'http://localhost:8787';
  let n: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--provider') provider = argv[++i] ?? null;
    else if (arg === '--base') baseUrl = argv[++i] ?? baseUrl;
    else if (arg === '--n') {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) n = value;
    }
  }

  if (provider !== 'claude' && provider !== 'openai') {
    throw new Error('사용법: node eval/run.ts --provider claude|openai [--n 30] [--base http://localhost:8787]');
  }

  return { provider, baseUrl, n };
}

async function main(): Promise<void> {
  const { provider, baseUrl, n } = parseArgs(process.argv.slice(2));
  const questionsPath = join(EVAL_DIR, 'questions.txt');
  const text = readFileSync(questionsPath, 'utf8');

  let chains = parseQuestions(text);
  if (n !== null) chains = takeFirstN(chains, n);

  const startedAt = new Date();
  const report = await runEval({ provider, baseUrl, chains, startedAt });

  const resultsDir = join(EVAL_DIR, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const base = `${provider}-${formatTimestamp(startedAt)}`;
  const jsonPath = join(resultsDir, `${base}.json`);
  const mdPath = join(resultsDir, `${base}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, renderMarkdown(report));

  console.log(`저장: ${jsonPath}`);
  console.log(`저장: ${mdPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

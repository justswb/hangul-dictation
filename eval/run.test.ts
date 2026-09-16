import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatTimestamp, parseQuestions, renderMarkdown, runEval, takeFirstN } from './run.ts';

describe('parseQuestions', () => {
  it('빈 줄을 건너뛰고 `>`로 시작하는 줄을 앞 질문에 이어붙인다', () => {
    const chains = parseQuestions('첫 질문\n> 후속 1\n> 후속 2\n\n두번째 질문\n');
    expect(chains).toEqual([
      [
        { text: '첫 질문', isFollowup: false },
        { text: '후속 1', isFollowup: true },
        { text: '후속 2', isFollowup: true },
      ],
      [{ text: '두번째 질문', isFollowup: false }],
    ]);
  });

  it('첫 줄이 `>`로 시작해도 새 다발로 취급한다(후속이 아님)', () => {
    const chains = parseQuestions('> 매달린 후속');
    expect(chains).toEqual([[{ text: '매달린 후속', isFollowup: false }]]);
  });
});

describe('takeFirstN', () => {
  it('다발 중간을 자르면 거기까지만 남긴다', () => {
    const chains = parseQuestions('a\n> b\n> c\nd\ne\n');
    expect(takeFirstN(chains, 2)).toEqual([[{ text: 'a', isFollowup: false }, { text: 'b', isFollowup: true }]]);
  });

  it('n이 전체 질문 수보다 크면 전부 남긴다', () => {
    const chains = parseQuestions('a\nb\n');
    expect(takeFirstN(chains, 10)).toEqual(chains);
  });
});

describe('formatTimestamp', () => {
  it('YYYYMMDD-HHmm 형식으로 포맷한다', () => {
    expect(formatTimestamp(new Date(2026, 8, 17, 9, 5))).toBe('20260917-0905');
  });
});

/** 질문별 고정 응답을 내는 가짜 dev-proxy. */
function startFakeProxy(scripts: Record<string, string[]>): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { question: string };
        const lines = scripts[body.question] ?? ['{"t":"done"}'];
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.end(lines.join('\n') + '\n');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('runEval', () => {
  let server: Server;
  let baseUrl: string;

  const Q1 = '첫 질문';
  const Q2 = '후속 질문';

  beforeAll(async () => {
    const scripts: Record<string, string[]> = {
      [Q1]: [
        JSON.stringify({
          t: 'text',
          v: '{"op":"plan","lines":2}\n{"op":"write","id":"a","text":"hello","size":"body"}\n{"op":"write","id":"b","text":"world","size":"body"}\n',
        }),
        JSON.stringify({ t: 'done' }),
      ],
      [Q2]: [
        JSON.stringify({ t: 'text', v: '{"op":"mark","target":"a","style":"circle"}\nnot-json-line\n' }),
        JSON.stringify({ t: 'done' }),
      ],
    };
    const started = await startFakeProxy(scripts);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterAll(() => {
    server.close();
  });

  it('가짜 프록시로 대화 하나를 실행해 지표를 기대값과 일치시킨다', async () => {
    const ticks = [0, 5, 20, 100, 105, 130];
    let i = 0;
    const now = (): number => ticks[i++] ?? 0;

    const chains = parseQuestions(`${Q1}\n> ${Q2}\n`);
    const report = await runEval({ provider: 'claude', baseUrl, chains, now, startedAt: new Date(2026, 8, 17, 9, 5) });

    expect(report.questions).toHaveLength(2);

    const [first, second] = report.questions;
    expect(first?.question).toBe(Q1);
    expect(first?.isFollowup).toBe(false);
    expect(first?.metrics.firstOpMs).toBe(5);
    expect(first?.metrics.firstLineIsPlan).toBe(true);
    expect(first?.metrics.planLines).toBe(2);
    expect(first?.metrics.actualLinesUsed).toBeCloseTo(2, 5);
    expect(first?.metrics.planLineError).toBeCloseTo(0, 5);
    expect(first?.metrics.validLines).toBe(3);
    expect(first?.metrics.totalLines).toBe(3);
    expect(first?.metrics.validRatio).toBe(1);
    expect(first?.metrics.referencedExistingId).toBeNull();

    expect(second?.question).toBe(Q2);
    expect(second?.isFollowup).toBe(true);
    expect(second?.metrics.firstOpMs).toBe(5);
    expect(second?.metrics.validLines).toBe(1);
    expect(second?.metrics.totalLines).toBe(2);
    expect(second?.metrics.validRatio).toBeCloseTo(0.5, 5);
    expect(second?.metrics.referencedExistingId).toBe(true);

    expect(report.summary.count).toBe(2);
    expect(report.summary.firstOpMsP50).toBe(5);
    expect(report.summary.followupCount).toBe(1);
    expect(report.summary.followupReferenceRatio).toBe(1);
    expect(report.summary.errorCounts).toEqual({});

    const md = renderMarkdown(report);
    expect(md).toContain('# 평가 결과: claude');
    expect(md).toContain(Q1);
    expect(md).toContain(Q2);
  });

  it('프록시가 error를 내면 errorKind로 집계한다', async () => {
    const errScripts: Record<string, string[]> = {
      [Q1]: [JSON.stringify({ t: 'error', kind: 'rate_limit' })],
    };
    const started = await startFakeProxy(errScripts);
    try {
      const chains = parseQuestions(Q1);
      const report = await runEval({ provider: 'openai', baseUrl: started.baseUrl, chains });
      expect(report.questions[0]?.metrics.errorKind).toBe('rate_limit');
      expect(report.summary.errorCounts).toEqual({ rate_limit: 1 });
    } finally {
      started.server.close();
    }
  });
});

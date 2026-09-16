/**
 * 개발 프록시 HTTP 서버 (T27, docs/dev-env.md 단계 ②; T28에서 provider 분기 추가).
 *
 * 브라우저(Vite 5173)가 이 프록시(8787)로 `/ask`를 호출하면, 요청의 `provider`
 * 값(`claude` | `openai`)에 맞는 제공자로 컨테이너 환경변수의 API 키를 통해
 * 실제 API를 대신 호출해 ndjson으로 중계한다. 키 값은 어디에도 로그·응답으로
 * 내보내지 않는다.
 *
 * 요청 구성(메시지 배열)은 `build-messages.ts`, 제공자별 스트리밍은
 * `providers/*.ts`, 텍스트 조각→이벤트 변환은 `stream.ts`로 분리했고,
 * 이 파일은 HTTP 배선과 provider 선택만 담당한다. 첫 텍스트 전 오류의 재시도는
 * `errors.ts`의 `withRetry`를 연결만 한다(T30).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ALLOWED_ORIGIN, PORT } from './config.ts';
import type { AskBody } from './build-messages.ts';
import { streamText as claudeStreamText } from './providers/claude.ts';
import { streamText as openaiStreamText } from './providers/openai.ts';
import type { StreamText } from './providers/types.ts';
import { toEvents } from './stream.ts';
import { withRetry } from './errors.ts';

const PROVIDERS: Record<string, StreamText> = {
  claude: claudeStreamText,
  openai: openaiStreamText,
};

function isTurn(value: unknown): value is AskBody['history'][number] {
  if (typeof value !== 'object' || value === null) return false;
  const { question, ops } = value as Record<string, unknown>;
  return typeof question === 'string' && Array.isArray(ops) && ops.every((op) => typeof op === 'string');
}

function isAskBody(value: unknown): value is AskBody {
  if (typeof value !== 'object' || value === null) return false;
  const { provider, question, history, pageSummary } = value as Record<string, unknown>;
  return (
    typeof provider === 'string' &&
    typeof question === 'string' &&
    typeof pageSummary === 'string' &&
    Array.isArray(history) &&
    history.every(isTurn)
  );
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleAsk(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readRequestBody(req));
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }

  if (!isAskBody(parsed)) {
    res.statusCode = 400;
    res.end();
    return;
  }

  const streamText = PROVIDERS[parsed.provider];
  if (!streamText) {
    res.statusCode = 400;
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  const chunks = withRetry(() => streamText(parsed, controller.signal), controller.signal);

  for await (const event of toEvents(chunks)) {
    res.write(`${JSON.stringify(event)}\n`);
  }
  res.end();
}

export function createProxyServer() {
  return createServer((req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/ask') {
      handleAsk(req, res).catch(() => {
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
      return;
    }

    res.statusCode = 404;
    res.end();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createProxyServer().listen(PORT);
}

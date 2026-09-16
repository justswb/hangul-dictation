/**
 * 개발 프록시 HTTP 서버 (T27, docs/dev-env.md 단계 ②).
 *
 * 브라우저(Vite 5173)가 이 프록시(8787)로 `/ask`를 호출하면, 컨테이너 환경변수
 * `ANTHROPIC_API_KEY`로 Anthropic API를 대신 호출해 ndjson으로 중계한다.
 * 키 값은 어디에도 로그·응답으로 내보내지 않는다.
 *
 * 요청 구성(메시지 배열)과 스트림→이벤트 변환은 순수 함수(`build-messages.ts`,
 * `stream.ts`)로 분리했고, 이 파일은 HTTP 배선만 담당한다.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { ALLOWED_ORIGIN, MAX_TOKENS, MODEL, PORT, SYSTEM_PROMPT_PATH, THINKING } from './config.ts';
import { buildMessages, type AskBody } from './build-messages.ts';
import { streamToEvents } from './stream.ts';

function readSystemPrompt(): string {
  try {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
  } catch {
    return '';
  }
}

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

async function handleAsk(req: IncomingMessage, res: ServerResponse, client: Anthropic): Promise<void> {
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

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: THINKING,
    system: readSystemPrompt(),
    messages: buildMessages(parsed),
  });

  for await (const event of streamToEvents(stream, controller.signal)) {
    res.write(`${JSON.stringify(event)}\n`);
  }
  res.end();
}

export function createProxyServer(client: Anthropic = new Anthropic()) {
  return createServer((req, res) => {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/ask') {
      handleAsk(req, res, client).catch(() => {
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

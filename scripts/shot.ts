// 페이지 스크린샷: node scripts/shot.ts <페이지경로> <출력.png>
// shot 컨테이너(Playwright 이미지)에서 실행한다. docs/agent-rules.md 3절 참고.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const [pagePath, out] = process.argv.slice(2);
if (!pagePath || !out) {
  console.error('사용법: npm run shot -- <페이지경로> <출력.png>');
  process.exit(2);
}

const PORT = 5174;
const server = await createServer({ server: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  // Git Bash가 "/..." 인자를 Windows 경로로 바꾸므로 앞의 "/" 없이 받는다.
  await page.goto(`http://127.0.0.1:${PORT}/${pagePath.replace(/^\/+/, '')}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`저장: ${out}`);
} finally {
  await browser.close();
  await server.close();
}

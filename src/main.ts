/**
 * 진입점 (T26). 셸·애니메이터·세션을 연결한다.
 *
 * - `?fixture=<이름>`이면 그 이름의 픽스처를 흘려보내는 FakeOpSource를 쓰고,
 *   데모 질문을 자동으로 보낸 뒤 판서가 끝나면 `window.__ready = true`로
 *   스크린샷 도구에 완료를 알린다.
 * - 쿼리가 없으면 기본 픽스처 `tcp`를 쓰되 자동 재생은 하지 않는다
 *   (M0에는 실제 AI 연결이 아직 없다).
 */
import { createSession, type Session } from './session.ts';
import { createFakeOpSource, fixtureLoader } from './sources/fake.ts';
import { createProxyOpSource } from './sources/proxy.ts';
import type { OpSource } from './contracts/op-source.ts';
import { createAnimator } from './render/animator.ts';
import { createScheduler } from './render/scheduler.ts';
import { createShell, type ShellState } from './ui/shell.ts';
import './ui/shell.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app 요소를 찾을 수 없다.');

const params = new URLSearchParams(window.location.search);
const fixture = params.get('fixture');
const autoPlay = fixture !== null;
const question = params.get('q') ?? 'TCP 3-way handshake를 설명해 줘';

// `?source=proxy&provider=claude`면 개발 프록시(dev-proxy)에 붙는 ProxyOpSource를 쓴다 (T27).
const source: OpSource =
  params.get('source') === 'proxy'
    ? createProxyOpSource({ baseUrl: 'http://localhost:8787', provider: params.get('provider') ?? 'claude' })
    : createFakeOpSource({ load: fixtureLoader(fixture ?? 'tcp') });

/** 제공자·키 입력 화면은 이후 티켓에서 붙인다. 그때까지의 안내 문구. */
const PROVIDER_NOTICE = '제공자 설정 화면은 아직 없습니다. 키를 확인해 주세요.';

let session: Session | null = null;
/** 지금 화면에 떠 있는 오류 문구 (없으면 null). */
let currentError: string | null = null;

function setError(msg: string | null): void {
  currentError = msg;
  shell.setError(msg);
}

/** 제공자 화면 대신 안내만 띄운다. 이미 오류 문구가 있으면 덮어쓰지 않는다. */
function showProviderNotice(): void {
  if (currentError !== null) return;
  setError(PROVIDER_NOTICE);
}

const shell = createShell(app, {
  onSend: (text) => session?.send(text),
  onStop: () => session?.stop(),
  onClear: () => session?.clear(),
  onProvider: () => showProviderNotice(),
});

// 기본 속도(900px/s)로는 픽스처 한 판을 그리는 데 스크린샷 도구의 15초 제한을
// 넘기므로, 데모·스크린샷용으로 빠르게 그린다.
const scheduler = createScheduler({ speed: 4000 });
const animator = createAnimator(shell.canvas, scheduler);

function handleState(state: ShellState): void {
  shell.setState(state);
  // 스크린샷 도구 규약: 자동 재생이 끝나 idle로 돌아오면 완료를 알린다.
  if (autoPlay && state === 'idle') window.__ready = true;
}

session = createSession({
  source,
  animator,
  shell: {
    setState: handleState,
    setError,
    onProvider: showProviderNotice,
  },
});

if (autoPlay) session.send(question);

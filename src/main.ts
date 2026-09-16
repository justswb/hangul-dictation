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

const source = createFakeOpSource({ load: fixtureLoader(fixture ?? 'tcp') });

let session: Session | null = null;

const shell = createShell(app, {
  onSend: (text) => session?.send(text),
  onStop: () => session?.stop(),
  onClear: () => session?.clear(),
  onProvider: () => shell.setError('제공자 설정 화면은 아직 없습니다.'),
});

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
    setError: (msg) => shell.setError(msg),
    onProvider: () => shell.setError('제공자 설정 화면은 아직 없습니다. 키를 확인해 주세요.'),
  },
});

if (autoPlay) session.send(question);

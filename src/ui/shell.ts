import { BOARD } from '../contracts/layout.ts';

/** 셸 상태: 대기 / 응답 생성 중(사고) / 응답 작성 중(판서). */
export type ShellState = 'idle' | 'thinking' | 'writing';

export type ShellHandlers = {
  onSend(text: string): void;
  onStop(): void;
  onClear(): void;
  onProvider(): void;
};

export type Shell = {
  canvas: HTMLCanvasElement;
  setState(state: ShellState): void;
  setError(msg: string | null): void;
};

const STATUS_TEXT: Record<Exclude<ShellState, 'idle'>, string> = {
  thinking: '생각 중…',
  writing: '쓰는 중…',
};

/** 화면 틀(입력 박스·버튼·상태 표시)을 root 안에 그린다. 세션 로직은 없음. */
export function createShell(root: HTMLElement, handlers: ShellHandlers): Shell {
  root.innerHTML = '';
  root.classList.add('shell');

  const toolbar = document.createElement('div');
  toolbar.className = 'shell__toolbar';

  const providerBtn = document.createElement('button');
  providerBtn.type = 'button';
  providerBtn.className = 'shell__btn shell__btn--provider';
  providerBtn.textContent = '⚙ 제공자';
  providerBtn.addEventListener('click', () => handlers.onProvider());

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'shell__btn shell__btn--clear';
  clearBtn.textContent = '지우기';
  clearBtn.addEventListener('click', () => handlers.onClear());

  toolbar.append(providerBtn, clearBtn);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'shell__canvasWrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'shell__canvas';
  canvas.width = BOARD.w;
  canvas.height = BOARD.h;

  canvasWrap.append(canvas);

  const inputRow = document.createElement('div');
  inputRow.className = 'shell__inputRow';

  const input = document.createElement('textarea');
  input.className = 'shell__input';
  input.placeholder = '질문을 입력하세요…';
  input.rows = 1;

  const sendStopBtn = document.createElement('button');
  sendStopBtn.type = 'button';
  sendStopBtn.className = 'shell__btn shell__btn--send';
  sendStopBtn.textContent = '전송';

  inputRow.append(input, sendStopBtn);

  const statusEl = document.createElement('div');
  statusEl.className = 'shell__status';

  const errorEl = document.createElement('div');
  errorEl.className = 'shell__error';
  errorEl.hidden = true;

  root.append(toolbar, canvasWrap, inputRow, statusEl, errorEl);

  let state: ShellState = 'idle';

  function trySend(): void {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handlers.onSend(text);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    trySend();
  });

  sendStopBtn.addEventListener('click', () => {
    if (state === 'idle') {
      trySend();
    } else {
      handlers.onStop();
    }
  });

  function setState(next: ShellState): void {
    state = next;
    if (next === 'idle') {
      input.disabled = false;
      sendStopBtn.textContent = '전송';
      statusEl.textContent = '';
    } else {
      input.disabled = true;
      sendStopBtn.textContent = '중단';
      statusEl.textContent = STATUS_TEXT[next];
    }
  }

  function setError(msg: string | null): void {
    errorEl.hidden = msg === null;
    errorEl.textContent = msg ?? '';
  }

  setState('idle');
  setError(null);

  return { canvas, setState, setError };
}

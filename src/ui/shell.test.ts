// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createShell, type ShellHandlers } from './shell.ts';
import { BOARD } from '../contracts/layout.ts';

function setup() {
  const root = document.createElement('div');
  document.body.append(root);

  const handlers: ShellHandlers = {
    onSend: vi.fn(),
    onStop: vi.fn(),
    onClear: vi.fn(),
    onProvider: vi.fn(),
  };

  const shell = createShell(root, handlers);

  const input = root.querySelector('.shell__input') as HTMLTextAreaElement;
  const sendStopBtn = root.querySelector('.shell__btn--send') as HTMLButtonElement;
  const providerBtn = root.querySelector('.shell__btn--provider') as HTMLButtonElement;
  const clearBtn = root.querySelector('.shell__btn--clear') as HTMLButtonElement;
  const statusEl = root.querySelector('.shell__status') as HTMLElement;
  const errorEl = root.querySelector('.shell__error') as HTMLElement;

  return { root, handlers, shell, input, sendStopBtn, providerBtn, clearBtn, statusEl, errorEl };
}

function pressEnter(input: HTMLTextAreaElement, shiftKey = false): void {
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true, cancelable: true }),
  );
}

describe('createShell', () => {
  it('캔버스를 BOARD 논리 크기로 만든다', () => {
    const { shell } = setup();
    expect(shell.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(shell.canvas.width).toBe(BOARD.w);
    expect(shell.canvas.height).toBe(BOARD.h);
  });

  it('Enter로 전송하고 입력을 비운다', () => {
    const { handlers, input } = setup();
    input.value = '질문';
    pressEnter(input);
    expect(handlers.onSend).toHaveBeenCalledWith('질문');
    expect(handlers.onSend).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('앞뒤 공백은 trim 후 전달한다', () => {
    const { handlers, input } = setup();
    input.value = '  질문  ';
    pressEnter(input);
    expect(handlers.onSend).toHaveBeenCalledWith('질문');
  });

  it('Shift+Enter는 전송하지 않는다', () => {
    const { handlers, input } = setup();
    input.value = '질문';
    pressEnter(input, true);
    expect(handlers.onSend).not.toHaveBeenCalled();
  });

  it('공백만 입력 후 Enter는 무시한다', () => {
    const { handlers, input } = setup();
    input.value = '   ';
    pressEnter(input);
    expect(handlers.onSend).not.toHaveBeenCalled();
    expect(input.value).toBe('   ');
  });

  it('idle 상태에서 전송 버튼 클릭은 onSend를 호출한다', () => {
    const { handlers, input, sendStopBtn } = setup();
    input.value = '질문';
    sendStopBtn.click();
    expect(handlers.onSend).toHaveBeenCalledWith('질문');
  });

  it("setState('thinking')은 입력을 비활성화하고 버튼을 중단으로 바꾼다", () => {
    const { shell, input, sendStopBtn, statusEl } = setup();
    shell.setState('thinking');
    expect(input.disabled).toBe(true);
    expect(sendStopBtn.textContent).toBe('중단');
    expect(statusEl.textContent).toBe('생각 중…');
  });

  it("setState('writing')에서 버튼 클릭 시 onStop을 호출하고 onSend는 호출하지 않는다", () => {
    const { handlers, shell, input, sendStopBtn, statusEl } = setup();
    input.value = '무시될 텍스트';
    shell.setState('writing');
    expect(input.disabled).toBe(true);
    expect(statusEl.textContent).toBe('쓰는 중…');
    sendStopBtn.click();
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
    expect(handlers.onSend).not.toHaveBeenCalled();
  });

  it("setState('idle')로 돌아오면 입력이 다시 활성화된다", () => {
    const { shell, input, sendStopBtn, statusEl } = setup();
    shell.setState('writing');
    shell.setState('idle');
    expect(input.disabled).toBe(false);
    expect(sendStopBtn.textContent).toBe('전송');
    expect(statusEl.textContent).toBe('');
  });

  it('setError(msg)로 오류 문구를 보여주고 null로 숨긴다', () => {
    const { shell, errorEl } = setup();
    expect(errorEl.hidden).toBe(true);
    shell.setError('오류가 발생했어요');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('오류가 발생했어요');
    shell.setError(null);
    expect(errorEl.hidden).toBe(true);
  });

  it('제공자 버튼과 지우기 버튼이 각각의 핸들러를 호출한다', () => {
    const { handlers, providerBtn, clearBtn } = setup();
    providerBtn.click();
    expect(handlers.onProvider).toHaveBeenCalledTimes(1);
    clearBtn.click();
    expect(handlers.onClear).toHaveBeenCalledTimes(1);
  });
});

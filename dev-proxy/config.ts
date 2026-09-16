/**
 * 프록시 요청 설정 한곳에 모음 (T27). 모델 파라미터 튜닝은 T32에서 다시 다룬다.
 */
import { fileURLToPath } from 'node:url';
import type { ThinkingConfigParam } from '@anthropic-ai/sdk/resources';

/** 사용할 모델. */
export const MODEL = 'claude-opus-5';

/** claude-opus-5의 기본 동작(적응형 사고)을 명시적으로 켜 둔다. */
export const THINKING: ThinkingConfigParam = { type: 'adaptive' };

/** 응답 최대 토큰 수. */
export const MAX_TOKENS = 4096;

/** 시스템 프롬프트 파일 경로. 없으면 빈 문자열을 쓴다. */
export const SYSTEM_PROMPT_PATH = fileURLToPath(new URL('../prompts/system.md', import.meta.url));

/** 프록시가 듣는 포트. */
export const PORT = 8787;

/** 개발용 CORS 허용 출처 (Vite 개발 서버). */
export const ALLOWED_ORIGIN = 'http://localhost:5173';

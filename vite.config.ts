import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  test: {
    // DOM이 필요한 테스트는 파일 상단에 `// @vitest-environment happy-dom`
    environment: 'node',
    passWithNoTests: true,
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src-tauri'],
  },
});

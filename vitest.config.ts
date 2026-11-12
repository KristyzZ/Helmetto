import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['ai/test/**/*.test.ts', 'api/test/**/*.test.ts'] },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
    env: { VERCEL: '1', OPENAI_API_KEY: 'test-only-not-a-secret' },
  },
});

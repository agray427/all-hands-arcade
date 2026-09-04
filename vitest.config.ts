import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against package *source*, not built dist, so the red/green loop
// never waits on `turbo run build`.
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@arcade/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@arcade/cipher': fileURLToPath(new URL('./packages/games/cipher/src/index.ts', import.meta.url)),
    },
  },
});

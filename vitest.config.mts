import { defineConfig } from 'vitest/config';
import path from 'node:path';

process.env.TZ = 'America/Los_Angeles';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

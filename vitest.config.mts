import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'tools/**', 'out/**', 'dist/**', 'analysis/**'],
    environment: 'node',
    reporters: ['default']
  }
});

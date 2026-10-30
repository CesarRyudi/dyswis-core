/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  resolve: {
    alias: {
      '@dyswis/shared-types': resolve(import.meta.dirname, '../../libs/shared-types/src/index.ts'),
    },
  },
  test: {
    name: 'api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
}));

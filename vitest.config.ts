import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // .claude/worktrees/* are agent worktrees whose stale tests resolve `@` to THIS src — exclude.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
});

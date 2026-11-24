import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client is always served as a production build by server/index.ts, so the
// tests exercise the same bundle a user would get (no dev-mode double renders).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});

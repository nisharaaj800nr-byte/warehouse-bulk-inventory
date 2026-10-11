import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two ways to build:
//   npm run build      -> dist/             (static hosting, fetch mode)
//   npm run build:gas  -> dist-gas/App.html (single file for Apps Script HtmlService)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
  server: { port: 5173, open: false },
  preview: { port: 4173, strictPort: true },
});

// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { defineConfig } from 'vite';

// GitHub Pages serves the game from /<repo-name>/. The deploy workflow passes
// that path in VITE_BASE; local dev and preview use the root.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});

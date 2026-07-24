import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 5278 = this project's reserved slot in the workspace-wide port map
    // (see scripts/launchers/projects.json). strictPort so a collision fails
    // loudly instead of sliding onto a port the desktop launcher won't open.
    port: 5278,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/healthz': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
});

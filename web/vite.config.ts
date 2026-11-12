import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = process.env.PORT || 3000;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a phone on the same WiFi
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true } },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Never inherit process.env.PORT — the API uses 5174. If Vite can't get
    // 5173 it used to silently steal 5174, proxy /api to itself, and balloon RAM.
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:5174',
    },
  },
});

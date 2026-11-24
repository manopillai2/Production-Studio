import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server (http://localhost:5173) forwards API and media requests to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5175',
      '/media': 'http://localhost:5175',
    },
  },
});

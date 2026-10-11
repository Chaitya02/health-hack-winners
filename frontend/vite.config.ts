/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Where the dev server forwards /api and /ws (the backend container in docker compose).
const backend = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
    // One address for page + API, so a tunnel to :5173 is all a tablet needs.
    proxy: { '/api': backend, '/ws': { target: backend, ws: true } },
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})

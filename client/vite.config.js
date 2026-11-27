import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local development: the frontend calls relative /api/... paths, and
    // Vite forwards them to the backend (node server.js on port 5000).
    // In production the backend serves the frontend itself, so the same
    // relative paths work without this proxy.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})

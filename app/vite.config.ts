import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'highlight.js/lib/core',
      'highlight.js/lib/languages/bash',
      'highlight.js/lib/languages/css',
      'highlight.js/lib/languages/javascript',
      'highlight.js/lib/languages/json',
      'highlight.js/lib/languages/markdown',
      'highlight.js/lib/languages/python',
      'highlight.js/lib/languages/typescript',
      'highlight.js/lib/languages/xml',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})

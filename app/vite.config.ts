import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Identifies this project's dev server so the Electron launch script can
// tell it apart from an unrelated dev server that happens to already be
// listening on the same port (see scripts/wait-for-felixo-vite.cjs).
const FELIXO_DEV_MARKER = 'felixo-ai-core'

function felixoDevMarkerPlugin(): Plugin {
  return {
    name: 'felixo-dev-marker',
    configureServer(server) {
      server.middlewares.use('/__felixo_dev_marker', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain')
        res.end(FELIXO_DEV_MARKER)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // O app empacotado carrega o renderer com `loadFile()`, isto é, por
  // file://. Sem isto o Vite emite os assets como "/assets/…", que sob
  // file:// resolve para a raiz do disco: o bundle não carrega e a janela
  // abre em branco. O caminho relativo funciona nos dois casos, porque em
  // dev o Vite serve a partir da raiz do próprio servidor.
  base: './',
  plugins: [react(), felixoDevMarkerPlugin()],
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

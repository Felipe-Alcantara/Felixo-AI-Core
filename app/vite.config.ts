import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { injectRendererCsp, verifyRendererCsp } from './scripts/renderer-csp.cjs'

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

/**
 * CSP do renderer, só no build: a política e os hashes vêm de
 * `scripts/renderer-csp.cjs`, calculados sobre o HTML final.
 *
 * O dev server fica SEM CSP de propósito. Ele serve por http://127.0.0.1:5173
 * (não por file://), injeta scripts inline próprios (o preâmbulo do React
 * Refresh e o cliente do HMR), cujo conteúdo não passa por este hook, e fala
 * com o navegador por um WebSocket de HMR. A política de produção quebraria o
 * dev, e uma política afrouxada para caber nele não provaria nada sobre o que
 * vai no instalador. Quem valida a CSP é o renderer do build.
 */
function felixoRendererCspPlugin(): Plugin {
  return {
    name: 'felixo-renderer-csp',
    apply: 'build',
    // 'post' nos dois sentidos: o hook de HTML roda depois de o Vite injetar
    // as tags dos chunks, e o generateBundle roda depois do plugin interno
    // que grava o index.html no bundle.
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => injectRendererCsp(html),
    },
    generateBundle(_options, bundle) {
      // O Vite ainda troca placeholders de asset no HTML depois dos hooks de
      // transformIndexHtml. Conferir o arquivo que vai para o disco garante
      // que o hash foi calculado sobre o texto que o navegador vai ler.
      const pages = Object.values(bundle).filter(
        (output) => output.type === 'asset' && output.fileName.endsWith('.html'),
      )
      if (pages.length === 0) {
        this.error('[renderer-csp] nenhum HTML no bundle: a CSP não teria sido conferida.')
      }
      for (const page of pages) {
        if (page.type !== 'asset') continue
        const problems = verifyRendererCsp(String(page.source))
        if (problems.length > 0) {
          this.error(`[renderer-csp] ${page.fileName}: ${problems.join('; ')}`)
        }
      }
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
  // Tailwind 4 pelo plugin dedicado do Vite (recomendação do guia oficial de
  // upgrade no lugar do plugin PostCSS); a configuração vive em src/index.css.
  plugins: [react(), tailwindcss(), felixoDevMarkerPlugin(), felixoRendererCspPlugin()],
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

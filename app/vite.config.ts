import fs from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { injectRendererCsp, verifyRendererCsp } from './scripts/renderer-csp.cjs'
import { listExcalidrawFonts, resolveDevFontRequest, stripExcalidrawCdnFallback } from './scripts/excalidraw-fonts.cjs'
import { removeStaleOutput } from './scripts/build-output.cjs'

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
      // Diz de qual pasta app/ este Vite serve: o `felixo devtools` só reaproveita o da própria worktree.
      server.middlewares.use('/__felixo_dev_root', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain')
        res.end(server.config.root)
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

/**
 * Fontes do Excalidraw pelo próprio app (`scripts/excalidraw-fonts.cjs`): o
 * build emite em `excalidraw-assets/fonts/` e o dev server serve a mesma URL
 * direto do `node_modules`. O renderer aponta o Excalidraw para lá
 * (`src/excalidraw-asset-path.ts`), e a CSP fica sem host remoto.
 *
 * No build, o código do Excalidraw também perde a URL do CDN que ele põe no
 * fim da lista de cada fonte (`stripExcalidrawCdnFallback`). Em dev não há
 * CSP, e a URL local, que vem primeiro, é a que carrega.
 */
function felixoExcalidrawFontsPlugin(): Plugin[] {
  let cdnFallbackRemoved = 0
  return [
    {
      name: 'felixo-excalidraw-fonts-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const file = resolveDevFontRequest(req.url)
          if (!file || !fs.existsSync(file)) {
            next()
            return
          }
          res.setHeader('Content-Type', 'font/woff2')
          fs.createReadStream(file).pipe(res)
        })
      },
    },
    {
      name: 'felixo-excalidraw-fonts',
      apply: 'build',
      transform(code, id) {
        if (!id.includes('@excalidraw/excalidraw') || !code.includes('ASSETS_FALLBACK_URL')) return null
        const stripped = stripExcalidrawCdnFallback(code)
        cdnFallbackRemoved += stripped.removed
        return { code: stripped.code, map: null }
      },
      generateBundle() {
        // Exatamente uma: zero é uma versão do Excalidraw que mudou o trecho
        // (o CDN voltaria em silêncio); mais de uma, um padrão largo demais.
        if (cdnFallbackRemoved !== 1) {
          this.error(
            `[excalidraw-fonts] a URL do CDN saiu ${cdnFallbackRemoved} vez(es) do Excalidraw, esperava 1: revise stripExcalidrawCdnFallback.`,
          )
        }
        const fonts = listExcalidrawFonts()
        if (fonts.length === 0) {
          this.error('[excalidraw-fonts] nenhuma fonte do Excalidraw encontrada: o desenho ficaria sem fonte.')
        }
        for (const font of fonts) {
          this.emitFile({ type: 'asset', fileName: font.fileName, source: fs.readFileSync(font.absolutePath) })
        }
      },
    },
  ]
}

/**
 * `dist` só com o que este build gravou (`scripts/build-output.cjs`).
 *
 * O `emptyOutDir` do Vite apaga com `fs.rmSync`, que no Node 25 volta sem erro
 * e não apaga nada num caminho com acento ("Programação\…"): os chunks de todo
 * build anterior ficavam em `dist/assets` e iam para o pacote local (9194
 * arquivos medidos). Depois de gravar, este passo tira o que não é do bundle
 * nem da `public`, pela lista exata do bundle; se algo resistir, o build falha.
 */
function felixoCleanBuildOutputPlugin(): Plugin {
  let publicDir = ''
  return {
    name: 'felixo-clean-build-output',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
    },
    writeBundle(options, bundle) {
      if (!options.dir) return
      const removidos = removeStaleOutput({ outDir: options.dir, emitted: Object.keys(bundle), publicDir })
      if (removidos.length > 0) {
        this.info(`[build-output] ${removidos.length} arquivo(s) de builds anteriores removido(s) do dist.`)
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
  plugins: [
    react(),
    tailwindcss(),
    felixoDevMarkerPlugin(),
    felixoExcalidrawFontsPlugin(),
    felixoRendererCspPlugin(),
    felixoCleanBuildOutputPlugin(),
  ],
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
    // FELIXO_VITE_PORT: o `felixo devtools` dá a cada worktree a sua porta; sem ele, 5173 como sempre.
    port: Number(process.env.FELIXO_VITE_PORT) || 5173,
    strictPort: true,
  },
})

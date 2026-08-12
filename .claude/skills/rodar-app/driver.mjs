// REPL para abrir e dirigir o Felixo AI Core (Electron) sem uma pessoa na frente
// da tela. Feito para agentes: rode sob xvfb dentro do tmux, mande comandos com
// send-keys e leia com capture-pane (ou use o `d.sh` ao lado).
//
// Cada comando imprime sua saida e termina com `--done--`, que e o sinal que o
// `d.sh` espera para saber que a resposta chegou inteira.
import { createRequire } from 'node:module'
import * as readline from 'node:readline'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** Raiz do app Electron (`app/`), tres pastas acima de `.claude/skills/rodar-app/`. */
const APP_DIR = path.resolve(import.meta.dirname, '../../../app')

/**
 * O `playwright-core` mora em `app/node_modules`, fora da cadeia de resolucao
 * deste arquivo — um `import` normal nao o acharia. Resolver a partir do
 * `package.json` do app e o que permite instala-lo onde ja existe um
 * `node_modules`, em vez de criar mais um dentro da skill.
 */
const requireFromApp = createRequire(path.join(APP_DIR, 'package.json'))
const { _electron: electron } = requireFromApp('playwright-core')
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots'
/**
 * userData isolado: o app guarda canvas, agentes e configuracoes reais em
 * `~/.config/felixo-ai-core`. Abrir o app de teste em cima disso apagaria ou
 * bagunçaria o trabalho de quem estiver usando a maquina.
 */
const USER_DATA = process.env.FELIXO_TEST_USERDATA || '/tmp/felixo-test-userdata'

fs.mkdirSync(SHOT_DIR, { recursive: true })

let app = null
let page = null

const electronBin =
  process.platform === 'darwin'
    ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(APP_DIR, 'node_modules/electron/dist/electron')

function requirePage() {
  if (!page) {
    throw new Error('lance o app primeiro: launch')
  }
  return page
}

const COMMANDS = {
  async launch() {
    if (app) return console.log('ja lancado')
    app = await electron.launch({
      executablePath: electronBin,
      args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${USER_DATA}`, APP_DIR],
      cwd: APP_DIR,
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
      timeout: 60_000,
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    // O canvas monta em varias etapas e nao emite sinal de "pronto".
    await new Promise((r) => setTimeout(r, 6_000))
    page = app.windows().find((w) => !w.url().startsWith('devtools://')) ?? page
    console.log('lancado. userData:', USER_DATA)
    for (const w of app.windows()) console.log(' ', w.url())
  },

  async ss(name) {
    const file = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png')
    await requirePage().screenshot({ path: file })
    console.log('screenshot:', file)
  },

  /**
   * Clique pelo DOM, nao por coordenada: o canvas transforma (zoom/pan) os
   * blocos, entao a coordenada que o Playwright calcula erra o alvo.
   */
  async click(selector) {
    console.log(
      'click',
      selector,
      '->',
      await requirePage().evaluate((s) => {
        const el = document.querySelector(s)
        if (!el) return 'NAO_ENCONTRADO'
        el.click()
        return 'OK'
      }, selector),
    )
  },

  /** Clica por texto visivel ou por `aria-label` — a barra do canvas usa os dois. */
  async 'click-text'(text) {
    console.log(
      'click-text',
      JSON.stringify(text),
      '->',
      await requirePage().evaluate((t) => {
        const els = [...document.querySelectorAll('button, a, [role="button"]')]
        const matches = (el) =>
          (el.getAttribute('aria-label') || '').includes(t) ||
          (el.textContent || '').trim() === t ||
          (el.textContent || '').includes(t)
        const el = els.find(matches)
        if (!el) return 'NAO_ENCONTRADO'
        el.click()
        return 'OK: ' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50)
      }, text),
    )
  },

  /** Lista os botoes com indice e rotulo, para descobrir o que da para clicar. */
  async buttons() {
    console.log(
      await requirePage().evaluate(() =>
        [...document.querySelectorAll('button, [role="button"]')]
          .map((e, i) => `${i}: ${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 60)}`)
          .join('\n'),
      ),
    )
  },

  /**
   * Abre a gaveta do primeiro terminal do canvas.
   *
   * Necessario antes de qualquer coisa com o xterm: no card recolhido o canvas
   * mostra so um preview em texto, e o elemento `.xterm` nao existe no DOM. Ele
   * so e montado (`TerminalSessionStore.attach`) quando a gaveta abre.
   */
  async expand() {
    console.log(
      await requirePage().evaluate(() => {
        const el = [...document.querySelectorAll('button')].find((b) =>
          (b.getAttribute('aria-label') || '').startsWith('Expandir terminal'),
        )
        if (!el) return 'NAO_ENCONTRADO: nenhum terminal no canvas?'
        el.click()
        return 'OK'
      }),
    )
    await new Promise((r) => setTimeout(r, 3_000))
    console.log(
      'xterm montado:',
      await requirePage().evaluate(() => document.querySelectorAll('.xterm').length),
    )
  },

  /** Poe o foco na entrada do terminal, para `type` e `press` chegarem na CLI. */
  async 'focus-terminal'() {
    console.log(
      await requirePage().evaluate(() => {
        const ta = document.querySelector('.xterm-helper-textarea')
        if (!ta) return 'NAO_ENCONTRADO: expanda o terminal primeiro'
        ta.focus()
        return 'OK'
      }),
    )
  },

  async type(text) { await requirePage().keyboard.type(text, { delay: 20 }) },
  async press(key) { await requirePage().keyboard.press(key) },

  /**
   * Dispara um `paste` de verdade no elemento do xterm.
   *
   * `kind` diz o que vai dentro do evento:
   * - `image` — um PNG gerado na hora, como quando se copia uma imagem;
   * - `text <conteudo>` — texto comum, que deve seguir pelo caminho do xterm;
   * - `empty` — evento sem nada, que e o que o Chromium entrega a pagina quando
   *   a ferramenta de captura publica um formato que o renderer nao enxerga
   *   (o caso do Linux Mint). Ai quem resolve e a leitura nativa do clipboard.
   *
   * Imprime `defaultPrevented`, que e como se sabe quem ficou com o evento:
   * `true` = o interceptador de imagem, `false` = o paste de texto do xterm.
   */
  async paste(args) {
    const [kind, ...rest] = args.split(/\s+/)
    const payload = rest.join(' ')
    console.log(
      JSON.stringify(
        await requirePage().evaluate(
          async ({ kind, payload }) => {
            const el = document.querySelector('.xterm')
            if (!el) return { erro: 'expanda o terminal primeiro' }

            const dt = new DataTransfer()
            if (kind === 'text') {
              dt.setData('text/plain', payload || 'texto de teste')
            } else if (kind === 'image') {
              const canvas = document.createElement('canvas')
              canvas.width = 8
              canvas.height = 8
              const ctx = canvas.getContext('2d')
              ctx.fillStyle = payload || 'red'
              ctx.fillRect(0, 0, 8, 8)
              const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
              dt.items.add(new File([blob], 'captura.png', { type: 'image/png' }))
            }

            const event = new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            })
            el.dispatchEvent(event)
            return {
              itens: dt.items.length,
              texto: dt.getData('text/plain'),
              defaultPrevented: event.defaultPrevented,
            }
          },
          { kind, payload },
        ),
      ),
    )
  },

  /**
   * Poe um PNG de 8x8 no clipboard **do sistema operacional**, pelo processo
   * principal. E assim que se testa a leitura nativa sem depender de xclip nem
   * de uma pessoa apertando "copiar" em algum outro programa.
   */
  async 'clipboard-image'(color) {
    const rgb = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255] }[color || 'red']
    if (!rgb) return console.log('cores: red, green, blue')
    console.log(
      JSON.stringify(
        await app.evaluate(({ clipboard, nativeImage }, [r, g, b]) => {
          // Bitmap cru em BGRA, que e o que createFromBitmap espera.
          const buffer = Buffer.alloc(8 * 8 * 4)
          for (let i = 0; i < 8 * 8; i += 1) {
            buffer[i * 4] = b
            buffer[i * 4 + 1] = g
            buffer[i * 4 + 2] = r
            buffer[i * 4 + 3] = 255
          }
          clipboard.writeImage(nativeImage.createFromBitmap(buffer, { width: 8, height: 8 }))
          return { vazio: clipboard.readImage().isEmpty(), tamanho: clipboard.readImage().getSize() }
        }, rgb),
      ),
    )
  },

  /**
   * Simula "copiar" um arquivo no gerenciador de arquivos do GNOME
   * (Nemo/Nautilus), que publica a lista como bytes e prefixada pela operacao.
   */
  async 'clipboard-file'(filePath) {
    if (!filePath) return console.log('uso: clipboard-file /caminho/para/imagem.png')
    console.log(
      JSON.stringify(
        await app.evaluate(({ clipboard }, p) => {
          clipboard.clear()
          const href = 'file://' + encodeURI(p)
          clipboard.writeBuffer('x-special/gnome-copied-files', Buffer.from('copy\n' + href, 'utf8'))
          return { href, bitmapVazio: clipboard.readImage().isEmpty() }
        }, filePath),
      ),
    )
  },

  async 'clipboard-clear'() {
    console.log(JSON.stringify(await app.evaluate(({ clipboard }) => {
      clipboard.clear()
      return { bitmapVazio: clipboard.readImage().isEmpty(), texto: clipboard.readText() }
    })))
  },

  /** Avalia no renderer. Uma expressao; funcao seta e chamada sem argumento. */
  async eval(expr) {
    try { console.log(JSON.stringify(await requirePage().evaluate(expr))) }
    catch (error) { console.log('ERRO:', error.message) }
  },

  /**
   * Avalia no **processo principal**. Recebe o modulo `electron` como argumento
   * — use `(e) => e.clipboard...`. Nao ha `require` aqui.
   */
  async main(expr) {
    try { console.log(JSON.stringify(await app.evaluate(new Function('e', `return (${expr})(e)`)))) }
    catch (error) { console.log('ERRO:', error.message) }
  },

  async text(selector) {
    console.log(
      await requirePage().evaluate(
        (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(nulo)',
        selector || null,
      ),
    )
  },

  async windows() {
    for (const w of app.windows()) console.log(' ', w.url())
  },

  async quit() {
    if (app) await app.close().catch(() => {})
    app = null
    page = null
    console.log('encerrado')
  },

  help() { console.log('comandos:', Object.keys(COMMANDS).join(', ')) },
}

// O Electron rouba o stdin do processo; ler pelo fd cru protege o REPL.
const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') })
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' })

rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return rl.prompt()

  const separator = trimmed.indexOf(' ')
  const name = separator === -1 ? trimmed : trimmed.slice(0, separator)
  const args = separator === -1 ? '' : trimmed.slice(separator + 1)
  const command = COMMANDS[name]

  if (!command) {
    console.log('desconhecido:', name, '- tente: help')
    console.log('--done--')
    return rl.prompt()
  }

  try { await command(args) } catch (error) { console.log('ERRO:', error.message) }
  console.log('--done--')

  if (name === 'quit') { rl.close(); process.exit(0) }
  rl.prompt()
})

rl.on('close', async () => { await COMMANDS.quit(); process.exit(0) })

console.log('driver do Felixo AI Core - "help" para comandos, "launch" para abrir')
rl.prompt()

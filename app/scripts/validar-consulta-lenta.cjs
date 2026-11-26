/**
 * App empacotado, perfil isolado, apontado para um registry local que não responde
 * à primeira consulta de cada CLI. Esperado: a segunda consulta traz a versão e a
 * rodada não cai no manifesto de reserva. Encerra assim que o log mostra o
 * resultado (antes das instalações).
 *
 * Uso: node scripts/validar-consulta-lenta.cjs <executavel>   (Linux: sob xvfb-run)
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const { spawn, execFileSync } = require('node:child_process')

const EXE = process.argv[2]
if (!EXE) {
  console.error('Uso: node scripts/validar-consulta-lenta.cjs <executavel>')
  process.exit(2)
}
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-consulta-lenta-'))
const userData = path.join(raiz, 'perfil')
const PACOTES = new Set(['/@anthropic-ai/claude-code', '/@openai/codex', '/@google/gemini-cli'])
const presos = new Set()
const inicio = Date.now()
const agora = () => `${((Date.now() - inicio) / 1000).toFixed(1).padStart(6)} s`

const proxy = http.createServer((pedido, resposta) => {
  const caminho = decodeURIComponent(pedido.url.split('?')[0])
  if (PACOTES.has(caminho) && !presos.has(caminho)) {
    presos.add(caminho)
    console.log(`${agora()}  registry: sem resposta para a 1ª consulta de ${caminho}`)
    return
  }
  if (PACOTES.has(caminho)) console.log(`${agora()}  registry: repassada ${caminho}`)
  const headers = { ...pedido.headers, host: 'registry.npmjs.org' }
  const saida = https.request({ host: 'registry.npmjs.org', path: pedido.url, method: pedido.method, headers }, (origem) => {
    resposta.writeHead(origem.statusCode, origem.headers)
    origem.pipe(resposta)
  })
  saida.on('error', () => resposta.destroy())
  pedido.pipe(saida)
})

const eventos = () => {
  const pasta = path.join(userData, 'logs', 'qa')
  if (!fs.existsSync(pasta)) return []
  return fs.readdirSync(pasta)
    .flatMap((nome) => fs.readFileSync(path.join(pasta, nome), 'utf8').split('\n'))
    .flatMap((linha) => { try { return [JSON.parse(linha)] } catch { return [] } })
    .filter((evento) => evento.scope === 'cli:auto-install')
}

proxy.listen(0, '127.0.0.1', () => {
  const env = {
    ...process.env,
    FELIXO_USER_DATA_DIR: userData,
    FELIXO_DEVTOOLS_HEADLESS: '1',
    npm_config_registry: `http://127.0.0.1:${proxy.address().port}/`,
    npm_config_cache: path.join(raiz, 'cache'),
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  // Sem GitHub: a instância não baixa atualização do app.
  const args = ['--host-resolver-rules=MAP github.com 0.0.0.0, MAP api.github.com 0.0.0.0, MAP objects.githubusercontent.com 0.0.0.0']
  if (process.platform === 'linux') args.push('--no-sandbox')
  const app = spawn(EXE, args, { env, stdio: 'ignore', detached: process.platform !== 'win32' })

  const encerrar = (codigo) => {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
      else process.kill(-app.pid, 'SIGKILL')
    } catch { /* já saiu */ }
    for (const e of eventos()) console.log(`  log ${e.createdAt.slice(11, 19)} ${e.level} ${e.message} | ${e.details?.id ?? ''} ${e.details?.durationMs ?? ''}`)
    console.log('pasta da execução:', raiz)
    process.exit(codigo)
  }
  const vigia = setInterval(() => {
    const lidos = eventos()
    const segundas = new Set(lidos.filter((e) => e.message.startsWith('Registry respondeu so na segunda')).map((e) => e.details.id))
    const quedas = lidos.filter((e) => e.message.startsWith('Registry indisponivel'))
    if (segundas.size === PACOTES.size || quedas.length > 0 || Date.now() - inicio > 200_000) {
      clearInterval(vigia)
      const ok = segundas.size === PACOTES.size && quedas.length === 0
      console.log(`${agora()}  ${ok ? 'APROVADO' : 'REPROVADO'}: segunda consulta em ${segundas.size}/${PACOTES.size}, quedas no manifesto ${quedas.length}`)
      encerrar(ok ? 0 : 1)
    }
  }, 500)
})

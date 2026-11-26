'use strict'
/**
 * Valida o ditado por voz no Windows numa instância isolada do app (userData
 * temporário, `felixo devtools`, janela invisível). Irmão do
 * validar-ditado-linux.cjs.
 *
 *   fase `simulada`: o "microfone" é um arquivo WAV entregue ao Chromium
 *     (--use-file-for-fake-audio-capture). Prova atalho → texto na linha do
 *     cmd sem Enter, indicadores, cópia sem terminal, erros, webm/opus e chave
 *     cifrada. Não passa pelo microfone do Windows.
 *   fase `sistema`: dispositivo de captura padrão do Windows. Mede no Core
 *     Audio (e fotografa o canto da bandeja) se o microfone é liberado ao
 *     cancelar, parar e fechar, e a mensagem com o acesso de apps de desktop
 *     desligado nas Configurações (a chave é religada no fim). O endereço de
 *     transcrição fica desligado: nada do que o microfone ouvir é transcrito.
 *
 * Preparo: python scripts/servidor-transcricao-local.py --registro transcricoes.jsonl
 * Uso: node scripts/validar-ditado-windows.cjs <saida> <fala.wav> [simulada|sistema]
 */
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const APP = path.resolve(__dirname, '..')
const [OUT, FALA, FASE = 'simulada'] = process.argv.slice(2)
if (process.platform !== 'win32' || !OUT || !FALA) {
  console.error('Uso (só no Windows): node scripts/validar-ditado-windows.cjs <saida> <fala.wav> [simulada|sistema]')
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })
const { connect, readState, executarDevtools } = require(path.join(APP, 'electron/cli/felixo-devtools.cjs'))
const ELECTRON = require(path.join(APP, 'node_modules/electron'))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evidencia = { fase: FASE, inicio: new Date().toISOString(), itens: {} }
const registrar = (item, dados) => {
  evidencia.itens[item] = { ...(evidencia.itens[item] ?? {}), ...dados }
  console.log(`[${item}]`, JSON.stringify(dados).slice(0, 600))
}

const script = (nome) => path.join(__dirname, 'windows', nome)
const powershell = (comando) =>
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${comando}`], { encoding: 'utf8' })
/** O Electron deste app tem uma sessão de captura ativa no Core Audio? */
const microfoneEmUso = () => Number(powershell(
  `$p = @(& '${script('capturas-de-audio.ps1')}'); @($p | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_.Path -eq '${ELECTRON}' }).Count`,
)) > 0
const acessoDoMicrofone = (estado = 'Ler') => powershell(`& '${script('acesso-do-microfone.ps1')}' -Estado ${estado}`).trim()
/** Recorte só do canto da bandeja, onde o Windows mostra o ícone de microfone em uso. */
const fotografarBandeja = (arquivo) => powershell(
  `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; Add-Type -Namespace W -Name D -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'; [void][W.D]::SetProcessDPIAware(); $t=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $i=New-Object System.Drawing.Bitmap 420,60; [System.Drawing.Graphics]::FromImage($i).CopyFromScreen($t.Right-420,$t.Bottom-60,0,0,$i.Size); $i.Save('${path.resolve(arquivo)}')`,
)

const argsDeAudio = FASE === 'simulada'
  ? ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(FALA)}%noloop`, '--no-sandbox', '--disable-features=AudioServiceSandbox']
  : []
const spawnComAudio = (comando, args, opcoes) => spawn(comando, comando === ELECTRON ? [...args, ...argsDeAudio] : args, opcoes)

async function main() {
  const subida = await executarDevtools(['launch', '--timeout', '150000'], { spawn: spawnComAudio })
  if (subida.codigo) throw new Error(subida.erro || subida.saida)
  const { userData } = readState()
  const { browser, page } = await connect(readState())
  const shot = (nome) => page.screenshot({ path: path.join(OUT, `${FASE}-${nome}.png`) })
  const estado = () => page.evaluate(() => document.querySelector('[data-dictation-state]')?.getAttribute('data-dictation-state') ?? 'sem-botao')
  // O aviso é um portal fora do botão: acha pelo "Fechar" que ele carrega.
  const mensagem = () => page.evaluate(() => [...document.querySelectorAll('[role="alert"],[role="status"]')]
    .find((el) => [...el.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Fechar'))?.querySelector('p')?.textContent ?? null)
  const atalho = () => page.keyboard.press('Control+Shift+M')
  const esperarEstado = async (alvo, ms = 60_000) => {
    const fim = Date.now() + ms
    while (Date.now() < fim) {
      if (alvo.includes(await estado())) return true
      await wait(150)
    }
    return false
  }
  const configurar = (config) => page.evaluate((c) => window.felixo.speech.saveConfig(c), config)
  const fecharAviso = () => page.evaluate(() => {
    ;[...document.querySelectorAll('[role="alert"] button,[role="status"] button')].find((b) => b.textContent.trim() === 'Fechar')?.click()
  })
  /** Começa a gravar; com a nuvem configurada, confirma antes o balão de custo. */
  const gravar = async () => {
    await atalho()
    await esperarEstado(['recording', 'confirming', 'error'], 15_000)
    if ((await estado()) === 'confirming') await page.getByRole('button', { name: 'Gravar', exact: true }).click()
    return esperarEstado(['recording', 'error'], 15_000)
  }
  const pararEEsperar = async () => {
    await atalho()
    await wait(200)
    await esperarEstado(['idle', 'error'], 180_000)
    await wait(400)
  }
  const LOCAL = { baseUrl: 'http://127.0.0.1:8765/v1', model: 'whisper-1', language: 'pt' }
  const DESLIGADO = { baseUrl: 'http://127.0.0.1:9/v1', model: 'whisper-1', language: 'pt' }
  let servidor401 = null
  let areaAnterior = null

  try {
    await page.waitForSelector('[data-dictation-state]', { timeout: 150_000 })

    if (FASE === 'sistema') {
      await configurar(DESLIGADO)
      const bandeja = (nome) => fotografarBandeja(path.join(OUT, `bandeja-${nome}.png`))
      registrar('8-microfone', { emUsoAntes: microfoneEmUso(), statusDoWindows: (await page.evaluate(() => window.felixo.speech.getMicrophoneStatus())).status })
      bandeja('1-antes')
      await gravar()
      await wait(1500)
      bandeja('2-gravando')
      registrar('8-microfone', { estadoGravando: await estado(), emUsoGravando: microfoneEmUso() })
      await shot('8-gravando')
      await page.getByRole('button', { name: 'Descartar gravação' }).click()
      await wait(2500)
      bandeja('3-cancelado')
      registrar('8-microfone', { emUsoAposCancelar: microfoneEmUso() })
      await gravar()
      await wait(1200)
      const antesDeParar = microfoneEmUso()
      await pararEEsperar()
      await wait(1500)
      registrar('8-microfone', { emUsoAntesDeParar: antesDeParar, emUsoAposParar: microfoneEmUso() })
      await fecharAviso()

      const anterior = acessoDoMicrofone()
      if (anterior !== 'On') throw new Error(`O acesso de apps de desktop já estava ${anterior}; não vou mexer.`)
      try {
        registrar('3-permissao', { chaveDuranteOTeste: acessoDoMicrofone('Off') })
        await wait(1500)
        const status = (await page.evaluate(() => window.felixo.speech.getMicrophoneStatus())).status
        await atalho()
        await esperarEstado(['error', 'recording'], 15_000)
        await wait(600)
        await shot('3-permissao-negada')
        registrar('3-permissao', { statusDoWindows: status, estado: await estado(), mensagem: await mensagem(), emUso: microfoneEmUso() })
        if ((await estado()) === 'recording') await page.getByRole('button', { name: 'Descartar gravação' }).click()
        await fecharAviso()
      } finally {
        registrar('3-permissao', { chaveRestaurada: acessoDoMicrofone(anterior) })
      }

      await wait(1500)
      await gravar()
      await wait(1200)
      registrar('8-microfone', { emUsoAntesDeFechar: microfoneEmUso(), estadoAntesDeFechar: await estado() })
      return
    }

    await configurar(LOCAL)
    await page.evaluate(async () => {
      const bridge = window.felixo.canvas
      await bridge.clear()
      await bridge.save({
        id: 'ditado-shell', type: 'terminal', position: { x: 200, y: 200 }, width: 560, height: 360,
        data: { label: 'Shell do ditado', command: 'cmd.exe', args: [], cwd: '' },
      })
    })
    await page.reload()
    await page.waitForSelector('[data-terminal-expand-trigger="ditado-shell"]', { timeout: 90_000 })
    await page.locator('[data-terminal-expand-trigger="ditado-shell"]').first().click()
    await page.waitForSelector('[data-canvas-terminal-drawer] .xterm-rows', { timeout: 60_000 })
    await wait(3000)
    const textoTerminal = () => page.evaluate(() => document.querySelector('[data-canvas-terminal-drawer] .xterm-rows')?.innerText ?? '')
    registrar('6-tipo-de-audio', {
      suportados: await page.evaluate(() => ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .map((t) => `${t}=${MediaRecorder.isTypeSupported(t)}`)),
    })

    // Itens 1 e 2: atalho, fala, atalho; o texto fica na linha, sem Enter.
    const gravando = await gravar()
    await wait(1000)
    await shot('1-gravando')
    const cronometro = await page.evaluate(() => document.querySelector('[role="timer"]')?.textContent ?? null)
    await wait(7000)
    const t0 = Date.now()
    await atalho()
    const transcrevendo = await esperarEstado(['transcribing'], 5_000)
    if (transcrevendo) await shot('2-transcrevendo')
    await esperarEstado(['idle', 'error'], 180_000)
    const latenciaMs = Date.now() - t0
    await wait(1500)
    await shot('1-texto-no-terminal')
    registrar('1-fluxo', { gravando, estadoFinal: await estado(), aviso: await mensagem(), latenciaMs,
      terminal: (await textoTerminal()).split('\n').filter((l) => l.trim()) })
    registrar('2-indicador', { cronometro, passouPorTranscrevendo: transcrevendo })

    // Item 4: sem terminal aberto, copia (a área de transferência é devolvida no fim).
    areaAnterior = powershell('Get-Clipboard -Raw')
    await page.getByRole('button', { name: 'Fechar terminal' }).click()
    await wait(1000)
    await gravar()
    await wait(9000)
    await pararEEsperar()
    await shot('4-copiado')
    registrar('4-sem-terminal', { estado: await estado(), aviso: await mensagem(), areaDeTransferencia: powershell('Get-Clipboard -Raw').trim() })
    await fecharAviso()

    // Item 5: erros. Nada sai da máquina: o endereço "sem internet" não resolve
    // e a chave recusada vem de um servidor 401 local.
    const CHAVE = 'sk-teste-invalida-felixo-0000'
    let autorizacao = null
    servidor401 = http.createServer((req, res) => {
      autorizacao = req.headers.authorization ?? null
      req.resume()
      req.on('end', () => { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":{"message":"Incorrect API key"}}') })
    }).listen(8766, '127.0.0.1')
    const casos = [
      { nome: 'endereco-desligado', config: DESLIGADO },
      { nome: 'rota-inexistente', config: { ...LOCAL, baseUrl: 'http://127.0.0.1:8765/v2' } },
      { nome: 'chave-recusada-401', config: { ...LOCAL, baseUrl: 'http://127.0.0.1:8766/v1' }, chave: CHAVE },
      { nome: 'sem-internet-dns', config: { ...LOCAL, baseUrl: 'https://transcricao-que-nao-existe.invalid/v1' }, chave: CHAVE },
    ]
    for (const caso of casos) {
      await configurar(caso.config)
      if (caso.chave) await page.evaluate((k) => window.felixo.speech.setKey(k), caso.chave)
      await gravar()
      await wait(2500)
      await pararEEsperar()
      const texto = await mensagem()
      await shot(`5-${caso.nome}`)
      registrar(`5-${caso.nome}`, { estado: await estado(), mensagem: texto, vazaChave: Boolean(texto?.includes(CHAVE)) })
      await fecharAviso()
    }
    registrar('5-chave-recusada-401', { chaveChegouNoCabecalho: autorizacao === `Bearer ${CHAVE}` })

    // Item 7: a chave fica cifrada pelo sistema (DPAPI), nunca em texto puro.
    await page.evaluate((k) => window.felixo.speech.setKey(k), CHAVE)
    const arquivo = path.join(userData, 'config', 'speech-key.bin')
    const bytes = fs.existsSync(arquivo) ? fs.readFileSync(arquivo) : null
    const estadoLocal = path.join(userData, 'Local State')
    const cifra = fs.existsSync(estadoLocal) ? JSON.parse(fs.readFileSync(estadoLocal, 'utf8')).os_crypt?.encrypted_key : null
    const emTextoPuro = fs.readdirSync(userData, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .filter((e) => {
        try { return fs.readFileSync(path.join(e.parentPath, e.name)).includes(CHAVE) } catch { return false }
      })
      .map((e) => e.name)
    registrar('7-chave-cifrada', {
      arquivoGravado: Boolean(bytes), bytes: bytes?.length ?? 0, prefixo: bytes?.subarray(0, 3).toString('latin1') ?? null,
      chaveMestraProtegidaPorDpapi: cifra ? Buffer.from(cifra, 'base64').subarray(0, 5).toString('latin1') === 'DPAPI' : null,
      arquivosComChaveEmTextoPuro: emTextoPuro,
    })
    await page.evaluate(() => window.felixo.speech.clearKey())
    registrar('7-chave-cifrada', { arquivoAposRemover: fs.existsSync(arquivo) })
  } finally {
    servidor401?.close()
    if (areaAnterior?.trim()) {
      const copia = path.join(OUT, 'area-anterior.tmp')
      fs.writeFileSync(copia, areaAnterior.replace(/\r\n$/, ''), 'utf8')
      powershell(`Set-Clipboard -Value (Get-Content -LiteralPath '${path.resolve(copia)}' -Raw -Encoding UTF8)`)
      fs.unlinkSync(copia)
    }
    await browser.close().catch(() => {})
    // Fechar o app no meio de uma gravação também precisa apagar o microfone.
    console.log((await executarDevtools(['quit'])).saida)
    await wait(2500)
    if (FASE === 'sistema') {
      registrar('8-microfone', { emUsoAposFecharOApp: microfoneEmUso() })
      fotografarBandeja(path.join(OUT, 'bandeja-4-app-fechado.png'))
    }
    evidencia.fim = new Date().toISOString()
    fs.writeFileSync(path.join(OUT, `evidencia-${FASE}.json`), JSON.stringify(evidencia, null, 2))
  }
}

main().catch(async (error) => {
  console.error('falhou:', error.stack?.slice(0, 1500) ?? error)
  await executarDevtools(['quit'])
  process.exit(1)
})

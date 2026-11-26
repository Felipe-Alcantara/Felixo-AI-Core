'use strict'
/**
 * Valida o ditado por voz no Linux, de ponta a ponta, numa instância isolada
 * do app (userData temporário, `felixo devtools`).
 *
 * O microfone é virtual: uma saída nula do PipeWire/PulseAudio cujo retorno
 * vira a fonte `felixo_vmic`, onde o roteiro toca frases gravadas. A
 * transcrição vai para um servidor local (scripts/servidor-transcricao-local.py),
 * então nenhuma chave é usada. Os itens seguem a task "Entrada de voz —
 * validar o ditado com microfone real nos três sistemas":
 *   fase `principal`: atalho → texto na linha do terminal (bash real) sem
 *     Enter, indicadores, permissão negada, sem terminal (copia), erros de
 *     endereço/rede/chave, tipo de áudio e microfone liberado ao parar/cancelar;
 *   fase `extra`: rota inexistente (404) e fechar o app no meio da gravação;
 *   fase `sem-keyring`: rode com DBUS_SESSION_BUS_ADDRESS apontando para lugar
 *     nenhum; a chave precisa ser recusada, sem arquivo gravado.
 *   fase `fisico`: microfone físico e voz de uma pessoa (itens 1, 2 e 8 e a
 *     qualidade em 5 frases nos modelos tiny, base e small). Use o comando
 *     único: bash scripts/validar-ditado-linux-fisico.sh
 *
 * Preparo (uma vez por sessão do sistema):
 *   pactl load-module module-null-sink sink_name=felixo_vmic_sink
 *   pactl load-module module-remap-source master=felixo_vmic_sink.monitor source_name=felixo_vmic
 *   python scripts/servidor-transcricao-local.py --registro transcricoes.jsonl
 *   frases em <audio>/f1.wav, f2.wav e f3.wav (ex.: piper com a voz pt_BR-faber-medium)
 *
 * Uso (sob flock + Xvfb, para não abrir janela na tela):
 *   PULSE_SOURCE=felixo_vmic xvfb-run -a node scripts/validar-ditado-linux.cjs <saida> <fase> <audio>
 *
 * O caso "chave inválida" manda uma chave falsa para a API da OpenAI e espera
 * o 401; nenhuma chave real é lida ou exibida.
 */
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const APP = path.resolve(__dirname, '..')
const [OUT, FASE = 'principal', AUDIO = path.join(process.cwd(), 'audio')] = process.argv.slice(2)
if (!OUT) {
  console.error('Uso: node scripts/validar-ditado-linux.cjs <saida> [principal|extra|sem-keyring|fisico] [pasta-de-audio]')
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })
const { connect, readState } = require(path.join(APP, 'electron/cli/felixo-devtools.cjs'))
const cli = (...args) =>
  execFileSync('node', [path.join(APP, 'electron/cli/felixo.cjs'), 'devtools', ...args], { cwd: APP, encoding: 'utf8', timeout: 240_000 }).trim()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** Ensaio sem pessoa (CI): este WAV é tocado no microfone virtual no lugar da fala. */
const ENSAIO = process.env.FELIXO_DITADO_ENSAIO ?? ''
const FRASES = [
  'Liste os arquivos desta pasta e mostre quais foram alterados hoje.',
  'Crie um commit com uma mensagem curta explicando o que mudou.',
  'Rode os testes do projeto e me avise se alguma coisa falhar.',
  'Abra o arquivo de configuração e confira a porta do servidor local.',
  'Antes de apagar qualquer coisa, faça uma cópia de segurança do banco de dados.',
]
const perguntar = (texto) => new Promise((resolve) => {
  if (ENSAIO) return resolve('s')
  const leitor = require('node:readline').createInterface({ input: process.stdin, output: process.stdout })
  leitor.question(texto, (resposta) => { leitor.close(); resolve(resposta.trim()) })
})
/** Espera a pessoa ler a frase; no ensaio, toca o áudio. */
const pessoaFala = (frase) => ENSAIO ? tocar(ENSAIO) : perguntar(`\n  Leia em voz alta: "${frase}"\n  Quando terminar, aperte Enter. `)
const evidencia = { fase: FASE, inicio: new Date().toISOString(), itens: {} }
const registrar = (item, dados) => {
  evidencia.itens[item] = { ...(evidencia.itens[item] ?? {}), ...dados }
  console.log(`[${item}]`, JSON.stringify(dados).slice(0, 400))
}
const salvar = () => fs.writeFileSync(path.join(OUT, `evidencia-${FASE}.json`), JSON.stringify(evidencia, null, 2))

/** Streams de captura abertos no PipeWire (o "indicador de microfone" do Linux). */
function capturasAbertas() {
  // LC_ALL=C: em português o pactl escreve "Saída da fonte #".
  const saida = execFileSync('pactl', ['list', 'source-outputs'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  return saida
    .split('Source Output #')
    .slice(1)
    // O stream interno do próprio microfone virtual não conta.
    .filter((bloco) => !/node\.name = "input\.felixo_vmic"/.test(bloco))
    .filter((bloco) => /electron|chrom|felixo/i.test(bloco)).length
}
function nomesDasCapturas() {
  const saida = execFileSync('pactl', ['list', 'source-outputs'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  return [...saida.matchAll(/application\.(?:name|process\.binary) = "([^"]+)"/g)].map((m) => m[1])
}
function tocar(arquivo) {
  return new Promise((resolve) => spawn('paplay', ['--device=felixo_vmic_sink', path.resolve(AUDIO, arquivo)]).on('exit', resolve))
}
const fontePadrao = () =>
  /Default Source: (.+)/.exec(execFileSync('pactl', ['info'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }))?.[1].trim() ?? ''

/** Antes de abrir o app: o microfone padrão é o físico? Quem confirma é a pessoa. */
async function confirmarMicrofone() {
  const fonte = fontePadrao()
  if ((!fonte || /\.monitor$|felixo_vmic/.test(fonte)) && !ENSAIO) {
    throw new Error(`O microfone padrão (${fonte || 'nenhum'}) é virtual. Escolha o físico: pactl list short sources; pactl set-default-source <fonte>`)
  }
  if ((await perguntar(`Microfone padrão: ${fonte}\nFeche outros apps que usem o microfone (navegador, chamada).\nÉ o microfone físico em que você vai falar? (s/N) `)).toLowerCase() !== 's') {
    throw new Error('Troque o padrão com pactl set-default-source <fonte> e rode de novo.')
  }
  return fonte
}

/** Grava as frases direto do microfone padrão e mede os três modelos sobre as mesmas gravações. */
async function medirQualidade() {
  const pasta = path.join(OUT, 'frases')
  fs.mkdirSync(pasta, { recursive: true })
  console.log('\nQualidade: 5 frases, gravadas uma vez.')
  for (const [indice, frase] of FRASES.entries()) {
    const nome = String(indice + 1).padStart(2, '0')
    await perguntar(`\n[${nome}/05] Aperte Enter para começar a gravar. `)
    const gravador = spawn('parecord', ['--file-format=wav', '--channels=1', '--rate=16000', path.join(pasta, `${nome}.wav`)])
    const saiu = new Promise((resolve) => gravador.on('exit', resolve))
    await wait(400)
    await pessoaFala(frase)
    await wait(400)
    gravador.kill('SIGINT')
    await saiu
    fs.writeFileSync(path.join(pasta, `${nome}.txt`), `${frase}\n`)
  }
  const { listarPares, medirPares } = require('./medir-transcricao-nuvem.cjs')
  const pares = listarPares(pasta)
  const modelos = {}
  for (const modelo of ['tiny', 'base', 'small']) {
    const pedido = { baseUrl: 'http://127.0.0.1:8765/v1', modelo, chave: 'local-sem-chave', preco: null }
    await medirPares({ ...pedido, pares: pares.slice(0, 1) }) // carrega o modelo fora do tempo medido
    const { itens, resumo } = await medirPares({ ...pedido, pares })
    modelos[modelo] = { medianaS: resumo.medianaLatenciaS, wer: resumo.werMedio, falhas: resumo.falhas, itens }
    console.log(`  ${modelo}: mediana ${resumo.medianaLatenciaS?.toFixed(2) ?? '—'} s, palavras erradas ${resumo.werMedio === null ? '—' : `${(100 * resumo.werMedio).toFixed(1)}%`}, falhas ${resumo.falhas}`)
  }
  return modelos
}

/** Aprovado ou reprovado por item, a partir do que foi registrado. */
function veredito(itens) {
  const m = itens['8-microfone'] ?? {}
  const fluxo = itens['1-fluxo'] ?? {}
  const modelos = Object.values(itens.qualidade ?? {})
  return {
    '1-texto-na-linha-sem-enter': fluxo.estadoFinal === 'idle' && fluxo.textoNaLinha === true,
    '2-indicadores': /\d:\d\d/.test(itens['2-indicador']?.cronometro ?? '') && fluxo.transcrevendo === true,
    '8-microfone-liberado': m.capturasGravando > 0 && m.capturasDepoisDeParar === 0
      && m.capturasDepoisDeCancelar === 0 && m.capturasAntesDeFechar > 0 && m.capturasDepoisDeFecharApp === 0,
    qualidade: modelos.length === 3 && modelos.every((q) => q.falhas === 0),
  }
}

async function main() {
  if (FASE === 'fisico') evidencia.microfone = await confirmarMicrofone()
  console.log('launch:', cli('launch', '--visible', '--timeout', '150000').split('\n').slice(-1)[0])
  const { browser, page } = await connect(readState())
  const shot = (nome) => page.screenshot({ path: path.join(OUT, `${FASE}-${nome}.png`) })
  const estado = () => page.evaluate(() => document.querySelector('[data-dictation-state]')?.getAttribute('data-dictation-state') ?? 'sem-botao')
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

  try {
    await page.waitForSelector('[data-dictation-state]', { timeout: 120_000 })

    if (FASE === 'sem-keyring') {
      const userData = await page.evaluate(() => window.felixo.devtools.mainEval("app.getPath('userData')"))
      const resultado = await page.evaluate(() => window.felixo.speech.setKey('chave-de-teste-sem-keyring'))
      const config = await page.evaluate(() => window.felixo.speech.getConfig())
      const arquivo = path.join(userData, 'config', 'speech-key.bin')
      const conteudo = fs.existsSync(arquivo) ? fs.readFileSync(arquivo) : null
      registrar('7-sem-keyring', {
        resultado,
        keyConfigured: config.config?.keyConfigured,
        arquivoGravado: Boolean(conteudo),
        bytes: conteudo?.length ?? 0,
        // Cifra "de verdade" (keyring) começa com "v11"; o fallback do Chromium sem keyring usa "v10" com senha fixa.
        prefixo: conteudo ? conteudo.subarray(0, 3).toString('latin1') : null,
        chaveEmTextoPuro: Boolean(conteudo && conteudo.includes(Buffer.from('chave-de-teste-sem-keyring'))),
      })
      return
    }

    if (FASE === 'extra') {
      await configurar({ baseUrl: 'http://127.0.0.1:8765/v2', model: 'base', language: 'pt' })
      await atalho()
      await esperarEstado(['recording'], 15_000)
      await tocar('f2.wav')
      await atalho()
      await esperarEstado(['error', 'idle'], 90_000)
      registrar('5-rota-inexistente-404', { estado: await estado(), mensagem: await mensagem() })
      await fecharAviso()
      // Fechar o app no meio da gravação: o microfone tem que apagar.
      await configurar({ baseUrl: 'http://127.0.0.1:8765/v1', model: 'base', language: 'pt' })
      await atalho()
      await esperarEstado(['recording'], 15_000)
      await wait(800)
      registrar('8-microfone', { capturasGravandoAntesDeFechar: capturasAbertas() })
      return
    }

    // ── preparo: servidor local e um terminal bash de verdade aberto ──────
    registrar('preparo', { config: await configurar({ baseUrl: 'http://127.0.0.1:8765/v1', model: 'base', language: 'pt' }) })
    await page.evaluate(async () => {
      const bridge = window.felixo.canvas
      await bridge.clear()
      await bridge.save({
        id: 'ditado-shell', type: 'terminal', position: { x: 200, y: 200 }, width: 560, height: 360,
        data: { label: 'Shell do ditado', command: 'bash', args: ['--norc', '--noprofile'], cwd: '' },
      })
    })
    await page.reload()
    await page.waitForSelector('[data-terminal-expand-trigger="ditado-shell"]', { timeout: 60_000 })
    await page.locator('[data-terminal-expand-trigger="ditado-shell"]').first().click()
    await page.waitForSelector('[data-canvas-terminal-drawer] .xterm-rows', { timeout: 60_000 })
    await wait(2500)
    const textoTerminal = () => page.evaluate(() => document.querySelector('[data-canvas-terminal-drawer] .xterm-rows')?.innerText ?? '')
    registrar('6-mediarecorder', {
      suportados: await page.evaluate(() => ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .map((t) => `${t}=${MediaRecorder.isTypeSupported(t)}`)),
    })

    if (FASE === 'fisico') {
      const antesTexto = await textoTerminal()
      await perguntar('\nPrimeira parte, dentro do app. Aperte Enter para começar a gravar. ')
      const antes = capturasAbertas()
      await atalho()
      const gravando = await esperarEstado(['recording'], 15_000)
      await wait(600)
      registrar('8-microfone', { capturasAntes: antes, capturasGravando: capturasAbertas(), nomesDurante: nomesDasCapturas() })
      await shot('1-gravando')
      await pessoaFala(FRASES[0])
      registrar('2-indicador', { cronometro: await page.evaluate(() => document.querySelector('[role="timer"]')?.textContent ?? null) })
      await atalho()
      const transcrevendo = await esperarEstado(['transcribing'], 5_000)
      await esperarEstado(['idle', 'error'], 180_000)
      await wait(1000)
      const terminal = await textoTerminal()
      await shot('3-texto-no-terminal')
      // Sem Enter: o texto aparece e o bash não tenta executá-lo.
      registrar('1-fluxo', { gravando, transcrevendo, estadoFinal: await estado(), aviso: await mensagem(),
        textoNaLinha: terminal.replace(/\s+/g, '') !== antesTexto.replace(/\s+/g, '') && !/command not found|comando não encontrado/i.test(terminal),
        linhaDoTerminal: terminal.split('\n').filter((l) => l.trim()).slice(-3) })
      registrar('8-microfone', { capturasDepoisDeParar: capturasAbertas() })

      await atalho()
      await esperarEstado(['recording'], 15_000)
      await wait(800)
      await page.getByRole('button', { name: 'Descartar gravação' }).click()
      await wait(1200)
      registrar('8-microfone', { capturasDepoisDeCancelar: capturasAbertas() })

      registrar('qualidade', await medirQualidade())

      // Por último: o app é fechado no meio desta gravação (no `finally`).
      await atalho()
      await esperarEstado(['recording'], 15_000)
      await wait(800)
      registrar('8-microfone', { capturasAntesDeFechar: capturasAbertas() })
      return
    }

    // ── itens 1, 2 e 8: atalho, fala, atalho; texto na linha, sem Enter ───
    const antes = capturasAbertas()
    await atalho()
    const gravando = await esperarEstado(['recording'], 15_000)
    await wait(600)
    const durante = capturasAbertas()
    const nomesDurante = nomesDasCapturas()
    await shot('1-gravando')
    const cronometro = await page.evaluate(() => document.querySelector('[role="timer"]')?.textContent ?? null)
    await tocar('f1.wav')
    await wait(500)
    const t0 = Date.now()
    await atalho()
    const transcrevendo = await esperarEstado(['transcribing'], 5_000)
    if (transcrevendo) await shot('2-transcrevendo')
    const terminou = await esperarEstado(['idle', 'error'], 120_000)
    const latenciaMs = Date.now() - t0
    await wait(800)
    const depois = capturasAbertas()
    const terminal = await textoTerminal()
    await shot('3-texto-no-terminal')
    registrar('1-fluxo', { gravando, transcrevendo, terminou, estadoFinal: await estado(), aviso: await mensagem(), latenciaMs,
      linhaDoTerminal: terminal.split('\n').filter((l) => l.trim()).slice(-3) })
    registrar('2-indicador', { cronometro })
    registrar('8-microfone', { capturasAntes: antes, capturasGravando: durante, nomesDurante, capturasDepoisDeParar: depois })

    // ── item 8: cancelar libera o microfone ────────────────────────────────
    await atalho()
    await esperarEstado(['recording'], 15_000)
    await wait(600)
    const durante2 = capturasAbertas()
    await page.getByRole('button', { name: 'Descartar gravação' }).click()
    await wait(1000)
    registrar('8-microfone', { capturasGravando2: durante2, capturasDepoisDeCancelar: capturasAbertas(), estadoAposCancelar: await estado() })

    // ── item 4: sem terminal aberto, copia ──────────────────────────────────
    await page.getByRole('button', { name: 'Fechar terminal' }).click().catch(() => {})
    await wait(800)
    await atalho()
    await esperarEstado(['recording'], 15_000)
    await tocar('f3.wav')
    await wait(400)
    await atalho()
    await esperarEstado(['idle', 'error'], 120_000)
    await wait(500)
    await shot('4-copiado')
    await page.bringToFront()
    const copiado = await page.evaluate(() => navigator.clipboard.readText().catch((error) => `erro: ${error.message}`))
    registrar('4-sem-terminal', { aviso: await mensagem(), areaDeTransferencia: copiado })
    await fecharAviso()

    // ── item 5: chave inválida, sem internet, endereço errado ──────────────
    const casos = [
      { nome: 'endereco-local-desligado', config: { baseUrl: 'http://127.0.0.1:9/v1', model: 'base', language: 'pt' } },
      { nome: 'rota-inexistente-404', config: { baseUrl: 'http://127.0.0.1:8765/v2', model: 'base', language: 'pt' } },
      { nome: 'sem-internet-dns', config: { baseUrl: 'https://transcricao-que-nao-existe.invalid/v1', model: 'whisper-1', language: 'pt' }, chave: 'sk-teste-invalida-felixo-0000' },
      { nome: 'chave-invalida-openai', config: { baseUrl: 'https://api.openai.com/v1', model: 'whisper-1', language: 'pt' }, chave: 'sk-teste-invalida-felixo-0000' },
    ]
    for (const caso of casos) {
      await configurar(caso.config)
      if (caso.chave) await page.evaluate((k) => window.felixo.speech.setKey(k), caso.chave)
      await atalho()
      await esperarEstado(['recording'], 15_000)
      await tocar('f2.wav')
      await atalho()
      await esperarEstado(['error', 'idle'], 90_000)
      await wait(300)
      const texto = await mensagem()
      await shot(`5-${caso.nome}`)
      registrar(`5-${caso.nome}`, { estado: await estado(), mensagem: texto, vazaChave: Boolean(caso.chave && texto?.includes(caso.chave)) })
      await fecharAviso()
    }
    await page.evaluate(() => window.felixo.speech.clearKey())

    // ── item 3: permissão negada (o handler da sessão recusa 'media') ──────
    await configurar({ baseUrl: 'http://127.0.0.1:8765/v1', model: 'base', language: 'pt' })
    await page.evaluate(() => window.felixo.devtools.mainEval(
      "(() => { const s = mainWindow.webContents.session; s.setPermissionRequestHandler((_w, p, cb) => cb(p !== 'media')); s.setPermissionCheckHandler((_w, p) => p !== 'media'); return true })()"))
    await atalho()
    await esperarEstado(['error'], 15_000)
    await shot('3-permissao-negada')
    registrar('3-permissao', { estado: await estado(), mensagem: await mensagem(), capturas: capturasAbertas() })
    await fecharAviso()

    // ── telas: botão, popover e seção de configurações ─────────────────────
    await page.evaluate(() => {
      const botoes = [...document.querySelectorAll('button')]
      ;(botoes.find((b) => /Configurações/.test(b.getAttribute('aria-label') || b.title || '')) || botoes.find((b) => b.textContent.trim() === 'Configurações'))?.click()
    })
    await wait(1500)
    const secao = await page.evaluate(() => {
      const titulo = [...document.querySelectorAll('h2,h3,h4,summary,legend')].find((el) => /Ditado por voz/.test(el.textContent))
      titulo?.scrollIntoView({ block: 'start' })
      return titulo ? titulo.closest('section,fieldset,details,div')?.innerText.slice(0, 1500) : null
    })
    await wait(500)
    await shot('9-configuracoes-ditado')
    registrar('telas', { secaoConfiguracoes: secao })
  } finally {
    evidencia.fim = new Date().toISOString()
    salvar()
    await browser.close().catch(() => {})
    // Fechar o app no meio de uma gravação também precisa apagar o microfone.
    console.log('quit:', cli('quit'))
    await wait(1500)
    registrar('8-microfone', { capturasDepoisDeFecharApp: capturasAbertas() })
    if (FASE === 'fisico') {
      evidencia.veredito = veredito(evidencia.itens)
      console.log('\nResultado:')
      for (const [item, ok] of Object.entries(evidencia.veredito)) console.log(`  ${ok ? 'APROVADO ' : 'REPROVADO'} ${item}`)
      console.log(`Evidência em ${path.resolve(OUT)}`)
      if (Object.values(evidencia.veredito).includes(false)) process.exitCode = 1
    }
    salvar()
  }
}

main().catch((error) => {
  console.error('falhou:', error.stack?.slice(0, 1200) ?? error)
  salvar()
  try { cli('quit') } catch {}
  process.exit(1)
})

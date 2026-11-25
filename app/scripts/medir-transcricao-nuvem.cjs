'use strict'
/**
 * Mede a API de transcrição na nuvem com a chave da pessoa, pelo mesmo pedido que
 * o ditado do app faz: POST {baseUrl}/audio/transcriptions com model, language=pt
 * e response_format=json. Para cada par de arquivos mede a latência do pedido, a
 * taxa de erro de palavras (WER) contra a transcrição oficial, a duração do áudio
 * e o custo pelo preço por minuto.
 *
 * Não mede o tempo do segundo atalho até o texto no app: isso inclui gravar,
 * codificar em webm e digitar no terminal, e é medido à mão (roteiro no relatório
 * da task). Aqui o WAV vai como está, sem a codificação do app.
 *
 * Chave: só pela variável de ambiente (padrão FELIXO_CHAVE_TRANSCRICAO). Ela não é
 * gravada, não vai para a saída nem para o JSON, e sem ela o script não roda.
 *
 * Roteiro (passo humano, uma vez por provedor):
 *   1. Pasta com pares NN.wav e NN.txt (transcrição oficial, uma linha). O conjunto
 *      da entrada "Motor local do ditado" do IA.md (05/10) tinha 6 frases do FLEURS
 *      pt_br (vozes masculinas) e 6 do VoxForge pt (femininas), de 3,3 a 9,5 s.
 *   2. Na sessão do terminal, sem gravar a chave em arquivo:
 *        PowerShell: $env:FELIXO_CHAVE_TRANSCRICAO = '<chave>'
 *        bash:       export FELIXO_CHAVE_TRANSCRICAO='<chave>'
 *   3. node app/scripts/medir-transcricao-nuvem.cjs <pasta> --saida <resultado.json>
 *      OpenAI é o padrão (whisper-1, 0,006 US$/min). Outro provedor compatível:
 *      --base-url <https://...> --modelo <nome> --preco-min <US$/min do painel>.
 *   4. Conferir o custo real no painel do provedor e comparar com o estimado.
 *
 * Saída: tabela em Markdown no terminal (para colar no IA.md) e o JSON em --saida.
 * Código 0 se todos os pedidos passarem; 1 se algum falhar; 2 para uso errado ou sem chave.
 */
const fs = require('node:fs')
const path = require('node:path')

const URL_PADRAO = 'https://api.openai.com/v1'
const MODELO_PADRAO = 'whisper-1'
// Tabela da OpenAI, a mesma do app (app/src/features/canvas/services/dictation.ts, conferida em 15/11/2026).
const PRECO_OPENAI_WHISPER_1 = 0.006
const CHAVE_ENV_PADRAO = 'FELIXO_CHAVE_TRANSCRICAO'
const TIMEOUT_MS = 60_000
const FLAGS = {
  '--base-url': 'baseUrl',
  '--modelo': 'modelo',
  '--preco-min': 'preco',
  '--chave-env': 'chaveEnv',
  '--saida': 'saida',
}

const formatar = (numero, casas) => numero.toFixed(casas).replace('.', ',')

/** Minúsculas e sem pontuação; acentos ficam (como no IA.md de 05/10). */
function palavras(texto) {
  return String(texto).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean)
}

/** (substituições + inserções + remoções) / palavras da referência. Distância de edição por palavra. */
function wer(referencia, hipotese) {
  const ref = palavras(referencia)
  const hip = palavras(hipotese)
  if (ref.length === 0) return hip.length === 0 ? 0 : 1
  let anterior = Array.from({ length: hip.length + 1 }, (_, j) => j)
  for (let i = 1; i <= ref.length; i++) {
    const atual = [i]
    for (let j = 1; j <= hip.length; j++) {
      const custo = ref[i - 1] === hip[j - 1] ? 0 : 1
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo)
    }
    anterior = atual
  }
  return anterior[hip.length] / ref.length
}

function mediana(valores) {
  if (valores.length === 0) return null
  const ordem = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordem.length / 2)
  return ordem.length % 2 ? ordem[meio] : (ordem[meio - 1] + ordem[meio]) / 2
}

/** Duração de um WAV pelo cabeçalho: bytes do chunk data ÷ bytes por segundo. */
function duracaoWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('não é WAV (RIFF/WAVE)')
  }
  let bytesPorSegundo = 0
  let pos = 12
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString('ascii', pos, pos + 4)
    const tamanho = buffer.readUInt32LE(pos + 4)
    const inicio = pos + 8
    if (id === 'fmt ') bytesPorSegundo = buffer.readUInt32LE(inicio + 8)
    if (id === 'data') {
      if (!bytesPorSegundo) throw new Error('WAV sem chunk fmt antes de data')
      return Math.min(tamanho, buffer.length - inicio) / bytesPorSegundo
    }
    // Chunks têm tamanho par: um byte de folga quando o tamanho é ímpar.
    pos = inicio + tamanho + (tamanho % 2)
  }
  throw new Error('WAV sem chunk data')
}

function custoUsd(segundos, precoUsdPorMinuto) {
  return precoUsdPorMinuto == null ? null : (segundos / 60) * precoUsdPorMinuto
}

/** Só https, ou http para localhost; sem usuário nem senha no endereço. */
function validarBaseUrl(valor) {
  const url = new URL(valor)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('o endereço precisa ser https (http só em localhost)')
  }
  if (url.username || url.password) throw new Error('o endereço não pode levar usuário nem senha')
  return valor.replace(/\/+$/, '')
}

/** Tira a chave de um texto antes de mostrar. */
function mascarar(texto, chave) {
  return chave ? texto.split(chave).join('[chave]') : texto
}

function parseArgs(argv) {
  const opcoes = {
    pasta: null,
    baseUrl: URL_PADRAO,
    modelo: MODELO_PADRAO,
    preco: undefined,
    chaveEnv: CHAVE_ENV_PADRAO,
    saida: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      if (opcoes.pasta !== null) throw new Error(`argumento sobrando: ${arg}`)
      opcoes.pasta = arg
      continue
    }
    const campo = Object.hasOwn(FLAGS, arg) ? FLAGS[arg] : undefined
    if (!campo) throw new Error(`opção desconhecida: ${arg}`)
    const valor = argv[++i]
    if (valor === undefined) throw new Error(`${arg} precisa de um valor`)
    if (campo === 'preco') {
      const numero = Number(valor)
      if (!Number.isFinite(numero) || numero < 0) throw new Error('--preco-min precisa ser um número maior ou igual a zero')
      opcoes.preco = numero
    } else {
      opcoes[campo] = valor
    }
  }
  if (opcoes.pasta === null) throw new Error('informe a pasta com os pares NN.wav e NN.txt')
  return opcoes
}

/** Preço informado ou, para a OpenAI e o whisper-1, o da tabela. Outro provedor sem --preco-min não tem custo calculado. */
function precoDoPedido(baseUrl, modelo, precoInformado) {
  if (precoInformado !== undefined) return precoInformado
  return new URL(baseUrl).host === 'api.openai.com' && modelo === MODELO_PADRAO ? PRECO_OPENAI_WHISPER_1 : null
}

/** Pares NN.wav + NN.txt, em ordem. Falta uma transcrição oficial? Para antes de gastar com a API. */
function listarPares(pasta) {
  const wavs = fs.readdirSync(pasta).filter((nome) => nome.toLowerCase().endsWith('.wav')).sort()
  if (wavs.length === 0) throw new Error(`nenhum .wav em ${pasta}`)
  return wavs.map((nome) => {
    const base = nome.slice(0, -4)
    const txt = path.join(pasta, `${base}.txt`)
    if (!fs.existsSync(txt)) throw new Error(`falta a transcrição oficial de ${nome} (${base}.txt)`)
    const referencia = fs.readFileSync(txt, 'utf8').trim()
    if (!referencia) throw new Error(`transcrição vazia em ${base}.txt`)
    const wav = fs.readFileSync(path.join(pasta, nome))
    let duracaoS
    try {
      duracaoS = duracaoWav(wav)
    } catch (erro) {
      throw new Error(`${nome}: ${erro.message}`)
    }
    return { nome: base, wav, referencia, duracaoS }
  })
}

/** Um pedido igual ao do ditado do app. Devolve o texto, ou o erro já sem a chave. */
async function transcrever({ baseUrl, modelo, chave, audio, nome, fetchImpl = fetch }) {
  const corpo = new FormData()
  corpo.append('file', new Blob([audio], { type: 'audio/wav' }), nome)
  corpo.append('model', modelo)
  corpo.append('language', 'pt')
  corpo.append('response_format', 'json')
  const inicio = performance.now()
  const decorrido = () => (performance.now() - inicio) / 1000
  try {
    const resposta = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}` },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const bruto = await resposta.text()
    const latenciaS = decorrido()
    if (!resposta.ok) {
      return { ok: false, latenciaS, erro: mascarar(`HTTP ${resposta.status}: ${bruto.slice(0, 200)}`, chave) }
    }
    let texto
    try {
      texto = String(JSON.parse(bruto).text ?? '').trim()
    } catch {
      return { ok: false, latenciaS, erro: 'a resposta não é JSON' }
    }
    return { ok: true, latenciaS, texto }
  } catch (erro) {
    return { ok: false, latenciaS: decorrido(), erro: mascarar(String(erro?.message ?? erro), chave) }
  }
}

function resumir(itens, preco) {
  const ok = itens.filter((item) => !item.erro)
  const segundos = ok.reduce((soma, item) => soma + item.duracaoS, 0)
  return {
    pedidos: itens.length,
    falhas: itens.length - ok.length,
    medianaLatenciaS: mediana(ok.map((item) => item.latenciaS)),
    werMedio: ok.length ? ok.reduce((soma, item) => soma + item.wer, 0) / ok.length : null,
    minutos: segundos / 60,
    precoUsdPorMinuto: preco ?? null,
    custoUsd: custoUsd(segundos, preco),
  }
}

/** Mede cada par em sequência. Só pedidos com sucesso entram nas medianas e no custo. */
async function medirPares({ pares, baseUrl, modelo, chave, preco, fetchImpl = fetch }) {
  const itens = []
  for (const par of pares) {
    const pedido = await transcrever({ baseUrl, modelo, chave, audio: par.wav, nome: `${par.nome}.wav`, fetchImpl })
    if (!pedido.ok) {
      itens.push({ arquivo: par.nome, duracaoS: par.duracaoS, latenciaS: pedido.latenciaS, erro: pedido.erro })
      continue
    }
    itens.push({
      arquivo: par.nome,
      duracaoS: par.duracaoS,
      latenciaS: pedido.latenciaS,
      wer: wer(par.referencia, pedido.texto),
      referencia: par.referencia,
      texto: pedido.texto,
      custoUsd: custoUsd(par.duracaoS, preco),
    })
  }
  return { itens, resumo: resumir(itens, preco) }
}

/** Tabela para colar no IA.md, com vírgula decimal como o resto do registro. */
function tabela({ itens, resumo }) {
  const linhas = ['| Arquivo | Áudio | Latência | WER | Erro |', '| --- | --- | --- | --- | --- |']
  for (const item of itens) {
    const erro = item.erro ? item.erro.replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').slice(0, 120) : ''
    const werCelula = item.erro ? '—' : `${formatar(item.wer * 100, 1)}%`
    linhas.push(`| ${item.arquivo} | ${formatar(item.duracaoS, 1)} s | ${formatar(item.latenciaS, 2)} s | ${werCelula} | ${erro} |`)
  }
  const medianaTxt = resumo.medianaLatenciaS === null ? '—' : `${formatar(resumo.medianaLatenciaS, 2)} s`
  const werTxt = resumo.werMedio === null ? '—' : `${formatar(resumo.werMedio * 100, 1)}%`
  const custo = resumo.custoUsd === null
    ? 'não calculado (informe --preco-min)'
    : `US$ ${formatar(resumo.custoUsd, 5)} (US$ ${formatar(resumo.precoUsdPorMinuto, 4)}/min)`
  linhas.push(
    '',
    `Mediana de latência: ${medianaTxt} · WER médio: ${werTxt} · áudio: ${formatar(resumo.minutos, 2)} min · custo estimado: ${custo} · falhas: ${resumo.falhas}`,
  )
  return linhas.join('\n')
}

async function main(argv = process.argv.slice(2), {
  ambiente = process.env,
  fetchImpl = fetch,
  imprimir = console.log,
  imprimirErro = console.error,
} = {}) {
  const uso = 'Uso: node medir-transcricao-nuvem.cjs <pasta> [--saida <json>] [--base-url <url>] [--modelo <nome>] [--preco-min <US$>] [--chave-env <nome>]'
  let opcoes
  try {
    opcoes = parseArgs(argv)
    opcoes.baseUrl = validarBaseUrl(opcoes.baseUrl)
  } catch (erro) {
    imprimirErro(`${uso}\n${erro.message}`)
    return 2
  }
  const chave = (ambiente[opcoes.chaveEnv] ?? '').trim()
  if (!chave) {
    imprimirErro(`Defina ${opcoes.chaveEnv} na sessão do terminal. A chave não é gravada nem impressa.`)
    return 2
  }
  let pares
  try {
    pares = listarPares(opcoes.pasta)
  } catch (erro) {
    imprimirErro(erro.message)
    return 2
  }
  const preco = precoDoPedido(opcoes.baseUrl, opcoes.modelo, opcoes.preco)
  imprimir(`${pares.length} pares · ${new URL(opcoes.baseUrl).host} · modelo ${opcoes.modelo}`)
  const resultado = await medirPares({ pares, baseUrl: opcoes.baseUrl, modelo: opcoes.modelo, chave, preco, fetchImpl })
  if (opcoes.saida) {
    const registro = { geradoEm: new Date().toISOString(), baseUrl: opcoes.baseUrl, modelo: opcoes.modelo, ...resultado }
    fs.writeFileSync(opcoes.saida, `${JSON.stringify(registro, null, 2)}\n`)
  }
  imprimir(tabela(resultado))
  return resultado.resumo.falhas === 0 ? 0 : 1
}

module.exports = { duracaoWav, listarPares, main, medirPares, mediana, parseArgs, tabela, transcrever, validarBaseUrl, wer }

if (require.main === module) {
  main().then((codigo) => {
    process.exitCode = codigo
  })
}

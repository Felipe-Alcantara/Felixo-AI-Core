'use strict'

/**
 * @module typescript-toolchain
 * Fonte única da fiação "lado a lado" do TypeScript no app.
 *
 * O TypeScript 7 (compilador nativo) ainda não publica a API programática que
 * o typescript-eslint importa. Seguindo a forma oficial do anúncio do 7.0
 * ("Running Side-by-Side with TypeScript 6.0"), o package.json instala dois
 * aliases npm:
 *
 * - `@typescript/native` → `typescript@^7`: dono do bin `tsc`, executado por
 *   `npm run typecheck`, `npm run build` e pelo benchmark de typecheck;
 * - `typescript` → `@typescript/typescript6@^6`: reexporta a API do 6 (via
 *   `@typescript/old`) para quem faz `require('typescript')` — o
 *   typescript-eslint — e expõe só o bin `tsc6`.
 *
 * O `@typescript/old` (dependência do pacote de compatibilidade) também
 * declara um bin `tsc`. O npm escolhe o vencedor por ordem lexical do nome
 * instalado, por isso o alias do 7 precisa se chamar `@typescript/native`
 * (microsoft/typescript-go#4567). As funções abaixo permitem provar, em cada
 * SO, para onde o `node_modules/.bin/tsc` realmente aponta: link simbólico no
 * POSIX e shim `.cmd` (formato do cmd-shim do npm) no Windows. O parser do
 * shim recebe o conteúdo por parâmetro para ser testado em qualquer SO.
 */

const fs = require('node:fs')
const path = require('node:path')

const APP_ROOT = path.resolve(__dirname, '..')

/** Nome instalado (alias) do pacote que fornece o compilador `tsc` (TS 7). */
const PACOTE_COMPILADOR = '@typescript/native'

/** Nome instalado do pacote que fornece a API para `require('typescript')`. */
const PACOTE_API = 'typescript'

/** Nome do bin que os scripts npm executam. */
const BIN_COMPILADOR = 'tsc'

function diretorioDoPacote(nomePacote, raizApp = APP_ROOT) {
  return path.join(raizApp, 'node_modules', ...nomePacote.split('/'))
}

/** Ponto de entrada JS do compilador, o mesmo alvo do `node_modules/.bin/tsc`. */
function caminhoDoCompilador(raizApp = APP_ROOT) {
  return path.join(diretorioDoPacote(PACOTE_COMPILADOR, raizApp), 'bin', BIN_COMPILADOR)
}

function lerManifesto(diretorio) {
  const arquivo = path.join(diretorio, 'package.json')
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  } catch (erro) {
    throw new Error(`não foi possível ler ${arquivo}: ${erro.message}`)
  }
}

/** Versão publicada do compilador instalado (ex.: "7.0.2"). */
function versaoDoCompilador(raizApp = APP_ROOT) {
  return lerManifesto(diretorioDoPacote(PACOTE_COMPILADOR, raizApp)).version
}

/**
 * Versão da API que `require('typescript')` entrega a partir do app. Carrega o
 * módulo de verdade: o pacote de compatibilidade tem versão própria (6.0.x) e
 * só a exportação `version` diz qual API do 6 está por trás dele.
 */
function versaoDaApi(raizApp = APP_ROOT) {
  const entrada = require.resolve(PACOTE_API, { paths: [raizApp] })
  return require(entrada).version
}

/**
 * Extrai o caminho relativo do alvo de um shim `.cmd` gerado pelo cmd-shim do
 * npm. O alvo é o último `"%dp0%\..."` antes de `%*`; o `"%dp0%\node.exe"` do
 * início do shim é o interpretador, não o alvo.
 *
 * @param {string} conteudo
 * @returns {string | null}
 */
function extrairAlvoDoShimCmd(conteudo) {
  const ocorrencias = [...String(conteudo).matchAll(/"%dp0%\\([^"]+)"\s+%\*/g)]
  return ocorrencias.length ? ocorrencias[ocorrencias.length - 1][1] : null
}

/**
 * Resolve o alvo de um shim `.cmd` com semântica de caminho do Windows, sem
 * depender do SO em que roda.
 */
function resolverAlvoDoShimCmd(conteudo, diretorioBin) {
  const relativo = extrairAlvoDoShimCmd(conteudo)
  return relativo ? path.win32.resolve(diretorioBin, relativo) : null
}

/**
 * Caminho real do arquivo que o npm executa para `nomeBin`.
 *
 * @param {string} diretorioBin `node_modules/.bin`
 * @param {string} nomeBin
 * @param {NodeJS.Platform} [plataforma]
 */
function resolverAlvoDoBinNpm(diretorioBin, nomeBin, plataforma = process.platform) {
  if (plataforma === 'win32') {
    const shim = path.join(diretorioBin, `${nomeBin}.cmd`)
    const alvo = resolverAlvoDoShimCmd(fs.readFileSync(shim, 'utf8'), diretorioBin)
    if (!alvo) throw new Error(`shim sem alvo reconhecível: ${shim}`)
    return fs.realpathSync(alvo)
  }
  return fs.realpathSync(path.join(diretorioBin, nomeBin))
}

/**
 * Sobe a partir de um arquivo até o package.json mais próximo e diz a qual
 * pacote ele pertence — útil para a mensagem de erro citar quem venceu o bin.
 */
function pacoteDono(arquivo) {
  let diretorio = path.dirname(arquivo)
  while (true) {
    if (fs.existsSync(path.join(diretorio, 'package.json'))) {
      const { name, version } = lerManifesto(diretorio)
      return { diretorio, name, version }
    }
    const pai = path.dirname(diretorio)
    if (pai === diretorio) return null
    diretorio = pai
  }
}

/**
 * O lançador JS do TS 7 (`bin/tsc`) substitui o próprio processo pelo
 * executável nativo via `process.execve` quando ela existe (Node >= 22.15) e o
 * SO não é Windows; caso contrário, roda o executável como processo filho.
 * Só no primeiro caso o PID iniciado pelo npm/benchmark é o do compilador.
 */
function compiladorRodaNoProcessoIniciado(
  plataforma = process.platform,
  temExecve = typeof process.execve === 'function',
) {
  return plataforma !== 'win32' && temExecve
}

function versaoMaior(versao) {
  const maior = Number.parseInt(String(versao).split('.')[0], 10)
  return Number.isInteger(maior) ? maior : null
}

module.exports = {
  APP_ROOT,
  BIN_COMPILADOR,
  PACOTE_API,
  PACOTE_COMPILADOR,
  caminhoDoCompilador,
  compiladorRodaNoProcessoIniciado,
  diretorioDoPacote,
  extrairAlvoDoShimCmd,
  pacoteDono,
  resolverAlvoDoBinNpm,
  resolverAlvoDoShimCmd,
  versaoDaApi,
  versaoDoCompilador,
  versaoMaior,
}

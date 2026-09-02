'use strict'

/**
 * @module agent-command-install
 * Materializa o comando `felixo` numa pasta e a coloca no PATH dos terminais.
 *
 * Por que um shim em vez de um binário: o app já carrega um Node — o do
 * Electron. Com `ELECTRON_RUN_AS_NODE=1`, `process.execPath` roda um `.cjs`
 * como Node puro, sem abrir janela. Assim o comando funciona mesmo em máquina
 * que não tem Node instalado, que é o caso de boa parte de quem usa um app
 * empacotado, e não há segundo runtime para manter em dia.
 *
 * O shim é reescrito quando muda de conteúdo e só então: reescrever a cada
 * abertura trocaria o inode de um arquivo que pode estar sendo executado.
 */

const fs = require('node:fs')
const path = require('node:path')

/** Nome do comando exposto ao agente. */
const NOME_DO_COMANDO = 'felixo'

/**
 * Conteúdo do shim POSIX.
 *
 * `exec` de propósito: o shim não precisa sobreviver ao comando, e sem ele
 * ficaria um shell de sobra segurando o processo do agente.
 *
 * @param {{ execPath: string, entrypoint: string, userData?: string }} alvo
 * @returns {string}
 */
function construirShimPosix({ execPath, entrypoint, userData }) {
  return [
    '#!/bin/sh',
    '# Gerado pelo Felixo AI Core. Edições aqui são sobrescritas.',
    ...(userData ? [`FELIXO_USER_DATA_DIR=${aspasPosix(userData)} \\`] : []),
    'ELECTRON_RUN_AS_NODE=1 \\',
    `exec ${aspasPosix(execPath)} ${aspasPosix(entrypoint)} "$@"`,
    '',
  ].join('\n')
}

/**
 * Conteúdo do shim do Windows.
 *
 * @param {{ execPath: string, entrypoint: string, userData?: string }} alvo
 * @returns {string}
 */
function construirShimWindows({ execPath, entrypoint, userData }) {
  return [
    '@echo off',
    'rem Gerado pelo Felixo AI Core. Edicoes aqui sao sobrescritas.',
    'setlocal',
    // Sem isto o cmd.exe le o .cmd (gravado em UTF-8) na code page ANSI da
    // maquina e corrompe qualquer acento no caminho — e o caminho real de
    // instalacao tem acento ("Programacao/Repositorios").
    'chcp 65001 >nul',
    ...(userData ? [`set "FELIXO_USER_DATA_DIR=${escaparValorWindows(userData)}"`] : []),
    'set ELECTRON_RUN_AS_NODE=1',
    `"${execPath}" "${entrypoint}" %*`,
    '',
  ].join('\r\n')
}

/**
 * Escapa para o shell POSIX: aspas simples, com o truque do apóstrofo.
 *
 * Existe porque o caminho de instalação real tem espaço e acento
 * ("Programação/Github/Repositórios"), e um shim sem aspas quebraria ali.
 *
 * @param {string} valor
 * @returns {string}
 */
function aspasPosix(valor) {
  return `'${String(valor).replace(/'/g, `'\\''`)}'`
}

/** Escapa aspas para o formato seguro `set "NOME=valor"` do cmd.exe. */
function escaparValorWindows(valor) {
  return String(valor).replace(/"/g, '""')
}

/**
 * Instala (ou atualiza) o comando na pasta indicada.
 *
 * Idempotente: com o conteúdo já igual, não escreve nada e reporta `false`.
 *
 * @param {object} opcoes
 * @param {string} opcoes.binDir - pasta do comando (`appPaths.bin`).
 * @param {string} opcoes.execPath - o Node/Electron que vai executar.
 * @param {string} opcoes.entrypoint - o `.cjs` do comando.
 * @param {string} [opcoes.userData] - `app.getPath('userData')` do processo principal.
 * @param {string} [opcoes.plataforma] - `process.platform`.
 * @param {object} [opcoes.sistemaDeArquivos] - injeção para teste.
 * @returns {{ caminho: string, escrito: boolean }}
 */
function instalarComandoDoAgente(opcoes) {
  const {
    binDir,
    execPath,
    entrypoint,
    userData,
    plataforma = process.platform,
    sistemaDeArquivos = fs,
  } = opcoes

  const windows = plataforma === 'win32'
  const caminho = path.join(binDir, windows ? `${NOME_DO_COMANDO}.cmd` : NOME_DO_COMANDO)
  const conteudo = windows
    ? construirShimWindows({ execPath, entrypoint, userData })
    : construirShimPosix({ execPath, entrypoint, userData })

  let atual = null

  try {
    atual = sistemaDeArquivos.readFileSync(caminho, 'utf8')
  } catch {
    atual = null
  }

  if (atual === conteudo) {
    return { caminho, escrito: false }
  }

  sistemaDeArquivos.mkdirSync(binDir, { recursive: true })
  sistemaDeArquivos.writeFileSync(caminho, conteudo, 'utf8')

  if (!windows) {
    // Sem o bit de execução o shim não é um comando, é um arquivo de texto.
    try {
      sistemaDeArquivos.chmodSync(caminho, 0o755)
    } catch {
      /* Sistema sem permissão POSIX: o shim vale pelo que está escrito nele. */
    }
  }

  return { caminho, escrito: true }
}

module.exports = {
  NOME_DO_COMANDO,
  aspasPosix,
  construirShimPosix,
  construirShimWindows,
  instalarComandoDoAgente,
}

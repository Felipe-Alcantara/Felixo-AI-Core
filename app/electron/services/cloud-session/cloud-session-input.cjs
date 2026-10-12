'use strict'

/**
 * Validação do que a pessoa digitou no cartão antes de chegar ao processo.
 *
 * A tarefa e o follow-up viram `argv` do `claude`. Aqui só se confere forma,
 * tamanho e existência da pasta; quem decide se o texto pode passar por um
 * shell é `hasShellUnsafeChars`, usado apenas quando não há como executar o
 * binário nativo direto (ver `cloud-session-executable.cjs`).
 */

const fs = require('node:fs')
const path = require('node:path')

const TASK_MAX = 4000
const FOLLOW_UP_MAX = 2000
const SESSION_ID_PATTERN = /^session_[A-Za-z0-9]+$/
// Caracteres que o cmd.exe reinterpreta (variável, aspas, escape, operadores,
// redirecionamento) e quebras de linha, que encerram o comando.
const SHELL_UNSAFE_PATTERN = /[%"^&|<>\r\n]/

function invalid(message) {
  return { ok: false, code: 'invalid-input', message }
}

function readText(value, max) {
  if (typeof value !== 'string' || value.includes('\0')) return null
  const text = value.trim()
  return text.length > 0 && text.length <= max ? text : null
}

function isExistingDirectory(cwd, fsApi) {
  if (typeof cwd !== 'string' || cwd.length === 0) return false
  if (!path.win32.isAbsolute(cwd) && !path.posix.isAbsolute(cwd)) return false
  try {
    return fsApi.statSync(cwd).isDirectory()
  } catch {
    return false
  }
}

/**
 * @param {{ task: unknown, cwd: unknown }} input
 * @param {{ statSync: (target: string) => { isDirectory(): boolean } }} [fsApi]
 * @returns {{ ok: true, task: string, cwd: string } | { ok: false, code: 'invalid-input', message: string }}
 */
function validateLaunchInput(input, fsApi = fs) {
  const task = readText(input?.task, TASK_MAX)
  if (task === null) {
    return invalid(`Escreva a tarefa (até ${TASK_MAX} caracteres).`)
  }
  if (!isExistingDirectory(input?.cwd, fsApi)) {
    return invalid('A pasta do projeto não existe ou não é uma pasta.')
  }
  return { ok: true, task, cwd: input.cwd }
}

/**
 * @param {{ sessionId: unknown, text: unknown, cwd: unknown }} input
 * @param {{ statSync: (target: string) => { isDirectory(): boolean } }} [fsApi]
 * @returns {{ ok: true, sessionId: string, text: string, cwd: string } | { ok: false, code: 'invalid-input', message: string }}
 */
function validateFollowUpInput(input, fsApi = fs) {
  if (typeof input?.sessionId !== 'string' || !SESSION_ID_PATTERN.test(input.sessionId)) {
    return invalid('O ID da sessão não é válido.')
  }
  const text = readText(input?.text, FOLLOW_UP_MAX)
  if (text === null) {
    return invalid(`Escreva a mensagem (até ${FOLLOW_UP_MAX} caracteres).`)
  }
  if (!isExistingDirectory(input?.cwd, fsApi)) {
    return invalid('A pasta do projeto não existe ou não é uma pasta.')
  }
  return { ok: true, sessionId: input.sessionId, text, cwd: input.cwd }
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasShellUnsafeChars(text) {
  return SHELL_UNSAFE_PATTERN.test(String(text ?? ''))
}

module.exports = {
  FOLLOW_UP_MAX,
  TASK_MAX,
  hasShellUnsafeChars,
  validateFollowUpInput,
  validateLaunchInput,
}

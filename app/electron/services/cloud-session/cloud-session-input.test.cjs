'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  FOLLOW_UP_MAX,
  TASK_MAX,
  hasShellUnsafeChars,
  validateFollowUpInput,
  validateLaunchInput,
} = require('./cloud-session-input.cjs')

const ID = 'session_01EXEMPLO0000000000000000'

/** `fs` falso: só `statSync`, com as pastas e arquivos dados. */
function fakeFs({ dirs = [], files = [] } = {}) {
  return {
    statSync(target) {
      if (dirs.includes(target)) return { isDirectory: () => true }
      if (files.includes(target)) return { isDirectory: () => false }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
  }
}

const PASTA = 'P:\\Programação\\Github\\Repositórios\\Meus repositórios\\Projeto'
const fsOk = fakeFs({ dirs: [PASTA, '/tmp/x'], files: ['/tmp/arquivo.txt'] })

test('aceita tarefa e pasta válidas e devolve a tarefa sem espaços nas pontas', () => {
  const result = validateLaunchInput({ task: '  Corrigir o bug  ', cwd: '/tmp/x' }, fsOk)

  assert.deepEqual(result, { ok: true, task: 'Corrigir o bug', cwd: '/tmp/x' })
})

test('aceita pasta com acento e espaço no caminho', () => {
  const result = validateLaunchInput({ task: 'Tarefa', cwd: PASTA }, fsOk)

  assert.equal(result.ok, true)
  assert.equal(result.cwd, PASTA)
})

test('recusa tarefa vazia, só com espaços, longa demais ou com NUL', () => {
  for (const task of ['', '   \n\t ', 'a'.repeat(TASK_MAX + 1), 'ab\0cd', undefined, 42]) {
    const result = validateLaunchInput({ task, cwd: '/tmp/x' }, fsOk)

    assert.equal(result.ok, false, `deveria recusar ${JSON.stringify(task)}`)
    assert.equal(result.code, 'invalid-input')
  }
})

test('aceita tarefa de exatamente o tamanho máximo', () => {
  const result = validateLaunchInput({ task: 'a'.repeat(TASK_MAX), cwd: '/tmp/x' }, fsOk)

  assert.equal(result.ok, true)
})

test('aceita tarefa com quebra de linha, aspas, emoji e variável de ambiente (é argv, não shell)', () => {
  const task = 'Linha 1\nLinha "2" com %PATH% & emoji 🚀'

  const result = validateLaunchInput({ task, cwd: '/tmp/x' }, fsOk)

  assert.equal(result.ok, true)
  assert.equal(result.task, task)
})

test('recusa pasta inexistente, arquivo no lugar de pasta e pasta vazia', () => {
  for (const cwd of ['/nao/existe', '/tmp/arquivo.txt', '', undefined]) {
    const result = validateLaunchInput({ task: 'Tarefa', cwd }, fsOk)

    assert.equal(result.ok, false, `deveria recusar ${JSON.stringify(cwd)}`)
    assert.equal(result.code, 'invalid-input')
  }
})

test('valida follow-up: ID da sessão, texto e pasta', () => {
  const ok = validateFollowUpInput({ sessionId: ID, text: ' pronto? ', cwd: '/tmp/x' }, fsOk)

  assert.deepEqual(ok, { ok: true, sessionId: ID, text: 'pronto?', cwd: '/tmp/x' })
})

test('recusa follow-up com ID fora do formato, texto vazio ou longo demais', () => {
  const casos = [
    { sessionId: 'session_x;rm -rf', text: 'oi', cwd: '/tmp/x' },
    { sessionId: '../session_x', text: 'oi', cwd: '/tmp/x' },
    { sessionId: 'sessao_x', text: 'oi', cwd: '/tmp/x' },
    { sessionId: ID, text: '   ', cwd: '/tmp/x' },
    { sessionId: ID, text: 'a'.repeat(FOLLOW_UP_MAX + 1), cwd: '/tmp/x' },
    { sessionId: ID, text: 'oi', cwd: '/nao/existe' },
  ]

  for (const caso of casos) {
    const result = validateFollowUpInput(caso, fsOk)

    assert.equal(result.ok, false, `deveria recusar ${JSON.stringify(caso)}`)
    assert.equal(result.code, 'invalid-input')
  }
})

test('hasShellUnsafeChars acusa cada caractere que o cmd.exe reinterpreta', () => {
  for (const unsafe of ['%PATH%', 'a"b', 'a^b', 'a&b', 'a|b', 'a<b', 'a>b', 'a\nb', 'a\rb']) {
    assert.equal(hasShellUnsafeChars(unsafe), true, `deveria acusar ${JSON.stringify(unsafe)}`)
  }
})

test('hasShellUnsafeChars deixa passar texto comum com acento e pontuação simples', () => {
  assert.equal(hasShellUnsafeChars('Corrigir o bug do formulário (login), por favor.'), false)
})

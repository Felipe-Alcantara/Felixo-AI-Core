'use strict'
require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const paineis = require('./canvas-smoke-paineis.cjs')

test('todo check exportado entra na lista que a sessão J executa, sem repetição', () => {
  const exportados = Object.keys(paineis).filter((nome) => nome.startsWith('checar')).sort()
  const executados = paineis.CHECKS_DOS_PAINEIS.map((check) => check.name).sort()
  assert.deepEqual(executados, exportados)
  assert.equal(new Set(executados).size, executados.length)
})

test('a sessão J roda por padrão, aponta o seletor de pasta para a fixture e executa a lista', () => {
  const smoke = fs.readFileSync(path.join(__dirname, 'canvas-smoke.cjs'), 'utf8')
  assert.match(smoke, /'A,B,C,D,E,F,G,H,I,J,K'/)
  assert.match(smoke, /letter: 'J',[\s\S]{0,900}get env\(\) \{\s*return ambienteDosPaineis\(\)\s*\}[\s\S]{0,200}run: \(page\) => executarChecksDosPaineis\(page\)/)
})

test('o inventário cita cada check dos painéis (nenhum teste órfão)', () => {
  const dados = ['tools-agents.ts', 'tools-workspace.ts'].map((n) => fs.readFileSync(path.join(__dirname, '..', 'src/features/canvas/inventory/data', n), 'utf8')).join('\n')
  for (const check of paineis.CHECKS_DOS_PAINEIS) {
    assert.ok(dados.includes(`check: '${check.name}'`), `o inventário não cita ${check.name}`)
  }
})

test('a fixture de Git: repositório com remoto, uma alteração, um arquivo novo e uma branch extra', () => {
  const dir = paineis.criarRepositorioDeFixture()
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  try {
    assert.equal(git('branch', '--show-current'), 'main')
    assert.match(git('branch', '--list', 'outra'), /outra/)
    assert.match(git('remote', '-v'), /origin/)
    assert.deepEqual(git('status', '--short').split('\n').map((l) => l.trim()).sort(), ['?? novo.txt', 'M src/a.txt'])
    assert.equal(git('rev-list', '--count', 'origin/main..main'), '0')
    assert.equal(paineis.ambienteDosPaineis().FELIXO_DEVTOOLS_PROJECT_FOLDER, dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(`${dir}-remoto.git`, { recursive: true, force: true })
  }
})

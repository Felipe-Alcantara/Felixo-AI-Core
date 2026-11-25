'use strict'
require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { TAREFAS, scriptDosHandlers, titulos } = require('./canvas-smoke-notion-fixture.cjs')

test('a fixture tem três tarefas sem repositório, uma delas concluída', () => {
  const sem = TAREFAS.filter((tarefa) => !tarefa.fields['Repositório'])
  assert.equal(sem.length, 3)
  assert.deepEqual(sem.filter((tarefa) => tarefa.completed).map((tarefa) => tarefa.id), ['t5'])
  assert.equal(titulos((tarefa) => tarefa.completed).length, 2)
})

test('o script registra os cinco canais, cabe no limite do main-eval e a ligação é opcional', () => {
  const canais = []
  const ipc = { removeHandler() {}, handle: (canal) => canais.push(canal) }
  for (const relacao of [false, true]) {
    const script = scriptDosHandlers({ relacao })
    assert.ok(script.length < 20_000)
    canais.length = 0
    vm.runInNewContext(script, { mainWindow: { webContents: { ipc } } })
    assert.deepEqual(canais.sort(), [
      'notion:connections:list', 'notion:databases:list', 'notion:tasks:cached',
      'notion:tasks:content', 'notion:tasks:list',
    ])
    assert.equal(script.includes('"Projeto"'), relacao)
  }
})

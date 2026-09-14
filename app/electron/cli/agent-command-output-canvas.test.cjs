'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { formatarElementos, formatarLeitura } = require('./agent-command-output.cjs')

test('formatarElementos avisa quando o canvas está vazio', () => {
  assert.equal(formatarElementos([]), 'Nenhum elemento neste canvas.')
  assert.equal(formatarElementos(undefined), 'Nenhum elemento neste canvas.')
})

test('formatarElementos lista id, tipo e rótulo de cada elemento', () => {
  const texto = formatarElementos([
    { id: 't1', type: 'terminal', label: 'Claude · local', leituraSuportada: true },
  ])
  assert.match(texto, /1 elemento\(s\)/)
  assert.match(texto, /t1\s+\[terminal\]\s+Claude · local/)
})

test('formatarElementos marca elemento sem leitura suportada', () => {
  const texto = formatarElementos([{ id: 'p1', type: 'webpage', label: 'https://example.com', leituraSuportada: false }])
  assert.match(texto, /leitura ainda não suportada/)
})

test('formatarLeitura: sucesso mostra rótulo, tipo e conteúdo', () => {
  const texto = formatarLeitura({ ok: true, id: 't1', type: 'terminal', label: 'Claude · local', content: 'linha1\nlinha2' })
  assert.match(texto, /Claude · local \[terminal\]/)
  assert.match(texto, /linha1\nlinha2/)
})

test('formatarLeitura: conteúdo vazio mostra um placeholder, não uma seção em branco', () => {
  const texto = formatarLeitura({ ok: true, id: 't1', type: 'terminal', label: 'Shell', content: '' })
  assert.match(texto, /\(vazio\)/)
})

test('formatarLeitura: mensagem extra (ex.: "sem saída registrada") aparece depois do conteúdo', () => {
  const texto = formatarLeitura({ ok: true, id: 't1', type: 'terminal', label: 'Shell', content: '', message: 'Terminal sem saída registrada ainda.' })
  assert.match(texto, /sem saída registrada/)
})

test('formatarLeitura: falha mostra a mensagem de erro, não um conteúdo vazio', () => {
  const texto = formatarLeitura({ ok: false, id: 'x', message: 'Nenhum elemento com id "x" neste canvas.' })
  assert.match(texto, /Não foi possível ler "x"/)
  assert.match(texto, /Nenhum elemento com id/)
})

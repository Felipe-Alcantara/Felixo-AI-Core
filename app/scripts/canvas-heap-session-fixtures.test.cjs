'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { collectDescendantPids, fixtureWebpageHtml, parsePsOutput, summarizeRss } = require('./canvas-heap-session-fixtures.cjs')

test('parsePsOutput lê pid/ppid/rss/comm e ignora linhas em branco', () => {
  const output = '  1000   1  204800 electron\n1001 1000 51200 electron (Renderer)\n\n'
  assert.deepEqual(parsePsOutput(output), [
    { pid: 1000, ppid: 1, rssKb: 204800, comm: 'electron' },
    { pid: 1001, ppid: 1000, rssKb: 51200, comm: 'electron (Renderer)' },
  ])
})

test('parsePsOutput ignora linhas que não batem com o formato esperado', () => {
  assert.deepEqual(parsePsOutput('cabeçalho estranho\n1000 1 2048 ok'), [
    { pid: 1000, ppid: 1, rssKb: 2048, comm: 'ok' },
  ])
})

test('collectDescendantPids encontra netos (PTY encadeado por processo utility) via BFS', () => {
  const processes = [
    { pid: 1, ppid: 0, rssKb: 0, comm: 'init' },
    { pid: 100, ppid: 1, rssKb: 0, comm: 'electron' },
    { pid: 101, ppid: 100, rssKb: 0, comm: 'electron (Renderer)' },
    { pid: 102, ppid: 100, rssKb: 0, comm: 'electron (Utility)' },
    { pid: 200, ppid: 102, rssKb: 0, comm: 'bash' },
    { pid: 999, ppid: 1, rssKb: 0, comm: 'processo-nao-relacionado' },
  ]
  const descendants = collectDescendantPids(100, processes)
  assert.deepEqual([...descendants].sort((a, b) => a - b), [100, 101, 102, 200])
})

test('collectDescendantPids devolve só a raiz quando ela não tem filhos', () => {
  assert.deepEqual(collectDescendantPids(42, []), new Set([42]))
})

test('summarizeRss soma só os pids do conjunto e agrupa por comm, ordenado do maior pro menor', () => {
  const processes = [
    { pid: 1, ppid: 0, rssKb: 100000, comm: 'electron' },
    { pid: 2, ppid: 1, rssKb: 50000, comm: 'electron (Renderer)' },
    { pid: 3, ppid: 1, rssKb: 10000, comm: 'bash' },
    { pid: 4, ppid: 1, rssKb: 10000, comm: 'bash' },
    { pid: 999, ppid: 0, rssKb: 999999, comm: 'fora-do-conjunto' },
  ]
  const summary = summarizeRss(processes, new Set([1, 2, 3, 4]))
  assert.equal(summary.totalKb, 170000)
  assert.equal(summary.totalMiB, 166.0)
  assert.equal(summary.processCount, 4)
  assert.deepEqual(summary.byComm, { electron: 100000, 'electron (Renderer)': 50000, bash: 20000 })
})

test('fixtureWebpageHtml gera HTML autocontido sem dependência de rede, com o rótulo embutido', () => {
  const html = fixtureWebpageHtml('webview-teste-3')
  assert.match(html, /<title>webview-teste-3<\/title>/)
  assert.match(html, /<h1>webview-teste-3<\/h1>/)
  assert.doesNotMatch(html, /https?:\/\//)
  assert.match(html, /setInterval/)
})

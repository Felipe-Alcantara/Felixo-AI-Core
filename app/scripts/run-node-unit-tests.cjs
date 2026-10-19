'use strict'

/**
 * Executa os testes Node que não dependem de um runner com uma PTY nativa.
 *
 * As integrações de node-pty ficam no comando `test:native`, pois precisam
 * rodar separadamente em Linux, macOS e Windows/ConPTY. Manter a descoberta
 * aqui em Node, em vez de `find`/glob do shell, preserva o mesmo contrato no
 * Windows e nos sistemas POSIX.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const RAIZES = ['electron', 'scripts']

function listarTestes(diretorio) {
  const entradas = fs.readdirSync(diretorio, { withFileTypes: true })
  const arquivos = []

  for (const entrada of entradas) {
    const caminho = path.join(diretorio, entrada.name)
    if (entrada.isDirectory()) {
      arquivos.push(...listarTestes(caminho))
      continue
    }

    if (
      entrada.isFile() &&
      entrada.name.endsWith('.test.cjs') &&
      !entrada.name.endsWith('.integration.test.cjs')
    ) {
      arquivos.push(caminho)
    }
  }

  return arquivos
}

/**
 * `NODE_OPTIONS` com a pré-carga do SQLite sem fsync: vale para o runner, para
 * cada arquivo de teste e para os processos filhos que os testes criam (os
 * testes de vários processos abrem o banco em workers). Barras normais e aspas:
 * o Node lê `\` dentro de aspas como escape, e o caminho do Windows o perderia.
 */
function nodeOptionsComPreCarga(atual) {
  const preCarga = path.resolve(__dirname, 'test-support', 'sqlite-sem-fsync.cjs').replace(/\\/g, '/')
  return [atual, `--require "${preCarga}"`].filter(Boolean).join(' ')
}

const testes = RAIZES.flatMap((raiz) => listarTestes(path.resolve(raiz))).sort()

if (testes.length === 0) {
  console.error('[test] nenhum teste Node unitário foi encontrado')
  process.exitCode = 1
} else {
  const resultado = spawnSync(
    process.execPath,
    ['--test', ...testes.map((arquivo) => path.relative(process.cwd(), arquivo))],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: nodeOptionsComPreCarga(process.env.NODE_OPTIONS) },
    },
  )

  if (resultado.error) {
    console.error(`[test] não foi possível iniciar o runner: ${resultado.error.message}`)
    process.exitCode = 1
  } else {
    process.exitCode = resultado.status ?? 1
  }
}

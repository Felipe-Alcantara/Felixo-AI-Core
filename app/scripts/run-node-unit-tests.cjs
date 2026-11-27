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
const {
  criarTemporario,
  descartarTemporario,
  descreverSobras,
} = require('./test-support/temporario-dos-testes.cjs')
const { VARIAVEL } = require('./test-support/prazo-por-arquivo.cjs')

const RAIZES = ['electron', 'scripts']

// Tetos contra teste que nunca termina. O do arquivo é ~5x o mais lento medido
// (63 s numa máquina carregada, 27/11/2026; no CI o maior teste leva 11 s). O da
// suíte fica abaixo do passo `Test` do CI (15 min) e só vale se o próprio runner
// parar, porque cada arquivo já tem o seu.
const PRAZO_ARQUIVO_MS = Number(process.env[VARIAVEL]) || 5 * 60_000
const PRAZO_SUITE_MS = Number(process.env.FELIXO_TEST_TOTAL_TIMEOUT_MS) || 12 * 60_000

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
 * `NODE_OPTIONS` com as pré-cargas (SQLite sem fsync e prazo por arquivo): vale
 * para o runner, para cada arquivo de teste e para os processos filhos que os
 * testes criam (os testes de vários processos abrem o banco em workers). Barras
 * normais e aspas: o Node lê `\` dentro de aspas como escape, e o caminho do
 * Windows o perderia.
 */
function nodeOptionsComPreCarga(atual) {
  const preCargas = ['sqlite-sem-fsync.cjs', 'prazo-por-arquivo.cjs'].map(
    (nome) => `--require "${path.resolve(__dirname, 'test-support', nome).replace(/\\/g, '/')}"`,
  )
  return [atual, ...preCargas].filter(Boolean).join(' ')
}

const testes = RAIZES.flatMap((raiz) => listarTestes(path.resolve(raiz))).sort()

if (testes.length === 0) {
  console.error('[test] nenhum teste Node unitário foi encontrado')
  process.exitCode = 1
} else {
  // Pasta temporária só desta execução (ver `test-support/temporario-dos-testes.cjs`):
  // o que os testes não limparem some junto com ela, em vez de ficar no sistema.
  const temporario = criarTemporario()
  const resultado = spawnSync(
    process.execPath,
    ['--test', ...testes.map((arquivo) => path.relative(process.cwd(), arquivo))],
    {
      stdio: 'inherit',
      timeout: PRAZO_SUITE_MS,
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
        TEMP: temporario,
        TMP: temporario,
        TMPDIR: temporario,
        NODE_OPTIONS: nodeOptionsComPreCarga(process.env.NODE_OPTIONS),
        [VARIAVEL]: String(PRAZO_ARQUIVO_MS),
      },
    },
  )
  const sobras = descreverSobras(descartarTemporario(temporario), temporario)
  if (sobras) console.log(sobras)

  if (resultado.error?.code === 'ETIMEDOUT') {
    console.error(
      `[test] a suíte passou de ${PRAZO_SUITE_MS / 1000} s e foi encerrada; os arquivos sem resultado acima são os que não terminaram`,
    )
    process.exitCode = 1
  } else if (resultado.error) {
    console.error(`[test] não foi possível iniciar o runner: ${resultado.error.message}`)
    process.exitCode = 1
  } else {
    process.exitCode = resultado.status ?? 1
  }
}

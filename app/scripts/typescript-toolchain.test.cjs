'use strict'

/**
 * Prova a fiação "lado a lado" do TypeScript em cada SO da matriz da CI:
 * o `tsc` que o npm executa é o TypeScript 7 e `require('typescript')` é a
 * API do 6 que o typescript-eslint consome. Não usa rede: lê o link/shim de
 * node_modules/.bin e roda `npm exec -- tsc -v`, que só resolve o bin local.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const crossSpawn = require('cross-spawn')

const toolchain = require('./typescript-toolchain.cjs')

const DIRETORIO_BIN = path.join(toolchain.APP_ROOT, 'node_modules', '.bin')

// Conteúdo real gerado para o bin `tsc` do @typescript/native pelo cmd-shim
// do npm 10.9 (cmd-shim 7.0.0) e do npm 11 (cmd-shim 8.0.0) — idêntico nos
// dois; mantém o parser do Windows testado em qualquer SO.
const SHIM_CMD_TSC =
  '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\n' +
  'SETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n' +
  '  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n' +
  '  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\n' +
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  ' +
  '"%dp0%\\..\\@typescript\\native\\bin\\tsc" %*\r\n'

/**
 * Roda `npm exec -- tsc -v` no app com o mesmo npm que executa o teste
 * (npm_execpath, sem depender de shell); fora do npm, usa o `npm` do PATH.
 * As opções de exec herdadas de um npm externo (`npm exec -c ...` ou
 * `--package`) mudariam o comando interno, então saem do ambiente do filho.
 */
function executarTscViaNpm() {
  const argumentos = ['exec', '--', 'tsc', '-v']
  const env = { ...process.env }
  for (const chave of Object.keys(env)) {
    if (/^npm_config_(call|package)$/i.test(chave)) delete env[chave]
  }
  const opcoes = { cwd: toolchain.APP_ROOT, encoding: 'utf8', env, timeout: 120_000 }
  const npmCli = process.env.npm_execpath
  if (npmCli && /npm-cli\.js$/.test(npmCli)) {
    return spawnSync(process.execPath, [npmCli, ...argumentos], opcoes)
  }
  return crossSpawn.sync('npm', argumentos, opcoes)
}

describe('parser do shim .cmd do npm (Windows)', () => {
  it('extrai o alvo, não o interpretador node.exe', () => {
    assert.equal(
      toolchain.extrairAlvoDoShimCmd(SHIM_CMD_TSC),
      '..\\@typescript\\native\\bin\\tsc',
    )
  })

  it('resolve o alvo com semântica de caminho do Windows', () => {
    assert.equal(
      toolchain.resolverAlvoDoShimCmd(SHIM_CMD_TSC, 'C:\\app\\node_modules\\.bin'),
      'C:\\app\\node_modules\\@typescript\\native\\bin\\tsc',
    )
  })

  it('devolve null para conteúdo sem alvo reconhecível', () => {
    assert.equal(toolchain.extrairAlvoDoShimCmd('@ECHO off\r\n'), null)
    assert.equal(toolchain.resolverAlvoDoShimCmd('', 'C:\\app\\node_modules\\.bin'), null)
  })
})

describe('fiação instalada em node_modules', () => {
  it('node_modules/.bin/tsc aponta para o TypeScript 7 (@typescript/native)', () => {
    const alvo = toolchain.resolverAlvoDoBinNpm(DIRETORIO_BIN, 'tsc')
    const dono = toolchain.pacoteDono(alvo)

    assert.ok(dono, `sem package.json acima de ${alvo}`)
    assert.equal(
      toolchain.versaoMaior(dono.version),
      7,
      `o bin tsc pertence a ${dono.name}@${dono.version} em ${dono.diretorio}; ` +
        'o alias do TS 7 precisa vencer o conflito de bin (microsoft/typescript-go#4567)',
    )
    assert.equal(alvo, fs.realpathSync(toolchain.caminhoDoCompilador()))
  })

  it('o tsc que o npm executa imprime a versão 7', () => {
    const resultado = executarTscViaNpm()

    // spawnSync devolve error undefined e o cross-spawn, null, quando o
    // processo inicia; ifError aceita os dois e falha em qualquer erro real.
    assert.ifError(resultado.error)
    assert.equal(resultado.status, 0, `${resultado.stdout}\n${resultado.stderr}`)
    const versao = /Version (\d+\.\d+\.\d+)/.exec(resultado.stdout)?.[1]
    assert.ok(versao, `saída inesperada do tsc: ${resultado.stdout}`)
    assert.equal(versao, toolchain.versaoDoCompilador())
    assert.equal(toolchain.versaoMaior(versao), 7)
  })

  it("require('typescript') entrega a API do TypeScript 6", () => {
    assert.equal(toolchain.versaoMaior(toolchain.versaoDaApi()), 6)
  })

  it('o typescript-eslint resolve a mesma API do 6', () => {
    const estree = require.resolve('@typescript-eslint/typescript-estree', {
      paths: [toolchain.APP_ROOT],
    })
    const doLinter = require.resolve('typescript', { paths: [path.dirname(estree)] })
    const doApp = require.resolve('typescript', { paths: [toolchain.APP_ROOT] })

    assert.equal(doLinter, doApp)
    assert.equal(toolchain.versaoMaior(require(doLinter).version), 6)
  })
})

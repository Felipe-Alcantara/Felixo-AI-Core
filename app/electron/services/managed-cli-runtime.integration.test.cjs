'use strict'

/**
 * Integração real no Windows: o `node.cmd` que o app gera tem de funcionar com
 * acento no caminho do executável quando o console está na página de código OEM
 * (cp850 no Windows em português, cp437 no em inglês).
 *
 * Por que existe: o `.cmd` é gravado em UTF-8 e o `cmd.exe` o lê na página OEM,
 * então `C:\Users\João\...` virava "O sistema não pode encontrar o caminho
 * especificado" (medido em 21/10/2026). O teste copia o Node para uma pasta com
 * acento, gera o atalho de verdade e o chama sob `chcp 850` e `chcp 437`,
 * conferindo a saída, o código de saída e a página de código depois da chamada.
 *
 * Só no Windows: é onde o `cmd.exe` lê o atalho.
 */

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const { removeTreeSync } = require('../../scripts/build-output.cjs')
const { ensureManagedCliRuntime } = require('./managed-cli-runtime.cjs')

const SUPORTADO = process.platform === 'win32'
const CODIGO_DE_SAIDA_DA_SONDA = 7

// Sem espaço nos nomes: o `cmd /c` e as aspas do Node não se entendem com vários argumentos entre aspas.
function montarInstalacao() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-sonda-atalho-'))
  const programa = path.join(raiz, 'Programação-João')
  const runtimeBin = path.join(raiz, 'runtime-bin')
  fs.mkdirSync(programa, { recursive: true })

  // O Node de verdade faz o papel do Electron-como-Node: o que se prova aqui é a leitura do `.cmd`.
  const executavel = path.join(programa, 'felixo-ação.exe')
  fs.copyFileSync(process.execPath, executavel)

  const sonda = path.join(raiz, 'sonda.cjs')
  fs.writeFileSync(sonda, `console.log('sonda-ok'); process.exit(${CODIGO_DE_SAIDA_DA_SONDA})\n`)

  // O driver só tem ASCII: ele fixa a página, chama o atalho e mostra a página que sobrou.
  const driver = path.join(raiz, 'driver.cmd')
  fs.writeFileSync(
    driver,
    ['@echo off', 'chcp %1 >nul', 'call "%~2" "%~3"', 'set "RC=%errorlevel%"', 'chcp', 'exit /b %RC%', ''].join('\r\n'),
  )

  const shims = ensureManagedCliRuntime({
    layout: { root: raiz, packagesBin: path.join(raiz, 'bin'), runtimeBin },
    nodeExecutable: executavel,
    platformName: 'win32',
  })

  return { raiz, driver, sonda, shim: shims.node }
}

for (const pagina of [850, 437]) {
  test(`node.cmd roda com acento no caminho do executável sob chcp ${pagina} e devolve a página e o código de saída`, { skip: !SUPORTADO }, () => {
    const { raiz, driver, sonda, shim } = montarInstalacao()

    try {
      const resultado = spawnSync('cmd.exe', ['/d', '/c', driver, String(pagina), shim, sonda], {
        encoding: 'latin1',
        windowsHide: true,
        timeout: 30_000,
      })

      assert.match(resultado.stdout, /sonda-ok/, `saída: ${JSON.stringify(resultado.stdout)} erro: ${JSON.stringify(resultado.stderr)}`)
      assert.equal(resultado.status, CODIGO_DE_SAIDA_DA_SONDA)
      // A última linha é a do `chcp` do driver, depois do atalho: tem de ser a página de antes.
      assert.equal(Number(/(\d+)\s*$/.exec(resultado.stdout)?.[1]), pagina)
    } finally {
      removeTreeSync(raiz)
      assert.equal(fs.existsSync(raiz), false, `a pasta temporária não foi apagada: ${raiz}`)
    }
  })
}

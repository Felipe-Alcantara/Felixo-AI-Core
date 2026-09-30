import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildContextFileReferences } from './context-file-delivery'

/**
 * A linha de leitura que o agente copia roda de verdade no shell de cada
 * sistema: teste de string não prova que as aspas funcionam. O comando
 * `felixo` daqui é um falso, numa pasta com espaço e acento, que só imprime os
 * argumentos que recebeu. A CI roda este arquivo no Linux, no macOS e no
 * Windows (onde o PowerShell, o `cmd.exe` e o Git Bash existem no runner).
 */

const NAME = 'felixo-context-1-catalog-prompt.txt'
const ARGS_PRINTED = /\[context\] \[read\] \["?felixo-context-1-catalog-prompt\.txt"?\]/

const tempDirs: string[] = []
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
})

/** Pasta com espaço e acento, como a de uma pessoa chamada "Ana Maria". */
function fakeBinDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo shell '))
  tempDirs.push(root)
  const bin = path.join(root, 'Área de trabalho', 'bin')
  fs.mkdirSync(bin, { recursive: true })
  return bin
}

/** O texto depois de `  <rótulo>: ` na referência gerada. */
function lineAfter(text: string, label: string): string {
  const line = text.split('\n').find((candidate) => candidate.startsWith(`  ${label}: `))
  if (!line) throw new Error(`linha "${label}" ausente em:\n${text}`)
  return line.slice(`  ${label}: `.length)
}

function references(commandPath: string): string {
  return buildContextFileReferences([{ name: NAME, kind: 'catalog-prompt' }], false, commandPath)
}

describe.runIf(process.platform !== 'win32')('linha de leitura no POSIX', () => {
  it('o sh roda o caminho entre aspas numa pasta com espaço e acento', () => {
    const felixo = path.join(fakeBinDir(), 'felixo')
    fs.writeFileSync(felixo, '#!/bin/sh\nfor arg in "$@"; do printf "[%s] " "$arg"; done\n', { mode: 0o755 })

    const text = references(felixo)
    expect(text).not.toContain('No PowerShell')
    const output = execFileSync('sh', ['-c', lineAfter(text, 'Leia com')], { encoding: 'utf8' })
    expect(output).toMatch(ARGS_PRINTED)
  })
})

describe.runIf(process.platform === 'win32')('linha de leitura no Windows', () => {
  // No `beforeAll`: o corpo do `describe` roda até quando o bloco é pulado.
  let text = ''
  beforeAll(() => {
    const felixo = path.join(fakeBinDir(), 'felixo.cmd')
    fs.writeFileSync(felixo, '@echo off\r\necho [%~1] [%~2] [%~3]\r\n')
    text = references(felixo)
  })

  it('o cmd.exe roda a linha comum', () => {
    // `/s /c "<linha>"`: o cmd tira só as aspas de fora e roda a linha como foi escrita.
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `"${lineAfter(text, 'Leia com')}"`], {
      encoding: 'utf8',
      windowsVerbatimArguments: true,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toMatch(ARGS_PRINTED)
  })

  it('o PowerShell roda a linha com & e recusa a linha comum', () => {
    const run = (line: string) =>
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', line], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    expect(run(lineAfter(text, 'No PowerShell'))).toMatch(ARGS_PRINTED)
    // Sem o &, o caminho entre aspas é uma string e "context" um token inesperado.
    expect(() => run(lineAfter(text, 'Leia com'))).toThrow()
  })

  const gitBash = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
  it.runIf(fs.existsSync(gitBash))('o Git Bash roda a linha comum', () => {
    const output = execFileSync(gitBash, ['-c', lineAfter(text, 'Leia com')], { encoding: 'utf8' })
    expect(output).toMatch(ARGS_PRINTED)
  })
})

'use strict'

/**
 * Matriz de rotas de instalação × forma de interromper, com PROCESSO REAL.
 *
 * O PR #84 deu ao npm a garantia de que cancelar ou estourar o prazo encerra a
 * árvore inteira, não só o processo imediato. O catálogo também instala por
 * Python (pip) e o instalador aceita qualquer script; estas rotas passam por
 * `runBufferedCommand`, que antes só matava o filho direto. Aqui as três rotas
 * sobem um processo que sobe um neto de verdade, e a sonda confere pid a pid —
 * fora do código testado — que ninguém sobra.
 *
 * Cada rota tem um controle: o mesmo cenário com um kill que mata só o processo
 * imediato PRECISA deixar o neto vivo. Sem isso, um teste que passa não prova
 * que enxerga o defeito (no Windows, o job object do libuv derruba netos de um
 * processo Node junto com ele, então o controle também protege contra isso).
 */

const { describe, it, after } = require('node:test')
const assert = require('node:assert/strict')
const crossSpawn = require('cross-spawn')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { runBufferedCommand } = require('./official-cli-service.cjs')
const { runCommand: runManagedCommand } = require('./managed-cli-installer.cjs')
const { killProcessTree } = require('../core/process-tree.cjs')

const WINDOWS = process.platform === 'win32'
/** Prazo do cenário `timeout`: folga para o processo e o neto subirem em máquina lenta. */
const TIMEOUT_MS = 5_000
/** O padrão de 2 s do POSIX só atrasaria a suíte; o que importa é a ordem SIGTERM → SIGKILL. */
const GRACE_MS = 200

const FIXTURE_NODE = `
const { spawn } = require('node:child_process')
const fs = require('node:fs')
// No Windows o neto precisa escapar do job object do libuv; senão ele morre junto
// com este processo e a sonda deixaria de enxergar o defeito.
const neto = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
  stdio: 'ignore',
  windowsHide: true,
  detached: process.platform === 'win32',
})
fs.writeFileSync(process.env.FELIXO_PID_FILE + '.neto', String(neto.pid))
fs.writeFileSync(process.env.FELIXO_PID_FILE, String(process.pid))
setTimeout(() => {}, 60000)
`

const FIXTURE_PYTHON = `
import os, subprocess, sys, time
neto = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
with open(os.environ['FELIXO_PID_FILE'] + '.neto', 'w') as arquivo:
    arquivo.write(str(neto.pid))
with open(os.environ['FELIXO_PID_FILE'], 'w') as arquivo:
    arquivo.write(str(os.getpid()))
time.sleep(60)
`

const SCRIPT_WINDOWS = '@echo off\r\n"%FELIXO_NODE%" "%FELIXO_FIXTURE%"\r\n'
const SCRIPT_POSIX = '#!/bin/sh\n"$FELIXO_NODE" "$FELIXO_FIXTURE"\n'

const PYTHON = findPython()
const diretorios = []

after(() => {
  for (const dir of diretorios) fs.rmSync(dir, { recursive: true, force: true })
})

function findPython() {
  const candidatos = WINDOWS ? ['py', 'python', 'python3'] : ['python3', 'python']
  for (const comando of candidatos) {
    const resultado = spawnSync(comando, ['-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
      timeout: 15_000,
    })
    if (resultado.status === 0 && resultado.stdout.trim() === '3') return comando
  }
  return null
}

function estaVivo(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function esperar(condicao, { timeoutMs = 8_000, intervalMs = 40 } = {}) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    if (condicao()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return Boolean(condicao())
}

/** Limpeza do próprio teste: nunca depende do código testado. */
function matar(pid) {
  if (!pid || !estaVivo(pid)) return
  try {
    if (WINDOWS) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(pid, 'SIGKILL')
  } catch {
    // Já saiu entre a conferência e o kill.
  }
}

const killRapido = (opcoes) => killProcessTree({ ...opcoes, graceMs: GRACE_MS })
/** O defeito de antes: derruba só o processo imediato. */
const killSoOImediato = async ({ pid }) => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Já morto.
  }
}

function criarCenario() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-rotas-'))
  diretorios.push(dir)
  const arquivos = {
    pidFile: path.join(dir, 'processo.pid'),
    fixtureNode: path.join(dir, 'neto.cjs'),
    fixturePython: path.join(dir, 'neto.py'),
    script: path.join(dir, WINDOWS ? 'instalar.cmd' : 'instalar.sh'),
  }
  fs.writeFileSync(arquivos.fixtureNode, FIXTURE_NODE)
  fs.writeFileSync(arquivos.fixturePython, FIXTURE_PYTHON)
  fs.writeFileSync(arquivos.script, WINDOWS ? SCRIPT_WINDOWS : SCRIPT_POSIX, { mode: 0o755 })
  const env = {
    ...process.env,
    FELIXO_PID_FILE: arquivos.pidFile,
    FELIXO_NODE: process.execPath,
    FELIXO_FIXTURE: arquivos.fixtureNode,
  }
  return { dir, env, ...arquivos }
}

const ROTAS = [
  {
    nome: 'npm (instalador gerenciado)',
    pular: false,
    rodar: (cenario, opcoes) =>
      runManagedCommand({
        command: process.execPath,
        args: [cenario.fixtureNode],
        env: cenario.env,
        cwd: cenario.dir,
        spawn: crossSpawn,
        platformName: process.platform,
        successMessage: 'instalado',
        failureMessage: 'Nao foi possivel instalar.',
        ...opcoes,
      }),
  },
  {
    nome: 'Python (pip)',
    pular: PYTHON ? false : 'sem Python 3 nesta máquina',
    rodar: (cenario, opcoes) =>
      runBufferedCommand({
        command: PYTHON,
        args: [cenario.fixturePython],
        env: cenario.env,
        cwd: cenario.dir,
        ...opcoes,
      }),
  },
  {
    nome: 'script (.cmd / .sh)',
    pular: false,
    rodar: (cenario, opcoes) =>
      runBufferedCommand({
        command: cenario.script,
        args: [],
        env: cenario.env,
        cwd: cenario.dir,
        ...opcoes,
      }),
  },
]

/** Espera o processo e o neto subirem e devolve os dois pids lidos do disco. */
async function esperarArvore(cenario) {
  const subiu = await esperar(
    () => fs.existsSync(cenario.pidFile) && fs.existsSync(`${cenario.pidFile}.neto`),
    { timeoutMs: 10_000 },
  )
  assert.ok(subiu, 'o processo de instalação não subiu o neto a tempo')
  const pids = {
    processo: Number(fs.readFileSync(cenario.pidFile, 'utf8')),
    neto: Number(fs.readFileSync(`${cenario.pidFile}.neto`, 'utf8')),
  }
  assert.ok(estaVivo(pids.processo) && estaVivo(pids.neto), 'a árvore deveria estar viva antes de interromper')
  return pids
}

for (const rota of ROTAS) {
  describe(`rota de instalação: ${rota.nome}`, { skip: rota.pular }, () => {
    it('o prazo vencido encerra a árvore inteira (processo e neto) e diz que foi o tempo', async () => {
      const cenario = criarCenario()
      let pids = {}
      try {
        const execucao = rota.rodar(cenario, { timeoutMs: TIMEOUT_MS, killTree: killRapido })
        pids = await esperarArvore(cenario)
        const resultado = await execucao

        assert.equal(resultado.ok, false)
        assert.equal(resultado.timedOut, true)
        assert.notEqual(resultado.cancelled, true)
        assert.ok(await esperar(() => !estaVivo(pids.processo)), 'o processo de instalação sobrou')
        assert.ok(await esperar(() => !estaVivo(pids.neto)), 'o neto ficou órfão depois do prazo')
      } finally {
        matar(pids.neto)
        matar(pids.processo)
      }
    })

    it('cancelar encerra a árvore inteira (processo e neto) e devolve cancelled', async () => {
      const cenario = criarCenario()
      const controlador = new AbortController()
      let pids = {}
      try {
        const execucao = rota.rodar(cenario, {
          timeoutMs: 60_000,
          killTree: killRapido,
          signal: controlador.signal,
        })
        pids = await esperarArvore(cenario)
        controlador.abort()
        const resultado = await execucao

        assert.equal(resultado.ok, false)
        assert.equal(resultado.cancelled, true)
        assert.notEqual(resultado.timedOut, true)
        assert.ok(await esperar(() => !estaVivo(pids.processo)), 'o processo de instalação sobrou')
        assert.ok(await esperar(() => !estaVivo(pids.neto)), 'o neto ficou órfão depois de cancelar')
      } finally {
        matar(pids.neto)
        matar(pids.processo)
      }
    })

    it('controle: matar só o processo imediato deixa o neto vivo (a sonda enxerga o defeito)', async () => {
      const cenario = criarCenario()
      const controlador = new AbortController()
      let pids = {}
      try {
        const execucao = rota.rodar(cenario, {
          timeoutMs: 60_000,
          killTree: killSoOImediato,
          signal: controlador.signal,
        })
        pids = await esperarArvore(cenario)
        controlador.abort()
        await execucao

        // O neto só pode morrer sozinho (60 s); dentro desta janela ele sobra.
        await new Promise((resolve) => setTimeout(resolve, 600))
        assert.ok(
          estaVivo(pids.neto) || estaVivo(pids.processo),
          'com o kill antigo nada sobrou: o cenário não discrimina o defeito',
        )
      } finally {
        matar(pids.neto)
        matar(pids.processo)
      }
    })
  })
}

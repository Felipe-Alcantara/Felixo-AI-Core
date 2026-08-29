'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  registerCliAutoInstallHandlers,
} = require('./cli-auto-install.cjs')
Module._load = originalLoad

/**
 * Monta um perfil isolado com o layout que o app usa em disco.
 *
 * `managedClis` são as CLIs cujo executável já está lá — a prova de que a
 * instalação anterior continua valendo.
 */
function createProfile({ managedClis = [], state = {} } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-auto-install-'))
  const binDir = path.join(userData, 'clis', 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.mkdirSync(path.join(userData, 'config'), { recursive: true })

  for (const cli of managedClis) {
    fs.writeFileSync(path.join(binDir, cli), '#!/bin/sh\n', 'utf8')
  }

  fs.writeFileSync(
    path.join(userData, 'config', 'cli-auto-install.json'),
    JSON.stringify(state),
    'utf8',
  )

  return {
    userData,
    appPaths: { userData, config: path.join(userData, 'config') },
    cleanup: () => fs.rmSync(userData, { recursive: true, force: true }),
  }
}

function createRunner(profile, { detect, appVersion = '0.1.103' }) {
  const installed = []

  const service = registerCliAutoInstallHandlers(() => null, {
    appPaths: profile.appPaths,
    appVersion,
    isPackaged: true,
    detect,
    installPackage: async ({ npmPackage }) => {
      installed.push(npmPackage)
      return { ok: true, message: `${npmPackage} instalado.`, output: '' }
    },
  })

  return { service, installed }
}

/**
 * Garante que a rodada chegou a planejar.
 *
 * Sem npm resolvido o serviço sai cedo com erro e nada é instalado — um
 * "não instalou" que passaria nos testes pelo motivo errado.
 */
function assertPlanned(status) {
  assert.notEqual(
    status.state,
    'error',
    `a rodada terminou em erro: ${status.message}`,
  )
  assert.ok(status.clis.length > 0, 'a rodada não chegou a planejar nenhuma CLI')
}

/** Só o que importa para o plano; o resto do catálogo não é usado aqui. */
function detectedOnly(ids) {
  return async (cli) => ({ detected: ids.includes(cli.id), version: '1.0.0' })
}

test(
  'atualizar o app não faz reinstalar a CLI que já foi instalada',
  { skip: process.platform === 'win32' ? 'layout de bin difere no Windows' : false },
  async () => {
    // O caso relatado: o app publica uma versão por push, então o registro de
    // sucesso amarrado à versão nunca valia na abertura seguinte.
    const profile = createProfile({
      managedClis: ['claude', 'gemini'],
      state: {
        claude: { version: '0.1.55', ok: true, message: 'instalado' },
        gemini: { version: '0.1.86', ok: true, message: 'instalado' },
      },
    })

    try {
      const { service, installed } = createRunner(profile, {
        detect: detectedOnly(['codex']),
        appVersion: '0.1.103',
      })

      assertPlanned(await service.run('startup'))
      service.stop()

      assert.deepEqual(installed, [])
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'uma detecção que falha e acerta na segunda tentativa não gera instalação',
  { skip: process.platform === 'win32' ? 'layout de bin difere no Windows' : false },
  async () => {
    // A detecção roda logo depois da abertura e uma CLI lenta estoura o tempo
    // limite; sem a segunda chance ela passava por ausente e era reinstalada.
    const profile = createProfile()
    const seen = new Set()

    try {
      const { service, installed } = createRunner(profile, {
        detect: async (cli) => {
          const first = !seen.has(cli.id)
          seen.add(cli.id)
          return { detected: !first, version: '1.0.0' }
        },
      })

      assertPlanned(await service.run('startup'))
      service.stop()

      assert.deepEqual(installed, [])
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'reinstala quando o executável que instalamos sumiu do disco',
  { skip: process.platform === 'win32' ? 'layout de bin difere no Windows' : false },
  async () => {
    const profile = createProfile({
      managedClis: [],
      state: { gemini: { version: '0.1.86', ok: true, message: 'instalado' } },
    })

    try {
      const { service, installed } = createRunner(profile, {
        detect: detectedOnly(['codex', 'claude']),
      })

      assertPlanned(await service.run('startup'))
      service.stop()

      assert.deepEqual(installed, ['@google/gemini-cli'])
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'a falha registrada continua valendo só para a versão em que aconteceu',
  { skip: process.platform === 'win32' ? 'layout de bin difere no Windows' : false },
  async () => {
    const profile = createProfile({
      state: { gemini: { version: '0.1.103', ok: false, message: 'sem rede' } },
    })

    try {
      const mesmaVersao = createRunner(profile, {
        detect: detectedOnly(['codex', 'claude']),
        appVersion: '0.1.103',
      })
      assertPlanned(await mesmaVersao.service.run('startup'))
      mesmaVersao.service.stop()
      assert.deepEqual(mesmaVersao.installed, [])

      const versaoNova = createRunner(profile, {
        detect: detectedOnly(['codex', 'claude']),
        appVersion: '0.1.104',
      })
      assertPlanned(await versaoNova.service.run('startup'))
      versaoNova.service.stop()
      assert.deepEqual(versaoNova.installed, ['@google/gemini-cli'])
    } finally {
      profile.cleanup()
    }
  },
)

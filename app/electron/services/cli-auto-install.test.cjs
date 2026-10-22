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
  hasManagedBinary,
} = require('./cli-auto-install.cjs')
Module._load = originalLoad
const { getManagedCliLayout } = require('../core/managed-cli-paths.cjs')
const {
  getManagedCliManifestEntry,
  getPinnedInstallTarget,
} = require('../core/managed-cli-manifest.cjs')

const GEMINI_PINNED = getPinnedInstallTarget('gemini')

/** Máquina sem npm global: a fase do sistema não encontra nada para atualizar. */
const SEM_INSTALACAO_DO_SISTEMA = {
  resolveGlobalRoot: async () => null,
  readInstall: () => null,
  install: async () => {
    throw new Error('a fase do sistema não deveria instalar nada neste teste')
  },
}

/**
 * Monta um perfil isolado com o layout que o app usa em disco.
 *
 * Usa `getManagedCliLayout` — o mesmo cálculo do código de produção — em vez
 * de montar a pasta na mão: no Windows os executáveis ficam direto em
 * `clis`, não em `clis/bin`, e um fixture que ignorasse isso pulava o cenário
 * real em vez de testá-lo (era o que os quatro testes abaixo faziam).
 *
 * `managedClis` são as CLIs cujo executável já está lá — a prova de que a
 * instalação anterior continua valendo.
 */
function createProfile({ managedClis = [], managedVersions = {}, state = {} } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-auto-install-'))
  const layout = getManagedCliLayout({ userData })
  fs.mkdirSync(layout.packagesBin, { recursive: true })
  fs.mkdirSync(path.join(userData, 'config'), { recursive: true })

  for (const cli of managedClis) {
    fs.writeFileSync(path.join(layout.packagesBin, cli), '#!/bin/sh\n', 'utf8')
  }

  for (const [providerId, version] of Object.entries(managedVersions)) {
    const entry = getManagedCliManifestEntry(providerId)
    if (!entry) continue
    writePackage(layout, entry.npmPackage, version)
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

function createRunner(
  profile,
  {
    detect,
    appVersion = '0.1.103',
    installPackage,
    resolveLatestPackage,
    verifyInstallation,
    platformName = process.platform,
    arch = process.arch,
    describePath,
    userName,
    // Por padrão nenhum teste toca no npm global da máquina que roda a suíte:
    // sem isto, a fase do sistema atualizaria CLIs de verdade.
    systemCli = SEM_INSTALACAO_DO_SISTEMA,
    // Sem espera de verdade entre as tentativas de rede: o teste que repete
    // injeta o `sleep`; os outros nunca chegam a esperar.
    networkRetry = { sleep: async () => {} },
  },
) {
  const installed = []

  const service = registerCliAutoInstallHandlers(() => null, {
    appPaths: profile.appPaths,
    appVersion,
    isPackaged: true,
    detect,
    platformName,
    arch,
    systemCli,
    networkRetry,
    ...(verifyInstallation ? { verifyInstallation } : {}),
    ...(describePath ? { describePath } : {}),
    ...(userName !== undefined ? { userName } : {}),
    resolveLatestPackage:
      resolveLatestPackage ??
      (async ({ npmPackage }) => {
        const entry = ['codex', 'claude', 'gemini']
          .map((id) => getManagedCliManifestEntry(id))
          .find((candidate) => candidate?.npmPackage === npmPackage)
        return entry
          ? {
              ok: true,
              npmPackage,
              version: entry.version,
              integrity: entry.integrity,
              message: 'fixture latest',
              output: '',
            }
          : { ok: false, message: 'fixture sem latest', output: '' }
      }),
    installPackage:
      installPackage ??
      (async ({ npmPackage }) => {
        installed.push(npmPackage)
        return { ok: true, message: `${npmPackage} instalado.`, output: '' }
      }),
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

function writePackage(layout, packageName, version) {
  const packageDir = path.join(layout.root, 'node_modules', ...packageName.split('/'))
  fs.mkdirSync(packageDir, { recursive: true })
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(version ? { version } : {}),
    'utf8',
  )
}

test(
  'atualizar o app não faz reinstalar a CLI que já foi instalada',
  async () => {
    // O caso relatado: o app publica uma versão por push, então o registro de
    // sucesso amarrado à versão nunca valia na abertura seguinte.
    const profile = createProfile({
      managedClis: ['claude', 'gemini'],
      managedVersions: {
        claude: getManagedCliManifestEntry('claude').version,
        gemini: getManagedCliManifestEntry('gemini').version,
      },
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
  'abrir o app atualiza uma CLI gerenciada antiga mesmo quando ela e detectada',
  async () => {
    const profile = createProfile({
      managedClis: ['gemini'],
      managedVersions: { gemini: '0.58.0' },
      state: {
        gemini: { version: '0.1.86', ok: true, message: 'instalado' },
      },
    })

    try {
      const { service, installed } = createRunner(profile, {
        detect: detectedOnly(['codex', 'claude', 'gemini']),
      })

      const status = await service.run('startup')
      service.stop()

      assertPlanned(status)
      assert.deepEqual(installed, [getPinnedInstallTarget('gemini')])
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'usa o fallback versionado quando o registry nao responde',
  async () => {
    const profile = createProfile()

    try {
      const { service, installed } = createRunner(profile, {
        detect: detectedOnly([]),
        platformName: 'linux',
        resolveLatestPackage: async () => ({
          ok: false,
          message: 'registry indisponivel',
          output: '',
        }),
      })

      const status = await service.run('startup')
      service.stop()

      assert.equal(status.state, 'done')
      assert.deepEqual(installed, [
        getPinnedInstallTarget('codex'),
        getPinnedInstallTarget('claude'),
        getPinnedInstallTarget('gemini'),
      ])
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'uma detecção que falha e acerta na segunda tentativa não gera instalação',
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
  'detecta o Codex incompleto e repete a instalação automaticamente',
  async () => {
    const profile = createProfile({
      // O executável existe e o estado anterior diz que deu certo, mas a
      // optionalDependency nativa não existe: esse é o estado observado no
      // Windows quando o npm termina com código 0 cedo demais.
      managedClis: ['codex.cmd'],
      state: {
        codex: { version: '0.1.102', ok: true, message: 'Codex instalado' },
      },
    })
    const codexPackage = '@openai/codex-win32-x64'
    let installCount = 0

    try {
      const { service, installed } = createRunner(profile, {
        detect: detectedOnly(['claude', 'gemini']),
        platformName: 'win32',
        arch: 'x64',
        installPackage: async ({ npmPackage, layout }) => {
          installed.push(npmPackage)
          installCount += 1

          if (installCount === 2) {
            writePackage(layout, codexPackage)
            fs.writeFileSync(path.join(layout.packagesBin, 'codex.cmd'), '', 'utf8')
          }

          return {
            ok: true,
            message: `${npmPackage} instalado (tentativa ${installCount}).`,
            output: '',
          }
        },
      })

      const status = await service.run('startup')
      service.stop()

      assert.equal(status.state, 'done')
      assert.deepEqual(installed, [
        getPinnedInstallTarget('codex'),
        getPinnedInstallTarget('codex'),
      ])
      assert.match(
        status.clis.find((item) => item.id === 'codex').message,
        /reinstalação automática/,
      )
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'mostra o erro real quando a reinstalação do Codex continua incompleta',
  async () => {
    const profile = createProfile({
      managedClis: ['codex.cmd'],
      state: {
        codex: { version: '0.1.102', ok: true, message: 'Codex instalado' },
      },
    })

    try {
      const { service, installed } = createRunner(profile, {
        detect: detectedOnly(['claude', 'gemini']),
        platformName: 'win32',
        arch: 'x64',
      })

      const status = await service.run('startup')
      service.stop()

      assert.equal(status.state, 'error')
      assert.equal(installed.length, 2)
      assert.match(status.message, /Missing optional dependency @openai\/codex-win32-x64/)
      assert.match(status.message, /npm install -g @openai\/codex@latest/)
      assert.match(
        status.clis.find((item) => item.id === 'codex').message,
        /instalação continua incompleta/,
      )
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'reinstala quando o executável que instalamos sumiu do disco',
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

      assert.deepEqual(installed, [GEMINI_PINNED])
    } finally {
      profile.cleanup()
    }
  },
)

test('reconhece o binário instalado pelo alias que o contrato declara (.ps1 incluído)', () => {
  // A openia declara .ps1 em `windowsAliases` porque o launcher instala assim
  // no Windows; sem ler o alias do catálogo, o app achava que sumiu e
  // reinstalava uma CLI que já estava lá.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-alias-'))
  const layout = getManagedCliLayout({ userData })
  fs.mkdirSync(layout.packagesBin, { recursive: true })
  fs.writeFileSync(path.join(layout.packagesBin, 'openia.ps1'), '', 'utf8')

  const cli = { command: 'openia', windowsAliases: ['openia.exe', 'openia.cmd', 'openia.ps1'] }

  assert.equal(hasManagedBinary(layout, cli), true)

  fs.rmSync(userData, { recursive: true, force: true })
})

test(
  'a falha registrada continua valendo só para a versão em que aconteceu',
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
      assert.deepEqual(versaoNova.installed, [GEMINI_PINNED])
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'a falha de instalação é redigida antes de ir para o status e para o disco',
  async () => {
    // O npm pode ecoar URL de registry com credencial e o caminho do usuário;
    // o estado em disco e o status vão para a interface e para suporte.
    const profile = createProfile()
    const segredo = 'npm_SEGREDO_MUITO_SECRETO_123'

    try {
      const { service } = createRunner(profile, {
        detect: detectedOnly(['codex', 'claude']),
        installPackage: async () => ({
          ok: false,
          message: `falhou em https://usuario:${segredo}@registry.exemplo/pkg?token=${segredo} (${os.homedir()})`,
          output: `//registry.exemplo/:_authToken=${segredo}`,
        }),
      })

      const status = await service.run('startup')
      service.stop()
      // Instalação que falha termina a rodada em `error` — é o resultado
      // esperado aqui, então o helper `assertPlanned` não serve.
      assert.ok(status.clis.length > 0, 'a rodada não chegou a planejar nenhuma CLI')
      assert.ok(status.clis.some((item) => item.state === 'failed'))

      const persisted = fs.readFileSync(
        path.join(profile.userData, 'config', 'cli-auto-install.json'),
        'utf8',
      )
      for (const surface of [persisted, JSON.stringify(status)]) {
        assert.equal(surface.includes(segredo), false, 'o segredo vazou')
        assert.equal(surface.includes('registry.exemplo/pkg'), false, 'a URL vazou')
        assert.equal(surface.includes(os.homedir()), false, 'o home vazou')
      }
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'clis:diagnose só lê: separa ausente de invisível e nunca instala',
  async () => {
    const profile = createProfile({ managedClis: ['gemini'] })

    try {
      const { service, installed } = createRunner(profile, {
        detect: async (cli) => ({
          detected: cli.id === 'codex',
          version: cli.id === 'codex' ? '1.0.0' : null,
          path: null,
          reason: cli.id === 'codex' ? null : 'not-found',
          attempts: [],
        }),
        platformName: 'linux',
        verifyInstallation: () => ({ ok: true }),
      })

      const { ok, diagnoses, supportText } = await handlers.get('clis:diagnose')()
      service.stop()

      assert.equal(ok, true)
      const byId = Object.fromEntries(diagnoses.map((item) => [item.id, item]))
      assert.equal(byId.codex.recommendInstall, false, 'binário válido não recomenda instalar')
      assert.equal(byId.gemini.cause, 'path', 'instalada pelo app mas invisível é PATH')
      assert.equal(byId.gemini.recommendInstall, false)
      assert.equal(byId.claude.cause, 'not-installed')
      assert.equal(byId.claude.recommendInstall, true)
      assert.match(supportText, /próxima ação:/)
      assert.deepEqual(installed, [], 'diagnosticar não pode instalar')
    } finally {
      profile.cleanup()
    }
  },
)

test(
  'clis:diagnose devolve o PATH efetivo minimizado e acha nele a pasta gerenciada',
  async () => {
    const profile = createProfile({ managedClis: ['gemini'] })
    const { packagesBin } = getManagedCliLayout({ userData: profile.userData })

    try {
      const { service } = createRunner(profile, {
        detect: async () => ({
          detected: false,
          version: null,
          path: null,
          reason: 'not-found',
          attempts: [],
        }),
        platformName: process.platform,
        verifyInstallation: () => ({ ok: true }),
        userName: 'conta-teste',
        describePath: () => [
          { position: 1, origin: 'usuario', path: path.join(os.homedir(), '.local', 'bin') },
          { position: 2, origin: 'processo', path: path.join(path.sep, 'opt', 'conta-teste', 'bin') },
          { position: 3, origin: 'gerenciada', path: packagesBin },
        ],
      })

      const { effectivePath, diagnoses, supportText } = await handlers.get('clis:diagnose')()
      service.stop()

      assert.deepEqual(
        effectivePath.slice(0, 2),
        [
          { position: 1, origin: 'usuario', path: path.join('~', '.local', 'bin') },
          { position: 2, origin: 'processo', path: path.join(path.sep, 'opt', '<usuario>', 'bin') },
        ],
      )
      const gemini = diagnoses.find((item) => item.id === 'gemini')
      assert.equal(gemini.cause, 'path')
      assert.equal(gemini.managedDir.position, 3)
      assert.match(supportText, /PATH que o app enxerga \(3 pastas/)
      for (const surface of [supportText, JSON.stringify(effectivePath)]) {
        assert.equal(surface.includes('conta-teste'), false, 'o nome da conta vazou')
        assert.equal(surface.includes(os.homedir()), false, 'o home vazou')
      }
    } finally {
      profile.cleanup()
    }
  },
)

/** npm global falso, com estado: a versão no disco muda depois de instalar. */
function sistemaFalso({ versoes, instalar = 'ok' }) {
  const atuais = { ...versoes }
  const instalados = []
  return {
    instalados,
    systemCli: {
      resolveGlobalRoot: async () => path.join(os.tmpdir(), 'npm-global-falso'),
      readInstall: ({ npmPackage }) =>
        npmPackage in atuais
          ? { version: atuais[npmPackage], packageDir: path.join(os.tmpdir(), 'npm-global-falso', npmPackage) }
          : null,
      install: async ({ npmPackage }) => {
        instalados.push(npmPackage)
        const at = npmPackage.lastIndexOf('@')
        if (instalar === 'rede-uma-vez' && instalados.length === 1) {
          return { ok: false, busy: false, message: 'O npm falhou.', output: 'npm error code ECONNRESET' }
        }
        if (instalar === 'ok' || instalar === 'rede-uma-vez') {
          atuais[npmPackage.slice(0, at)] = npmPackage.slice(at + 1)
        }
        if (instalar === 'em-uso') return { ok: false, busy: true, message: 'EBUSY', output: 'npm error code EBUSY' }
        return { ok: true, busy: false, message: 'instalado', output: '' }
      },
    },
  }
}

test('atualiza a CLI do npm global do sistema para o mesmo alvo e avisa no status', async () => {
  const claude = getManagedCliManifestEntry('claude')
  const profile = createProfile({ managedClis: ['claude'], managedVersions: { claude: claude.version } })
  const sistema = sistemaFalso({ versoes: { [claude.npmPackage]: '2.1.200' } })

  try {
    const { service, installed } = createRunner(profile, {
      detect: detectedOnly(['codex', 'claude', 'gemini']),
      systemCli: sistema.systemCli,
    })
    const status = await service.run('startup')
    service.stop()

    assertPlanned(status)
    assert.deepEqual(installed, [])
    assert.deepEqual(sistema.instalados, [`${claude.npmPackage}@${claude.version}`])
    assert.deepEqual(status.updates, [
      { id: 'claude', name: status.updates[0].name, scope: 'sistema', from: '2.1.200', to: claude.version },
    ])
    assert.equal(status.state, 'done')
  } finally {
    profile.cleanup()
  }
})

test('o npm global que terminou sem trocar a versão no disco conta como falha', async () => {
  const claude = getManagedCliManifestEntry('claude')
  const profile = createProfile({ managedClis: ['claude'], managedVersions: { claude: claude.version } })
  const sistema = sistemaFalso({ versoes: { [claude.npmPackage]: '2.1.200' }, instalar: 'sem-efeito' })

  try {
    const { service } = createRunner(profile, {
      detect: detectedOnly(['codex', 'claude', 'gemini']),
      systemCli: sistema.systemCli,
    })
    const status = await service.run('startup')
    service.stop()

    assert.equal(status.systemUpdates[0].action, 'failed')
    assert.deepEqual(status.updates, [])
  } finally {
    profile.cleanup()
  }
})

test('arquivo em uso no npm global vira adiamento com nova tentativa, sem registrar falha', async () => {
  const claude = getManagedCliManifestEntry('claude')
  const profile = createProfile({ managedClis: ['claude'], managedVersions: { claude: claude.version } })
  const sistema = sistemaFalso({ versoes: { [claude.npmPackage]: '2.1.200' }, instalar: 'em-uso' })

  try {
    const { service } = createRunner(profile, {
      detect: detectedOnly(['codex', 'claude', 'gemini']),
      systemCli: sistema.systemCli,
    })
    const status = await service.run('startup')
    service.stop()

    assert.equal(status.systemUpdates[0].action, 'deferred')
    assert.match(status.message, /nova tentativa em 5 min/)
    const state = JSON.parse(fs.readFileSync(path.join(profile.userData, 'config', 'cli-auto-install.json'), 'utf8'))
    assert.equal(state['sistema:claude'], undefined)
  } finally {
    profile.cleanup()
  }
})

test('instala o alvo confirmado no registry com a lista de versões revalidada, e o do manifesto pelo cache', async () => {
  const rodar = async (resolveLatestPackage) => {
    const profile = createProfile()
    const opcoes = []
    try {
      const { service } = createRunner(profile, {
        detect: detectedOnly(['claude', 'gemini']),
        verifyInstallation: () => ({ ok: true }),
        ...(resolveLatestPackage ? { resolveLatestPackage } : {}),
        installPackage: async (options) => {
          opcoes.push(options)
          return { ok: true, message: `${options.npmPackage} instalado.`, output: '' }
        },
      })
      assertPlanned(await service.run('startup'))
      service.stop()
      return opcoes
    } finally {
      profile.cleanup()
    }
  }

  const doRegistry = await rodar()
  const doManifesto = await rodar(async () => ({ ok: false, message: 'registry fora do ar', output: '' }))

  assert.deepEqual(doRegistry.map((options) => options.preferOnline), [true])
  assert.deepEqual(doManifesto.map((options) => options.preferOnline), [false])
  // O cache continua sendo usado nos dois casos: só a lista de versões é revalidada.
  assert.ok(doRegistry[0].cacheDir)
  assert.ok(doManifesto[0].cacheDir)
})

// Falha de rede na instalação: antes só existia retry para "instalou mas a verificação falhou".
// Uma queda de conexão na abertura do app marcava a CLI como "já tentou nesta versão" e ela
// só voltava a instalar numa atualização do app ou no "Tentar de novo" manual.
const SAIDA_DE_REDE = 'npm error code ENOTFOUND\nnpm error network This is a problem related to network connectivity.'
const SAIDA_DE_PACOTE_INEXISTENTE = 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/pacote-que-nao-existe'

test('uma queda de rede na instalação é repetida sozinha e a CLI acaba instalada', async () => {
  const profile = createProfile()
  const tentativas = []
  const esperas = []

  try {
    const { service } = createRunner(profile, {
      detect: detectedOnly(['codex', 'gemini']),
      verifyInstallation: () => ({ ok: true }),
      networkRetry: { delaysMs: [7, 9], sleep: async (ms) => esperas.push(ms) },
      installPackage: async ({ npmPackage }) => {
        tentativas.push(npmPackage)
        return tentativas.length < 3
          ? { ok: false, message: 'Nao foi possivel instalar.', output: SAIDA_DE_REDE }
          : { ok: true, message: `${npmPackage} instalado.`, output: '' }
      },
    })
    const status = await service.run('startup')
    service.stop()

    assertPlanned(status)
    assert.equal(tentativas.length, 3, 'a primeira tentativa e as duas novas')
    assert.deepEqual(esperas, [7, 9])
    assert.equal(status.clis.find((item) => item.id === 'claude').state, 'installed')
    const state = JSON.parse(fs.readFileSync(path.join(profile.userData, 'config', 'cli-auto-install.json'), 'utf8'))
    assert.equal(state.claude.ok, true)
  } finally {
    profile.cleanup()
  }
})

test('o status e o log dizem que a rede falhou enquanto a instalação espera para tentar de novo', async () => {
  const profile = createProfile()
  const mensagens = []
  const janela = { webContents: { isDestroyed: () => false, send: (_canal, status) => mensagens.push(status.message) } }

  try {
    const service = registerCliAutoInstallHandlers(() => janela, {
      appPaths: profile.appPaths,
      appVersion: '0.1.103',
      detect: detectedOnly(['codex', 'gemini']),
      systemCli: SEM_INSTALACAO_DO_SISTEMA,
      verifyInstallation: () => ({ ok: true }),
      networkRetry: { delaysMs: [0], retries: 1, sleep: async () => {} },
      resolveLatestPackage: async () => ({ ok: false, message: 'fixture sem latest', output: '' }),
      installPackage: (() => {
        let chamadas = 0
        return async ({ npmPackage }) => {
          chamadas += 1
          return chamadas === 1
            ? { ok: false, message: 'Nao foi possivel instalar.', output: SAIDA_DE_REDE }
            : { ok: true, message: `${npmPackage} instalado.`, output: '' }
        }
      })(),
    })
    await service.run('startup')
    service.stop()

    assert.ok(
      mensagens.some((mensagem) => /Sem resposta da rede.*tentando de novo \(1 de 1\)/.test(mensagem)),
      `nenhuma mensagem de nova tentativa em: ${JSON.stringify(mensagens)}`,
    )
  } finally {
    profile.cleanup()
  }
})

test('falha que a rede não explica (pacote inexistente) não é repetida', async () => {
  const profile = createProfile()
  let tentativas = 0

  try {
    const { service } = createRunner(profile, {
      detect: detectedOnly(['codex', 'gemini']),
      verifyInstallation: () => ({ ok: true }),
      installPackage: async () => {
        tentativas += 1
        return { ok: false, message: 'Nao foi possivel instalar.', output: SAIDA_DE_PACOTE_INEXISTENTE }
      },
    })
    const status = await service.run('startup')
    service.stop()

    assert.equal(tentativas, 1)
    assert.equal(status.clis.find((item) => item.id === 'claude').state, 'failed')
  } finally {
    profile.cleanup()
  }
})

test('com a rede fora o tempo todo, desiste depois das tentativas e registra a falha da versão', async () => {
  const profile = createProfile()
  let tentativas = 0

  try {
    const { service } = createRunner(profile, {
      detect: detectedOnly(['codex', 'gemini']),
      verifyInstallation: () => ({ ok: true }),
      installPackage: async () => {
        tentativas += 1
        return { ok: false, message: 'Nao foi possivel instalar.', output: SAIDA_DE_REDE }
      },
    })
    const status = await service.run('startup')
    service.stop()

    assert.equal(tentativas, 3, 'a primeira tentativa e as duas novas, nunca mais que isso')
    const claude = status.clis.find((item) => item.id === 'claude')
    assert.equal(claude.state, 'failed')
    assert.match(claude.message, /A rede falhou nas 3 tentativas/)
    const state = JSON.parse(fs.readFileSync(path.join(profile.userData, 'config', 'cli-auto-install.json'), 'utf8'))
    assert.equal(state.claude.ok, false)
  } finally {
    profile.cleanup()
  }
})

test('a atualização do npm global do sistema também repete quando a rede cai', async () => {
  const claude = getManagedCliManifestEntry('claude')
  const profile = createProfile({ managedClis: ['claude'], managedVersions: { claude: claude.version } })
  const sistema = sistemaFalso({ versoes: { [claude.npmPackage]: '2.1.200' }, instalar: 'rede-uma-vez' })

  try {
    const { service } = createRunner(profile, {
      detect: detectedOnly(['codex', 'claude', 'gemini']),
      systemCli: sistema.systemCli,
    })
    const status = await service.run('startup')
    service.stop()

    assertPlanned(status)
    assert.equal(sistema.instalados.length, 2, 'a primeira tentativa e uma nova')
    assert.equal(status.systemUpdates[0].action, 'updated')
  } finally {
    profile.cleanup()
  }
})

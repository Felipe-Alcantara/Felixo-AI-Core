const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { createNodeEnv, resolveNpmCliPath } = require('./node-runtime.cjs')

describe('node-runtime', () => {
  it('prefers the npm shipped inside the packaged app', () => {
    const packaged = path.join(
      '/opt/app/resources',
      'npm-runtime',
      'npm',
      'bin',
      'npm-cli.js',
    )

    assert.equal(
      resolveNpmCliPath({
        resourcesPath: '/opt/app/resources',
        appRoot: '/opt/app',
        exists: () => true,
      }),
      packaged,
    )
  })

  it('falls back to the project npm when running from source', () => {
    const fromSource = path.join('/repo/app', 'node_modules', 'npm', 'bin', 'npm-cli.js')

    assert.equal(
      resolveNpmCliPath({
        resourcesPath: '/opt/app/resources',
        appRoot: '/repo/app',
        exists: (candidate) => candidate === fromSource,
      }),
      fromSource,
    )
  })

  // Sem npm nao ha instalacao possivel, e devolver um caminho inexistente so
  // adiaria a falha para dentro do spawn, com uma mensagem pior.
  it('returns null when no npm is available', () => {
    assert.equal(
      resolveNpmCliPath({
        resourcesPath: '/opt/app/resources',
        appRoot: '/repo/app',
        exists: () => false,
      }),
      null,
    )
  })

  it('turns the Electron binary into a plain Node runtime', () => {
    const env = createNodeEnv({ PATH: '/usr/bin', ELECTRON_NO_ATTACH_CONSOLE: '1' })

    assert.equal(env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(env.PATH, '/usr/bin')
    assert.ok(!('ELECTRON_NO_ATTACH_CONSOLE' in env))
  })
})

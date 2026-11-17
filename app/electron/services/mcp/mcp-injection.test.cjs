const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createMcpRegistry } = require('./mcp-registry.cjs')
const { createMcpInjection, geminiSettings } = require('./mcp-injection.cjs')
const { PtyProcessManager } = require('../pty-process-manager.cjs')

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, 'utf8').toString('base64'),
  decryptString: (value) => Buffer.from(Buffer.isBuffer(value) ? value.toString('utf8') : value, 'base64').toString('utf8'),
}

const OBS = { id: 'obs', transporte: 'stdio', comando: 'C:\\Programas\\x y\\obs-mcp.exe', args: ['--porta', '4455'], env: { OBS_HOST: 'localhost' }, segredos: ['OBS_PASSWORD'] }
const ZAP = { id: 'whats-app', transporte: 'http', url: 'http://127.0.0.1:8000/mcp', segredos: ['X-Token'] }

function fixture(run) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-mcp-injection-'))
  try {
    const registry = createMcpRegistry({ userData, safeStorage })
    registry.save(OBS, { OBS_PASSWORD: 'SEGREDO-OBS' })
    registry.save(ZAP, { 'X-Token': 'SEGREDO-ZAP' })
    run({ registry, userData, build: createMcpInjection({ registry, userData }) })
  } finally {
    fs.rmSync(userData, { recursive: true, force: true })
  }
}

test('Claude: --mcp-config com arquivo de sessao que leva o segredo; argv limpo; dispose apaga', () => {
  fixture(({ build }) => {
    const injection = build({ ids: ['obs', 'whats-app'], providerId: 'claude', sessionId: 'canvas:1' })
    assert.equal(injection.args[0], '--mcp-config')
    assert.equal(injection.args.join(' ').includes('SEGREDO'), false)
    const config = JSON.parse(fs.readFileSync(injection.args[1], 'utf8')).mcpServers
    assert.deepEqual(config.obs, { type: 'stdio', command: OBS.comando, args: OBS.args, env: { OBS_HOST: 'localhost', OBS_PASSWORD: 'SEGREDO-OBS' } })
    assert.deepEqual(config['whats-app'], { type: 'http', url: ZAP.url, headers: { 'X-Token': 'SEGREDO-ZAP' } })
    injection.dispose()
    assert.equal(fs.existsSync(injection.args[1]), false)
  })
})

test('Codex: -c por campo, segredo so no ambiente (nome em env_vars/env_http_headers), nenhum em argv', () => {
  fixture(({ build }) => {
    const { args, env } = build({ ids: ['obs', 'whats-app'], providerId: 'codex', sessionId: 's' })
    assert.equal(args.join(' ').includes('SEGREDO'), false)
    assert.deepEqual(args.filter((_, i) => i % 2 === 0), Array(args.length / 2).fill('-c'))
    const settings = args.filter((_, i) => i % 2 === 1)
    assert.ok(settings.includes('mcp_servers.obs.command="C:\\\\Programas\\\\x y\\\\obs-mcp.exe"'))
    assert.ok(settings.includes('mcp_servers.obs.args=["--porta","4455"]'))
    assert.ok(settings.includes('mcp_servers.obs.env={OBS_HOST="localhost"}'))
    assert.ok(settings.includes('mcp_servers.obs.env_vars=["OBS_PASSWORD"]'))
    assert.ok(settings.includes('mcp_servers.whats-app.url="http://127.0.0.1:8000/mcp"'))
    assert.ok(settings.includes('mcp_servers.whats-app.env_http_headers={X-Token="FELIXO_MCP_WHATS_APP_X_TOKEN"}'))
    assert.deepEqual(env, { OBS_PASSWORD: 'SEGREDO-OBS', FELIXO_MCP_WHATS_APP_X_TOKEN: 'SEGREDO-ZAP' })
  })
})

test('Codex recusa o mesmo segredo com valores diferentes em dois servidores', () => {
  fixture(({ registry, build }) => {
    registry.save({ ...OBS, id: 'obs2' }, { OBS_PASSWORD: 'OUTRO' })
    assert.throws(() => build({ ids: ['obs', 'obs2'], providerId: 'codex', sessionId: 's' }), /valores diferentes/)
  })
})

test('sem ids, sem servidor conhecido ou para CLI sem adaptador no spawn: nada a injetar', () => {
  fixture(({ build }) => {
    assert.equal(build({ ids: [], providerId: 'claude', sessionId: 's' }), null)
    assert.equal(build({ ids: ['sumiu'], providerId: 'claude', sessionId: 's' }), null)
    assert.equal(build({ ids: ['obs'], providerId: 'gemini', sessionId: 's' }), null)
  })
})

test('Gemini: conteudo do settings.json usa url + type http, nunca httpUrl', () => {
  const servers = [
    { id: 'whats', transporte: 'http', url: 'http://127.0.0.1:8000/mcp', cabecalhos: {}, secretValues: { 'X-Token': 't' } },
    { id: 'obs', transporte: 'stdio', comando: 'obs', args: [], env: {}, secretValues: {} },
  ]
  const { mcpServers } = JSON.parse(geminiSettings(servers))
  assert.deepEqual(mcpServers.whats, { url: 'http://127.0.0.1:8000/mcp', type: 'http', headers: { 'X-Token': 't' } })
  assert.equal('httpUrl' in mcpServers.whats, false)
  assert.equal(mcpServers.obs.command, 'obs')
})

test('spawn: so quem tem mcpIds recebe os MCPs; args originais ficam intactos e a saida da sessao apaga o arquivo', () => {
  fixture(({ build }) => {
    const calls = []
    const listeners = []
    const pty = { pid: 1, write() {}, resize() {}, kill() {}, onData() {}, onExit: (l) => listeners.push(l) }
    const manager = new PtyProcessManager({
      spawnPty: (file, args, options) => (calls.push({ file, args, options }), pty),
      platform: { name: 'linux', getDefaultShell: () => '/bin/bash' },
      buildMcpInjection: build,
    })
    try {
      manager.spawn('canvas:com', { command: 'claude', args: ['--model', 'opus'], cwd: process.cwd(), mcpIds: ['obs'] })
      const [com] = calls
      assert.equal(com.args[0], '--mcp-config')
      assert.deepEqual(com.args.slice(2), ['--model', 'opus'])
      const file = com.args[1]
      assert.equal(fs.existsSync(file), true)
      assert.deepEqual(manager.sessions.get('canvas:com').args, ['--model', 'opus'])

      listeners[0]({ exitCode: 0 })
      assert.equal(fs.existsSync(file), false)

      manager.spawn('canvas:sem', { command: 'claude', args: ['--model', 'opus'], cwd: process.cwd() })
      assert.deepEqual(calls[1].args, ['--model', 'opus'])

      manager.spawn('canvas:codex', { command: 'codex', args: ['resume', 'abc-123-abc-123'], cwd: process.cwd(), mcpIds: ['obs'] })
      assert.equal(calls[2].options.env.OBS_PASSWORD, 'SEGREDO-OBS')
      assert.deepEqual(calls[2].args.slice(-2), ['resume', 'abc-123-abc-123'])
    } finally {
      manager.killAll({ force: true })
    }
  })
})

'use strict'

/**
 * Confere se as gravações da Leitura do terminal ainda são da versão que o
 * Claude Code e o Codex têm instalada. As regras da Leitura vêm dessas
 * gravações: com uma CLI mais nova, o desenho pode mudar sem que nenhum teste
 * avise, porque os testes só reproduzem a gravação antiga.
 *
 * Uso: node scripts/check-reading-fixtures.cjs
 *
 * Sai com 1 quando alguma gravação é de outra versão que a instalada. Aí,
 * regrave (`scripts/record-terminal-fixture.cjs`, com a própria conta), rode
 * `npx vitest run src/features/canvas/terminal/reading -u` e confira o diff dos
 * snapshots; se o desvio for aceito, registre-o no `IA.md`.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'features', 'canvas', 'terminal', '__fixtures__', 'terminal-output')
const PROVIDERS = [
  { provider: 'claude', command: 'claude' },
  { provider: 'codex', command: 'codex' },
]

/** A versão que `--version` imprime (`2.1.327 (Claude Code)`, `codex-cli 0.171.0-alpha.12`). */
function parseVersion(output) {
  return (String(output).match(/\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?/) ?? [null])[0]
}

/** As gravações do provedor com a versão em que foram feitas. */
function fixtureVersions(provider, dir = FIXTURES_DIR) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.startsWith(`${provider}-`) && file.endsWith('.json'))
    .map((file) => ({ name: file.replace(/\.json$/, ''), version: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).version }))
}

/** As gravações cuja versão difere da instalada; `installed` vazio (CLI ausente) não aponta desvio. */
function driftedFixtures(installed, fixtures) {
  return installed ? fixtures.filter((fixture) => fixture.version !== installed) : []
}

function installedVersion(command) {
  try {
    return parseVersion(execSync(`${command} --version`, { encoding: 'utf8', timeout: 30_000 }))
  } catch {
    return null
  }
}

function main() {
  let drift = false
  for (const { provider, command } of PROVIDERS) {
    const installed = installedVersion(command)
    const drifted = driftedFixtures(installed, fixtureVersions(provider))
    if (!installed) console.log(`${provider}: CLI não encontrada no PATH, nada a conferir.`)
    else if (drifted.length === 0) console.log(`${provider}: gravações na versão instalada (${installed}).`)
    else {
      drift = true
      console.log(`${provider}: instalada ${installed}; gravações de outra versão: ${drifted.map((item) => `${item.name} (${item.version})`).join(', ')}.`)
    }
  }
  if (drift) console.log('Regrave as gravações e compare os snapshots da Leitura (ver o cabeçalho deste script).')
  process.exitCode = drift ? 1 : 0
}

module.exports = { driftedFixtures, fixtureVersions, parseVersion }

if (require.main === module) main()

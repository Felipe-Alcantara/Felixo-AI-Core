'use strict'

/**
 * O `allowScripts` do package.json anda junto com o lockfile: todo pacote do lock com script de
 * instalação tem uma entrada que o cobre, e toda entrada cobre algum pacote do lock.
 *
 * Origem: o Electron passou de 41 para 42, que não tem mais script de instalação (baixa o binário na
 * primeira execução), e a entrada `electron@41.3.0` ficou sem pacote. Já o fsevents, instalado só no
 * macOS, nunca foi revisado: o npm 11 do projeto avisava no CI do macOS e pularia o script se passasse
 * a bloquear (task 3e991f95-497e-8108-bf74-f5ec9466cb07).
 *
 * Lê só os dois JSONs, então vale em todas as plataformas (o fsevents não é instalado no Windows nem no
 * Linux). A regra de casamento é a do npm do projeto (`script-allowed.js` do arborist), não uma cópia:
 * identidade pelo `resolved` do lock, versão exata, `||` de versões exatas ou nome sozinho.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const APP_DIR = path.resolve(__dirname, '..')
const { isScriptAllowed, matches } = require(
  path.join(APP_DIR, 'node_modules', 'npm', 'node_modules', '@npmcli', 'arborist', 'lib', 'script-allowed.js'),
)
const { allowScripts } = require(path.join(APP_DIR, 'package.json'))
const { packages } = require(path.join(APP_DIR, 'package-lock.json'))

/** Pacotes do lock que rodam script na instalação, no formato de nó que o npm compara. */
const withScripts = Object.entries(packages)
  .filter(([key, entry]) => key && entry.hasInstallScript && !entry.inBundle)
  .map(([key, entry]) => ({ key, version: entry.version, node: { resolved: entry.resolved, isRegistryDependency: true } }))

test('todo pacote do lock com script de instalação está no allowScripts', () => {
  assert.ok(withScripts.length > 0, 'nenhum pacote do lock com script: o filtro quebrou')
  const pending = withScripts.filter(({ node }) => isScriptAllowed(node, allowScripts) === null)
  assert.deepEqual(pending.map(({ key, version }) => `${key}@${version}`), [])
})

test('toda entrada do allowScripts cobre um pacote do lock que roda script', () => {
  const unused = Object.keys(allowScripts).filter((spec) => !withScripts.some(({ node }) => matches(node, spec)))
  assert.deepEqual(unused, [])
})

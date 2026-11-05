'use strict'

/**
 * O lockfile precisa ser uma árvore que o npm aceita (`npm ls` sem `ELSPROBLEMS`),
 * e os binários nativos do lightningcss precisam bater com o pacote que os carrega.
 *
 * Origem: o Tailwind 4 fixa o lightningcss 1.32.0 e o Vite 8 traz o 1.33; se o
 * lock resolve um binário opcional (ex.: `lightningcss-linux-x64-musl`) para a
 * versão do outro, o `npm ls --all` sai com `invalid`. O lock de hoje já aninha
 * os dois grupos; estes testes impedem a volta (task
 * 3e791f95-497e-81bc-a366-c4f58fc01463).
 *
 * `npm ls --package-lock-only` lê só o `package.json` e o `package-lock.json`,
 * então vale para todas as plataformas e não precisa de rede nem de
 * `node_modules` completo. Usa o npm do projeto (`devDependency`), não o do
 * PATH: o npm 11.6.2 do Node 25.3 acusava três `invalid` falsos no React por
 * causa de um override aninhado, e a versão do PATH varia de máquina em máquina.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const APP_DIR = path.resolve(__dirname, '..')
const NPM_CLI = path.join(APP_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js')

/** Entrada do lock que o Node resolveria a partir de `fromKey`: aninhada, irmã, e daí para cima até a raiz. */
function resolveInLock(packages, fromKey, name) {
  let dir = fromKey
  for (;;) {
    const candidate = `${dir}/node_modules/${name}`
    if (packages[candidate]) return candidate
    const cut = dir.lastIndexOf('/node_modules/')
    if (cut < 0) break
    dir = dir.slice(0, cut)
  }
  return packages[`node_modules/${name}`] ? `node_modules/${name}` : null
}

/**
 * Para cada `lightningcss` do lock, cada binário opcional que ele declara tem de
 * resolver, pela regra do Node, para a versão exata que ele pede. Binário que
 * não aparece no lock (plataforma não resolvida) não é erro: o `npm ci` o
 * ignora; o erro é o binário existir na versão do vizinho.
 */
function findLightningcssMismatches(packages) {
  const mismatches = []
  const parents = Object.keys(packages).filter((key) => /(^|\/)node_modules\/lightningcss$/.test(key))
  for (const parentKey of parents) {
    const parent = packages[parentKey]
    for (const [name, wanted] of Object.entries(parent.optionalDependencies ?? {})) {
      const foundKey = resolveInLock(packages, parentKey, name)
      if (!foundKey) continue
      const found = packages[foundKey].version
      if (found !== wanted) mismatches.push({ parent: parentKey, parentVersion: parent.version, binary: name, wanted, found, foundKey })
    }
  }
  return { parents, mismatches }
}

/** Problemas do `npm ls --all --package-lock-only` rodado em `cwd` com o npm do projeto. */
function npmLsProblems(cwd) {
  const result = spawnSync(process.execPath, [NPM_CLI, 'ls', '--all', '--package-lock-only', '--json'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' },
  })
  assert.ok(result.stdout, `o npm ls não escreveu nada (status ${result.status}): ${result.stderr}`)
  return JSON.parse(result.stdout).problems ?? []
}

const lightningcssLock = (overrides = {}) => ({
  'node_modules/lightningcss': { version: '1.33.0', optionalDependencies: { 'lightningcss-linux-x64-musl': '1.33.0' } },
  'node_modules/lightningcss-linux-x64-musl': { version: '1.33.0', optional: true },
  'node_modules/@tailwindcss/node/node_modules/lightningcss': { version: '1.32.0', optionalDependencies: { 'lightningcss-linux-x64-musl': '1.32.0' } },
  'node_modules/@tailwindcss/node/node_modules/lightningcss-linux-x64-musl': { version: '1.32.0', optional: true },
  ...overrides,
})

test('os binários do lightningcss aninhado e do hoisted batem cada um com o seu pai', () => {
  const { parents, mismatches } = findLightningcssMismatches(lightningcssLock())
  assert.equal(parents.length, 2)
  assert.deepEqual(mismatches, [])
})

test('acusa o binário que o lock resolve para a versão do outro lightningcss (o defeito original)', () => {
  // Sem o musl aninhado, o do Tailwind (1.32.0) resolveria para o hoisted (1.33.0).
  const packages = lightningcssLock()
  delete packages['node_modules/@tailwindcss/node/node_modules/lightningcss-linux-x64-musl']
  const { mismatches } = findLightningcssMismatches(packages)
  assert.equal(mismatches.length, 1)
  assert.equal(mismatches[0].binary, 'lightningcss-linux-x64-musl')
  assert.equal(mismatches[0].wanted, '1.32.0')
  assert.equal(mismatches[0].found, '1.33.0')
  assert.equal(mismatches[0].foundKey, 'node_modules/lightningcss-linux-x64-musl')
})

test('binário que o lock não resolveu para a plataforma não é erro', () => {
  const packages = lightningcssLock()
  delete packages['node_modules/lightningcss-linux-x64-musl']
  delete packages['node_modules/@tailwindcss/node/node_modules/lightningcss-linux-x64-musl']
  assert.deepEqual(findLightningcssMismatches(packages).mismatches, [])
})

test('o lockfile do app alinha o lightningcss do Tailwind e o do Vite', () => {
  const { packages } = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package-lock.json'), 'utf8'))
  const { parents, mismatches } = findLightningcssMismatches(packages)
  assert.ok(parents.length >= 2, `esperava o lightningcss do Tailwind e o do Vite, achei ${parents.join(', ') || 'nenhum'}`)
  assert.deepEqual(mismatches, [], `binário do lightningcss fora da versão do pai: ${JSON.stringify(mismatches, null, 1)}`)
})

test('o npm ls aponta um lockfile fora do package.json (o teste enxerga defeito de árvore)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-ruim-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ruim', version: '1.0.0', dependencies: { ms: '^2.0.0' } }))
  fs.writeFileSync(
    path.join(dir, 'package-lock.json'),
    JSON.stringify({
      name: 'ruim',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'ruim', version: '1.0.0', dependencies: { ms: '^2.0.0' } }, 'node_modules/ms': { version: '1.0.0' } },
    }),
  )
  const problems = npmLsProblems(dir)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /invalid: ms@1\.0\.0/)
})

test('o npm ls --all do app sai sem problemas (sem ELSPROBLEMS)', () => {
  assert.ok(fs.existsSync(NPM_CLI), `npm do projeto não instalado em ${NPM_CLI}: rode npm ci`)
  assert.deepEqual(npmLsProblems(APP_DIR), [])
})

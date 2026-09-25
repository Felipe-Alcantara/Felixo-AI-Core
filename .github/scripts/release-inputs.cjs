#!/usr/bin/env node
'use strict'

/**
 * Lista, um por linha e relativo à raiz do repositório, os arquivos que o
 * pipeline de Release executa ou empacota — derivados do próprio
 * `.github/workflows/release.yml` e do bloco `build` de `app/package.json`,
 * mais os `require` locais desses scripts.
 *
 * Existe para `release-relevant.test.sh` provar que a lista de inclusão de
 * `release-relevant.sh` cobre tudo isso. A lista é mantida à mão; sem esta
 * derivação, um script novo exigido por um gate do Release (como aconteceu
 * com `package-manager-selection.cjs`) ficava fora dela sem ninguém notar, e
 * uma mudança nele não publicaria instalador.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const APP = path.join(ROOT, 'app')

function relativeToRoot(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/')
}

/** Scripts `scripts/*.cjs` que o release.yml roda (o job trabalha em `app/`). */
function workflowScripts(workflowText) {
  const scripts = new Set()
  for (const match of workflowText.matchAll(/(?<![\w./-])scripts\/[\w.-]+\.cjs/g)) {
    scripts.add(path.join(APP, match[0]))
  }
  for (const match of workflowText.matchAll(/\.github\/scripts\/[\w.-]+\.(?:sh|cjs)/g)) {
    scripts.add(path.join(ROOT, match[0]))
  }
  return scripts
}

/** Hooks do electron-builder e conteúdo versionado que entra no instalador. */
function packagedInputs(buildConfig) {
  const inputs = new Set()
  for (const hook of [buildConfig.beforePack, buildConfig.afterPack]) {
    if (typeof hook === 'string') inputs.add(path.join(APP, hook))
  }
  for (const pattern of buildConfig.files ?? []) {
    // `dist/**` é saída do build do renderer, cuja fonte é app/src.
    const base = pattern === 'dist/**/*' ? 'src/representante.ts' : pattern.replace(/\*\*\/\*$/, 'representante')
    inputs.add(path.join(APP, base))
  }
  for (const resource of buildConfig.extraResources ?? []) {
    const from = typeof resource === 'string' ? resource : resource?.from
    // `build/` é gerado pelo beforePack (npm-runtime); não é arquivo versionado.
    if (typeof from === 'string' && !from.startsWith('build/')) {
      inputs.add(path.join(APP, from, 'representante'))
    }
  }
  return inputs
}

/**
 * Fecho dos `require('./...')`/`require('../...')`. Só segue caminhos que
 * existem: há `require` dentro de strings (código montado para rodar em outro
 * processo), e esses não apontam para arquivo do repositório.
 */
function localRequireClosure(entries) {
  const seen = new Set()
  const pending = [...entries]
  while (pending.length) {
    const file = pending.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (!file.endsWith('.cjs') && !file.endsWith('.js')) continue
    let source
    try {
      source = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const match of source.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const target = resolveLocal(path.join(path.dirname(file), match[1]))
      if (target) pending.push(target)
    }
  }
  return seen
}

function resolveLocal(candidate) {
  for (const option of [candidate, `${candidate}.cjs`, `${candidate}.js`, `${candidate}.json`]) {
    if (fs.existsSync(option) && fs.statSync(option).isFile()) return option
  }
  return null
}

function releaseInputs({
  workflowText = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8'),
  buildConfig = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).build,
} = {}) {
  const executed = localRequireClosure(workflowScripts(workflowText))
  const packaged = packagedInputs(buildConfig ?? {})
  return [...new Set([...executed, ...packaged].map(relativeToRoot))].sort()
}

module.exports = { releaseInputs }

if (require.main === module) {
  process.stdout.write(`${releaseInputs().join('\n')}\n`)
}

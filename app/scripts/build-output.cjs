'use strict'

/**
 * Saída de build sem sobras: remoção que confere o que fez e limpeza do `dist`.
 *
 * Medido em 16/11/2026: no Node 25.3, `fs.rmSync` (arquivo ou pasta,
 * `recursive` e `force`) volta SEM ERRO e não apaga nada quando o caminho tem
 * caractere fora do ASCII no Windows — o checkout em "Programação\…\Repositórios"
 * cai nisso, num disco qualquer. `unlinkSync`, `rmdirSync` de pasta vazia e
 * `fs.promises.rm` funcionam. O Node do Electron 42 (24.19) e o do CI (22) não
 * têm o defeito. Consequências que apareceram:
 * - o `emptyOutDir` do Vite (que usa `rmSync`) não limpava o `dist`: 9194
 *   arquivos em `dist/assets`, de builds antigos, iam para o pacote local;
 * - o `bundle-npm-runtime` não apagava o runtime anterior, e o `cpSync` por cima
 *   falhava com "The operation completed successfully".
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * Apaga um arquivo ou uma árvore (sem seguir link) e confere que sumiu.
 * Lança se algo ficou: um `rmSync` mudo é exatamente o que isto evita.
 */
function removeTreeSync(target, fsImpl = fs) {
  let stats
  try {
    stats = fsImpl.lstatSync(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  if (stats.isDirectory()) {
    for (const entry of fsImpl.readdirSync(target)) {
      removeTreeSync(path.join(target, entry), fsImpl)
    }
    fsImpl.rmdirSync(target)
  } else {
    try {
      fsImpl.unlinkSync(target)
    } catch (error) {
      // Junção de pasta no Windows: é link, mas sai por rmdir.
      if (error?.code !== 'EPERM' && error?.code !== 'EISDIR') throw error
      fsImpl.rmdirSync(target)
    }
  }
  if (fsImpl.existsSync(target)) {
    throw new Error(`[build-output] não consegui apagar ${target}`)
  }
}

/** Arquivos de `dir`, em caminho relativo com `/`. */
function listFiles(dir, fsImpl = fs, prefix = '') {
  let entries
  try {
    entries = fsImpl.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  return entries.flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), fsImpl, relative) : [relative]
  })
}

/**
 * O que está em `outDir` e não saiu deste build: nem emitido pelo bundle, nem
 * copiado da pasta `public`. Pela lista exata do bundle, não por busca de nome.
 */
function findStaleOutputFiles({ outDir, emitted, publicDir }, fsImpl = fs) {
  const expected = new Set([...emitted, ...(publicDir ? listFiles(publicDir, fsImpl) : [])])
  return listFiles(outDir, fsImpl).filter((file) => !expected.has(file))
}

/**
 * Apaga as sobras de builds anteriores e as pastas que ficarem vazias.
 *
 * @returns {string[]} os caminhos relativos removidos
 */
function removeStaleOutput({ outDir, emitted, publicDir }, fsImpl = fs) {
  const stale = findStaleOutputFiles({ outDir, emitted, publicDir }, fsImpl)
  for (const file of stale) removeTreeSync(path.join(outDir, ...file.split('/')), fsImpl)
  pruneEmptyDirs(outDir, fsImpl)
  return stale
}

function pruneEmptyDirs(dir, fsImpl, isRoot = true) {
  for (const entry of fsImpl.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name), fsImpl, false)
  }
  if (!isRoot && fsImpl.readdirSync(dir).length === 0) fsImpl.rmdirSync(dir)
}

module.exports = {
  findStaleOutputFiles,
  listFiles,
  removeStaleOutput,
  removeTreeSync,
}

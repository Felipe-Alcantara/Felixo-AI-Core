'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { BUILTIN_SKILLS } = require('./skills-catalog.cjs')

/**
 * Materializa a biblioteca de skills que acompanha o app num diretorio que a
 * pessoa pode abrir e editar.
 *
 * Por que copiar em vez de apontar para dentro do pacote: o agente precisa ler
 * o arquivo (e num app empacotado o conteudo pode estar dentro do asar), e a
 * pessoa precisa poder ajustar uma skill sem recompilar nada.
 *
 * A copia **nunca sobrescreve edicao**. Junto de cada arquivo fica um `.origem`
 * com o conteudo instalado da versao anterior; na atualizacao, o arquivo so e
 * reescrito quando ainda esta identico ao que o app instalou. Editou? fica como
 * esta, e a atualizacao e reportada como pulada.
 */

/** Nome do arquivo de skill, no padrao Agent Skills. */
const SKILL_FILE = 'SKILL.md'

/** Guarda o conteudo instalado, para distinguir "intocado" de "editado". */
const MARKER_FILE = '.origem'

/**
 * Onde a biblioteca que acompanha o app esta, em dev e empacotado.
 *
 * @param {object} [options]
 * @param {string} [options.appRoot] - raiz de `app/` (dev).
 * @param {string} [options.resourcesPath] - `process.resourcesPath` (empacotado).
 * @param {boolean} [options.isPackaged]
 * @returns {string}
 */
function getBundledSkillsDir(options = {}) {
  const {
    appRoot = path.join(__dirname, '..', '..', '..'),
    resourcesPath = process.resourcesPath,
    isPackaged = false,
  } = options

  if (isPackaged && resourcesPath) {
    return path.join(resourcesPath, 'skills')
  }
  return path.join(appRoot, 'resources', 'skills')
}

/**
 * Instala/atualiza a biblioteca no diretorio de destino.
 *
 * @param {object} options
 * @param {string} options.bundledDir - de onde copiar.
 * @param {string} options.targetDir - para onde copiar (editavel pela pessoa).
 * @param {object} [options.fileSystem] - injecao para teste.
 * @returns {{instaladas: string[], atualizadas: string[], preservadas: string[], ausentes: string[]}}
 */
function installBuiltinSkills(options) {
  const { bundledDir, targetDir, fileSystem = fs } = options
  const resultado = { instaladas: [], atualizadas: [], preservadas: [], ausentes: [] }

  for (const { slug } of BUILTIN_SKILLS) {
    const origem = path.join(bundledDir, slug, SKILL_FILE)
    if (!fileSystem.existsSync(origem)) {
      resultado.ausentes.push(slug)
      continue
    }

    const pastaDestino = path.join(targetDir, slug)
    const destino = path.join(pastaDestino, SKILL_FILE)
    const marcador = path.join(pastaDestino, MARKER_FILE)
    const conteudo = fileSystem.readFileSync(origem, 'utf8')

    if (!fileSystem.existsSync(destino)) {
      fileSystem.mkdirSync(pastaDestino, { recursive: true })
      fileSystem.writeFileSync(destino, conteudo, 'utf8')
      fileSystem.writeFileSync(marcador, conteudo, 'utf8')
      resultado.instaladas.push(slug)
      continue
    }

    const atual = fileSystem.readFileSync(destino, 'utf8')
    if (atual === conteudo) {
      continue
    }

    // Sem marcador, o arquivo veio de uma versao anterior a este mecanismo:
    // trate como editado e preserve. Perder edicao e pior que ficar atrasado.
    const instaladoAntes = fileSystem.existsSync(marcador)
      ? fileSystem.readFileSync(marcador, 'utf8')
      : null

    if (instaladoAntes !== null && atual === instaladoAntes) {
      fileSystem.writeFileSync(destino, conteudo, 'utf8')
      fileSystem.writeFileSync(marcador, conteudo, 'utf8')
      resultado.atualizadas.push(slug)
    } else {
      resultado.preservadas.push(slug)
    }
  }

  return resultado
}

/** Caminho do SKILL.md de uma skill que acompanha o app, dentro do destino. */
function builtinSkillPath(targetDir, slug) {
  return path.join(targetDir, slug, SKILL_FILE)
}

module.exports = {
  MARKER_FILE,
  SKILL_FILE,
  builtinSkillPath,
  getBundledSkillsDir,
  installBuiltinSkills,
}

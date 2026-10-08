'use strict'

/**
 * @module system-design-project
 * Camada de PROJETO dos guias do System Design (08/10/2026).
 *
 * Um projeto pode trazer os próprios guias por três caminhos, à escolha de
 * quem usa, e os três somam:
 *
 * 1. **Arquivo no repositório** (`.felixo/system-design.json`): versionado, o
 *    time inteiro recebe ao clonar. Vem de fora — qualquer repositório baixado
 *    pode apontar os agentes para instruções de terceiros —, então NUNCA vale
 *    sem confirmação. A confirmação guarda o hash da lista normalizada: mudou
 *    URL ou branch, pergunta de novo.
 * 2. **Escolha no app**, guardada por projeto nas configurações.
 * 3. **Pasta de guias** na raiz (`Padrão de qualidade - <nome>/`): a convenção
 *    que o lembrete dos agentes já citava. Local, sem rede; vale por padrão,
 *    porque o comportamento anterior já mandava o agente usá-la.
 *
 * Precedência: a lista do projeto, quando não vazia, SUBSTITUI a do usuário
 * naquele projeto (com aviso na UI e no lembrete); senão vale a do usuário.
 *
 * Só funções puras: quem lê o disco (com autorização de caminho) é o serviço.
 */

const crypto = require('node:crypto')
const {
  DEFAULT_LABEL,
  getDefaultSource,
  labelFor,
  normalizeGuideList,
  normalizeBranch,
  sourceKey,
  sourcesEqual,
  validateBranch,
  validateSourceUrl,
} = require('./system-design-source.cjs')
const { sanitizeGitRemoteUrl } = require('../services/git-secret-redaction.cjs')

const PROJECT_GUIDE_FILE_SEGMENTS = Object.freeze(['.felixo', 'system-design.json'])
const PROJECT_GUIDE_FILE = PROJECT_GUIDE_FILE_SEGMENTS.join('/')
const MAX_GUIDE_FILE_BYTES = 16 * 1024
const MAX_PROJECT_GUIDES = 5
const PROJECT_SETTINGS_VERSION = 1
const DEFAULT_GUIDE_BRANCH = 'main'

/** De onde um guia de projeto veio. A UI e o lembrete dizem isso. */
const PROJECT_ORIGINS = Object.freeze({
  FILE: 'projeto-arquivo',
  APP: 'projeto-app',
  FOLDER: 'projeto-pasta',
})

/** Situação do arquivo do repositório. Fechado: quem consome faz `switch`. */
const FILE_STATUS = Object.freeze({
  ABSENT: 'ausente',
  /** Tem guias válidos e ninguém confirmou ainda: aparece, não vale. */
  PENDING: 'pendente',
  CONFIRMED: 'confirmado',
  /** Foi confirmado, mas a lista mudou desde então: volta a pedir confirmação. */
  CHANGED: 'alterado',
  IGNORED: 'ignorado',
  /** Existe, mas nada nele vale (JSON quebrado, grande demais, sem guia válido). */
  INVALID: 'invalido',
})

const GUIDE_FOLDER_PATTERN = /^padr[aã]o de qualidade\s*-\s*(.+)$/i

function hashGuides(guides) {
  const canonical = guides.map((guide) => sourceKey(guide)).sort()
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

/**
 * Lê o texto de `.felixo/system-design.json`. Entrada inválida vira problema e
 * fica de fora; as válidas seguem (a pessoa vê as duas coisas antes de
 * confirmar). Formato: `{ "guias": [ { "url": "https://…", "branch": "main" } ] }`.
 *
 * @returns {{ guides: {repoUrl: string, branch: string}[], problems: string[], hash: string | null }}
 */
function parseProjectGuideFile(text) {
  const raw = typeof text === 'string' ? text : ''
  if (Buffer.byteLength(raw, 'utf8') > MAX_GUIDE_FILE_BYTES) {
    return { guides: [], problems: [`O arquivo passa de ${MAX_GUIDE_FILE_BYTES / 1024} KB.`], hash: null }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { guides: [], problems: ['O arquivo não é um JSON válido.'], hash: null }
  }
  const list = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.guias : undefined
  if (!Array.isArray(list)) {
    return { guides: [], problems: ['O arquivo precisa de uma lista "guias".'], hash: null }
  }

  const problems = []
  const guides = []
  for (const [index, item] of list.entries()) {
    const label = `Guia ${index + 1}`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`${label}: use { "url": "…", "branch": "…" }.`)
      continue
    }
    const url = typeof item.url === 'string' ? item.url.trim() : ''
    const urlProblem = validateSourceUrl(url)
    if (urlProblem) {
      problems.push(`${label}: ${urlProblem}`)
      continue
    }
    const branch = item.branch === undefined ? DEFAULT_GUIDE_BRANCH : normalizeBranch(item.branch)
    const branchProblem = validateBranch(branch)
    if (branchProblem) {
      problems.push(`${label}: ${branchProblem}`)
      continue
    }
    const repoUrl = sanitizeGitRemoteUrl(url)
    // Só http(s) carrega senha/token na URL; o `git@` de uma URL ssh é usuário.
    if (/^https?:\/\/[^/\s]*@/i.test(url)) problems.push(`${label}: a credencial da URL foi descartada.`)
    const guide = { repoUrl, branch }
    if (guides.some((existing) => sourcesEqual(existing, guide))) continue
    if (guides.length === MAX_PROJECT_GUIDES) {
      problems.push(`Só os ${MAX_PROJECT_GUIDES} primeiros guias valem.`)
      break
    }
    guides.push(guide)
  }

  return { guides, problems, hash: guides.length ? hashGuides(guides) : null }
}

/** Pastas de guias na raiz do projeto, a partir da listagem dela. */
function detectGuideFolders(entries) {
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry) => entry && entry.isDirectory && typeof entry.name === 'string')
    .map((entry) => {
      const match = entry.name.normalize('NFC').match(GUIDE_FOLDER_PATTERN)
      return match ? { name: entry.name, label: match[1].trim() } : null
    })
    .filter((folder) => folder && folder.label)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function normalizeProjectSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const guides = normalizeGuideList(Array.isArray(value.guides) ? value.guides : [], {
    maxGuides: MAX_PROJECT_GUIDES,
  })
  return {
    useRepoFile: value.useRepoFile !== false,
    confirmedFileHash:
      typeof value.confirmedFileHash === 'string' && /^[0-9a-f]{64}$/.test(value.confirmedFileHash)
        ? value.confirmedFileHash
        : null,
    useGuideFolders: value.useGuideFolders !== false,
    guides: guides.ok ? guides.guides : [],
  }
}

/** `system-design.projects`: escolhas por raiz de projeto. */
function normalizeProjectSettingsStore(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const projects = {}
  const rawProjects = value.projects && typeof value.projects === 'object' ? value.projects : {}
  for (const [root, settings] of Object.entries(rawProjects)) {
    if (typeof root === 'string' && root) projects[root] = normalizeProjectSettings(settings)
  }
  return { version: PROJECT_SETTINGS_VERSION, projects }
}

function settingsForRoot(store, root) {
  return store.projects[root] ?? normalizeProjectSettings(null)
}

/**
 * Aplica uma alteração vinda do renderer às escolhas de UM projeto. Lista
 * branca. A confirmação só vale para o conteúdo que a pessoa está vendo agora:
 * um hash diferente do arquivo atual é recusado.
 *
 * @returns {{ ok: true, settings: object } | { ok: false, message: string }}
 */
function applyProjectChange(settings, partial, { currentFileHash = null } = {}) {
  const change = partial && typeof partial === 'object' ? partial : {}
  const next = { ...settings, guides: [...settings.guides] }

  if (typeof change.confirmFile === 'string') {
    if (!currentFileHash || change.confirmFile !== currentFileHash) {
      return { ok: false, message: 'O arquivo do projeto mudou desde que você o viu. Confira de novo antes de confirmar.' }
    }
    next.confirmedFileHash = currentFileHash
    next.useRepoFile = true
  } else if (change.ignoreFile === true) {
    next.useRepoFile = false
    next.confirmedFileHash = null
  } else if (change.useRepoFile === true) {
    next.useRepoFile = true
  }

  if (typeof change.useGuideFolders === 'boolean') next.useGuideFolders = change.useGuideFolders

  if (change.guides !== undefined) {
    const result = normalizeGuideList(change.guides, { maxGuides: MAX_PROJECT_GUIDES })
    if (!result.ok) return result
    next.guides = result.guides
  }

  return { ok: true, settings: next }
}

/** Situação do arquivo, cruzando o que foi lido com a escolha gravada. */
function fileStatus(file, settings) {
  if (!file || !file.present) return FILE_STATUS.ABSENT
  if (!settings.useRepoFile) return FILE_STATUS.IGNORED
  if (!file.parsed || !file.parsed.hash) return FILE_STATUS.INVALID
  if (settings.confirmedFileHash === file.parsed.hash) return FILE_STATUS.CONFIRMED
  return settings.confirmedFileHash ? FILE_STATUS.CHANGED : FILE_STATUS.PENDING
}

function projectGuideLabel(guide) {
  return sourcesEqual(guide, getDefaultSource()) ? DEFAULT_LABEL : labelFor(guide, 'custom')
}

/**
 * Resolve a camada de projeto de UMA raiz.
 *
 * @param {object} input
 * @param {object} input.settings - escolhas gravadas para esta raiz
 * @param {{ present: boolean, parsed: object | null } | null} input.file - arquivo lido (ou ausente)
 * @param {{ name: string, label: string, path: string }[]} input.folders - pastas de guias detectadas
 */
function resolveProjectLayer({ settings, file, folders = [] }) {
  const status = fileStatus(file, settings)
  const guides = []
  const add = (guide) => {
    if (!guides.some((existing) => existing.key === guide.key)) guides.push(guide)
  }

  if (status === FILE_STATUS.CONFIRMED) {
    for (const guide of file.parsed.guides) {
      add({ ...guide, key: sourceKey(guide), kind: 'git', label: projectGuideLabel(guide), origin: PROJECT_ORIGINS.FILE })
    }
  }
  if (settings.useGuideFolders) {
    for (const folder of folders) {
      add({ key: `local:${folder.path}`, kind: 'local', path: folder.path, label: folder.label, origin: PROJECT_ORIGINS.FOLDER })
    }
  }
  for (const guide of settings.guides) {
    add({ ...guide, key: sourceKey(guide), kind: 'git', label: projectGuideLabel(guide), origin: PROJECT_ORIGINS.APP })
  }

  return {
    guides,
    file: {
      present: Boolean(file?.present),
      path: PROJECT_GUIDE_FILE,
      status,
      guides: file?.parsed?.guides ?? [],
      problems: file?.parsed?.problems ?? [],
      hash: file?.parsed?.hash ?? null,
    },
    folders: folders.map((folder) => ({ ...folder, active: settings.useGuideFolders })),
    appGuides: settings.guides,
    useGuideFolders: settings.useGuideFolders,
  }
}

/**
 * Guias que valem num projeto: os do projeto, se houver, no lugar dos do
 * usuário (decisão de 08/10/2026); senão os do usuário. `replaced` diz quais
 * guias do usuário deixaram de valer ali — a UI e o lembrete avisam.
 *
 * @param {{ userGuides: object[], userSourceMode: string, projectLayer: object | null }} input
 */
function resolveEffectiveGuides({ userGuides, userSourceMode, projectLayer }) {
  if (projectLayer && projectLayer.guides.length > 0) {
    return { layer: 'projeto', guides: projectLayer.guides, replaced: userGuides }
  }
  return {
    layer: userSourceMode === 'custom' ? 'usuario' : 'padrao',
    guides: userGuides,
    replaced: [],
  }
}

module.exports = {
  FILE_STATUS,
  MAX_GUIDE_FILE_BYTES,
  MAX_PROJECT_GUIDES,
  PROJECT_GUIDE_FILE,
  PROJECT_GUIDE_FILE_SEGMENTS,
  PROJECT_ORIGINS,
  applyProjectChange,
  detectGuideFolders,
  normalizeProjectSettings,
  normalizeProjectSettingsStore,
  parseProjectGuideFile,
  projectGuideLabel,
  resolveEffectiveGuides,
  resolveProjectLayer,
  settingsForRoot,
}

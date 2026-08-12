/**
 * @module editor-command
 * Qual editor abrir quando alguem pede para editar um arquivo num terminal.
 *
 * A escolha da pessoa vem primeiro (`$VISUAL`, depois `$EDITOR`), porque quem
 * configurou uma dessas ja disse qual editor quer. Sem configuracao, cai numa
 * lista de candidatos **conferidos no PATH**: oferecer um editor que nao esta
 * instalado so troca o "comando nao encontrado" de lugar, que e exatamente o
 * problema que este modulo existe para resolver.
 *
 * `vi` fecha a lista no POSIX por ser o unico exigido pelo proprio padrao —
 * quando nem ele existe, nao ha fallback honesto a oferecer.
 */

const { resolveCommandPath } = require('../core/cli-detector.cjs')

/** Ordem de preferencia por plataforma, quando nada esta configurado. */
const EDITOR_CANDIDATES = {
  win32: ['notepad'],
  posix: ['nano', 'micro', 'vim', 'vi'],
}

/**
 * @typedef {object} EditorCommand
 * @property {string} command
 * @property {string[]} args - Argumentos que vem antes do arquivo.
 */

/**
 * @param {object} [options]
 * @param {Record<string, string>} [options.env] - Injetavel em teste.
 * @param {string} [options.platform] - Injetavel em teste.
 * @param {(command: string, env: object, options?: object) => string | null} [options.resolvePath]
 * @returns {{ ok: true, editor: EditorCommand } | { ok: false, message: string }}
 */
function resolveEditorCommand(options = {}) {
  const {
    env = process.env,
    platform: platformName = process.platform,
    resolvePath = resolveCommandPath,
  } = options

  const configured = parseEditorSetting(env.VISUAL) ?? parseEditorSetting(env.EDITOR)

  // Configurado vale mesmo sem passar pelo PATH: pode ser um caminho absoluto,
  // uma funcao do shell ou algo que so existe no ambiente do terminal.
  if (configured) {
    return { ok: true, editor: configured }
  }

  const candidates =
    platformName === 'win32' ? EDITOR_CANDIDATES.win32 : EDITOR_CANDIDATES.posix

  for (const candidate of candidates) {
    if (resolvePath(candidate, env, { platform: platformName })) {
      return { ok: true, editor: { command: candidate, args: [] } }
    }
  }

  return {
    ok: false,
    message: `Nenhum editor de terminal encontrado (${candidates.join(', ')}). Defina EDITOR ou VISUAL.`,
  }
}

/**
 * Le uma configuracao como `code -w` ou `"C:\\Program Files\\ed.exe" -n`.
 *
 * Separa por espaco respeitando aspas, porque um editor configurado costuma vir
 * com opcao junto e um caminho no Windows costuma ter espaco no meio.
 *
 * @param {unknown} value
 * @returns {EditorCommand | null}
 */
function parseEditorSetting(value) {
  const raw = typeof value === 'string' ? value.trim() : ''

  if (!raw) {
    return null
  }

  const parts = raw.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  const unquoted = parts.map((part) =>
    /^(".*"|'.*')$/.test(part) ? part.slice(1, -1) : part,
  )
  const [command, ...args] = unquoted.filter(Boolean)

  return command ? { command, args } : null
}

module.exports = {
  EDITOR_CANDIDATES,
  parseEditorSetting,
  resolveEditorCommand,
}

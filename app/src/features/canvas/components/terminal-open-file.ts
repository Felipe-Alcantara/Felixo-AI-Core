/**
 * Descobre qual arquivo está aberto num editor de texto (`nano`/`vim`/`vi`)
 * num terminal, para oferecer o preview renderizado sem pedir que a pessoa
 * aponte o caminho de novo.
 *
 * Há duas formas de um editor estar aberto ali, e elas pedem fontes
 * diferentes:
 *
 * 1. **O app abriu** (painel Projetos → "editar no terminal"): o bloco nasce
 *    com `command: nano`, `args: [..., arquivo]`. O comando é executado via
 *    `bash -c` e por isso **nunca é ecoado na tela** — procurá-lo no texto do
 *    terminal não acha nada. Aqui a resposta certa é a opção de lançamento,
 *    que o app já tem e não precisa adivinhar.
 * 2. **A pessoa digitou** `nano arquivo.md` num terminal de shell: aí o
 *    comando foi ecoado e vive no histórico do shell.
 *
 * `resolveOpenEditorFile` tenta (1) e cai para (2), porque (1) é um fato
 * registrado e (2) é leitura de tela.
 */

// Exige o editor no INÍCIO de um comando (começo de linha ou depois de um
// prompt/separador de comando), nunca só "depois de um espaço qualquer" — sem
// isso, o próprio texto que o editor imprime na tela ("GNU nano 7.2") também
// batia, e "7.2" virava um nome de arquivo fantasma.
const EDITOR_COMMAND = /^(?:nano|vim?)\s+(.+)$/
const COMMAND_SEPARATORS = /[;&|]+/
const PROMPT_PREFIX = /^[$#>%]\s*/

/**
 * @param transcript - Histórico de comandos do shell (`store.getShellHistory`,
 *   não `getTranscript` — este último lê a tela atual de um app de tela
 *   cheia como o nano, que não tem o comando que o abriu).
 * @param cwd - Diretório de trabalho do terminal, para resolver caminho relativo.
 */
export function findLastEditedFile(
  transcript: string,
  cwd: string | undefined,
): { path: string; name: string } | undefined {
  const lines = transcript.split('\n')

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    // Uma linha pode encadear vários comandos (`cd x && nano y`); cada pedaço
    // é testado como um comando próprio.
    const segments = lines[i].trim().split(COMMAND_SEPARATORS)

    for (let j = segments.length - 1; j >= 0; j -= 1) {
      const segment = segments[j].trim().replace(PROMPT_PREFIX, '')
      const match = EDITOR_COMMAND.exec(segment)
      if (!match) continue

      const arg = extractFirstArg(match[1])
      if (!arg || arg.startsWith('-')) continue

      const path = resolvePath(arg, cwd)
      const name = path.split(/[\\/]/).pop() ?? path
      return { path, name }
    }
  }

  return undefined
}

/** Editor conhecido, aceitando caminho completo (`/usr/bin/nano`). */
const EDITOR_BINARY = /^(?:nano|vim?)$/

/**
 * O arquivo que o app mandou o terminal abrir, lido da opção de lançamento.
 *
 * @param command - Comando do bloco (`nano`, `/usr/bin/vim`, …).
 * @param args - Argumentos do bloco; o arquivo é o último, como montado em
 *   `ProjectsPanel.editFileInTerminal` (`[...editor.args, entry.name]`).
 * @param cwd - Diretório do bloco, para resolver o nome relativo.
 */
export function findLaunchedEditorFile(
  command: string | undefined,
  args: string[] | undefined,
  cwd: string | undefined,
): { path: string; name: string } | undefined {
  const binary = (command ?? '').split(/[\\/]/).pop() ?? ''
  if (!EDITOR_BINARY.test(binary)) return undefined

  const last = args?.[args.length - 1]
  if (!last || last.startsWith('-')) return undefined

  const path = resolvePath(last, cwd)
  return { path, name: path.split(/[\\/]/).pop() ?? path }
}

/**
 * O arquivo aberto num editor deste terminal, preferindo o que o app
 * registrou ao lançar o bloco e caindo para o histórico do shell.
 */
export function resolveOpenEditorFile(options: {
  command?: string
  args?: string[]
  cwd?: string
  shellHistory: string
}): { path: string; name: string } | undefined {
  return (
    findLaunchedEditorFile(options.command, options.args, options.cwd) ??
    findLastEditedFile(options.shellHistory, options.cwd)
  )
}

/** Pega o primeiro argumento da linha, respeitando aspas simples/duplas. */
function extractFirstArg(rest: string): string | undefined {
  const trimmed = rest.trim()
  const quoted = /^(['"])(.*?)\1/.exec(trimmed)
  if (quoted) return quoted[2]
  return trimmed.split(/\s+/)[0]
}

function resolvePath(arg: string, cwd: string | undefined): string {
  const isAbsolute = arg.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(arg)
  if (isAbsolute || !cwd) return arg
  const separator = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'
  return `${cwd.replace(/[\\/]+$/, '')}${separator}${arg}`
}

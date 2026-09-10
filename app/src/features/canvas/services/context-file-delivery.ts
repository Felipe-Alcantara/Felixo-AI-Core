import { isSubmittedTerminalText, toSubmittedTerminalText } from '../terminal/terminal-input'

export type ContextFileKind =
  | 'initial-context'
  | 'canvas-context'
  | 'agent-identity'
  | 'skills-manifest'
  | 'handoff'
  | 'catalog-prompt'
  | 'skill-prompt'
  | 'collaboration'
  | 'scratchpad-link'
  | 'rename'

export type ContextFilePart = {
  kind: ContextFileKind
  content: string
}

/**
 * Commands belong to the agent CLI parser, not to the context-file channel.
 * Keeping this rule here prevents a future refactor from turning `/resume`
 * (or another slash command) into a file path by accident.
 */
export function isAgentCliCommand(text: string): boolean {
  const body = String(text ?? '').replace(/(?:\r\n|\r|\n)+$/, '').trim()
  return /^\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(body)
}

export function contextFileKindForPrompt(text: string): ContextFileKind {
  return isSubmittedTerminalText(text) ? 'handoff' : 'initial-context'
}

/**
 * Quotes the opaque artifact name used by `felixo context read`. It is not a
 * filesystem path: the active Felixo command resolves the native user-data
 * directory for the current OS/profile.
 */
export function quoteContextFileName(fileName: string): string {
  return `"${String(fileName).replaceAll('"', '\\"')}"`
}

/**
 * Keeps the generated startup contexts independently readable. The first
 * section is the quality standard; the remaining headings are produced by
 * `buildCanvasTerminalInitialText`. User/catalog bodies and handoff text are
 * deliberately left as one part so their content remains byte-for-byte
 * intact.
 */
export function splitInitialContext(text: string): ContextFilePart[] {
  const headings: Array<{ marker: string; kind: ContextFileKind }> = [
    { marker: 'Contexto do canvas:', kind: 'canvas-context' },
    { marker: 'Sua identidade no canvas:', kind: 'agent-identity' },
    {
      marker: 'Arquivos .md do canvas ligados a este terminal:',
      kind: 'scratchpad-link',
    },
    { marker: 'Skills disponíveis neste sistema', kind: 'skills-manifest' },
  ]
  const positions = headings
    .map((heading) => ({ ...heading, index: text.indexOf(heading.marker) }))
    .filter((heading) => heading.index >= 0)
    .sort((left, right) => left.index - right.index)

  if (positions.length === 0) {
    return [{ kind: 'initial-context', content: text }]
  }

  const parts: ContextFilePart[] = []
  const first = text.slice(0, positions[0].index).trim()
  if (first) {
    parts.push({ kind: 'initial-context', content: first })
  }

  positions.forEach((position, index) => {
    const end = positions[index + 1]?.index ?? text.length
    const content = text.slice(position.index, end).trim()
    // CANVAS_CONTEXT_PROMPT describes the live .md scratchpad channel. It is
    // deliberately not copied into immutable delivery files: the generated
    // header and the dedicated scratchpad-link file already describe that
    // channel, while the original prompt remains the fallback-inline text.
    if (content && position.kind !== 'canvas-context') {
      parts.push({ kind: position.kind, content })
    }
  })

  if (parts.length > 0) {
    return parts
  }

  // The live canvas scratchpad is intentionally not copied into an immutable
  // delivery file. Keep a small, generated pointer so an initial context made
  // only of that section still gives the agent an actionable instruction.
  return [{
    kind: 'scratchpad-link',
    content: 'O scratchpad .md compartilhado do canvas é o único canal gravável. Leia-o para acompanhar o trabalho e registre nele o progresso; este arquivo temporário é somente leitura.',
  }]
}

/**
 * @param commandPath - Caminho absoluto do shim `felixo` desta instância
 *   (`window.felixo.contextFiles.write(...).commandPath`). Quando presente,
 *   a instrução manda rodar esse caminho exato em vez do nome nu "felixo":
 *   em bash/zsh uma FUNÇÃO de shell com esse nome — instalada por outra
 *   ferramenta no `.bashrc`/`.zshrc` da pessoa — vence a resolução do PATH
 *   silenciosamente, e o agente acaba rodando o comando errado sem erro
 *   nenhum (visto em relato real: um agente só percebeu porque foi conferir
 *   `felixo --help` por conta própria). Sem o caminho (ponte antiga, web
 *   preview), cai de volta no nome nu.
 */
export function buildContextFileReferences(
  files: Array<{ name: string; kind: ContextFileKind }>,
  submitted: boolean,
  commandPath?: string,
): string {
  const command = commandPath ? quoteContextFileName(commandPath) : 'felixo'
  const lines = [
    'CONTEXTO ENTREGUE EM ARQUIVOS SOMENTE LEITURA',
    'Leia todos os arquivos abaixo antes de agir. Eles são artefatos temporários do Felixo AI Core, não fazem parte do repositório, não devem ser editados nem versionados.',
    'Se precisar registrar progresso, use o scratchpad .md compartilhado do canvas — estes arquivos não são o scratchpad.',
    'Os nomes abaixo são portáveis entre Linux, macOS e Windows; não use caminhos absolutos de outra máquina ou perfil.',
    commandPath
      ? 'Leia cada artefato com o comando no caminho exato indicado abaixo, não com o nome nu "felixo": outro comando de mesmo nome pode existir no seu shell (função de .bashrc/.zshrc de outra ferramenta) e venceria a resolução do PATH sem aviso, lendo o arquivo errado. Se mesmo assim falhar, informe o nome e o erro exatos — não substitua por outro artefato equivalente.'
      : 'Leia cada artefato pelo comando do Felixo e, se ele falhar, informe o nome e o erro exatos — não substitua por outro artefato equivalente.',
    ...files.flatMap(({ name, kind }) => [
      `- ${kind}: ${quoteContextFileName(name)}`,
      `  Leia com: ${command} context read ${quoteContextFileName(name)}`,
    ]),
  ]
  const reference = lines.join('\n')
  return submitted ? toSubmittedTerminalText(reference) : reference
}

export function buildInlineFallback(text: string): string {
  const submitted = isSubmittedTerminalText(text)
  const body = String(text ?? '').replace(/(?:\r\n|\r|\n)+$/, '')
  const warning = [
    'AVISO DO FELIXO AI CORE: não foi possível criar o arquivo temporário de contexto; usando o fallback inline.',
    'O texto abaixo é contexto entregue pelo app. Valide-o contra o estado real do projeto.',
    '',
    body,
  ].join('\n')
  return submitted ? toSubmittedTerminalText(warning) : warning
}

import { isSubmittedTerminalText, toSubmittedTerminalText } from '../terminal/terminal-input'
import { buildSkillsManifestPrompt } from './skills-manifest'
import type { CanvasSkill } from '../types'

/**
 * Standing instruction typed into a terminal that opens WITH an agent
 * (Claude/Gemini/Codex), telling it to follow the project's quality standard
 * regardless of the task. Independent of file-block linking.
 */

export const DEFAULT_QUALITY_STANDARD_PROMPT = `Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE do Felixo System Design (padrões de design, backend/frontend, política de git e o template de contexto IA.md). Procure os guias na pasta "Padrão de qualidade - Felixo System Design/" dentro do repositório; se ela não existir, use a fonte: https://github.com/Felipe-Alcantara/Felixo-System-Design. Leia o que for relevante para a tarefa e mantenha esse padrão em tudo que produzir (código, commits e documentação). Se estiver atualizando um arquivo de contexto ou plano, nunca encerre a resposta com o trabalho ainda marcado como "em andamento": faça a última edição do arquivo e deixe o estado final claro (concluído, bloqueado, aguardando decisão ou interrompido com motivo).

Quando precisar perguntar algo ao usuário (escolher entre opções, confirmar uma decisão que só ele pode tomar), use a ferramenta interativa de pergunta da sua própria CLI (ex.: AskUserQuestion), se ela existir — não escreva a pergunta como texto corrido no chat. Pergunta em texto vira só um parágrafo na conversa, sem botão nem campo pra responder; a ferramenta interativa é o que dá ao usuário uma UI de verdade para escolher.`

const CANVAS_CONTEXT_PROMPT = `Contexto do canvas: você está em um nó do canvas do Felixo AI Core. Esse terminal faz parte do canvas, então trate o canvas como o ambiente real de trabalho. Se este terminal estiver ligado a um arquivo .md do canvas, esse arquivo é um scratchpad vivo compartilhado entre agentes e é a fonte da verdade do trabalho. Leia-o, siga-o e mantenha-o atualizado conforme o trabalho avançar.`

/** Identity given to an agent terminal: its name, cwd and the multi-agent setting. */
export type AgentIdentity = {
  /** The block's human-given name; the agent should know and use it. */
  agentName?: string
  /** Working directory/project the terminal was opened in. */
  cwd?: string
}

/**
 * Tells the agent who it is inside the canvas: its given name, where it is
 * working, and that other agents may be running in parallel — so it signs its
 * notes in shared files and doesn't assume it is alone in the repo.
 */
export function buildAgentIdentityPrompt(identity: AgentIdentity): string {
  const name = identity.agentName?.trim()
  const cwd = identity.cwd?.trim()
  const lines = ['Sua identidade no canvas:']

  if (name) {
    lines.push(
      `- Seu nome neste canvas é "${name}". Quando escrever em arquivos compartilhados ou relatar progresso, identifique-se como "${name}".`,
    )
  }

  if (cwd) {
    lines.push(`- Você está trabalhando no diretório/projeto: ${cwd}`)
  }

  lines.push(
    '- Este é um ambiente multi-agente: outros agentes podem estar rodando em paralelo em outros terminais do canvas, possivelmente no mesmo repositório. Coordene pelo(s) arquivo(s) .md compartilhados, não assuma que mudanças no repositório são só suas e evite pisar no trabalho dos outros (commits, arquivos em edição, branches).',
  )

  return lines.join('\n')
}

/**
 * A instrução permanente como texto, sem Enter.
 *
 * Ela só prepara o agente: não há nada para executar, então ela é digitada e
 * fica esperando. Quem acrescenta o Enter é o chamador que junta uma tarefa de
 * verdade a ela (ver `composeTerminalInitialText`).
 */
export function buildQualityStandardMessage(template: string): string {
  return template.trimEnd()
}

/** Typed into an agent terminal restored from a previous run instead of its
 *  usual standing instruction — see resolveTerminalInitialText. */
export const RESUME_INITIAL_TEXT = toSubmittedTerminalText('/resume')

/**
 * Creates the standing instruction for an optional external planning file.
 * The file can have any extension: the agent receives its path and decides how
 * to read it, rather than the UI imposing a file-format policy.
 */
export function buildPlanningFileInstruction(
  planningFile?: string,
): string | undefined {
  const path = planningFile?.trim()
  if (!path) {
    return undefined
  }

  return [
    'ARQUIVO DE PLANEJAMENTO OBRIGATÓRIO',
    'Leia o arquivo a seguir antes de começar e siga as funções, etapas e decisões indicadas nele.',
    'Você é responsável por executar e manter esse plano atualizado quando apropriado.',
    `Caminho: ${path}`,
  ].join('\n')
}

/**
 * Junta instruções completas num prompt só, sem decidir se ele roda.
 *
 * Devolve texto puro de propósito: `injetar contexto` e `enviar prompt` são
 * coisas diferentes, e misturar as duas foi o que fez o terminal sair
 * executando sozinho. Quem tem uma tarefa a despachar envolve o resultado em
 * `toSubmittedTerminalText`.
 */
export function composeTerminalInitialText(
  ...sections: Array<string | undefined>
): string | undefined {
  const normalized = sections
    .map((section) => section?.trim())
    .filter((section): section is string => Boolean(section))

  return normalized.length > 0 ? normalized.join('\n\n') : undefined
}

/**
 * A terminal must wait until every source of its first instruction is known.
 * In particular, the restored-agent capture decides whether `/resume` takes
 * precedence over the normal initial prompt after an application restart.
 */
export function isTerminalInitialTextReady(params: {
  restoredAgentsCaptured: boolean
  edgesHydrated: boolean
  connectedCanvasFileCount: number
  resolvedCanvasFileCount: number
}): boolean {
  return (
    params.restoredAgentsCaptured &&
    params.edgesHydrated &&
    (params.connectedCanvasFileCount === 0 ||
      params.resolvedCanvasFileCount >= params.connectedCanvasFileCount)
  )
}

/**
 * Decides what a canvas terminal's first-spawn text should be. A terminal
 * that already existed on disk when the app booted (`isRestoredAgent`) may
 * have unfinished work from a previous run, so it gets "/resume" instead of
 * whatever standing instruction it would otherwise receive — regardless of
 * the quality-standard toggle, since resuming takes priority over restating
 * standing instructions the agent already saw last run.
 */
export function resolveTerminalInitialText(params: {
  isRestoredAgent: boolean
  qualityStandardEnabled: boolean
  qualityStandardPrompt: string
  hasCommand: boolean
  existingInitialText?: string
  canvasFilePaths?: string[]
  identity?: AgentIdentity
}): string | undefined {
  // "/resume" is an agent CLI slash command — meaningless (and potentially
  // confusing) typed into a plain shell, so hasCommand gates it here too,
  // not just in how the caller builds the restored-terminal set.
  if (params.isRestoredAgent && params.hasCommand) {
    return RESUME_INITIAL_TEXT
  }
  if (params.qualityStandardEnabled && params.hasCommand) {
    return buildCanvasTerminalInitialText(
      params.qualityStandardPrompt,
      params.existingInitialText,
      params.canvasFilePaths,
      params.identity,
    )
  }
  return params.existingInitialText
}

/**
 * Builds the full standing instruction for a canvas terminal, combining the
 * quality standard with the canvas-specific shared-scratchpad context and the
 * agent's identity (name, cwd, multi-agent setting).
 *
 * O resultado só é submetido quando `existingPrompt` já vinha submetido — isto
 * é, quando existe uma tarefa de verdade embrulhada nele (uma passagem de
 * responsabilidade). Contexto sozinho não tem o que executar: ele é digitado e
 * espera o usuário escrever o pedido. Sem essa distinção o agente subia já
 * executando e ia caçar uma tarefa dentro do texto de contexto.
 */
export function buildCanvasTerminalInitialText(
  qualityPrompt: string,
  existingPrompt?: string,
  canvasFilePaths: string[] = [],
  identity?: AgentIdentity,
  skills: CanvasSkill[] = [],
): string {
  const basePrompt = (existingPrompt?.trim() || buildQualityStandardMessage(qualityPrompt)).trimEnd()
  const uniquePaths = [...new Set(canvasFilePaths.map((path) => path.trim()).filter(Boolean))]
  const pathPrompt = uniquePaths.length
    ? [
        'Arquivos .md do canvas ligados a este terminal:',
        ...uniquePaths.map((path) => `- ${path}`),
        'Use esses caminhos para ler e salvar o contexto que aparece nos blocos .md do canvas.',
      ].join('\n')
    : ''

  const sections = [basePrompt]

  if (!basePrompt.includes('Contexto do canvas:')) {
    sections.push(CANVAS_CONTEXT_PROMPT)
  }

  if (
    identity &&
    (identity.agentName?.trim() || identity.cwd?.trim()) &&
    !basePrompt.includes('Sua identidade no canvas:')
  ) {
    sections.push(buildAgentIdentityPrompt(identity))
  }

  if (pathPrompt && uniquePaths.some((path) => !basePrompt.includes(path))) {
    sections.push(pathPrompt)
  }

  // Por último: a lista de skills é referência de consulta, não instrução a
  // seguir de cara. Vindo depois da tarefa e da identidade, ela não compete
  // com o que o agente precisa fazer primeiro.
  const skillsPrompt = buildSkillsManifestPrompt(skills)
  if (skillsPrompt && !basePrompt.includes('Skills disponíveis neste sistema')) {
    sections.push(skillsPrompt)
  }

  const combined = sections.join('\n\n')
  return existingPrompt && isSubmittedTerminalText(existingPrompt)
    ? toSubmittedTerminalText(combined)
    : combined
}

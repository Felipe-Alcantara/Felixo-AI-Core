import type { SystemDesignProject } from '../../shared/system-design/types'
import { stripTerminalSubmission } from '../terminal/terminal-input'
import type { CanvasNodeData } from '../types'
import type { AgentCliVersions } from './agent-cli-versions'
import { isDirectOpeniaLaunch, isKnownAgentCommand } from './agent-launch-options'
import { resumeDependsOnVersion } from './agent-resume-capability'
import { explainAgentResume } from './agent-session'
import {
  isTerminalInitialTextReady,
  qualityStandardGuidesFrom,
  resolveQualityStandardPrompt,
  resolveTerminalInitialText,
  type QualityStandardGuides,
  type QualityStandardSource,
} from './quality-standard-prompt'
import { buildTerminalResumeBanner, followsTerminalResumePlan } from './terminal-resume-banner'

/** Agentes que já existiam no disco quando o app subiu (ver o CanvasView). */
export type RestoredAgentTerminals = {
  captured: boolean
  /** Agentes vindos do disco nesta execução do app: seguem o plano de retomada. */
  ids: ReadonlySet<string>
  /** Os restaurados ainda sem processo nesta execução: só esses são segurados. */
  holdable: ReadonlySet<string>
}

/** Tudo o que a decisão lê de fora do bloco. Nada aqui é estado nem ref. */
export type TerminalSpawnContext = {
  nodeId: string
  /** O lembrete do padrão de qualidade da pessoa e se ele está ligado. */
  qualityStandard: { prompt: string; enabled: boolean }
  /** As entradas do lembrete, para montá-lo com os guias do projeto do terminal. */
  qualityInputs: {
    stored: string | null
    source: QualityStandardSource | QualityStandardGuides | null
  }
  projectGuides: {
    projects: Record<string, SystemDesignProject>
    settled: Record<string, true>
  }
  /** Arquivos do canvas ligados a este terminal. */
  connectedFileNames: readonly string[]
  /** Os que já têm caminho absoluto resolvido. */
  canvasFilePaths: string[]
  restoredAgentTerminals: RestoredAgentTerminals
  edgesHydrated: boolean
  /** `null` enquanto o processo principal ainda responde as versões das CLIs. */
  agentCliVersions: AgentCliVersions | null
}

/**
 * O que um bloco de terminal deve fazer ao subir: que texto recebe, se retoma
 * a conversa gravada, e se o primeiro spawn fica segurado esperando a pessoa
 * escolher, a versão da CLI chegar ou os guias do projeto assentarem.
 *
 * Saiu do `useMemo` de renderização do CanvasView com as expressões copiadas
 * como estavam; o cache por bloco e a lista de dependências continuam lá.
 */
export function resolveTerminalSpawnPlan(data: CanvasNodeData, context: TerminalSpawnContext) {
  const {
    nodeId,
    qualityStandard,
    qualityInputs,
    projectGuides,
    connectedFileNames,
    canvasFilePaths,
    restoredAgentTerminals,
    edgesHydrated,
    agentCliVersions,
  } = context
  const node = { id: nodeId, data }

  const quality = qualityStandard
  // O lembrete cita os guias do projeto deste terminal (ou os da pessoa).
  const terminalProject =
    typeof node.data.cwd === 'string' ? projectGuides.projects[node.data.cwd] : undefined
  const qualityPrompt = terminalProject
    ? resolveQualityStandardPrompt({
        stored: qualityInputs.stored,
        source: qualityStandardGuidesFrom(terminalProject) ?? qualityInputs.source,
      })
    : quality.prompt
  const initialTextReady = isTerminalInitialTextReady({
    restoredAgentsCaptured: restoredAgentTerminals.captured,
    edgesHydrated,
    connectedCanvasFileCount: connectedFileNames.length,
    resolvedCanvasFileCount: canvasFilePaths.length,
  })
  const isDirectOpenia = isDirectOpeniaLaunch(node.data.command, node.data.args)
  const hasAgentCommand =
    isDirectOpenia ||
    (node.data.launchMode !== 'launcher' && isKnownAgentCommand(node.data.command))
  // Agente restaurado (ou com conversa associada, para o Reiniciar):
  // `explainAgentResume` decide se retoma pelo ID, digita `/resume`,
  // abre conversa nova ou — quando a conversa gravada não é exata —
  // segura o spawn até a pessoa escolher na faixa do cartão.
  const isRestoredAgent = restoredAgentTerminals.ids.has(node.id)
  const followsResumePlan = followsTerminalResumePlan({
    isRestoredAgent,
    hasAgentCommand,
    reference: node.data.agentSession,
  })
  const cliVersion = agentCliVersions?.[node.data.command ?? ''] ?? undefined
  const resumePlan = followsResumePlan
    ? explainAgentResume({
        command: node.data.command,
        cwd: node.data.cwd,
        reference: node.data.agentSession,
        accountId: node.data.accountId,
        failure: node.data.resumeFailure,
        choice: node.data.resumeChoice,
        cliVersion,
      })
    : undefined
  const resumeAgentSession = resumePlan?.outcome === 'exact'
  const resumePending = resumePlan?.outcome === 'pending'
  // Conversa gravada numa CLI cujo método depende da versão, e a versão
  // ainda não chegou do processo principal: o plano calculado agora é o de
  // "versão desconhecida". Só vale para quem segue o plano de retomada — um
  // lançador opaco nunca retoma, então não tem o que esperar.
  const cliVersionPending =
    followsResumePlan &&
    agentCliVersions === null &&
    node.data.agentSession !== undefined &&
    resumeDependsOnVersion(node.data.command)
  // Bloco restaurado ainda sem processo: espera a versão chegar antes de
  // subir. Sem isto o Gemini decidiria como "versão desconhecida" e a faixa
  // piscaria antes de a versão confirmar a retomada pelo ID.
  const waitsForCliVersion = cliVersionPending && restoredAgentTerminals.holdable.has(node.id)
  // Só o PRIMEIRO spawn de um bloco vindo do disco é segurado. Um bloco
  // cujo processo já subiu nesta execução (mesmo antes de uma ida ao
  // chat ou de um reload da interface) não tem o que segurar: o
  // `ensure()` dele é no-op ou só reanexa ao PTY vivo; a pendência vale
  // para o próximo Reiniciar, que mostra a faixa em vez de subir.
  const holdForResumeChoice = resumePending && restoredAgentTerminals.holdable.has(node.id)
  // Left open from a previous run: whatever it was doing may not have
  // finished, so type "/resume" on this (re)spawn instead of the usual
  // standing instruction — see restoredAgentTerminalIds above. With a
  // pending plan nothing is typed: the block waits for the person.
  const fallbackInitialText = resolveTerminalInitialText({
    isRestoredAgent: followsResumePlan,
    command: node.data.command,
    qualityStandardEnabled: quality.enabled,
    qualityStandardPrompt: qualityPrompt,
    hasCommand: hasAgentCommand,
    // `handoffText` é transitório e carrega um pedido de verdade, então
    // pode sair submetido; `initialText` é persistido e é sempre
    // contexto. O recorte cobre os blocos salvos antes desta mudança,
    // gravados com o Enter no fim — sem ele, um canvas antigo voltaria a
    // executar sozinho ao reabrir.
    existingInitialText:
      node.data.handoffText ?? stripTerminalSubmission(node.data.initialText),
    canvasFilePaths,
    identity: { agentName: node.data.label, cwd: node.data.cwd },
    cwd: node.data.cwd,
    agentSession: node.data.agentSession,
    accountId: node.data.accountId,
    resumeAgentSession,
    resumeFailure: node.data.resumeFailure,
    resumeChoice: node.data.resumeChoice,
    cliVersion,
  })
  // Só quando o lembrete vai ser MONTADO aqui (agente sem texto gravado):
  // espera a camada do projeto assentar, para não subir citando os guias
  // errados. Bloco novo já nasce com o texto, montado na criação.
  const waitsForProjectGuides =
    quality.enabled &&
    hasAgentCommand &&
    !followsResumePlan &&
    typeof node.data.cwd === 'string' &&
    Boolean(node.data.cwd) &&
    !node.data.handoffText &&
    !stripTerminalSubmission(node.data.initialText) &&
    !projectGuides.settled[node.data.cwd]

  return {
    cliVersion,
    cliVersionPending,
    fallbackInitialText,
    followsResumePlan,
    holdForResumeChoice,
    initialTextReady,
    isDirectOpenia,
    resumeAgentSession,
    resumePending,
    resumePlan,
    waitsForCliVersion,
    waitsForProjectGuides,
  }
}

export type TerminalSpawnPlan = ReturnType<typeof resolveTerminalSpawnPlan>

/**
 * A parte do plano que entra na chave do cache de dados do bloco, na ordem em
 * que o CanvasView a compara (entre `node.data` e a numeração do terminal).
 */
export function terminalSpawnCacheDeps(plan: TerminalSpawnPlan): unknown[] {
  const {
    cliVersion,
    cliVersionPending,
    fallbackInitialText,
    followsResumePlan,
    holdForResumeChoice,
    initialTextReady,
    isDirectOpenia,
    waitsForCliVersion,
    waitsForProjectGuides,
  } = plan

  return [
    fallbackInitialText,
    initialTextReady,
    waitsForProjectGuides,
    // O plano e a faixa são funções de `node.data` e destes flags;
    // o objeto do plano, novo a cada render, invalidaria o cache.
    followsResumePlan,
    holdForResumeChoice,
    cliVersion,
    waitsForCliVersion,
    isDirectOpenia,
    // A faixa espera a versão mesmo no bloco com processo (que não é
    // segurado): sem isto, versões que chegam sem a desta CLI não mudariam
    // nenhum outro valor e a faixa ficaria escondida para sempre.
    cliVersionPending,
  ]
}

/** Os campos que o plano acrescenta (ou sobrepõe) aos dados gravados do bloco. */
export function terminalSpawnData(data: CanvasNodeData, plan: TerminalSpawnPlan) {
  const {
    cliVersion,
    cliVersionPending,
    fallbackInitialText,
    holdForResumeChoice,
    initialTextReady,
    resumeAgentSession,
    resumePending,
    resumePlan,
    waitsForCliVersion,
    waitsForProjectGuides,
  } = plan
  const node = { data }

  return {
    // Retomada exata não digita nada; pendente não sobe — e nenhum
    // dos dois pode carregar a instrução de largada gravada.
    ...(resumeAgentSession || resumePending
      ? { initialText: undefined }
      : fallbackInitialText
        ? { initialText: fallbackInitialText }
        : {}),
    // A passagem vira o texto inicial deste bloco; a sessão precisa
    // saber disso para nunca reenviá-la num relançamento automático.
    initialTextIsHandoff: !resumeAgentSession && Boolean(node.data.handoffText),
    // Retomada pendente usa a mesma barreira da espera pelos
    // arquivos do canvas: o cartão não chama `ensure()` enquanto
    // for `false`. Nada sobe, nada é apagado, o canvas fica intacto
    // — "agora não" é simplesmente não clicar na faixa.
    initialTextReady:
      initialTextReady && !holdForResumeChoice && !waitsForCliVersion && !waitsForProjectGuides,
    resumeAgentSession,
    resumePlan,
    resumeCliVersion: cliVersion,
    // Enquanto a versão não chega, o plano é o de "versão desconhecida": a
    // faixa montada com ele trocaria de texto um instante depois.
    resumeBanner: resumePlan && !cliVersionPending
      ? buildTerminalResumeBanner({
          plan: resumePlan,
          reference: node.data.agentSession,
          cwd: node.data.cwd,
          command: node.data.command,
        })
      : null,
  }
}

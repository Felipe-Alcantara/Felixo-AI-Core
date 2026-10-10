import { buildPresetInstruction } from './agent-preset-prompt'
import { isDirectOpeniaLaunch } from './agent-launch-options'
import type { NewTerminalOptions } from './new-terminal-options'
import {
  buildCanvasTerminalInitialText,
  buildPlanningFileInstruction,
  buildQualityStandardMessage,
  composeTerminalInitialText,
} from './quality-standard-prompt'
import { toSubmittedTerminalText } from '../terminal/terminal-input'
import type { CanvasSkill } from '../types'

/** Opções de um terminal novo, mais o pedido que ele herda numa passagem de responsabilidade. */
export type TerminalNodeDataOptions = NewTerminalOptions & {
  handoffText?: string
  handoffAutoSubmit?: boolean
}

type TerminalNodeDataContext = {
  /** O lembrete do padrão de qualidade e se ele está ligado. */
  quality: { prompt: string; enabled: boolean }
  /** O texto do lembrete que vale na pasta deste terminal (guias do projeto ou da pessoa). */
  qualityPrompt: string
  availableSkills: CanvasSkill[]
}

/**
 * Dados gravados num bloco de terminal novo: comando, pasta, conta e o texto
 * que o agente recebe ao subir.
 */
export function buildTerminalNodeData(
  options: TerminalNodeDataOptions,
  { quality, qualityPrompt, availableSkills }: TerminalNodeDataContext,
) {
  // Agent terminals get the standing quality-standard instruction (if on)
  // plus their canvas identity (name, cwd, multi-agent setting); a plain
  // shell does not (there's no agent to read it).
  //
  // Só a passagem de responsabilidade sai submetida: ela carrega um pedido
  // que alguém despachou de propósito para este terminal. A instrução
  // permanente sozinha é contexto — fica digitada na entrada esperando o
  // usuário escrever a tarefa, em vez de o agente subir executando.
  const isDirectOpenia = isDirectOpeniaLaunch(options.command, options.args)
  const isOpaqueLauncher = options.launchMode === 'launcher' && !isDirectOpenia
  const isContextAwareCommand = Boolean(options.command && !isOpaqueLauncher)
  const planningInstruction = isContextAwareCommand
    ? buildPlanningFileInstruction(options.planningFile)
    : undefined
  // Preset de agente: contexto e skills dele entram no mesmo initialText,
  // que o session-store entrega por arquivo. Passagem de responsabilidade
  // (handoff) carrega o próprio pedido e não recebe preset.
  const presetInstruction = isContextAwareCommand && !options.handoffText
    ? buildPresetInstruction(options.preset, availableSkills)
    : undefined
  const handoffSections = isContextAwareCommand && options.handoffText
    ? composeTerminalInitialText(
        quality.enabled ? buildQualityStandardMessage(qualityPrompt) : undefined,
        options.handoffText,
        planningInstruction,
      )
    : undefined
  // Na continuação da cadeia a pessoa pode desmarcar "pedir para o agente
  // continuar": aí o contexto vai sem submissão, esperando por ela.
  const handoffInstruction = handoffSections
    ? options.handoffAutoSubmit === false
      ? handoffSections
      : toSubmittedTerminalText(handoffSections)
    : undefined
  const initialText = isContextAwareCommand
    ? handoffInstruction ?? composeTerminalInitialText(
        quality.enabled
          ? buildCanvasTerminalInitialText(
              qualityPrompt,
              undefined,
              [],
              { agentName: options.label, cwd: options.cwd },
              availableSkills,
            )
          : undefined,
        presetInstruction,
        planningInstruction,
      )
    : undefined

  return {
    label: options.label,
    ...(options.command ? { command: options.command } : {}),
    ...(options.args && options.args.length ? { args: options.args } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.accountId ? { accountId: options.accountId } : {}),
    ...(options.providerId ? { providerId: options.providerId } : {}),
    // Só a cadeia marca `chain`; ausente o bloco é fixo (decisão 5).
    ...(options.accountMode === 'chain' ? { accountMode: 'chain' as const } : {}),
    ...(options.chainTicket ? { chainTicket: options.chainTicket } : {}),
    ...(options.chainOrigin ? { chainOrigin: options.chainOrigin } : {}),
    ...(options.launchMode ? { launchMode: options.launchMode } : {}),
    ...(options.preset?.color ? { frameColor: options.preset.color } : {}),
    ...(initialText && !options.handoffText ? { initialText } : {}),
    ...(options.handoffText ? { handoffText: initialText } : {}),
  }
}

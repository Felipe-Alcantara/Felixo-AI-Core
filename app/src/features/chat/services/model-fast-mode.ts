import { getAgent, supportsFastMode } from '../../canvas/services/agent-launch-options'
import type { Model } from '../types'

const CODEX_CLI_TYPES = new Set(['codex', 'codex-app-server'])

/**
 * True quando o modelo de chat aceita o modo fast: só Codex, e só um modelo
 * (ou o padrão) que o catálogo do Codex lista com o tier. Mesma regra do
 * formulário de criar agente no canvas — uma fonte só (`supportsFastMode`).
 */
export function modelSupportsFastMode(
  model: Pick<Model, 'cliType' | 'providerModel'> | null | undefined,
): boolean {
  if (!model || !CODEX_CLI_TYPES.has(model.cliType)) return false
  return supportsFastMode(getAgent('codex'), model.providerModel ?? '')
}

/** O fastMode que pode ser guardado: `true` só onde suporta; senão ausente. */
export function resolveFastMode(
  model: Pick<Model, 'cliType' | 'providerModel'>,
  wanted: boolean | undefined,
): true | undefined {
  return wanted === true && modelSupportsFastMode(model) ? true : undefined
}

import type { CloudSessionBridge } from '../../shared/types/cloud-session'
import type { CloudSessionNodeData } from '../types'
import {
  appendFollowUp,
  applyLaunchResult,
  canFollowUp,
  canLaunch,
  markLaunching,
} from './cloud-session-state'

/**
 * Orquestração das duas chamadas do cartão "Agente na nuvem" ao processo
 * principal (disparar e enviar mensagem), sem React: o componente só liga os
 * botões a estas funções, e a regra fica testável no Node.
 *
 * As duas nunca rejeitam. Uma falha da ponte (IPC caiu, processo principal sem
 * o recurso) vira estado do cartão ou mensagem para a tela.
 */

export const CLOUD_SESSION_UNAVAILABLE = 'O agente na nuvem não está disponível nesta versão do app.'
export const CLOUD_SESSION_BRIDGE_ERROR = 'Não foi possível falar com o processo principal do app.'

type ActionParams = {
  nodeId: string
  /** Dados do cartão no momento do clique. */
  current: CloudSessionNodeData
  /** Dados mais recentes, lidos depois do `await`: o cartão pode ter mudado no meio. */
  latest: () => CloudSessionNodeData
  /** Ausente numa versão do app sem o serviço. */
  bridge: CloudSessionBridge | undefined
  /** Horário ISO 8601 em UTC. */
  now: () => string
  /** Mescla os campos `cloud*` no nó. */
  change: (patch: CloudSessionNodeData) => void
}

/**
 * Cria a sessão: marca o cartão como disparando, chama o main e grava o
 * resultado. `started: false` quer dizer que nada foi chamado (e nada gasto).
 */
export async function runLaunch(
  params: ActionParams,
): Promise<{ started: boolean; message?: string }> {
  const { nodeId, current, latest, bridge, now, change } = params
  if (!canLaunch(current)) return { started: false }
  if (!bridge) return { started: false, message: CLOUD_SESSION_UNAVAILABLE }

  change(markLaunching(current))
  try {
    const result = await bridge.launch({
      nodeId,
      task: current.cloudTask ?? '',
      cwd: current.cloudCwd ?? '',
      accountId: current.cloudAccountId,
    })
    change(applyLaunchResult(latest(), result, now()))
  } catch {
    change(
      applyLaunchResult(
        latest(),
        { ok: false, code: 'unknown', message: CLOUD_SESSION_BRIDGE_ERROR },
        now(),
      ),
    )
  }
  return { started: true }
}

/**
 * Envia uma mensagem à sessão e registra o resultado na lista do cartão.
 * `sent: false` sem `message` quer dizer que nada foi enviado por não haver o
 * que enviar (texto vazio ou cartão sem sessão).
 */
export async function runFollowUp(
  params: ActionParams & { text: string },
): Promise<{ sent: boolean; message?: string }> {
  const { nodeId, current, latest, bridge, now, change } = params
  const text = params.text.trim()
  if (!text || !canFollowUp(current) || !current.cloudSession) return { sent: false }
  if (!bridge) return { sent: false, message: CLOUD_SESSION_UNAVAILABLE }

  try {
    const result = await bridge.followUp({
      nodeId,
      sessionId: current.cloudSession.id,
      text,
      cwd: current.cloudCwd ?? '',
      accountId: current.cloudAccountId,
    })
    change(
      appendFollowUp(latest(), {
        at: now(),
        text,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.code }),
      }),
    )
    return result.ok ? { sent: true } : { sent: false, message: result.message }
  } catch {
    return { sent: false, message: CLOUD_SESSION_BRIDGE_ERROR }
  }
}

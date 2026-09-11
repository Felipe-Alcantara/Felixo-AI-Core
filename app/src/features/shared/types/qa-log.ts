// Evento de log emitido pelo processo principal. Fica em shared/ porque o
// painel que o mostra é do canvas, e não da tela de chat que o originou.
export type QaLogEntry = {
  id: number
  createdAt: string
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  sessionId?: string
  message: string
  details: unknown
}

/**
 * O que o renderer manda ao gravar um evento (`window.felixo.qaLogger.log`)
 * — sem `id`/`createdAt`, que o processo principal atribui na hora de
 * gravar.
 */
export type QaLogEntryInput = Omit<QaLogEntry, 'id' | 'createdAt'>

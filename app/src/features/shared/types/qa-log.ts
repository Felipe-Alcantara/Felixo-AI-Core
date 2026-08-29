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

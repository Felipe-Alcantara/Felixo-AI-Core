/** Resumo por pessoa do registro de sessões (electron/services/storage/agent-session-log-repository.cjs). */
export type AgentDailySummaryData = {
  generatedAt: string
  from: string | null
  to: string | null
  sessions: number
  people: Array<{
    responsible: string
    sessions: number
    interactions: number
    active_ms: number
    wall_ms: number
    /** Ainda abertas. */
    open: number
    /** Terminadas porque o app fechou ou caiu com a sessão aberta. */
    interrupted: number
    /** Sem nenhuma interação. */
    idle: number
    agents: Array<{ agent: string | null; model: string | null; sessions: number; interactions: number; active_ms: number }>
  }>
}

/** Hoje no relógio local, como `AAAA-MM-DD` (o valor de um `<input type="date">`). */
export function localDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Início e fim (ISO, UTC) do dia local `AAAA-MM-DD`: o registro guarda UTC, a pessoa pensa no dia dela. */
export function localDayBounds(day: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const start = new Date(year, month, date)
  // Dia que não existe (31/02) o Date rola para o mês seguinte; recusar evita resumo do dia errado.
  if (start.getMonth() !== month || start.getDate() !== date) return null
  return { from: start.toISOString(), to: new Date(year, month, date + 1).toISOString() }
}

/** `1 h 05 min`, `12 min` ou `menos de 1 min`. */
export function formatActiveTime(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

type Person = AgentDailySummaryData['people'][number]

/** O que merece um olhar do responsável, em frases curtas; vazio quando nada chama atenção. */
export function personAlerts(person: Person): string[] {
  const alerts: string[] = []
  if (person.open > 0) alerts.push(`${person.open} sessão(ões) ainda aberta(s)`)
  if (person.interrupted > 0) alerts.push(`${person.interrupted} interrompida(s) pelo fechamento do app`)
  if (person.idle > 0) alerts.push(`${person.idle} sem nenhuma interação`)
  return alerts
}

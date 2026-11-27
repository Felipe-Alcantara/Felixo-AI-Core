import type { DetachMode } from './terminal-detach'
import { MAX_DRAWER_PANES } from './terminal-drawer-panes'

/**
 * Quais terminais estavam numa janela própria, para reabri-los na próxima
 * execução. A posição e o tamanho de cada janela ficam no processo principal
 * (`window.aux.<id>.state`); aqui vai só quem estava destacado e como.
 */
const CHAVE = 'felixo.canvas.janelas-destacadas'

/**
 * Sair do app também fecha as janelas auxiliares, e isso pareceria um X da
 * pessoa. O X só esquece depois desta espera: o app que está saindo é destruído
 * antes de ela vencer.
 */
export const ESPERA_PARA_ESQUECER_MS = 2000

export type JanelaLembrada = { sessionId: string; modo: DetachMode }

const esquecimentos = new Map<string, ReturnType<typeof setTimeout>>()
let pendentes = new Map<string, DetachMode>()
let preparada = false

const eJanela = (item: unknown): item is JanelaLembrada => {
  const janela = item as Partial<JanelaLembrada> | null
  return (
    typeof janela?.sessionId === 'string' &&
    janela.sessionId !== '' &&
    (janela.modo === 'janela' || janela.modo === 'pip')
  )
}

export function janelasLembradas(): JanelaLembrada[] {
  try {
    const lido: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    return Array.isArray(lido) ? lido.filter(eJanela) : []
  } catch {
    return []
  }
}

function gravar(janelas: JanelaLembrada[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(janelas))
  } catch {
    // Sem armazenamento a janela só não reabre sozinha.
  }
}

function cancelarEsquecimento(sessionId: string): void {
  clearTimeout(esquecimentos.get(sessionId))
  esquecimentos.delete(sessionId)
}

export function lembrarJanela(sessionId: string, modo: DetachMode): void {
  cancelarEsquecimento(sessionId)
  gravar([...janelasLembradas().filter((j) => j.sessionId !== sessionId), { sessionId, modo }])
}

export function esquecerJanela(sessionId: string): void {
  cancelarEsquecimento(sessionId)
  gravar(janelasLembradas().filter((j) => j.sessionId !== sessionId))
}

export function esquecerJanelaDepois(sessionId: string): void {
  cancelarEsquecimento(sessionId)
  esquecimentos.set(sessionId, setTimeout(() => esquecerJanela(sessionId), ESPERA_PARA_ESQUECER_MS))
}

/**
 * Na partida do app: devolve os blocos cujo painel a gaveta deve abrir para a
 * janela voltar, e esquece os que não existem mais. Vale uma vez por execução.
 */
export function prepararReabertura(blocos: ReadonlySet<string>): string[] {
  if (preparada) return []
  preparada = true
  const lembradas = janelasLembradas()
  const existentes = lembradas.filter((j) => blocos.has(j.sessionId))
  if (existentes.length !== lembradas.length) gravar(existentes)
  // Só cabe na gaveta o que ela mostra lado a lado.
  pendentes = new Map(existentes.slice(0, MAX_DRAWER_PANES).map((j) => [j.sessionId, j.modo]))
  return [...pendentes.keys()]
}

export const reaberturaPendente = (sessionId: string): DetachMode | null => pendentes.get(sessionId) ?? null

export const concluirReabertura = (sessionId: string): void => void pendentes.delete(sessionId)

/** A pessoa fechou o painel antes de o terminal existir: não reabrir, nem na próxima vez. */
export function desistirDaReabertura(sessionIds: readonly string[]): void {
  for (const id of sessionIds) if (pendentes.delete(id)) esquecerJanela(id)
}

export function reiniciarReaberturaParaTeste(): void {
  preparada = false
  pendentes = new Map()
  for (const id of [...esquecimentos.keys()]) cancelarEsquecimento(id)
}

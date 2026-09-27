import type { AnchorId, StepDef, StepTarget } from './onboarding-catalog'
import {
  formatOnboardingMessage,
  resolveCardLocale,
  resolveOnboardingLocale,
  type MessageKey,
  type MessageParams,
} from './onboarding-messages'
import type { HelpEntry, HelpStatus } from './onboarding-state'
import type { NoticeSession, OnboardingPersistence, TourSession } from './onboarding-store'

/**
 * Textos prontos do card, do aviso e dos anúncios, a partir do snapshot da
 * store. Puro e sem React: a camada (casca) só mede e posiciona, e os
 * componentes só desenham o que recebem. Mora no chunk preguiçoso junto com as
 * mensagens.
 *
 * O locale é resolvido tudo ou nada por superfície (`resolveCardLocale`): se
 * falta uma chave no idioma pedido, a superfície inteira usa pt-BR, e o `lang`
 * nunca mente sobre o texto que acompanha.
 */

export type TourCardModel = {
  lang: string
  tourTitle: string
  stepTitle: string
  counter: string
  body: string
  skipLabel: string
  backLabel: string
  nextLabel: string
  /** `proximo` ou `concluir` no último passo: o mesmo botão, só muda o rótulo e o atributo. */
  nextAction: 'proximo' | 'concluir'
  isFirst: boolean
  isLast: boolean
  passoId: string
  ancora: AnchorId | null
  instancia: number
}

export type NoticeModel = {
  lang: string
  rotulo: string
  titulo: string
  verLabel: string
  agoraNaoLabel: string
}

export type Announcement = { texto: string; lang: string }

type TourView = Pick<TourSession, 'titulo' | 'lang' | 'stepIndex' | 'passos' | 'ancora' | 'instancia'>

/** O alvo cujo texto o card mostra: o resolvido pela camada, ou o primário antes da primeira medição. */
export function stepTargetFor(step: StepDef, ancora: AnchorId | null): StepTarget {
  return step.targets.find((target) => target.anchor === ancora) ?? step.targets[0]
}

function formatter(requested: string, keys: readonly MessageKey[]) {
  const lang = resolveCardLocale(resolveOnboardingLocale(requested), keys)
  return { lang, format: (key: MessageKey, params?: MessageParams) => formatOnboardingMessage(lang, key, params) }
}

export function describeTourCard(tour: TourView): TourCardModel | null {
  const step = tour.passos[tour.stepIndex]
  if (!step) return null
  const target = stepTargetFor(step, tour.ancora)
  const isFirst = tour.stepIndex === 0
  const isLast = tour.stepIndex === tour.passos.length - 1
  const nextKey: MessageKey = isLast ? 'card.concluir' : 'card.proximo'
  const { lang, format } = formatter(tour.lang, [
    tour.titulo,
    step.title,
    target.body,
    'card.contador',
    'card.pular',
    'card.voltar',
    nextKey,
  ])
  return {
    lang,
    tourTitle: format(tour.titulo),
    stepTitle: format(step.title),
    counter: format('card.contador', { n: tour.stepIndex + 1, m: tour.passos.length }),
    body: format(target.body),
    skipLabel: format('card.pular'),
    backLabel: format('card.voltar'),
    nextLabel: format(nextKey),
    nextAction: isLast ? 'concluir' : 'proximo',
    isFirst,
    isLast,
    passoId: step.id,
    ancora: tour.ancora,
    instancia: tour.instancia,
  }
}

export function describeNotice(aviso: NoticeSession): NoticeModel {
  const { lang, format } = formatter(aviso.lang, [
    'aviso.rotulo',
    'aviso.titulo',
    aviso.titulo,
    'aviso.ver',
    'aviso.agora-nao',
  ])
  return {
    lang,
    rotulo: format('aviso.rotulo'),
    titulo: format('aviso.titulo', { titulo: format(aviso.titulo) }),
    verLabel: format('aviso.ver'),
    agoraNaoLabel: format('aviso.agora-nao'),
  }
}

export type TourAnnouncementKind = 'passo' | 'aberto-sem-foco' | 'retomado' | 'concluido' | 'fechado'

const ANNOUNCEMENT_KEYS: Record<TourAnnouncementKind, MessageKey> = {
  passo: 'anuncio.passo',
  'aberto-sem-foco': 'anuncio.aberto-sem-foco',
  retomado: 'anuncio.retomado',
  concluido: 'anuncio.concluido',
  fechado: 'anuncio.fechado',
}

/** Frase da região live para uma mudança do tour. */
export function describeTourAnnouncement(kind: TourAnnouncementKind, tour: TourView): Announcement {
  const step = tour.passos[tour.stepIndex]
  const key = ANNOUNCEMENT_KEYS[kind]
  const { lang, format } = formatter(tour.lang, step ? [key, step.title] : [key])
  const params = { n: tour.stepIndex + 1, m: tour.passos.length, titulo: step ? format(step.title) : '' }
  return { texto: format(key, params), lang }
}

/** Frase da região live quando o aviso de novidade aparece. */
export function describeNoticeAnnouncement(aviso: NoticeSession): Announcement {
  const { lang, format } = formatter(aviso.lang, ['anuncio.novidade', aviso.titulo])
  return { texto: format('anuncio.novidade', { titulo: format(aviso.titulo) }), lang }
}

// ---------------------------------------------------------------------------
// Menu Ajuda
// ---------------------------------------------------------------------------

export type HelpActionId = 'iniciar' | 'continuar' | 'rever' | 'recomecar' | 'ver'

export type HelpActionModel = {
  id: HelpActionId
  label: string
  tourId: string
  /** Só em "Continuar do passo n": o passo exato onde a pessoa parou. */
  stepId: string | null
}

export type HelpItemModel = {
  tourId: string
  titulo: string
  status: string
  statusKind: HelpStatus
  actions: HelpActionModel[]
}

export type HelpMenuModel = {
  lang: string
  rotulo: string
  tutorial: { titulo: string; itens: HelpItemModel[] }
  novidades: { titulo: string; itens: HelpItemModel[]; vazio: string | null }
  redefinir: { label: string; pergunta: string; confirmar: string; cancelar: string }
  /** Linha discreta quando o progresso não será salvo (sem ponte, leitura falha, versão mais nova). */
  semPersistencia: string | null
}

const STATUS_KEYS: Record<HelpStatus, MessageKey> = {
  'nao-visto': 'ajuda.status.nao-visto',
  'em-andamento': 'ajuda.status.em-andamento',
  interrompido: 'ajuda.status.interrompido',
  pulado: 'ajuda.status.pulado',
  concluido: 'ajuda.status.concluido',
  atualizado: 'ajuda.status.atualizado',
  novo: 'ajuda.status.novo',
  indisponivel: 'ajuda.status.indisponivel',
}

const ACTION_KEYS: Record<HelpActionId, MessageKey> = {
  iniciar: 'ajuda.acao.iniciar',
  continuar: 'ajuda.acao.continuar',
  rever: 'ajuda.acao.rever',
  recomecar: 'ajuda.acao.recomecar',
  ver: 'ajuda.acao.ver',
}

const MENU_KEYS: readonly MessageKey[] = [
  'ajuda.menu.rotulo',
  'ajuda.secao.tutorial',
  'ajuda.secao.novidades',
  'ajuda.novidades.vazio',
  'ajuda.redefinir',
  'ajuda.redefinir.pergunta',
  'ajuda.redefinir.confirmar',
  'ajuda.redefinir.cancelar',
  'ajuda.sem-persistencia',
  ...Object.values(STATUS_KEYS),
  ...Object.values(ACTION_KEYS),
]

/** Data de conclusão no formato do locale; um locale que o Intl não conhece cai no pt-BR. */
function formatDate(iso: string | null, lang: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'short' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
  }
}

/** O que a Ajuda oferece para cada estado: nunca uma ação que cria algo, só abrir o tour. */
function actionsFor(entry: HelpEntry): Array<{ id: HelpActionId; stepId: string | null }> {
  if (entry.status === 'indisponivel') return []
  if (entry.tipo === 'novidade') return [{ id: 'ver', stepId: null }]
  switch (entry.status) {
    case 'nao-visto':
    case 'novo':
      return [{ id: 'iniciar', stepId: null }]
    case 'interrompido':
      return entry.passoId
        ? [{ id: 'continuar', stepId: entry.passoId }, { id: 'recomecar', stepId: null }]
        : [{ id: 'recomecar', stepId: null }]
    case 'concluido':
    case 'atualizado':
      return [{ id: 'rever', stepId: null }]
    case 'em-andamento':
    case 'pulado':
      return [{ id: 'recomecar', stepId: null }]
  }
}

/**
 * O menu Ajuda a partir das entradas da store (visto × disponível): o tutorial do
 * canvas com o estado e a ação certa, as novidades anunciadas ou vistas e a
 * redefinição com confirmação na própria tela.
 */
export function describeHelpMenu(input: {
  ajuda: readonly HelpEntry[]
  persistencia: OnboardingPersistence
  lang: string
}): HelpMenuModel {
  const titleKeys = input.ajuda.map((entry) => entry.titulo)
  const { lang, format } = formatter(input.lang, [...MENU_KEYS, ...titleKeys])
  const item = (entry: HelpEntry): HelpItemModel => ({
    tourId: entry.tourId,
    titulo: format(entry.titulo),
    status: format(STATUS_KEYS[entry.status], {
      n: entry.passo ?? 1,
      data: formatDate(entry.concluidoEm, lang),
    }),
    statusKind: entry.status,
    actions: actionsFor(entry).map((action) => ({
      id: action.id,
      label: format(ACTION_KEYS[action.id], { n: entry.passo ?? 1 }),
      tourId: entry.tourId,
      stepId: action.stepId,
    })),
  })
  const novidades = input.ajuda.filter((entry) => entry.tipo === 'novidade').map(item)
  const semPersistencia =
    input.persistencia === 'indisponivel' || input.persistencia === 'somente-leitura' || input.persistencia === 'sem-ponte'
  return {
    lang,
    rotulo: format('ajuda.menu.rotulo'),
    tutorial: { titulo: format('ajuda.secao.tutorial'), itens: input.ajuda.filter((entry) => entry.tipo === 'tutorial').map(item) },
    novidades: {
      titulo: format('ajuda.secao.novidades'),
      itens: novidades,
      vazio: novidades.length === 0 ? format('ajuda.novidades.vazio') : null,
    },
    redefinir: {
      label: format('ajuda.redefinir'),
      pergunta: format('ajuda.redefinir.pergunta'),
      confirmar: format('ajuda.redefinir.confirmar'),
      cancelar: format('ajuda.redefinir.cancelar'),
    },
    semPersistencia: semPersistencia ? format('ajuda.sem-persistencia') : null,
  }
}

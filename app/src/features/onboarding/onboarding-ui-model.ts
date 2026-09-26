import type { AnchorId, StepDef, StepTarget } from './onboarding-catalog'
import {
  formatOnboardingMessage,
  resolveCardLocale,
  resolveOnboardingLocale,
  type MessageKey,
  type MessageParams,
} from './onboarding-messages'
import type { NoticeSession, TourSession } from './onboarding-store'

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

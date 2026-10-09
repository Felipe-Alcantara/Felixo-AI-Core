import type {
  SystemDesignConfig,
  SystemDesignGuide,
  SystemDesignGuideOrigin,
  SystemDesignLoginNeeded,
  SystemDesignProject,
} from './types'

export type SystemDesignStatusTone = 'ok' | 'warn' | 'muted'

export type SystemDesignStatusView = {
  headline: string
  detail: string | null
  tone: SystemDesignStatusTone
}

type PresentationOptions = {
  /** Injetável nos testes; o padrão usa o locale do sistema. */
  formatDate?: (iso: string) => string
}

const defaultFormatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR')

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** "Felixo System Design · main" — a fonte configurada agora. */
export function describeConfiguredSource(config: SystemDesignConfig): string {
  if (!config.repoUrl) return '—'
  return `${config.label} · ${config.branch}`
}

/**
 * Diz, em uma frase e um detalhe, qual conteúdo os agentes estão recebendo.
 *
 * A distinção que importa é entre a fonte CONFIGURADA e a fonte ENTREGUE: logo
 * depois de trocar a URL, ou quando a sincronização falha, o conteúdo em cache
 * ainda é o da fonte anterior — e a tela não pode afirmar o contrário.
 */
export function describeSystemDesignStatus(
  config: SystemDesignConfig,
  { formatDate = defaultFormatDate }: PresentationOptions = {},
): SystemDesignStatusView {
  const delivered = config.delivered
  const deliveredLabel = delivered
    ? `${delivered.label} · ${delivered.branch} @ ${shortSha(delivered.sha)}`
    : null
  const deliveredWhen =
    delivered?.syncedAt ? ` (sincronizado em ${formatDate(delivered.syncedAt)})` : ''

  switch (config.syncState) {
    case 'disabled':
      return {
        headline: 'Desligado',
        detail: 'Os agentes não recebem o System Design.',
        tone: 'muted',
      }
    case 'never-synced':
      return {
        headline: 'Ainda não sincronizado',
        detail: config.repoUrl
          ? `Sincronize para entregar ${describeConfiguredSource(config)} aos agentes.`
          : null,
        tone: 'muted',
      }
    case 'synced':
      return {
        headline: 'Sincronizado',
        detail: deliveredLabel ? `Os agentes recebem ${deliveredLabel}${deliveredWhen}.` : null,
        tone: 'ok',
      }
    case 'offline-fallback':
      return {
        headline: 'Sem acesso à fonte — usando o último conteúdo',
        detail: deliveredLabel
          ? `A última sincronização falhou. Os agentes seguem recebendo ${deliveredLabel}${deliveredWhen}.`
          : 'A última sincronização falhou.',
        tone: 'warn',
      }
    case 'pending-source-change':
      return {
        headline: 'Fonte alterada, ainda não sincronizada',
        detail: deliveredLabel
          ? `Até a próxima sincronização, os agentes seguem recebendo ${deliveredLabel}${deliveredWhen}, não ${describeConfiguredSource(config)}.`
          : null,
        tone: 'warn',
      }
  }
}

/** De onde veio um guia, em palavras. */
export function describeGuideOrigin(origin: SystemDesignGuideOrigin): string {
  switch (origin) {
    case 'default':
      return 'padrão do app'
    case 'custom':
      return 'escolhido por você'
    case 'projeto-arquivo':
      return 'arquivo do projeto'
    case 'projeto-app':
      return 'escolhido para este projeto'
    case 'projeto-pasta':
      return 'pasta do projeto'
  }
}

/** "Doktor · main" ou "Cliente X · pasta do projeto". */
export function describeGuideSource(guide: SystemDesignGuide): string {
  // Guia de pasta: a origem ("pasta do projeto") já vai no selo ao lado.
  if (guide.kind === 'local') return guide.label
  return guide.branch ? `${guide.label} · ${guide.branch}` : guide.label
}

/** Estado de UM guia: cada fonte tem cache e índice próprios. */
export function describeGuideStatus(
  guide: SystemDesignGuide,
  { formatDate = defaultFormatDate }: PresentationOptions = {},
): SystemDesignStatusView {
  if (guide.kind === 'local') {
    return { headline: 'Lido do repositório', detail: null, tone: 'ok' }
  }
  const when = guide.syncedAt ? ` em ${formatDate(guide.syncedAt)}` : ''
  const sha = guide.sha ? ` @ ${shortSha(guide.sha)}` : ''
  switch (guide.syncState) {
    case 'disabled':
      return { headline: 'Desligado', detail: null, tone: 'muted' }
    case 'never-synced':
    case 'pending-source-change':
      return {
        headline: 'Ainda não sincronizado',
        detail: 'Os agentes recebem a URL; o índice local chega na próxima sincronização.',
        tone: 'muted',
      }
    case 'synced':
      return { headline: `Sincronizado${sha}`, detail: when ? `Última sincronização${when}.` : null, tone: 'ok' }
    case 'offline-fallback':
      return {
        headline: 'Sem acesso à fonte — usando o último conteúdo',
        detail: guide.sha ? `O índice é o de ${shortSha(guide.sha)}${when}.` : null,
        tone: 'warn',
      }
  }
}

/** Qual camada vale num projeto, e o aviso quando ela substitui a sua. */
export function describeProjectLayer(project: SystemDesignProject): SystemDesignStatusView {
  if (!project.authorized) {
    return {
      headline: 'Fora dos projetos registrados',
      detail: 'Nada desta pasta é lido. Registre o projeto em Projetos para usar guias próprios; até lá valem os seus.',
      tone: 'muted',
    }
  }
  if (project.layer === 'projeto') {
    const replaced = project.replaced.map((guide) => guide.label).join(', ')
    return {
      headline: 'Guias do projeto',
      detail: replaced ? `Valem aqui no lugar dos seus (${replaced}).` : null,
      tone: 'warn',
    }
  }
  const fileWaiting = project.file?.status === 'pendente' || project.file?.status === 'alterado'
  return {
    headline: project.layer === 'usuario' ? 'Seus guias' : 'Padrão do app',
    detail: fileWaiting
      ? 'O arquivo do projeto ainda não foi confirmado; até lá valem os seus guias.'
      : 'O projeto não traz guias próprios.',
    tone: 'muted',
  }
}

/** Situação do `.felixo/system-design.json`, ou null quando não há arquivo. */
export function describeProjectFile(file: SystemDesignProject['file']): SystemDesignStatusView | null {
  if (!file) return null
  const count = file.guides.length
  const guides = `${count} guia${count === 1 ? '' : 's'}`
  switch (file.status) {
    case 'ausente':
      return null
    case 'pendente':
      return {
        headline: `O arquivo do projeto pede ${guides}`,
        detail: 'Ele vem do repositório: confira as URLs antes de usar. Até confirmar, nada é buscado.',
        tone: 'warn',
      }
    case 'alterado':
      return {
        headline: 'O arquivo do projeto mudou desde a sua confirmação',
        detail: `Agora ele pede ${guides}. Confira de novo; até lá ele não vale.`,
        tone: 'warn',
      }
    case 'confirmado':
      return { headline: `Arquivo do projeto confirmado (${guides})`, detail: null, tone: 'ok' }
    case 'ignorado':
      return { headline: 'Arquivo do projeto ignorado', detail: null, tone: 'muted' }
    case 'invalido':
      return {
        headline: 'O arquivo do projeto não tem guia válido',
        detail: file.problems.join(' '),
        tone: 'warn',
      }
  }
}

export type SystemDesignLoginNoticeView = {
  title: string
  description: string
  primaryLabel: string
  secondaryLabel: string
  dismissLabel: string
}

/**
 * Texto do aviso de quando a sincronização automática não atualizou um guia
 * porque ele pede login. Diz qual guia, por quê, que os agentes continuam com
 * o que já tinham e o que o botão faz (o clique é o que pode abrir o login).
 */
export function describeLoginNotice(notice: SystemDesignLoginNeeded): SystemDesignLoginNoticeView {
  const project = notice.projectRoot ? ` do projeto ${lastPathSegment(notice.projectRoot)}` : ''
  return {
    title: 'Um guia do System Design pede login',
    description:
      `O guia "${notice.label}"${project} não foi atualizado: o repositório pede login ` +
      '(é privado, ou o endereço está errado). Os agentes seguem com o último conteúdo baixado.',
    primaryLabel: 'Fazer login e sincronizar',
    secondaryLabel: 'Agora não',
    dismissLabel: 'Dispensar aviso de login do System Design',
  }
}

function lastPathSegment(value: string): string {
  const parts = value.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? value
}

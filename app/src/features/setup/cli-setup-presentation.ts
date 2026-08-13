/**
 * Traduz o status da instalação automática das CLIs no que a interface mostra.
 *
 * A instalação roda sozinha em segundo plano na primeira abertura do app
 * instalado, então a régua aqui é a do trabalho não interrompido: enquanto
 * corre bem, ela vale um marcador discreto e um aviso que se dispensa. Só a
 * falha vira algo com ação — sem as CLIs o app não tem o que orquestrar, e
 * seria pior deixar a pessoa descobrir isso sozinha ao tentar usar um agente.
 */

export type CliSetupState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'installing'
  | 'done'
  | 'error'

export type CliSetupItemState =
  | 'present'
  | 'pending'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'skipped'

export type CliSetupItem = {
  id: string
  name: string
  state: CliSetupItemState
  message?: string
}

export type CliSetupStatus = {
  state: CliSetupState
  message: string
  updatedAt: string
  clis?: CliSetupItem[]
}

export type CliSetupPresentation = {
  /** Marcador discreto na barra de ferramentas. */
  showIndicator: boolean
  /** Aviso flutuante, no canto da tela. */
  showToast: boolean
  indicatorLabel: string
  toastTitle: string
  toastDescription: string
  /** Se vale oferecer uma nova tentativa. */
  canRetry: boolean
  /** 0–100 quando há fila em andamento; null quando não há barra a mostrar. */
  progress: number | null
  tone: 'neutral' | 'info' | 'success' | 'error'
}

const HIDDEN: CliSetupPresentation = {
  showIndicator: false,
  showToast: false,
  indicatorLabel: '',
  toastTitle: '',
  toastDescription: '',
  canRetry: false,
  progress: null,
  tone: 'neutral',
}

/**
 * `null` cobre o app rodando sem a ponte do Electron (navegador, testes):
 * ali não há instalação acontecendo, e nada aparece.
 */
export function presentCliSetupStatus(
  status: CliSetupStatus | null,
): CliSetupPresentation {
  if (!status) {
    return HIDDEN
  }

  switch (status.state) {
    // 'disabled' é o app rodando do código-fonte; 'idle' é "não havia nada a
    // instalar". Nenhum dos dois é notícia.
    case 'disabled':
    case 'idle':
      return HIDDEN

    case 'checking':
      return {
        ...HIDDEN,
        showIndicator: true,
        indicatorLabel: 'Verificando CLIs…',
        tone: 'neutral',
      }

    case 'installing': {
      const queue = countQueue(status.clis)

      return {
        showIndicator: true,
        showToast: true,
        indicatorLabel: installingLabel(status.clis, queue),
        toastTitle: 'Preparando as CLIs de IA',
        toastDescription:
          'O app está instalando as CLIs que faltam na máquina. Pode continuar usando — elas aparecem sozinhas quando ficarem prontas.',
        canRetry: false,
        progress: queue.total === 0 ? null : Math.round((queue.finished / queue.total) * 100),
        tone: 'info',
      }
    }

    case 'done':
      return {
        showIndicator: true,
        showToast: true,
        indicatorLabel: 'CLIs prontas',
        toastTitle: 'CLIs de IA prontas',
        toastDescription: status.message,
        canRetry: false,
        progress: 100,
        tone: 'success',
      }

    // Sem CLI o app não tem o que orquestrar: aqui o aviso flutuante se
    // justifica, e com ele a nova tentativa — a automática não volta sozinha
    // nesta versão, de propósito, para não repetir a falha a cada abertura.
    case 'error':
      return {
        ...HIDDEN,
        showIndicator: true,
        showToast: true,
        indicatorLabel: 'Falha ao instalar CLIs',
        toastTitle: 'Não foi possível instalar as CLIs de IA',
        toastDescription: status.message,
        canRetry: true,
        tone: 'error',
      }

    default:
      return HIDDEN
  }
}

/**
 * Identidade do aviso, para saber o que a pessoa dispensou.
 *
 * O andamento é um assunto só — se a chave mudasse a cada CLI instalada, o
 * botão de dispensar não serviria para nada. Já o fim (sucesso ou falha) é
 * assunto novo: dispensar o andamento não pode esconder o resultado.
 */
export function cliSetupNoticeKey(status: CliSetupStatus | null): string | null {
  if (!status) {
    return null
  }

  return status.state === 'installing' || status.state === 'checking'
    ? 'em-andamento'
    : `resultado:${status.state}:${status.updatedAt}`
}

function countQueue(clis: CliSetupItem[] | undefined): {
  total: number
  finished: number
} {
  const queue = (clis ?? []).filter((cli) =>
    ['pending', 'installing', 'installed', 'failed'].includes(cli.state),
  )

  return {
    total: queue.length,
    finished: queue.filter((cli) => cli.state === 'installed' || cli.state === 'failed')
      .length,
  }
}

function installingLabel(
  clis: CliSetupItem[] | undefined,
  queue: { total: number; finished: number },
): string {
  const current = (clis ?? []).find((cli) => cli.state === 'installing')

  if (!current) {
    return 'Instalando CLIs…'
  }

  return queue.total > 1
    ? `Instalando ${current.name} (${queue.finished + 1}/${queue.total})`
    : `Instalando ${current.name}`
}

/**
 * Traduz o status cru do auto-updater no que a interface mostra.
 *
 * O estado vem do processo principal (`electron-updater`) e é técnico:
 * 'checking', 'available', 'downloading', 'downloaded', 'error', 'idle',
 * 'disabled'. Nem todo estado merece a atenção do usuário — avisar
 * "verificando atualizações" a cada dez minutos seria só ruído —, então a
 * decisão de o que aparece, e com que urgência, vive aqui em vez de espalhada
 * pelos componentes.
 */

export type UpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type UpdateStatus = {
  state: UpdateState
  message: string
  updatedAt: string
  reason?: string
  version?: string
  progress?: number
}

export type UpdatePresentation = {
  /** Se o indicador da barra deve aparecer. */
  showIndicator: boolean
  /** Se o aviso flutuante deve aparecer. */
  showToast: boolean
  /** Texto curto do indicador — cabe na barra. */
  indicatorLabel: string
  /** Título do aviso flutuante. */
  toastTitle: string
  /** Detalhe do aviso, abaixo do título. */
  toastDescription: string
  /** Se o botão de reiniciar/instalar deve aparecer. */
  canInstall: boolean
  /** 0–100 quando há download em curso; null quando não há barra a mostrar. */
  progress: number | null
  /** Urgência, para o componente escolher a cor. */
  tone: 'neutral' | 'info' | 'success' | 'error'
}

const HIDDEN: UpdatePresentation = {
  showIndicator: false,
  showToast: false,
  indicatorLabel: '',
  toastTitle: '',
  toastDescription: '',
  canInstall: false,
  progress: null,
  tone: 'neutral',
}

/**
 * `null` cobre o caso de o app rodar sem a ponte do Electron (navegador,
 * testes) — ali não há atualização a verificar, e o indicador não aparece.
 */
export function presentUpdateStatus(
  status: UpdateStatus | null,
): UpdatePresentation {
  if (!status) {
    return HIDDEN
  }

  const version = status.version ? `Versão ${status.version}` : 'Nova versão'

  switch (status.state) {
    // 'disabled' é o app rodando do código-fonte, onde o updater não age;
    // 'idle' é "já está atualizado". Nenhum dos dois é notícia.
    case 'disabled':
    case 'idle':
      return HIDDEN

    // Verificar é rotina (a cada dez minutos): fica no indicador para quem
    // olhar, mas nunca vira aviso flutuante.
    case 'checking':
      return {
        ...HIDDEN,
        showIndicator: true,
        indicatorLabel: 'Verificando…',
        tone: 'neutral',
      }

    case 'available':
      return {
        showIndicator: true,
        showToast: true,
        indicatorLabel: `${version} baixando`,
        toastTitle: `${version} disponível`,
        toastDescription: 'O download começou e roda em segundo plano.',
        canInstall: false,
        progress: 0,
        tone: 'info',
      }

    case 'downloading': {
      const percent = clampPercent(status.progress)
      return {
        showIndicator: true,
        showToast: true,
        indicatorLabel: percent === null ? 'Baixando…' : `Baixando ${percent}%`,
        toastTitle: `${version} baixando`,
        toastDescription:
          percent === null
            ? 'O download roda em segundo plano.'
            : `${percent}% concluído. Pode continuar trabalhando.`,
        canInstall: false,
        progress: percent,
        tone: 'info',
      }
    }

    case 'downloaded':
      return {
        showIndicator: true,
        showToast: true,
        indicatorLabel: `${version} pronta`,
        toastTitle: `${version} pronta para instalar`,
        toastDescription:
          'Reinicie para usar agora, ou ela será instalada ao fechar o app.',
        canInstall: true,
        progress: 100,
        tone: 'success',
      }

    // Falha de rede é o caso comum aqui, e não é problema do usuário
    // resolver: fica no indicador, sem aviso flutuante interrompendo.
    case 'error':
      return {
        ...HIDDEN,
        showIndicator: true,
        indicatorLabel: 'Falha ao atualizar',
        toastTitle: 'Não foi possível atualizar',
        toastDescription: status.message,
        tone: 'error',
      }

    default:
      return HIDDEN
  }
}

/**
 * Identidade do aviso, para saber o que o usuário dispensou.
 *
 * Combina versão e assunto, e não um booleano, por dois motivos: dispensar a
 * 0.1.8 não pode silenciar a 0.1.9 que sair depois, e dispensar o progresso
 * do download não pode esconder o "pronta para instalar" — ali há uma ação
 * nova a oferecer, e calá-la deixaria a atualização parada sem o usuário
 * saber. Já o progresso em si não entra na chave: se a identidade mudasse a
 * cada porcentagem, o botão de dispensar não serviria para nada.
 */
export function updateNoticeKey(status: UpdateStatus | null): string | null {
  if (!status) {
    return null
  }

  // 'downloaded' é o único estado que oferece uma ação; os demais avisos são
  // sobre o mesmo assunto em andamento.
  const subject = status.state === 'downloaded' ? 'pronta' : 'em-andamento'
  return `${status.version ?? `sem-versao:${status.state}`}:${subject}`
}

/** Percentual do electron-updater vem fracionário e às vezes fora da faixa. */
function clampPercent(progress: number | undefined): number | null {
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    return null
  }

  return Math.min(100, Math.max(0, Math.round(progress)))
}

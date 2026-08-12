import { describe, expect, it } from 'vitest'
import {
  presentUpdateStatus,
  updateNoticeKey,
  type UpdateState,
  type UpdateStatus,
} from './update-presentation'

function status(state: UpdateState, extra: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    state,
    message: 'mensagem do updater',
    updatedAt: '2026-08-09T17:00:00.000Z',
    ...extra,
  }
}

describe('presentUpdateStatus', () => {
  it('não mostra nada sem a ponte do Electron', () => {
    // O app também roda no navegador (dev/testes), onde não há o que atualizar.
    const presentation = presentUpdateStatus(null)

    expect(presentation.showIndicator).toBe(false)
    expect(presentation.showToast).toBe(false)
  })

  it('não mostra nada quando o app já está atualizado', () => {
    const presentation = presentUpdateStatus(status('idle'))

    expect(presentation.showIndicator).toBe(false)
    expect(presentation.showToast).toBe(false)
  })

  it('não mostra nada rodando do código-fonte, onde o updater não age', () => {
    const presentation = presentUpdateStatus(status('disabled'))

    expect(presentation.showIndicator).toBe(false)
    expect(presentation.showToast).toBe(false)
  })

  it('mostra a verificação só no indicador, nunca como aviso', () => {
    // Roda a cada dez minutos: um aviso flutuante a cada vez seria ruído puro.
    const presentation = presentUpdateStatus(status('checking'))

    expect(presentation.showIndicator).toBe(true)
    expect(presentation.showToast).toBe(false)
  })

  it('avisa assim que encontra a versão, antes de o download terminar', () => {
    const presentation = presentUpdateStatus(status('available', { version: '0.1.8' }))

    expect(presentation.showToast).toBe(true)
    expect(presentation.toastTitle).toContain('0.1.8')
    expect(presentation.canInstall).toBe(false)
  })

  it('mostra o progresso do download', () => {
    const presentation = presentUpdateStatus(
      status('downloading', { version: '0.1.8', progress: 42.7 }),
    )

    expect(presentation.progress).toBe(43)
    expect(presentation.indicatorLabel).toContain('43%')
    expect(presentation.canInstall).toBe(false)
  })

  it('trata progresso ausente sem inventar um número', () => {
    const presentation = presentUpdateStatus(status('downloading'))

    expect(presentation.progress).toBeNull()
    expect(presentation.indicatorLabel).toBe('Baixando…')
  })

  it('prende o percentual na faixa 0–100', () => {
    // O electron-updater já reportou valores fora da faixa em downloads
    // retomados; uma barra de 137% é um bug visível.
    expect(presentUpdateStatus(status('downloading', { progress: 137 })).progress).toBe(100)
    expect(presentUpdateStatus(status('downloading', { progress: -4 })).progress).toBe(0)
  })

  it('só oferece instalar quando o download terminou', () => {
    const presentation = presentUpdateStatus(status('downloaded', { version: '0.1.8' }))

    expect(presentation.canInstall).toBe(true)
    expect(presentation.showToast).toBe(true)
    expect(presentation.tone).toBe('success')
    expect(presentation.toastDescription).toContain('Reinicie')
  })

  it('não interrompe com aviso quando a verificação falha', () => {
    // Ficar sem rede é comum e não é problema do usuário resolver — fica
    // registrado no indicador, sem roubar a atenção.
    const presentation = presentUpdateStatus(
      status('error', { message: 'net::ERR_INTERNET_DISCONNECTED' }),
    )

    expect(presentation.showIndicator).toBe(true)
    expect(presentation.showToast).toBe(false)
    expect(presentation.tone).toBe('error')
  })

  it('oferece nova tentativa no erro, para ele não ser um beco sem saída', () => {
    // A verificação automática só volta em dez minutos: sem nova tentativa, um
    // erro passageiro fica na tela todo esse tempo sem nada a fazer.
    expect(presentUpdateStatus(status('error')).canRetry).toBe(true)
  })

  it('não oferece nova tentativa quando não houve falha', () => {
    for (const state of ['idle', 'checking', 'available', 'downloading', 'downloaded'] as const) {
      expect(presentUpdateStatus(status(state)).canRetry).toBe(false)
    }
    expect(presentUpdateStatus(null).canRetry).toBe(false)
  })

  it('não oferece instalar e tentar de novo ao mesmo tempo', () => {
    // O indicador é um botão só; duas ações concorrendo tornariam o clique
    // imprevisível.
    const downloaded = presentUpdateStatus(status('downloaded'))
    const failed = presentUpdateStatus(status('error'))

    expect(downloaded.canInstall && downloaded.canRetry).toBe(false)
    expect(failed.canInstall && failed.canRetry).toBe(false)
  })

  it('usa "Nova versão" quando o updater não informa o número', () => {
    const presentation = presentUpdateStatus(status('downloaded'))

    expect(presentation.toastTitle).toContain('Nova versão')
    expect(presentation.toastTitle).not.toContain('undefined')
  })
})

describe('updateNoticeKey', () => {
  it('identifica o aviso pela versão, para não silenciar a próxima', () => {
    // Dispensar o aviso da 0.1.8 não pode esconder a 0.1.9 que sair depois.
    expect(updateNoticeKey(status('downloaded', { version: '0.1.8' }))).not.toBe(
      updateNoticeKey(status('downloaded', { version: '0.1.9' })),
    )
  })

  it('volta a avisar quando o download termina, mesmo tendo sido dispensado antes', () => {
    // Dispensar "baixando 0.1.8" é dispensar o progresso, não a notícia que
    // importa: quando ela fica pronta há uma ação nova a oferecer (reiniciar),
    // e silenciá-la deixaria a atualização parada sem o usuário saber.
    expect(updateNoticeKey(status('downloading', { version: '0.1.8' }))).not.toBe(
      updateNoticeKey(status('downloaded', { version: '0.1.8' })),
    )
  })

  it('não reaparece a cada porcentagem durante o download', () => {
    // Se a chave mudasse a cada progresso, dispensar o aviso seria inútil.
    expect(updateNoticeKey(status('downloading', { version: '0.1.8', progress: 10 }))).toBe(
      updateNoticeKey(status('downloading', { version: '0.1.8', progress: 90 })),
    )
  })

  it('separa avisos sem versão por estado, para não confundir assuntos', () => {
    expect(updateNoticeKey(status('downloading'))).not.toBe(
      updateNoticeKey(status('error')),
    )
  })

  it('não tem chave sem status', () => {
    expect(updateNoticeKey(null)).toBeNull()
  })
})

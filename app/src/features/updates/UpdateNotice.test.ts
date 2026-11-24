import { describe, expect, it, vi } from 'vitest'
import { AppVersionBadge, CheckUpdateButton, UpdateIndicator } from './UpdateNotice'
import { presentUpdateStatus, type UpdateState, type UpdateStatus } from './update-presentation'
import { acharTodos, botoes, textoDe } from '../shared/test-support/react-tree'

function apresentar(state: UpdateState, extra: Partial<UpdateStatus> = {}) {
  return presentUpdateStatus({ state, message: 'mensagem do updater', updatedAt: '2026-11-24T12:00:00.000Z', ...extra })
}

const tela = (presentation: ReturnType<typeof apresentar>) => {
  const onInstall = vi.fn()
  const onRetry = vi.fn()
  return { onInstall, onRetry, arvore: UpdateIndicator({ presentation, onInstall, onRetry }) }
}

describe('UpdateIndicator', () => {
  it('não aparece quando não há nada a dizer', () => {
    expect(tela(apresentar('idle')).arvore).toBeNull()
    expect(tela(apresentar('disabled')).arvore).toBeNull()
  })

  it('com a atualização baixada vira o botão que reinicia, e só ele chama onInstall', () => {
    const { arvore, onInstall, onRetry } = tela(apresentar('downloaded', { version: '2.0.0' }))
    const [botao] = botoes(arvore)
    expect(botao.props.title).toBe('Reiniciar agora para aplicar a atualização')
    botao.props.onClick()
    expect(onInstall).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('depois de uma falha vira o botão de tentar de novo, com o motivo no title', () => {
    const { arvore, onInstall, onRetry } = tela(apresentar('error', { message: 'sem rede' }))
    const [botao] = botoes(arvore)
    expect(botao.props.title).toContain('Clique para verificar de novo.')
    botao.props.onClick()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onInstall).not.toHaveBeenCalled()
  })

  it('baixando mostra só o rótulo, sem botão: um controle que não faz nada é pior que um rótulo', () => {
    const { arvore } = tela(apresentar('downloading', { progress: 40 }))
    expect(botoes(arvore)).toHaveLength(0)
    expect(textoDe(arvore).length).toBeGreaterThan(0)
  })
})

describe('CheckUpdateButton', () => {
  it('oferece Verificar atualizações quando está tudo em dia e chama onCheck ao clicar', () => {
    const onCheck = vi.fn()
    const arvore = CheckUpdateButton({ presentation: apresentar('idle'), onCheck })
    const [botao] = botoes(arvore)
    expect(textoDe(botao).trim()).toBe('Verificar atualizações')
    botao.props.onClick()
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it('some enquanto há verificação ou download em andamento e no app que roda do código-fonte', () => {
    const onCheck = vi.fn()
    for (const estado of ['checking', 'downloading', 'disabled'] as const) {
      expect(CheckUpdateButton({ presentation: apresentar(estado), onCheck })).toBeNull()
    }
  })
})

describe('AppVersionBadge', () => {
  it('mostra v + a versão, e some enquanto ela não chegou', () => {
    expect(AppVersionBadge({ version: null })).toBeNull()
    const [selo] = acharTodos(AppVersionBadge({ version: '1.4.2' }), (e) => e.type === 'span')
    expect(textoDe(selo)).toBe('v1.4.2')
  })
})

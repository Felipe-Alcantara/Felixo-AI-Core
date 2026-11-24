// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentPresetFields } from './AgentPresetFields'
import type { AgentConfig } from '../hooks/useAgentConfig'
import { instalarShimsDeLayout } from '../../shared/test-support/jsdom-shims'

instalarShimsDeLayout()

type PresetFalso = { id: string; name: string; native: boolean; icon?: string; description?: string; skillIds: string[] }

const NATIVO: PresetFalso = { id: 'revisar', name: 'Revisar código', native: true, skillIds: ['builtin-code-review'] }
const MEU: PresetFalso = { id: 'meu', name: 'Meu preset', native: false, skillIds: [] }

/** O que o formulário usa de `useAgentConfig`: a lista, o ativo e as ações, todas espiãs. */
function montar(ativo: PresetFalso | null, extra: Record<string, unknown> = {}) {
  const config = {
    presets: {
      presets: [NATIVO, MEU],
      duplicate: vi.fn(async () => {}),
      remove: vi.fn(async () => true),
      error: null as string | null,
    },
    activePreset: ativo,
    applyPreset: vi.fn(),
    contextDraft: '',
    setContextDraft: vi.fn(),
    saveAsPreset: vi.fn(async () => true),
    agent: { isLauncher: false },
    ...extra,
  }
  render(<AgentPresetFields config={config as unknown as AgentConfig} />)
  return config
}

describe('AgentPresetFields (clique)', () => {
  afterEach(() => cleanup())

  it('escolher um preset da lista preenche o formulário com ele', () => {
    const config = montar(null)

    fireEvent.click(screen.getByRole('combobox', { name: 'Preset de agente' }))
    fireEvent.click(screen.getByRole('option', { name: /Meu preset/ }))

    expect(config.applyPreset).toHaveBeenCalledWith(MEU)
  })

  it('"Nenhum (configurar à mão)" volta o formulário ao zero', () => {
    const config = montar(MEU)

    fireEvent.click(screen.getByRole('combobox', { name: 'Preset de agente' }))
    fireEvent.click(screen.getByRole('option', { name: /Nenhum/ }))

    expect(config.applyPreset).toHaveBeenCalledWith(null)
  })

  describe('Salvar como preset', () => {
    it('fica desabilitado sem nome, e com nome salva e limpa o campo', async () => {
      const config = montar(null)
      const botao = screen.getByRole('button', { name: 'Salvar como preset' }) as HTMLButtonElement
      expect(botao.disabled).toBe(true)

      fireEvent.change(screen.getByLabelText('Nome do novo preset'), { target: { value: '  Para revisar PR  ' } })
      expect(botao.disabled).toBe(false)
      await act(async () => {
        fireEvent.click(botao)
      })

      expect(config.saveAsPreset).toHaveBeenCalledWith('Para revisar PR')
      expect((screen.getByLabelText('Nome do novo preset') as HTMLInputElement).value).toBe('')
    })

    it('se o salvamento não vale (recusado), o nome fica para a pessoa tentar de novo', async () => {
      const config = montar(null, { saveAsPreset: vi.fn(async () => false) })

      fireEvent.change(screen.getByLabelText('Nome do novo preset'), { target: { value: 'Repetido' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Salvar como preset' }))
      })

      expect(config.saveAsPreset).toHaveBeenCalledTimes(1)
      expect((screen.getByLabelText('Nome do novo preset') as HTMLInputElement).value).toBe('Repetido')
    })

    it('não salva para o lançador de agente (sem agente configurável)', () => {
      montar(null, { agent: { isLauncher: true } })
      fireEvent.change(screen.getByLabelText('Nome do novo preset'), { target: { value: 'X' } })
      expect((screen.getByRole('button', { name: 'Salvar como preset' }) as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('Duplicar e Excluir', () => {
    it('sem preset ativo não há como duplicar nem excluir', () => {
      montar(null)
      expect(screen.queryByRole('button', { name: /Duplicar/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /Excluir/ })).toBeNull()
    })

    it('Duplicar copia o preset ativo (inclusive o nativo), e o nativo não pode ser excluído', () => {
      const config = montar(NATIVO)

      fireEvent.click(screen.getByRole('button', { name: /Duplicar/ }))

      expect(config.presets.duplicate).toHaveBeenCalledWith(NATIVO)
      expect(screen.queryByRole('button', { name: /Excluir/ })).toBeNull()
    })

    it('Excluir remove o preset salvo e volta o formulário a "Nenhum" só se a remoção deu certo', async () => {
      const config = montar(MEU)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Excluir/ }))
      })

      expect(config.presets.remove).toHaveBeenCalledWith('meu')
      expect(config.applyPreset).toHaveBeenCalledWith(null)
    })

    it('se a remoção falha, o preset continua aplicado', async () => {
      const config = montar(MEU)
      config.presets.remove.mockResolvedValue(false)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Excluir/ }))
      })

      expect(config.applyPreset).not.toHaveBeenCalled()
    })

    it('Excluir apaga na hora, sem confirmação (comportamento atual declarado no inventário)', async () => {
      const confirmar = vi.fn(() => false)
      vi.stubGlobal('confirm', confirmar)
      const config = montar(MEU)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Excluir/ }))
      })

      expect(confirmar).not.toHaveBeenCalled()
      expect(config.presets.remove).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    })
  })

  it('o contexto inicial editado vai ao rascunho do formulário, e o erro dos presets aparece', () => {
    const config = montar(NATIVO, { presets: { presets: [NATIVO, MEU], duplicate: vi.fn(), remove: vi.fn(), error: 'Falha ao ler os presets.' } })

    fireEvent.change(screen.getByLabelText('Contexto inicial'), { target: { value: 'Siga o padrão.' } })

    expect(config.setContextDraft).toHaveBeenCalledWith('Siga o padrão.')
    expect(screen.getByText('Falha ao ler os presets.')).toBeTruthy()
    expect(screen.getByText(/Skills do preset: code-review/)).toBeTruthy()
  })
})

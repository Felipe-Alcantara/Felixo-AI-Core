// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConfigFields } from './AgentConfigFields'
import { useAgentConfig, type AgentConfigProject } from '../hooks/useAgentConfig'
import { instalarLocalStorageEmMemoria } from '../../shared/test-support/jsdom-storage'
import { instalarShimsDeLayout } from '../../shared/test-support/jsdom-shims'

instalarShimsDeLayout()

const PROJETOS: AgentConfigProject[] = [{ id: 'p1', name: 'loja', path: '/tmp/loja' }]

type ContaFalsa = { id: string; providerId: string; label: string; authKind?: string; secretConfigured?: boolean }

function Formulario({ onAddFolder }: { onAddFolder: () => Promise<string[]> }) {
  const config = useAgentConfig(PROJETOS, { persistPreferences: false })
  return <AgentConfigFields config={config} projects={PROJETOS} onAddFolder={onAddFolder} />
}

/** Ponte de contas falsa: lista o que `contas` guarda, e cria/remove de verdade nessa lista. */
function pontes(inicial: ContaFalsa[], extras: Record<string, unknown> = {}) {
  const contas = [...inicial]
  const cliAccounts = {
    list: vi.fn(async () => ({ ok: true, accounts: [...contas] })),
    create: vi.fn(async ({ providerId, label }: { providerId: string; label: string }) => {
      const conta = { id: `nova-${contas.length + 1}`, providerId, label }
      contas.push(conta)
      return { ok: true, account: conta }
    }),
    setSecret: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async (id: string, options?: { confirmed?: boolean }) => {
      if (!options?.confirmed) return { ok: true, requiresConfirmation: true, sessions: [] }
      const indice = contas.findIndex((c) => c.id === id)
      if (indice >= 0) contas.splice(indice, 1)
      return { ok: true, removed: true }
    }),
  }
  ;(window as unknown as { felixo: unknown }).felixo = { cliAccounts, ...extras }
  return { cliAccounts, contas }
}

async function montar(onAddFolder: () => Promise<string[]> = async () => []) {
  render(<Formulario onAddFolder={onAddFolder} />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function clicar(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function escolher(seletor: string, opcao: string | RegExp) {
  await clicar(screen.getByRole('combobox', { name: seletor }))
  await clicar(screen.getByRole('option', { name: opcao }))
}

describe('AgentConfigFields (conta)', () => {
  beforeEach(() => instalarLocalStorageEmMemoria())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('lista as contas do agente, e escolher uma habilita o Remover dela', async () => {
    pontes([{ id: 'a1', providerId: 'claude', label: 'Trabalho' }])
    await montar()
    expect(screen.queryByRole('button', { name: /^Remover a conta/ })).toBeNull()

    await escolher('Conta', /Trabalho/)

    expect(screen.getByRole('button', { name: 'Remover a conta "Trabalho"' })).toBeTruthy()
  })

  describe('Criar conta', () => {
    it('"Nova conta…" abre o cadastro; sem nome o botão fica parado, e com nome cria e escolhe a conta nova', async () => {
      const { cliAccounts } = pontes([])
      await montar()

      await escolher('Conta', /Nova conta…/)
      const criar = screen.getByRole('button', { name: 'Criar conta' }) as HTMLButtonElement
      expect(criar.disabled).toBe(true)

      fireEvent.change(screen.getByPlaceholderText(/Nome da conta/), { target: { value: 'Pessoal' } })
      await clicar(criar)

      expect(cliAccounts.create).toHaveBeenCalledWith(expect.objectContaining({ label: 'Pessoal' }))
      // O cadastro fechou e a conta nova ficou escolhida (o Remover dela apareceu).
      expect(screen.queryByRole('button', { name: 'Criar conta' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Remover a conta "Pessoal"' })).toBeTruthy()
    })

    it('quando o main recusa, o motivo aparece e o cadastro continua aberto', async () => {
      const { cliAccounts } = pontes([])
      cliAccounts.create.mockResolvedValue({ ok: false, message: 'Já existe uma conta com esse nome.' } as never)
      await montar()

      await escolher('Conta', /Nova conta…/)
      fireEvent.change(screen.getByPlaceholderText(/Nome da conta/), { target: { value: 'Pessoal' } })
      await clicar(screen.getByRole('button', { name: 'Criar conta' }))

      expect(screen.getByText('Já existe uma conta com esse nome.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Criar conta' })).toBeTruthy()
    })

    it('Cancelar fecha o cadastro sem criar nada', async () => {
      const { cliAccounts } = pontes([])
      await montar()

      await escolher('Conta', /Nova conta…/)
      await clicar(screen.getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('button', { name: 'Criar conta' })).toBeNull()
      expect(cliAccounts.create).not.toHaveBeenCalled()
    })
  })

  describe('Remover a conta', () => {
    it('depois da confirmação, apaga a conta e ela some da lista', async () => {
      const { cliAccounts } = pontes([{ id: 'a1', providerId: 'claude', label: 'Trabalho' }])
      const confirmar = vi.fn((_mensagem: string) => true)
      vi.stubGlobal('confirm', confirmar)
      await montar()
      await escolher('Conta', /Trabalho/)

      await clicar(screen.getByRole('button', { name: 'Remover a conta "Trabalho"' }))

      expect(confirmar).toHaveBeenCalledTimes(1)
      expect(String(confirmar.mock.calls[0][0])).toContain('Remover a conta "Trabalho"')
      expect(cliAccounts.remove).toHaveBeenLastCalledWith('a1', expect.objectContaining({ confirmed: true }))
    })

    it('se a pessoa recusa a confirmação, nada é apagado', async () => {
      const { cliAccounts } = pontes([{ id: 'a1', providerId: 'claude', label: 'Trabalho' }])
      vi.stubGlobal('confirm', vi.fn(() => false))
      await montar()
      await escolher('Conta', /Trabalho/)

      await clicar(screen.getByRole('button', { name: 'Remover a conta "Trabalho"' }))

      expect(cliAccounts.remove).toHaveBeenCalledTimes(1)
      expect(cliAccounts.remove).not.toHaveBeenCalledWith('a1', expect.objectContaining({ confirmed: true }))
    })
  })

  describe('lista de contas ilegível', () => {
    it('mostra o aviso com "Tentar de novo", que pede a lista outra vez e limpa o aviso quando ela volta', async () => {
      const { cliAccounts } = pontes([{ id: 'a1', providerId: 'claude', label: 'Trabalho' }])
      cliAccounts.list.mockResolvedValueOnce({ ok: false, message: 'O arquivo de contas está corrompido.' } as never)
      await montar()
      expect(screen.getByRole('alert').textContent).toContain('O arquivo de contas está corrompido.')
      const chamadasAntes = cliAccounts.list.mock.calls.length

      await clicar(screen.getByRole('button', { name: 'Tentar de novo' }))

      expect(cliAccounts.list.mock.calls.length).toBe(chamadasAntes + 1)
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    })
  })
})

describe('AgentConfigFields (projeto, modelo, esforço e planejamento)', () => {
  beforeEach(() => instalarLocalStorageEmMemoria())
  afterEach(() => cleanup())

  it('Projeto: escolher um projeto da lista o seleciona', async () => {
    pontes([])
    await montar()

    await escolher('Projeto', /loja/)

    expect(screen.getByRole('combobox', { name: 'Projeto' }).textContent).toContain('loja')
  })

  it('Projeto: "Adicionar pasta…" abre o seletor e escolhe a pasta nova; sem pasta volta a "Local"', async () => {
    pontes([])
    const onAddFolder = vi.fn(async () => ['p1'])
    await montar(onAddFolder)

    await escolher('Projeto', /Adicionar pasta/)

    expect(onAddFolder).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('combobox', { name: 'Projeto' }).textContent).toContain('loja')
  })

  it('Modelo: "Atualizar lista de modelos" pede às CLIs de novo', async () => {
    const refresh = vi.fn(async () => ({ ok: true }))
    pontes([], { agentModels: { get: vi.fn(async () => ({ catalog: undefined })), refresh } })
    await montar()
    const chamadasAntes = refresh.mock.calls.length

    await clicar(screen.getByRole('button', { name: 'Atualizar lista de modelos' }))

    expect(refresh.mock.calls.length).toBe(chamadasAntes + 1)
  })

  it('Esforço: a lista oferece os níveis do agente e escolher um grava o esforço', async () => {
    pontes([])
    await montar()

    await clicar(screen.getByRole('combobox', { name: 'Esforço de raciocínio' }))
    const niveis = screen.getAllByRole('option').map((o) => o.textContent ?? '')
    expect(niveis.length).toBeGreaterThan(1)
    expect(screen.getByRole('combobox', { name: 'Esforço de raciocínio' }).textContent).toContain('Padrão')
    await clicar(screen.getAllByRole('option')[1])

    expect(screen.getByRole('combobox', { name: 'Esforço de raciocínio' }).textContent).not.toContain('Padrão')
  })

  it('Arquivo de planejamento: digitar o caminho o grava, e o botão abre o seletor de arquivo', async () => {
    pontes([])
    await montar()
    const campo = screen.getByPlaceholderText(/Caminho para um arquivo/) as HTMLInputElement

    fireEvent.change(campo, { target: { value: '/tmp/plano.md' } })
    expect(campo.value).toBe('/tmp/plano.md')

    const seletor = document.querySelector('input[type="file"]') as HTMLInputElement
    const abrir = vi.spyOn(seletor, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar arquivo de planejamento' }))
    expect(abrir).toHaveBeenCalledTimes(1)
  })

  it('Arquivo de planejamento: o arquivo escolhido no seletor preenche o caminho', async () => {
    const getFilePath = vi.fn(() => '/home/ana/plano-real.md')
    pontes([], { getFilePath })
    await montar()
    const seletor = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = new File(['x'], 'plano.md')

    await act(async () => {
      fireEvent.change(seletor, { target: { files: [arquivo] } })
    })

    expect((screen.getByPlaceholderText(/Caminho para um arquivo/) as HTMLInputElement).value).toBe('/home/ana/plano-real.md')
  })
})

describe('AgentConfigFields (Openia)', () => {
  beforeEach(() => instalarLocalStorageEmMemoria())
  afterEach(() => cleanup())

  function ponteOpenia() {
    const openia = {
      listInterfaces: vi.fn(async () => ({
        ok: true,
        interfaces: [{ key: 'chat', name: 'Chat', description: '', ecosystem: 'openia', command: 'openia', homepage: '', modelPrefix: '', supportsModelSelection: true }],
      })),
      listModels: vi.fn(async () => ({
        ok: true,
        models: [
          { id: 'openai/gpt-x', vendor: 'openai', name: 'GPT X', completionPrice: 1 },
          { id: 'anthropic/claude-y', vendor: 'anthropic', name: 'Claude Y', completionPrice: 2 },
        ],
      })),
      setKey: vi.fn(async () => ({ ok: true })),
    }
    pontes([], { openia })
    return openia
  }

  async function abrirOpenia() {
    await montar()
    await escolher('Agente', /Openia/i)
  }

  it('escolher o agente Openia carrega as interfaces e os modelos', async () => {
    const openia = ponteOpenia()
    await abrirOpenia()

    expect(openia.listInterfaces).toHaveBeenCalled()
    expect(openia.listModels).toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Interface Openia' }).textContent).toContain('Chat')
  })

  it('"Atualizar configuração do Openia" pede de novo as interfaces e os modelos, forçando a atualização da lista', async () => {
    const openia = ponteOpenia()
    await abrirOpenia()
    openia.listModels.mockClear()

    await clicar(screen.getByRole('button', { name: 'Atualizar configuração do Openia' }))

    expect(openia.listModels).toHaveBeenCalledWith({ refresh: true })
  })

  it('o modelo do Openia escolhido na lista fica selecionado', async () => {
    ponteOpenia()
    await abrirOpenia()

    await escolher('Modelo Openia', /Claude Y/)

    expect(screen.getByRole('combobox', { name: 'Modelo Openia' }).textContent).toContain('Claude Y')
  })

  it('Salvar guarda a chave do OpenRouter e limpa o campo', async () => {
    const openia = ponteOpenia()
    await abrirOpenia()
    const salvar = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    expect(salvar.disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('sk-or-…'), { target: { value: 'sk-or-teste' } })
    await clicar(salvar)

    expect(openia.setKey).toHaveBeenCalledWith({ name: 'felixo', key: 'sk-or-teste' })
    // Com a chave guardada o campo esvazia e o texto passa a dizer que ela já está configurada.
    expect(screen.getByText(/Chave do login do sistema configurada/)).toBeTruthy()
  })
})

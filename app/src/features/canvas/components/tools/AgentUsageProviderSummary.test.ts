import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CodexSessionFieldsNotice, ProviderSummaryTable } from './AgentUsageProviderSummary'
import { AgentUsageFilterBar } from '../../../shared/agent-usage/AgentUsageFilterBar'
import { AgentUsageStatusDetailsView } from '../../../shared/agent-usage/AgentUsageStatusDetails'
import { EMPTY_AGENT_USAGE_FILTER } from '../../../shared/agent-usage/agent-usage'
import type {
  AgentUsageAccount,
  AgentUsageProviderSummary,
  AgentUsageSample,
} from '../../../shared/agent-usage/agent-usage'

/** Props do botão Atualizar por conta quando o teste não trata delas. */
const SEM_ACAO = { onRefreshAccount: () => {}, refreshingIds: new Set<string>(), refreshDisabled: false }

function account(id: string, identityDisplay: string | null): AgentUsageAccount {
  return {
    id,
    providerId: 'codex',
    label: id,
    identityKey: null,
    identityDisplay,
    identitySource: null,
    createdAt: '2026-10-02T12:00:00.000Z',
    updatedAt: '2026-10-02T12:00:00.000Z',
    ownLogin: false,
    availability: { state: 'available', message: null },
    latestSample: null,
    lastKnownSample: null,
  }
}

const SUMMARY: AgentUsageProviderSummary = {
  columns: [
    { key: 'rate_limits.primary', label: 'Últimas 5 h' },
    { key: 'rate_limits.secondary', label: 'Últimos 7 dias' },
  ],
  rows: [
    {
      account: account('conta-a', 'p***a@example.com'),
      plan: 'plus',
      status: 'current',
      warning: null,
      lastKnown: false,
      notice: null,
      cells: {
        'rate_limits.primary': { remaining: 80, usedPercent: 20, resetAt: null },
        'rate_limits.secondary': { remaining: 5, usedPercent: 95, resetAt: null },
      },
    },
    {
      account: account('Felixo principal', null),
      plan: null,
      status: 'error',
      warning: 'O serviço bloqueou o uso comum desta conta.',
      lastKnown: false,
      notice: null,
      cells: { 'rate_limits.primary': null, 'rate_limits.secondary': null },
    },
  ],
}

describe('ProviderSummaryTable', () => {
  it('um grupo por conta com plano, cada janela e o status, em tabela acessível', () => {
    const html = renderToStaticMarkup(createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: SUMMARY, ...SEM_ACAO }))

    expect(html).toContain('<caption class="sr-only">Resumo das contas do Codex CLI</caption>')
    expect(html).toContain('<th scope="col" class="py-1 pr-2 font-normal">Últimas 5 h</th>')
    expect(html.match(/<tbody/g)).toHaveLength(2)
    expect(html).toContain('p***a@example.com')
    expect(html).toContain('Felixo principal')
    expect(html).toContain('>plus<')
    expect(html).toContain('80 % livre')
    // Janela quase no fim ganha a cor de erro, como a barra.
    expect(html).toContain('<span class="text-theme-error">5 % livre</span>')
    expect(html).toContain('Atualizado')
    expect(html).toContain('Erro')
    expect(html).toContain('O serviço bloqueou o uso comum desta conta.')
  })

  it('o identificador da conta ocupa a largura inteira da tabela, acima dos números', () => {
    // Numa linha só, plano + quatro janelas + status deixavam poucos pixels
    // para a conta e o e-mail quebrava letra por letra no painel estreito.
    const narrowSummary: AgentUsageProviderSummary = {
      ...SUMMARY,
      rows: [
        {
          ...SUMMARY.rows[0],
          account: account('conta-a', 'nome.sobrenome.backup2026@example.com'),
        },
      ],
    }
    const html = renderToStaticMarkup(
      createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: narrowSummary, ...SEM_ACAO }),
    )

    // Plano + 2 janelas + status = 4 colunas, todas cobertas pelo nome.
    expect(html).toContain('<th scope="rowgroup" colSpan="4"')
    expect(html).toContain('title="nome.sobrenome.backup2026@example.com"')
    // Sem coluna "Conta" disputando largura com os números.
    expect(html).not.toContain('>Conta</th>')
    // Uma conta por grupo de linhas: o nome é o cabeçalho dos números dela.
    expect(html.match(/<tbody/g)).toHaveLength(1)
  })

  it('janela que a conta não publicou aparece como traço, nunca como zero', () => {
    const html = renderToStaticMarkup(createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: SUMMARY, ...SEM_ACAO }))

    expect(html).toContain('title="A CLI não publicou esta janela para a conta."')
    expect(html).not.toContain('>0 % livre')
  })

  it('sem contas, não desenha a tabela', () => {
    const html = renderToStaticMarkup(
      createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: { columns: [], rows: [] }, ...SEM_ACAO }),
    )

    expect(html).toBe('')
  })

  describe('botão Atualizar de cada conta', () => {
    const tabela = (extras: Partial<Parameters<typeof ProviderSummaryTable>[0]> = {}) =>
      renderToStaticMarkup(createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: SUMMARY, ...SEM_ACAO, ...extras }))

    it('cada conta tem o seu botão, com nome acessível e o texto que diz o que a consulta lê', () => {
      const html = tabela()

      expect(html.match(/data-felixo-agent-usage-refresh-account/g)).toHaveLength(2)
      expect(html).toContain('aria-label="Atualizar a conta &quot;p***a@example.com&quot;"')
      expect(html).toContain('aria-label="Atualizar a conta &quot;Felixo principal&quot;"')
      // Conta do login do sistema (`ownLogin: false` na fixture): a ajuda avisa que lê a sessão da máquina.
      expect(html).toContain('login desta máquina')
    })

    it('a conta com login próprio diz que a consulta é só dela', () => {
      const proprio: AgentUsageProviderSummary = {
        ...SUMMARY,
        rows: [{ ...SUMMARY.rows[0], account: { ...SUMMARY.rows[0].account, ownLogin: true } }],
      }

      const html = tabela({ summary: proprio })

      expect(html).toContain('Consulta só esta conta, na pasta de login dela')
      expect(html).not.toContain('login desta máquina')
    })

    it('a conta que está atualizando gira e não aceita outro clique; as outras seguem livres', () => {
      const html = tabela({ refreshingIds: new Set(['conta-a']) })
      const botoes = html.match(/<button[^>]*data-felixo-agent-usage-refresh-account[^>]*>/g) ?? []

      expect(botoes).toHaveLength(2)
      expect(botoes[0]).toContain('disabled=""')
      expect(botoes[0]).toContain('aria-busy="true"')
      expect(botoes[1]).not.toContain('disabled=""')
      expect(botoes[1]).toContain('aria-busy="false"')
      expect(html.match(/animate-spin/g)).toHaveLength(1)
    })

    it('com a rodada completa em andamento os botões ficam desabilitados, porque ela já lê todas as contas', () => {
      const botoes = tabela({ refreshDisabled: true }).match(/<button[^>]*data-felixo-agent-usage-refresh-account[^>]*>/g) ?? []

      expect(botoes).toHaveLength(2)
      for (const botao of botoes) {
        expect(botao).toContain('disabled=""')
      }
    })
  })
})

describe('AgentUsageFilterBar', () => {
  const barra = (props: Partial<Parameters<typeof AgentUsageFilterBar>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(AgentUsageFilterBar, {
        filter: EMPTY_AGENT_USAGE_FILTER,
        onChange: () => {},
        shown: 8,
        total: 8,
        attentionCount: 3,
        ...props,
      }),
    )

  it('sem filtro ligado: campo de busca com nome acessível e o atalho de atenção com a contagem, sem contador nem "limpar"', () => {
    const html = barra()

    expect(html).toContain('role="search"')
    expect(html).toContain('type="search"')
    expect(html).toContain('aria-label="Buscar conta por nome, e-mail ou plano"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('Precisa de atenção (3)')
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('Limpar filtro')
  })

  it('com filtro ligado: diz quantas contas sobraram e oferece limpar', () => {
    const html = barra({ filter: { query: 'ana', attentionOnly: true }, shown: 2 })

    expect(html).toContain('value="ana"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('<span role="status"')
    expect(html).toContain('>2 de 8 contas<')
    expect(html).toContain('Limpar filtro')
  })

  it('uma conta só fica no singular', () => {
    expect(barra({ filter: { query: 'x', attentionOnly: false }, shown: 1, total: 1 })).toContain('>1 de 1 conta<')
  })
})

describe('CodexSessionFieldsNotice', () => {
  it('diz quais campos da conversa ficam fora e por quê', () => {
    const html = renderToStaticMarkup(createElement(CodexSessionFieldsNotice))

    for (const field of ['pasta', 'permissões da pasta', 'Agents.md', 'nome e modo da conversa', 'ID da sessão', 'janela de contexto']) {
      expect(html).toContain(field)
    }
    expect(html).toContain('pertencem ao terminal, não à conta')
  })
})

describe('AgentUsageStatusDetailsView com os detalhes do Codex', () => {
  function sampleWith(statusDetails: AgentUsageSample['metadata']['statusDetails']): AgentUsageSample {
    return {
      id: 'amostra',
      accountId: 'conta-a',
      status: 'current',
      sourceKind: 'live-query',
      sourceLabel: 'Codex',
      sourceCommand: null,
      sourceUrl: null,
      collectedAt: '2026-10-02T20:04:00.000Z',
      metrics: [],
      observedIdentityKey: null,
      observedIdentityDisplay: null,
      errorMessage: null,
      metadata: { statusDetails },
    }
  }

  it('rotula os campos em português e só transforma em link a página de uso https', () => {
    const html = renderToStaticMarkup(
      createElement(AgentUsageStatusDetailsView, {
        sample: sampleWith({
          usagePage: 'https://chatgpt.com/codex/settings/usage',
          configuration: { reasoningEffort: 'max', approvalPolicy: 'padrão da CLI' },
          tokenUsage: { lifetimeTokens: '123.456.789 tokens' },
          screen: 'lida às 17:04.',
        }),
      }),
    )

    expect(html).toContain('href="https://chatgpt.com/codex/settings/usage"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Esforço de raciocínio')
    expect(html).toContain('Política de aprovação')
    expect(html).toContain('Total desde o início')
    expect(html).toContain('Tela do /status')

    const notLink = renderToStaticMarkup(
      createElement(AgentUsageStatusDetailsView, {
        sample: sampleWith({ usagePage: 'javascript:alert(1)' }),
      }),
    )
    expect(notLink).not.toContain('href=')
  })
})

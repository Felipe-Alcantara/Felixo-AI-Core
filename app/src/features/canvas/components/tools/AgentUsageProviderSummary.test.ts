import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CodexSessionFieldsNotice, ProviderSummaryTable } from './AgentUsageProviderSummary'
import { AgentUsageStatusDetailsView } from '../../../shared/agent-usage/AgentUsageStatusDetails'
import type {
  AgentUsageAccount,
  AgentUsageProviderSummary,
  AgentUsageSample,
} from '../../../shared/agent-usage/agent-usage'

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
      cells: { 'rate_limits.primary': null, 'rate_limits.secondary': null },
    },
  ],
}

describe('ProviderSummaryTable', () => {
  it('uma linha por conta com plano, cada janela e o status, em tabela acessível', () => {
    const html = renderToStaticMarkup(createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: SUMMARY }))

    expect(html).toContain('<caption class="sr-only">Resumo das contas do Codex CLI</caption>')
    expect(html).toContain('<th scope="col" class="w-[4.5rem] py-1 pr-2 font-normal">Últimas 5 h</th>')
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

  it('janela que a conta não publicou aparece como traço, nunca como zero', () => {
    const html = renderToStaticMarkup(createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: SUMMARY }))

    expect(html).toContain('title="A CLI não publicou esta janela para a conta."')
    expect(html).not.toContain('>0 % livre')
  })

  it('sem contas, não desenha a tabela', () => {
    const html = renderToStaticMarkup(
      createElement(ProviderSummaryTable, { providerName: 'Codex CLI', summary: { columns: [], rows: [] } }),
    )

    expect(html).toBe('')
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

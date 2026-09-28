import { describe, expect, it } from 'vitest'
import {
  buildAccountSwitchDialogModel,
  buildContinuationLaunch,
  countLines,
  formatTranscriptSize,
  initialDialogSelection,
} from './account-switch-dialog'
import { makeCandidate, makeProposal } from './__fixtures__/account-chain-fixtures'

const SP = { timeZone: 'America/Sao_Paulo' }
const NOW = Date.parse('2026-09-28T17:34:05.000Z')

function model(overrides: Parameters<typeof makeProposal>[0] = {}, selectedAccountId: string | null = null) {
  return buildAccountSwitchDialogModel({
    proposal: makeProposal(overrides),
    selectedAccountId,
    transcriptChars: 3277,
    transcriptLines: 48,
    nowMs: NOW,
    timeOptions: SP,
  })
}

describe('buildAccountSwitchDialogModel', () => {
  it('resumo para o leitor de tela com origem, cobrança e recomendada', () => {
    expect(model().summary).toBe(
      'Limite de uso detectado às 14:32 na conta Pessoal (Codex, assinatura). Recomendada: Trabalho (Codex, assinatura).',
    )
    expect(model().title).toBe('Trocar de conta?')
  })

  it('foco inicial no rádio recomendado, nunca no botão; rótulo do botão leva o destino', () => {
    const view = model()
    expect(view.initialFocusAccountId).toBe('conta-b')
    expect(view.options.find((option) => option.recommended)?.accountId).toBe('conta-b')
    expect(view.confirmLabel).toBe('Abrir bloco novo em Trabalho')
  })

  it('a escolha da pessoa muda o destino e o rótulo, sem mudar o recomendado', () => {
    const view = model({}, 'conta-c')
    expect(view.initialFocusAccountId).toBe('conta-c')
    expect(view.confirmLabel).toBe('Abrir bloco novo em Reserva')
    expect(view.options.find((option) => option.recommended)?.accountId).toBe('conta-b')
  })

  it('a conta escolhida sai da proposta: sem destino, com o motivo, e nunca cai na recomendada', () => {
    // A checagem em curso de "Reserva" terminou deslogada: a proposta ao vivo
    // passa a vir sem ela e com ela em "Fora agora".
    const view = model(
      {
        candidates: [makeCandidate({ accountId: 'conta-b', label: 'Trabalho', position: 1 })],
        excluded: [{ accountId: 'conta-c', providerId: 'codex', label: 'Reserva', reason: 'deslogada', reasonText: null }],
      },
      'conta-c',
    )
    expect(view.initialFocusAccountId).toBeNull()
    expect(view.selectionLost).toBe('A conta escolhida (Reserva) deixou de estar apta: sem login. Escolha outra para continuar.')
    expect(view.confirmLabel).toBe('Abrir bloco novo')
    expect(view.costNotice).toBeNull()
    expect(view.providerSwitchNotice).toBeNull()

    const gone = model({ candidates: [makeCandidate({ accountId: 'conta-b', label: 'Trabalho' })] }, 'conta-c')
    expect(gone.initialFocusAccountId).toBeNull()
    expect(gone.selectionLost).toBe('A conta escolhida saiu da lista. Escolha outra para continuar.')
  })

  it('sem escolha perdida não há aviso; ao abrir, o destino marcado é o recomendado', () => {
    expect(model().selectionLost).toBeNull()
    expect(model({}, 'conta-c').selectionLost).toBeNull()
    expect(initialDialogSelection(makeProposal())).toBe('conta-b')
    expect(initialDialogSelection(makeProposal({ recommendedAccountId: null }))).toBe('conta-b')
    expect(initialDialogSelection(makeProposal({ candidates: [], recommendedAccountId: null }))).toBeNull()
  })

  it('custo com todas as letras: tamanho do contexto e o que será consumido', () => {
    expect(model().costNotice).toBe(
      'Abrir o bloco novo envia o contexto (3,2 KB, 48 linhas) como ponto de partida. O agente vai ler esse contexto e consumir a assinatura da conta Trabalho.',
    )
    const uso = model({
      candidates: [makeCandidate({ accountId: 'conta-b', label: 'Trabalho', billingDetected: 'uso' })],
    })
    expect(uso.costNotice).toContain('cobrança por uso da conta Trabalho')
    const openia = model({
      candidates: [makeCandidate({ accountId: 'conta-b', label: 'Router', providerId: 'openia' })],
    })
    expect(openia.costNotice).toContain('créditos por uso do OpenRouter em Router')
  })

  it('outro provedor avisa que o histórico mascarado vai para ele', () => {
    const view = model({
      candidates: [makeCandidate({ accountId: 'conta-b', label: 'Max', providerId: 'claude' })],
    })
    expect(view.providerSwitchNotice).toContain('Outro provedor')
    expect(view.providerSwitchNotice).toContain('será enviado a Claude')
    expect(model().providerSwitchNotice).toBeNull()
  })

  it('várias sessões na mesma conta e retomada automática do Claude', () => {
    expect(model({ otherSessionsInIncident: 2 }).multipleSessionsNotice).toBe(
      'Outros 2 blocos nesta conta também pararam. Cada continuação que você confirmar envia o contexto dela à conta de destino.',
    )
    expect(model({ otherSessionsInIncident: 0 }).multipleSessionsNotice).toBeNull()
    expect(model({ sourceAutoResumeAt: '2026-09-28T19:40:00.000Z' }).oldTerminal.autoResume).toContain(
      'continuar sozinho às 16:40 na conta antiga',
    )
  })

  it('terminal antigo intacto; saída recente pede a segunda confirmação', () => {
    const parado = model({ sourceLastOutputAt: '2026-09-28T17:33:05.000Z' })
    expect(parado.oldTerminal.untouched).toMatch(/não será encerrado nem receberá nada/)
    expect(parado.oldTerminal.sourceActive).toBe(false)
    expect(parado.oldTerminal.activity).toBe('Parado há 60 s.')
    const ativo = model({ sourceLastOutputAt: '2026-09-28T17:34:03.000Z' })
    expect(ativo.oldTerminal.sourceActive).toBe(true)
    expect(ativo.oldTerminal.activity).toMatch(/ainda está produzindo saída/)
  })

  it('evidência limitada a 200 caracteres', () => {
    const view = model({ evidence: 'x'.repeat(500) })
    expect(view.from.evidence?.length).toBe(200)
  })

  it('estado vazio: nenhuma conta apta, com os motivos', () => {
    const view = model({
      candidates: [],
      recommendedAccountId: null,
      excluded: [{ accountId: 'conta-b', providerId: 'codex', label: 'Trabalho', reason: 'em-espera', reasonText: null }],
    })
    expect(view.empty).toBe(true)
    expect(view.initialFocusAccountId).toBeNull()
    expect(view.costNotice).toBeNull()
    expect(view.excluded).toEqual([{ name: 'Trabalho (Codex)', reason: 'em espera' }])
    expect(view.summary).toMatch(/Nenhuma conta apta agora/)
  })

  it('login em checagem aparece como tal', () => {
    const view = model({ candidates: [makeCandidate({ accountId: 'conta-b', checkingLogin: true })] })
    expect(view.options[0].login).toBe('Conferindo login…')
  })
})

describe('tamanho do contexto', () => {
  it('é fato do texto, não estimativa de tokens', () => {
    expect(formatTranscriptSize(3277, 48)).toBe('3,2 KB, 48 linhas')
    expect(formatTranscriptSize(12, 1)).toBe('12 caracteres, 1 linha')
    expect(countLines('a\nb\nc')).toBe(3)
    expect(countLines('')).toBe(0)
  })
})

describe('buildContinuationLaunch', () => {
  it('mesmo provedor repete comando e argumentos do bloco antigo', () => {
    expect(
      buildContinuationLaunch({
        source: { command: 'codex', args: ['--model', 'gpt-5', '--dangerously-bypass-approvals-and-sandbox'], label: 'Codex · repo' },
        sourceProviderId: 'codex',
        destinationProviderId: 'codex',
        destinationLabel: 'Trabalho',
      }),
    ).toEqual({
      command: 'codex',
      args: ['--model', 'gpt-5', '--dangerously-bypass-approvals-and-sandbox'],
      label: 'Codex · repo · continuação (Trabalho)',
    })
  })

  it('outro provedor volta ao modelo padrão e mantém só o modo de permissão', () => {
    expect(
      buildContinuationLaunch({
        source: { command: 'codex', args: ['--model', 'gpt-5', '--dangerously-bypass-approvals-and-sandbox'], label: 'Codex' },
        sourceProviderId: 'codex',
        destinationProviderId: 'claude',
        destinationLabel: 'Max',
      }),
    ).toEqual({ command: 'claude', args: ['--dangerously-skip-permissions'], label: 'Codex · continuação (Max)' })
  })

  it('Openia de destino abre o menu dele, sem inventar flags', () => {
    expect(
      buildContinuationLaunch({
        source: { command: 'claude', label: 'Claude' },
        sourceProviderId: 'claude',
        destinationProviderId: 'openia',
        destinationLabel: 'Router',
      }),
    ).toEqual({ command: 'openia', launchMode: 'launcher', label: 'Claude · continuação (Router)' })
  })
})

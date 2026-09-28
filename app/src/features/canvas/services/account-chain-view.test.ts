import { describe, expect, it } from 'vitest'
import {
  accountChipLabel,
  chainLaunchSummary,
  confirmErrorText,
  exclusionsText,
  explainCandidateRank,
  failureClassLabel,
  formatAgo,
  formatBilling,
  formatCapacity,
  formatClockTime,
  formatCooldown,
  formatLogin,
  formatMultiplier,
  ineligibilityText,
  isUsageBilling,
  moveMember,
  nodeIdFromPtySessionId,
  parseMultiplierInput,
  positionAnnouncement,
  ptySessionIdForNode,
  summarizeChain,
  toHistoryRow,
  toMemberUpdates,
} from './account-chain-view'
import { makeCandidate, makeMember, makeProposal, makeState } from './__fixtures__/account-chain-fixtures'
import type { AccountSwitchHistoryEntry } from '../../shared/types/account-chain'

const SP = { timeZone: 'America/Sao_Paulo' }
const NOW = Date.parse('2026-09-28T17:35:05.000Z')

describe('sessão PTY ↔ bloco', () => {
  it('ida e volta pelo prefixo canvas:', () => {
    expect(ptySessionIdForNode('abc')).toBe('canvas:abc')
    expect(nodeIdFromPtySessionId('canvas:abc')).toBe('abc')
  })

  it('sessão que não é de bloco não vira id', () => {
    expect(nodeIdFromPtySessionId('chat:1')).toBeNull()
    expect(nodeIdFromPtySessionId('canvas:')).toBeNull()
    expect(nodeIdFromPtySessionId(null)).toBeNull()
  })
})

describe('glossário', () => {
  it('rede e servidor nunca são chamados de limite', () => {
    expect(failureClassLabel('network')).not.toMatch(/limite/i)
    expect(failureClassLabel('provider')).not.toMatch(/limite/i)
    expect(failureClassLabel('timeout')).not.toMatch(/limite/i)
    expect(failureClassLabel('limit')).toBe('limite de uso')
  })
})

describe('horários', () => {
  it('mostra o horário local pedido e diz quando não há horário', () => {
    expect(formatClockTime('2026-09-28T17:32:05.000Z', SP)).toBe('14:32')
    expect(formatClockTime(null)).toBe('horário desconhecido')
    expect(formatClockTime('não é data')).toBe('horário desconhecido')
  })

  it('relativo curto em pt-BR', () => {
    expect(formatAgo('2026-09-28T17:33:05.000Z', NOW)).toBe('há 2 min')
    expect(formatAgo('2026-09-28T17:35:00.000Z', NOW)).toBe('agora')
  })
})

describe('formatCooldown', () => {
  const base = {
    accountId: 'conta-a',
    providerId: 'codex' as const,
    failureClass: 'limit' as const,
    detectedAt: '2026-09-28T17:32:05.000Z',
    untilAt: '2026-09-28T19:40:00.000Z',
    untilSource: 'texto' as const,
    alternativeUntilAt: null,
    alternativeUntilSource: null,
    evidence: null,
    needsCheck: false,
  }

  it('fim e fonte da espera', () => {
    expect(formatCooldown(base, SP)).toBe(
      'em espera até 16:40 · fonte: horário impresso pela CLI',
    )
  })

  it('mostra também a outra fonte quando medição e texto divergem', () => {
    expect(
      formatCooldown(
        { ...base, alternativeUntilAt: '2026-09-28T19:20:00.000Z', alternativeUntilSource: 'medicao' },
        SP,
      ),
    ).toBe('em espera até 16:40 · fonte: horário impresso pela CLI (medido: 16:20)')
  })

  it('auth e billing esperam uma ação, não um horário', () => {
    expect(formatCooldown({ ...base, failureClass: 'auth', untilAt: null, untilSource: 'checagem' })).toBe(
      'em espera até conferir o login de novo',
    )
    expect(formatCooldown({ ...base, failureClass: 'billing', untilAt: null, untilSource: 'checagem' })).toBe(
      'em espera até recarregar e conferir o login',
    )
  })

  it('espera vencida pede nova checagem, nunca volta a apta sozinha', () => {
    expect(formatCooldown({ ...base, needsCheck: true })).toMatch(/precisa conferir o login/)
  })

  it('sem espera, nada', () => {
    expect(formatCooldown(null)).toBe('')
  })
})

describe('formatCapacity', () => {
  it('exemplo do dono: 50% × 20x = 1000', () => {
    expect(
      formatCapacity(
        {
          value: 1000,
          remainingPercent: 50,
          measuredAt: '2026-09-28T17:02:00.000Z',
          lastMeasuredAt: '2026-09-28T17:02:00.000Z',
          comparable: true,
        },
        20,
        SP,
      ),
    ).toBe('1000 = 50% × 20x · medido às 14:02')
  })

  it('sem medição atual não vira 0 nem 100', () => {
    const text = formatCapacity(
      { value: null, remainingPercent: null, measuredAt: null, lastMeasuredAt: '2026-09-28T16:02:00.000Z', comparable: true },
      1,
      SP,
    )
    expect(text).toBe('sem medição atual (última às 13:02)')
    expect(text).not.toMatch(/\b0\b|100/)
  })

  it('créditos em dinheiro não são comparáveis', () => {
    expect(
      formatCapacity(
        { value: null, remainingPercent: null, measuredAt: null, lastMeasuredAt: null, comparable: false },
        1,
      ),
    ).toMatch(/não comparável/)
  })
})

describe('multiplicador e cobrança', () => {
  it('diz a fonte do multiplicador e a divergência', () => {
    expect(formatMultiplier({ multiplier: 1, source: 'nao_declarado', declared: null, detected: null })).toBe(
      'não declarado (vale 1)',
    )
    expect(formatMultiplier({ multiplier: 20, source: 'declarado', declared: 20, detected: null })).toBe(
      '20x · declarado',
    )
    expect(formatMultiplier({ multiplier: 20, source: 'cli', declared: 5, detected: 20 })).toBe(
      '20x · informado pela CLI (você declarou 5x, a CLI informa 20x)',
    )
  })

  it('cobrança divergente é desconhecida e nunca presumida assinatura', () => {
    expect(formatBilling('assinatura', 'uso')).toMatch(/^cobrança desconhecida/)
    expect(isUsageBilling('assinatura', 'uso')).toBe(false)
    expect(formatBilling(null, null)).toBe('cobrança não declarada')
    expect(formatBilling('uso', null)).toBe('cobrança por uso (declarada)')
    expect(isUsageBilling(null, 'uso')).toBe(true)
  })
})

describe('formatLogin', () => {
  it('login conferido pela CLI diz que é checagem local', () => {
    expect(
      formatLogin(
        {
          status: 'logged_in',
          checkedAt: '2026-09-28T17:32:05.000Z',
          source: 'checagem',
          method: null,
          plan: null,
          identityStatus: 'matched',
        },
        NOW,
      ),
    ).toBe('conferido pela CLI há 3 min (checagem local)')
  })

  it('sem checagem diz que não foi conferido', () => {
    expect(formatLogin(null, NOW)).toBe('login não conferido')
  })
})

describe('ineligibilityText', () => {
  it('prefere o texto do main e cai no glossário', () => {
    expect(ineligibilityText('em-espera', 'em espera até 16:40')).toBe('em espera até 16:40')
    expect(ineligibilityText('sem-checagem-de-login')).toMatch(/até o app conferir o login/)
    expect(ineligibilityText(null)).toBe('')
  })
})

describe('summarizeChain', () => {
  it('desligada por padrão', () => {
    expect(summarizeChain(makeState({ settings: { enabled: false, strategy: 'manual', maxHopsPerLineage: 3, updatedAt: null } }))).toMatch(
      /^Desligada/,
    )
  })

  it('ligada sem contas habilitadas pede para habilitar', () => {
    expect(summarizeChain(makeState({ members: [makeMember({ enabled: false })] }))).toBe(
      'Ligada · 0 contas habilitadas: habilite as que podem receber trocas.',
    )
  })

  it('conta travada (sem checagem de login) não conta como habilitada', () => {
    expect(
      summarizeChain(makeState({ members: [makeMember({ enabled: true, locked: true, providerId: 'gemini' })] })),
    ).toMatch(/0 contas habilitadas/)
  })

  it('conta habilitadas e aptas', () => {
    expect(
      summarizeChain(
        makeState({
          members: [makeMember(), makeMember({ accountId: 'conta-b', eligible: false, reason: 'em-espera' })],
        }),
      ),
    ).toBe('Ligada · 2 contas habilitadas, 1 apta agora · Ordem manual.')
  })
})

describe('ordem da lista', () => {
  const members = [
    makeMember({ accountId: 'a', label: 'Pessoal' }),
    makeMember({ accountId: 'b', label: 'Trabalho' }),
    makeMember({ accountId: 'c', label: 'Reserva' }),
  ]

  it('move para cima e para baixo sem mutar a lista original', () => {
    expect(moveMember(members, 'b', -1)?.map((item) => item.accountId)).toEqual(['b', 'a', 'c'])
    expect(moveMember(members, 'b', 1)?.map((item) => item.accountId)).toEqual(['a', 'c', 'b'])
    expect(members.map((item) => item.accountId)).toEqual(['a', 'b', 'c'])
  })

  it('fora dos limites não manda nada', () => {
    expect(moveMember(members, 'a', -1)).toBeNull()
    expect(moveMember(members, 'c', 1)).toBeNull()
    expect(moveMember(members, 'x', 1)).toBeNull()
  })

  it('anuncia a posição nova em ordinal', () => {
    expect(positionAnnouncement('Pessoal', 1)).toBe('Pessoal agora é a 2ª')
  })

  it('a regravação leva a lista inteira, na ordem, sem campos derivados', () => {
    expect(toMemberUpdates(members.slice(0, 1))).toEqual([
      { accountId: 'a', enabled: true, billingDeclared: null, multiplierDeclared: null },
    ])
  })
})

describe('parseMultiplierInput', () => {
  it('aceita 1 a 100, vírgula e o x no fim; vazio é não declarado', () => {
    expect(parseMultiplierInput('20')).toEqual({ ok: true, value: 20 })
    expect(parseMultiplierInput('2,5x')).toEqual({ ok: true, value: 2.5 })
    expect(parseMultiplierInput('  ')).toEqual({ ok: true, value: null })
  })

  it('recusa fora da faixa e texto', () => {
    expect(parseMultiplierInput('0')).toEqual({ ok: false })
    expect(parseMultiplierInput('101')).toEqual({ ok: false })
    expect(parseMultiplierInput('muito')).toEqual({ ok: false })
  })
})

describe('toHistoryRow', () => {
  const entry: AccountSwitchHistoryEntry = {
    id: 'evento-1',
    kind: 'continuation',
    state: 'spawned',
    from: { accountId: 'conta-a', providerId: 'codex', label: 'Pessoal' },
    to: { accountId: 'conta-b', providerId: 'codex', label: 'Trabalho' },
    failureClass: 'limit',
    reason: 'Limite de uso da conta Pessoal',
    strategy: 'manual',
    chosenBy: 'chain',
    sourceSessionId: 'canvas:bloco-1',
    targetSessionId: 'canvas:bloco-2',
    detectedAt: '2026-09-28T17:32:05.000Z',
    proposedAt: '2026-09-28T17:32:06.000Z',
    decidedAt: '2026-09-28T17:33:00.000Z',
    spawnedAt: '2026-09-28T17:33:02.000Z',
    sourceActiveAck: false,
    transcriptChars: 1200,
    postSwitchFailure: null,
  }

  it('origem → destino, motivo, estado e o bloco novo', () => {
    const row = toHistoryRow(entry, NOW, SP)
    expect(row.route).toBe('Pessoal (Codex) → Trabalho (Codex)')
    expect(row.reason).toBe('Limite de uso da conta Pessoal')
    expect(row.stateLabel).toBe('bloco aberto')
    expect(row.when).toBe('28/09/2026, 14:33')
    expect(row.at).toBe(entry.spawnedAt)
    expect(row.nodeId).toBe('bloco-2')
  })

  it('aviso sem destino aponta para o bloco de origem; Login do sistema tem nome', () => {
    const row = toHistoryRow(
      {
        ...entry,
        kind: 'notice',
        state: 'noticed',
        to: null,
        from: { accountId: null, providerId: 'claude', label: null },
        targetSessionId: null,
        spawnedAt: null,
        decidedAt: null,
        reason: '',
      },
      NOW,
      SP,
    )
    expect(row.route).toBe('Login do sistema (Claude)')
    expect(row.reason).toBe('limite de uso')
    expect(row.nodeId).toBe('bloco-1')
  })
})

describe('accountChipLabel', () => {
  it('fixa é o padrão sem modo gravado', () => {
    expect(accountChipLabel({ accountId: 'conta-a', accountLabel: 'Pessoal' }).text).toBe('Pessoal · fixa')
  })

  it('cadeia e Login do sistema', () => {
    expect(
      accountChipLabel({ accountId: 'conta-a', accountLabel: 'Pessoal', accountMode: 'chain' }).text,
    ).toBe('Pessoal · cadeia')
    expect(accountChipLabel({ accountId: '', accountMode: 'chain' }).text).toBe('Login do sistema')
  })
})

describe('prévia e recomendação', () => {
  it('explica a posição conforme a estratégia', () => {
    const candidate = makeCandidate({
      capacity: { value: 1000, remainingPercent: 50, measuredAt: null, lastMeasuredAt: null, comparable: true },
      multiplier: 20,
    })
    expect(explainCandidateRank('manual', candidate, 0)).toBe('1ª apta na ordem manual')
    expect(explainCandidateRank('round_robin', candidate, 0)).toBe('próxima do rodízio')
    expect(explainCandidateRank('most_capacity', candidate, 0)).toBe('maior capacidade: 1000 = 50% × 20x')
    expect(
      explainCandidateRank('most_capacity', makeCandidate(), 1),
    ).toBe('sem medição atual, não comparada')
    expect(explainCandidateRank('subscription_first', makeCandidate({ billingDeclared: 'assinatura', billingDetected: 'uso' }), 0)).toBe(
      'cobrança desconhecida, depois das assinaturas',
    )
  })

  it('a prévia da Automática diz qual conta e por quê', () => {
    expect(chainLaunchSummary(makeProposal({ kind: 'launch' }))).toBe(
      'A cadeia vai usar: Trabalho (Codex) · 1ª apta na ordem manual.',
    )
    expect(chainLaunchSummary(makeProposal({ recommendedAccountId: null }))).toBeNull()
  })

  it('nenhuma conta apta lista o motivo de cada uma', () => {
    expect(
      exclusionsText([
        { accountId: 'a', providerId: 'codex', label: 'Pessoal', reason: 'em-espera', reasonText: null },
        { accountId: 'b', providerId: 'codex', label: 'Trabalho', reason: 'login-nao-conferido', reasonText: null },
      ]),
    ).toBe('Pessoal (Codex): em espera; Trabalho (Codex): login não conferido há pouco')
    expect(exclusionsText([])).toMatch(/Nenhuma conta/)
  })

  it('recusa do confirm vira texto que diz que nada foi aberto', () => {
    expect(confirmErrorText('EXPIRED')).toMatch(/Nada foi aberto/)
    expect(confirmErrorText('NOT_PENDING')).toMatch(/Nada foi aberto/)
    expect(confirmErrorText('OUTRO', 'falhou no main')).toBe('falhou no main')
  })
})

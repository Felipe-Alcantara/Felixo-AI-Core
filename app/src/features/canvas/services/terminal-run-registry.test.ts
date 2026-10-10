import { describe, expect, it } from 'vitest'
import { explainAgentResume, type AgentResumeFailure, type AgentSessionReference } from './agent-session'
import { RESUME_INITIAL_TEXT } from './quality-standard-prompt'
import { buildTerminalResumeBanner, followsTerminalResumePlan, resolveTerminalRelaunch } from './terminal-resume-banner'
import {
  TERMINAL_RUN_STORAGE_KEY,
  createTerminalRunRegistry,
  type TerminalRunStorage,
} from './terminal-run-registry'

/**
 * `sessionStorage` em memória. Compartilhar a instância entre dois registros
 * simula o `location.reload` da mesma janela (o módulo recomeça, o
 * armazenamento fica); uma instância nova é a janela fechada e reaberta.
 */
function memoryStorage(): TerminalRunStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

const reload = (storage: TerminalRunStorage) => createTerminalRunRegistry(() => storage)

const reference: AgentSessionReference = {
  version: 1,
  provider: 'codex',
  sessionId: 'conversa-antiga-0123456789',
  cwd: '/repo',
  capturedAt: 1,
}
const expired: AgentResumeFailure = { sessionId: reference.sessionId, reason: 'expired', at: 5 }

describe('registro de execução: recarregar só a interface', () => {
  it('bloco iniciado continua iniciado depois do location.reload da mesma janela', () => {
    const storage = memoryStorage()
    const first = reload(storage)
    first.captureRestored(['agente'])
    first.markStarted('agente')

    // Ctrl+R: o módulo recomeça, o PTY segue vivo no processo principal.
    const afterReload = reload(storage)
    expect(afterReload.hasStarted('agente')).toBe(true)
    // Nada a segurar: o `ensure()` reanexa ao processo de pé, e o bloco não
    // volta para "aguardando escolha / Nada foi iniciado".
    expect(afterReload.captureRestored(['agente']).holdable.has('agente')).toBe(false)
  })

  it('bloco segurado (sem processo) continua segurado depois do reload', () => {
    const storage = memoryStorage()
    reload(storage).captureRestored(['segurado'])
    const capture = reload(storage).captureRestored(['segurado'])
    expect(capture.restored.has('segurado')).toBe(true)
    expect(capture.holdable.has('segurado')).toBe(true)
  })

  it('janela nova (app reaberto) começa do zero, como os PTYs', () => {
    const storage = memoryStorage()
    reload(storage).markStarted('agente')
    const reopened = reload(memoryStorage())
    expect(reopened.hasStarted('agente')).toBe(false)
    expect(reopened.captureRestored(['agente']).holdable.has('agente')).toBe(true)
  })

  it('sem sessionStorage o registro segue em memória, sem erro', () => {
    const throwing: TerminalRunStorage = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('cheio')
      },
    }
    for (const registry of [
      createTerminalRunRegistry(() => throwing),
      createTerminalRunRegistry(() => {
        throw new Error('SecurityError')
      }),
      createTerminalRunRegistry(() => undefined),
    ]) {
      registry.markStarted('agente')
      expect(registry.hasStarted('agente')).toBe(true)
      expect(registry.captureRestored(['agente', 'outro']).holdable).toEqual(new Set(['outro']))
    }
  })

  it('conteúdo gravado ilegível vira registro vazio', () => {
    const storage = memoryStorage()
    storage.values.set(TERMINAL_RUN_STORAGE_KEY, '{quebrado')
    expect(reload(storage).hasStarted('agente')).toBe(false)
    storage.values.set(TERMINAL_RUN_STORAGE_KEY, JSON.stringify({ started: [1, null, 'ok'], choices: { a: 'x' } }))
    const registry = reload(storage)
    expect(registry.hasStarted('ok')).toBe(true)
    expect(registry.choiceFor('a')).toBeUndefined()
  })
})

describe('registro de execução: ida ao chat e volta', () => {
  it('quem era restaurado continua restaurado com o processo de pé, sem ser segurado', () => {
    const storage = memoryStorage()
    const registry = reload(storage)
    expect(registry.captureRestored(['restaurado']).restored.has('restaurado')).toBe(true)
    registry.markStarted('restaurado')

    // Nova montagem do canvas (mesmo registro) e reload (registro novo).
    for (const again of [registry, reload(storage)]) {
      const capture = again.captureRestored(['restaurado'])
      expect(capture.restored.has('restaurado')).toBe(true)
      expect(capture.holdable.has('restaurado')).toBe(false)
    }
  })

  it('o Reiniciar de um restaurado sem conversa segue o mesmo plano (/resume) na volta', () => {
    const registry = reload(memoryStorage())
    const relaunch = (isRestoredAgent: boolean) =>
      resolveTerminalRelaunch({
        followsResumePlan: followsTerminalResumePlan({ isRestoredAgent, hasAgentCommand: true, reference: undefined }),
        command: 'codex',
        cwd: '/repo',
        initialText: 'instrução de largada',
      })
    const before = relaunch(registry.captureRestored(['restaurado']).restored.has('restaurado'))
    registry.markStarted('restaurado')
    const after = relaunch(registry.captureRestored(['restaurado']).restored.has('restaurado'))
    expect(before).toMatchObject({ kind: 'spawn', initialText: RESUME_INITIAL_TEXT })
    expect(after).toEqual(before)
  })

  it('agente criado nesta execução não vira restaurado na volta', () => {
    const registry = reload(memoryStorage())
    registry.captureRestored([])
    registry.markStarted('novo')
    expect(registry.captureRestored(['novo']).restored.has('novo')).toBe(false)
  })

  it('a escolha da faixa volta depois da reidratação, e a faixa de falha não reaparece', () => {
    const storage = memoryStorage()
    const registry = reload(storage)
    registry.recordNodePatch('bloco', { resumeChoice: 'new' })
    // Outros patches não mexem na escolha.
    registry.recordNodePatch('bloco', { label: 'Renomeado' })

    // O disco não tem a escolha (é transitória); o registro a reaplica.
    const hydrated = [{ id: 'bloco', data: { agentSession: reference, resumeFailure: expired } }]
    for (const again of [registry, reload(storage)]) {
      const [node] = again.applyChoices(hydrated)
      const data = node.data as { resumeChoice?: 'picker' | 'new' }
      expect(data.resumeChoice).toBe('new')
      const plan = explainAgentResume({
        command: 'codex',
        cwd: '/repo',
        reference,
        accountId: undefined,
        failure: expired,
        choice: data.resumeChoice,
      })
      expect(buildTerminalResumeBanner({ plan, reference, cwd: '/repo', command: 'codex' })).toBeNull()
    }
  })

  it('limpar a escolha (tentar de novo, conversa trocada, falha nova) também sai do registro', () => {
    const storage = memoryStorage()
    const registry = reload(storage)
    registry.recordNodePatch('bloco', { resumeChoice: 'picker' })
    registry.recordNodePatch('bloco', { resumeChoice: undefined })
    expect(registry.choiceFor('bloco')).toBeUndefined()
    expect(reload(storage).choiceFor('bloco')).toBeUndefined()
    const nodes = [{ id: 'bloco', data: {} }]
    expect(registry.applyChoices(nodes)).toBe(nodes)
  })

  it('não sobrescreve uma escolha que o bloco já tem', () => {
    const registry = reload(memoryStorage())
    registry.recordNodePatch('bloco', { resumeChoice: 'new' })
    const nodes = [{ id: 'bloco', data: { resumeChoice: 'picker' } }]
    expect(registry.applyChoices(nodes)).toBe(nodes)
  })
})

describe('registro de execução: conversa esquecida', () => {
  it('o reanexo que reemite a conversa esquecida é ignorado, inclusive depois do reload', () => {
    const storage = memoryStorage()
    const registry = reload(storage)
    expect(registry.acceptAgentSession('bloco', reference.sessionId)).toBe(true)
    registry.forgetAgentSessions('bloco', [reference.sessionId, undefined])
    expect(registry.acceptAgentSession('bloco', reference.sessionId)).toBe(false)
    expect(reload(storage).acceptAgentSession('bloco', reference.sessionId)).toBe(false)
    // Só o bloco que esqueceu.
    expect(registry.acceptAgentSession('outro', reference.sessionId)).toBe(true)
  })

  it('uma conversa diferente volta a valer e encerra o esquecimento', () => {
    const storage = memoryStorage()
    const registry = reload(storage)
    registry.forgetAgentSessions('bloco', [reference.sessionId])
    expect(registry.acceptAgentSession('bloco', 'conversa-nova-9876543210')).toBe(true)
    // Outro processo gravou outra conversa: escolher a antiga na lista depois vale.
    expect(registry.acceptAgentSession('bloco', reference.sessionId)).toBe(true)
    expect(reload(storage).acceptAgentSession('bloco', reference.sessionId)).toBe(true)
  })

  it('esquecer sem conversa nenhuma não bloqueia nada', () => {
    const registry = reload(memoryStorage())
    registry.forgetAgentSessions('bloco', [undefined, ''])
    expect(registry.acceptAgentSession('bloco', reference.sessionId)).toBe(true)
  })
})

describe('registro de execução: o que a decisão de subida pressupõe', () => {
  // `resolveTerminalSpawnPlan` segura um bloco pela versão da CLI olhando só
  // os "sem processo" (`holdable`), sem conferir que ele está entre os
  // restaurados. Quem garante isso é a captura: este teste prende a garantia
  // aqui, na origem, para ela não depender de ninguém lembrar.
  it('os "sem processo" são sempre um subconjunto dos restaurados, em qualquer ordem de eventos', () => {
    const ids = ['a', 'b', 'c', 'd']
    const passos: Array<(registry: ReturnType<typeof reload>) => void> = [
      (registry) => registry.markStarted('a'),
      (registry) => registry.markStarted('c'),
      (registry) => void registry.captureRestored(['a', 'b']),
      (registry) => void registry.captureRestored(ids),
      (registry) => registry.markStarted('b'),
      (registry) => registry.markStarted('d'),
    ]

    // Todas as ordens dos seis passos, com um reload da interface no meio.
    const ordens = permutacoes(passos.map((_, index) => index))
    expect(ordens).toHaveLength(720)
    for (const ordem of ordens) {
      const storage = memoryStorage()
      let registry = reload(storage)
      ordem.forEach((indice, posicao) => {
        if (posicao === 3) registry = reload(storage)
        passos[indice](registry)
        const captura = registry.captureRestored(ids)
        for (const id of captura.holdable) {
          expect(captura.restored.has(id), `${id} em ${ordem.join(',')}`).toBe(true)
          expect(registry.hasStarted(id), `${id} em ${ordem.join(',')}`).toBe(false)
        }
      })
    }
  })
})

function permutacoes<T>(itens: T[]): T[][] {
  if (itens.length <= 1) return [itens]
  return itens.flatMap((item, index) =>
    permutacoes([...itens.slice(0, index), ...itens.slice(index + 1)]).map((resto) => [item, ...resto]),
  )
}

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  getPersistenceFailures,
  reportActionFailure,
  resetPersistenceFailuresForTests,
} from '../../canvas/services/canvas-persistence-status'
import { announceFileNodeToTerminalNode, requestRepoDiagnosis } from '../../canvas/services/file-terminal-links'
import { dispensaDoAndamentoCaiu, tentarInstalarDeNovo } from '../../setup/cli-setup-actions'
import { instalarAtualizacao, verificarAtualizacao } from '../../updates/update-actions'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('falha de ação sem lugar próprio na tela', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetPersistenceFailuresForTests()
  })
  afterEach(() => {
    resetPersistenceFailuresForTests()
    vi.useRealTimers()
  })

  it('aparece na barra de status e some sozinha depois do prazo', () => {
    reportActionFailure('ligar-arquivo:a:b', 'O aviso do arquivo não chegou ao terminal do agente.')
    expect(getPersistenceFailures()).toEqual(['O aviso do arquivo não chegou ao terminal do agente.'])
    vi.advanceTimersByTime(8001)
    expect(getPersistenceFailures()).toEqual([])
  })

  it('repetir a mesma ação renova o prazo em vez de empilhar', () => {
    reportActionFailure('x', 'falhou')
    vi.advanceTimersByTime(6000)
    reportActionFailure('x', 'falhou')
    vi.advanceTimersByTime(6000)
    expect(getPersistenceFailures()).toEqual(['falhou'])
    vi.advanceTimersByTime(2100)
    expect(getPersistenceFailures()).toEqual([])
  })
})

const arquivo = (data: Record<string, unknown>): Node => ({ id: 'f1', type: 'file', position: { x: 0, y: 0 }, data })
const terminal: Node = { id: 't1', type: 'terminal', position: { x: 0, y: 0 }, data: { command: 'claude' } }

function ponte(resolve: () => Promise<unknown>) {
  ;(globalThis as { window?: unknown }).window = { felixo: { canvasFiles: { resolve } } }
}

describe('ligar arquivo ao agente e pedir o diagnóstico', () => {
  const anterior = (globalThis as { window?: unknown }).window
  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = anterior
  })

  it('arquivo externo (sem fileName) não é avisado ao agente e isso é dito', async () => {
    ponte(async () => ({ ok: true, path: '/x' }))
    const sink = { sendText: vi.fn() }
    expect(await announceFileNodeToTerminalNode(arquivo({ filePath: '/externo.md' }), terminal, sink, 'T')).toBe('no-file-name')
    expect(sink.sendText).not.toHaveBeenCalled()
  })

  it('resolve que falha ({ ok: false }) ou rejeita vira resolve-failed', async () => {
    const sink = { sendText: vi.fn() }
    ponte(async () => ({ ok: false }))
    expect(await announceFileNodeToTerminalNode(arquivo({ fileName: 'a.md' }), terminal, sink, 'T')).toBe('resolve-failed')
    ponte(async () => { throw new Error('IPC caiu') })
    expect(await announceFileNodeToTerminalNode(arquivo({ fileName: 'a.md' }), terminal, sink, 'T')).toBe('resolve-failed')
    expect(sink.sendText).not.toHaveBeenCalled()
  })

  it('só "sent" quando o terminal recebeu o texto; entrega recusada ou rejeitada é send-failed', async () => {
    ponte(async () => ({ ok: true, path: '/repo/a.md' }))
    const file = arquivo({ fileName: 'a.md' })
    expect(await announceFileNodeToTerminalNode(file, terminal, { sendText: async () => ({ delivered: true }) }, 'T')).toBe('sent')
    expect(await announceFileNodeToTerminalNode(file, terminal, { sendText: async () => ({ delivered: false, reason: 'rejected' as const }) }, 'T')).toBe('send-failed')
    expect(await announceFileNodeToTerminalNode(file, terminal, { sendText: () => Promise.reject(new Error('pty:write caiu')) }, 'T')).toBe('send-failed')
  })

  it('o diagnóstico só diz "ok" depois de o terminal receber (antes respondia sem esperar o pty:write)', async () => {
    ponte(async () => ({ ok: true, path: '/repo/a.md' }))
    const nodes = [arquivo({ fileName: 'a.md' }), terminal]
    const edges = [{ id: 'e', source: 'f1', target: 't1' }]
    expect(await requestRepoDiagnosis('f1', nodes, edges, { sendText: async () => ({ delivered: true }) }, 'T')).toBe('ok')
    expect(await requestRepoDiagnosis('f1', nodes, edges, { sendText: async () => ({ delivered: false, reason: 'no-session' as const }) }, 'T')).toBe('send-failed')
  })
})

describe('instalação das CLIs e atualização do app', () => {
  it('nova tentativa recusada ({ ok: false }), rejeitada ou sem ponte é falha com mensagem', async () => {
    expect(await tentarInstalarDeNovo({ retry: async () => ({ ok: false, message: 'Já há uma instalação em curso.' }) })).toEqual({ ok: false, message: 'Já há uma instalação em curso.' })
    expect(await tentarInstalarDeNovo({ retry: async () => { throw new Error('IPC caiu') } })).toEqual({ ok: false, message: 'IPC caiu' })
    expect(await tentarInstalarDeNovo(undefined)).toMatchObject({ ok: false })
    expect(await tentarInstalarDeNovo({ retry: async () => ({ ok: true }) })).toMatchObject({ ok: true })
  })

  it('a dispensa do andamento cai quando a rodada acaba, para o da próxima não nascer escondido', () => {
    expect(dispensaDoAndamentoCaiu('em-andamento', 'error')).toBe(true)
    expect(dispensaDoAndamentoCaiu('em-andamento', 'done')).toBe(true)
    expect(dispensaDoAndamentoCaiu('em-andamento', 'installing')).toBe(false)
    expect(dispensaDoAndamentoCaiu('resultado:error:1', 'installing')).toBe(false)
    expect(dispensaDoAndamentoCaiu(null, 'error')).toBe(false)
  })

  it('instalar e verificar atualização devolvem a recusa do main e a rejeição', async () => {
    expect(await instalarAtualizacao({ install: async () => ({ ok: false, message: 'Nada baixado.' }) })).toEqual({ ok: false, message: 'Nada baixado.' })
    expect(await instalarAtualizacao({ install: async () => { throw new Error('boom') } })).toEqual({ ok: false, message: 'boom' })
    expect(await verificarAtualizacao(undefined)).toMatchObject({ ok: false })
    expect(await verificarAtualizacao({ check: async () => ({ ok: true }) })).toMatchObject({ ok: true })
  })
})

describe('painéis: o resultado do IPC decide o "Salvo", a lista e o erro', () => {
  it.each([
    ['canvas/components/tools/SettingsPanel.tsx', ['resultadoDeIpc(() => persist(value)', 'setQualityStandard', 'setSaveError(result.message)']],
    ['canvas/components/tools/NotesPanel.tsx', ["'Não foi possível salvar a nota.'", "'Não foi possível criar a nota.'", "'Não foi possível apagar a nota.'", 'setLoadError(']],
    ['canvas/components/tools/ModelsPanel.tsx', ["'Não foi possível remover o modelo.'", "'Não foi possível carregar os modelos.'"]],
    ['canvas/components/tools/GitPanel.tsx', ["'Não foi possível listar os arquivos do repositório.'", "'Não foi possível ler o histórico de commits.'", "'Não foi possível listar as branches.'", 'catch (error)']],
    ['canvas/components/tools/FetchAllPanel.tsx', ["'Não foi possível ler as configurações do Fetch All.'", "'Não foi possível voltar a considerar a pasta.'"]],
    ['canvas/components/tools/AgentUsagePanel.tsx', ["'Não foi possível alterar a coleta do rate limit.'", 'setError(await onToggle(enable))']],
    ['canvas/components/tools/SkillsPanel.tsx', ["'Não foi possível salvar as skills.'", 'setSkills(previous)']],
    ['canvas/components/tools/PromptsPanel.tsx', ["'Não foi possível apagar a automação.'", "result = 'failed'"]],
    ['canvas/components/tools/ProjectsPanel.tsx', ['setLoadError(null)\n', '.catch((error) =>', "reportActionFailure('adicionar-projeto'"]],
    ['canvas/hooks/useAgentPresets.ts', ['clearError', 'só os nativos aparecem']],
    ['canvas/components/AgentQuestionDialog.tsx', ["'Não foi possível responder.'", '.catch(() => undefined)']],
    ['canvas/components/AgentBrowserRequestCard.tsx', ["'Não foi possível decidir o pedido.'", '.catch(() => undefined)']],
    ['canvas/components/TerminalMenu.tsx', ["reportActionFailure('abrir-agente'"]],
    ['canvas/components/HandoffDialog.tsx', ["reportActionFailure('registrar-passagem'"]],
  ])('%s trata ok:false e rejeição', (file, trechos) => {
    const code = source(file)
    for (const trecho of trechos) expect(code, `${file}: ${trecho}`).toContain(trecho)
  })

  it('o CanvasView só diz "copiado" se copiou, e avisa o ditado e a ligação de arquivo', () => {
    const code = source('canvas/components/CanvasView.tsx')
    expect(code).toContain("(await copiarTexto(insertion.content)).ok ? 'copied' : 'failed'")
    expect(code).not.toMatch(/navigator\.clipboard\?\.writeText/)
    expect(code).toContain('ANNOUNCE_FAILURE_MESSAGE[status]')
    expect(code).toContain('não consegui copiar')
  })

  it('o LinkChooserHost e os botões de cópia do terminal não engolem a recusa do clipboard', () => {
    expect(source('shared/links/LinkChooserHost.tsx')).not.toMatch(/clipboard?.writeText/)
    expect(source('shared/links/LinkChooserHost.tsx')).toContain('onCopyFailed(copy.message)')
    expect(source('canvas/components/TerminalCopyButton.tsx')).toContain("setEstado('falhou')")
    expect(source('canvas/components/TerminalDetailsPanel.tsx')).toContain('copiarTexto(text)')
    expect(source('canvas/terminal/terminal-session-store.ts')).toContain('throw new Error(copy.message)')
  })

  it('o aviso da placa de vídeo diz quando não conseguiu dispensar', () => {
    const code = source('shared/hardware/HardwareNotices.tsx')
    expect(code).toContain('acknowledgeGpuFallback().catch(() => setGpuAckFailed(true))')
    expect(code).toContain('ele volta na próxima abertura')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const main = (path: string) => readFileSync(new URL(`../../../../electron/${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('falhas de IPC (parte 2): o que a pessoa vê quando o IPC falha', () => {
  it.each([
    ['canvas/components/CanvasView.tsx', ["reportActionFailure('abrir-imagem', picked.message)", "reportActionFailure('abrir-arquivo', picked.message)"]],
    ['canvas/hooks/useCanvasNotifications.ts', ["reportActionFailure('som-notificacao'"]],
    ['canvas/services/openia-image-store.ts', ["reportActionFailure('cancelar-imagem'", 'cancelling: false']],
    ['canvas/services/webview-profiles-store.ts', ["reportActionFailure('perfis-do-navegador'", 'loaded = false']],
    ['canvas/components/tools/TerminalsPanel.tsx', ["reportActionFailure(`enviar-rascunho:${nodeId}`", 'o rascunho foi mantido']],
    ['canvas/services/account-chain-client.ts', ["set({ message })\n        return { ok: false, message }"]],
    ['canvas/components/tools/DictationSettingsSection.tsx', ["'Não foi possível remover a chave guardada.'", "'Não foi possível ler as configurações do ditado.'"]],
    ['canvas/components/tools/NotionTasksPanel.tsx', ['staleNoticeRef', 'current === antigo ? null : current']],
    ['canvas/hooks/useAccountContinuation.ts', ["setBannerError(sourceNodeId, message)", "reportActionFailure('conferir-login'"]],
    ['canvas/components/AgentConfigFields.tsx', ["'Não foi possível criar a conta.'"]],
    ['canvas/terminal/session-notifications.ts', ["snapshot?.activity === 'error'"]],
  ])('%s', (file, trechos) => {
    const code = source(file)
    for (const trecho of trechos) expect(code, `${file}: ${trecho}`).toContain(trecho)
  })

  it('o main devolve { ok: false } ao apagar a chave de voz, em vez de rejeitar', () => {
    const code = main('services/speech/speech-ipc-handlers.cjs')
    expect(code).toMatch(/speech:clear-key[\s\S]{0,260}catch[\s\S]{0,120}ok: false/)
  })
})

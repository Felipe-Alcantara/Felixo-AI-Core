// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PromptGeneratorForm } from './PromptGeneratorForm'
import { instalarShimsDeLayout } from '../../../shared/test-support/jsdom-shims'

instalarShimsDeLayout()

const SCOPES = [{ value: 'chat', label: 'Chat' }]

function montar(props: Partial<React.ComponentProps<typeof PromptGeneratorForm>> = {}) {
  const onSend = vi.fn(async () => 'copied' as const)
  const onSave = vi.fn(async () => null)
  render(
    <PromptGeneratorForm editing={false} scopeOptions={SCOPES} onSend={onSend} onSave={onSave} onClose={() => {}} {...props} />,
  )
  return { onSend, onSave }
}

const escrever = (rotulo: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })

describe('PromptGeneratorForm', () => {
  afterEach(() => cleanup())

  it('sem objetivo as três ações ficam desligadas', () => {
    montar()
    for (const nome of [/Copiar/, /Enviar ao agente/, /Salvar no catálogo/]) {
      expect((screen.getByRole('button', { name: nome }) as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('a prévia segue os campos e o envio leva o texto exato da prévia', async () => {
    const { onSend } = montar()
    escrever(/Objetivo/, 'Revisar o PR 12')
    escrever(/Contexto/, 'Mexe no login')
    const previa = screen.getByLabelText(/Prévia/) as HTMLTextAreaElement
    expect(previa.value).toContain('## Objetivo\nRevisar o PR 12')
    expect(previa.value).toContain('## Contexto\nMexe no login')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Enviar ao agente/ })))
    expect(onSend).toHaveBeenCalledWith({ name: 'Revisar o PR 12', content: previa.value })
    // Sem terminal aberto o envio cai na cópia e a tela avisa.
    expect(screen.getByRole('status').textContent).toMatch(/copiado/i)
  })

  it('copiar põe a prévia editada, e editar não é sobrescrito pelos campos', async () => {
    const escrita = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrita }, configurable: true })
    montar()
    escrever(/Objetivo/, 'Resumir')
    fireEvent.change(screen.getByLabelText(/Prévia/), { target: { value: 'texto meu' } })
    escrever(/Contexto/, 'mais')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Copiar/ })))
    expect(escrita).toHaveBeenCalledWith('texto meu')
  })

  it('salvar manda nome, tópico e os campos preenchidos; reabrir devolve os campos', async () => {
    const { onSave } = montar()
    escrever(/Objetivo/, 'Resumir a reunião')
    escrever(/Formato de saída/, 'Cinco linhas')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar no catálogo/ })))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Resumir a reunião',
        scope: 'chat',
        fields: { objetivo: 'Resumir a reunião', formatoSaida: 'Cinco linhas' },
      }),
    )
    cleanup()
    montar({ initialFields: { objetivo: 'Resumir a reunião', formatoSaida: 'Cinco linhas' }, editing: true })
    expect((screen.getByLabelText(/Objetivo/) as HTMLTextAreaElement).value).toBe('Resumir a reunião')
    expect((screen.getByLabelText(/Formato de saída/) as HTMLTextAreaElement).value).toBe('Cinco linhas')
    expect(screen.getByRole('button', { name: /Atualizar no catálogo/ })).toBeTruthy()
  })

  it('falha ao salvar aparece como erro', async () => {
    montar({ onSave: vi.fn(async () => 'Não foi possível criar este prompt.') })
    escrever(/Objetivo/, 'x')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar no catálogo/ })))
    expect(screen.getByRole('status').textContent).toMatch(/Não foi possível/)
  })
})

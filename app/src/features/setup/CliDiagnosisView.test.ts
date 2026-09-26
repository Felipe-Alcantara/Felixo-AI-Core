import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CliDiagnosisFooter, CliDiagnosisLine, CliDiagnosisList } from './CliDiagnosisView'
import type { CliDiagnosis } from './cli-diagnosis'

const INVISIBLE: CliDiagnosis = {
  id: 'codex',
  name: 'Codex CLI',
  status: 'unavailable',
  cause: 'path',
  recommendInstall: false,
  nextAction: {
    kind: 'fix-path',
    text: 'Reiniciar o Felixo costuma refazer o PATH; reinstalar não resolve.',
  },
}

describe('CliDiagnosisLine', () => {
  it('shows what happened and what to do next, escaped as text', () => {
    const html = renderToStaticMarkup(
      createElement(CliDiagnosisLine, {
        diagnosis: { ...INVISIBLE, nextAction: { kind: 'inspect', text: '<b>rode no terminal</b>' } },
      }),
    )

    expect(html).toContain('Instalada, mas invisível ao app')
    expect(html).toContain('&lt;b&gt;rode no terminal&lt;/b&gt;')
    expect(html).toContain('data-cli-diagnosis="codex"')
  })
})

describe('CliDiagnosisList', () => {
  it('names each CLI and keeps the scrollable list reachable by keyboard', () => {
    const html = renderToStaticMarkup(createElement(CliDiagnosisList, { diagnoses: [INVISIBLE] }))

    expect(html).toContain('Codex CLI')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="Diagnóstico das CLIs de IA"')
  })
})

describe('CliDiagnosisFooter', () => {
  it('offers the support text only once there is one to copy', () => {
    const running = renderToStaticMarkup(
      createElement(CliDiagnosisFooter, { state: { running: true, report: null, error: null } }),
    )
    const ready = renderToStaticMarkup(
      createElement(CliDiagnosisFooter, {
        state: {
          running: false,
          report: { diagnoses: [INVISIBLE], supportText: 'Felixo AI Core 0.1.0 — linux/x64' },
          error: null,
        },
      }),
    )

    expect(running).toContain('Diagnosticando as CLIs…')
    expect(running).not.toContain('Copiar texto para o suporte')
    expect(ready).toContain('Copiar texto para o suporte')
  })

  it('announces a failed diagnosis as an alert', () => {
    const html = renderToStaticMarkup(
      createElement(CliDiagnosisFooter, {
        state: { running: false, report: null, error: 'IPC fechado' },
      }),
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('IPC fechado')
  })
})

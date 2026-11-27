import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Trava: o código que roda dentro de um elemento destacável não pode presumir a
 * janela principal. `document` e `window` globais são sempre os dela; o certo é
 * perguntar ao elemento (`documentoDe`, `janelaDe` em `multijanela.ts`).
 * Elemento que passar a ser destacável entra nesta lista.
 */
const SRC = join(__dirname, '..', '..', '..')

const TERMINAL = 'features/canvas/terminal'
const DESTACAVEL = [
  ...readdirSync(join(SRC, TERMINAL))
    .filter((nome) => nome.endsWith('.ts') && !nome.endsWith('.test.ts') && !nome.startsWith('mock-'))
    .map((nome) => `${TERMINAL}/${nome}`),
  'features/canvas/components/terminal-detach.ts',
  'features/canvas/components/terminal-fit-lifecycle.ts',
]

/** Pontos de partida do app, que não vão junto para a auxiliar. */
const PROIBIDO = /\bdocument\.(body|activeElement|addEventListener|querySelector)|\bwindow\.(addEventListener|innerWidth|innerHeight|getSelection|requestAnimationFrame|matchMedia|getComputedStyle|devicePixelRatio)|instanceof (Element|HTMLElement|Node)\b/

const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('código destacável não presume a janela principal', () => {
  it('cobre o terminal inteiro', () => {
    expect(DESTACAVEL).toContain(`${TERMINAL}/terminal-session-store.ts`)
    expect(DESTACAVEL.length).toBeGreaterThan(30)
  })

  it('a expressão pega o que precisa pegar', () => {
    for (const linha of ['document.body.append(x)', "window.addEventListener('resize', f)", 'if (a instanceof Node) b()']) {
      expect(linha).toMatch(PROIBIDO)
    }
    expect('documentoDe(elemento).body; janelaDe(elemento).addEventListener("resize", f)').not.toMatch(PROIBIDO)
  })

  it.each(DESTACAVEL)('%s', (arquivo) => {
    const achados = semComentarios(readFileSync(join(SRC, arquivo), 'utf8'))
      .split('\n')
      .filter((linha) => PROIBIDO.test(linha))
      .map((linha) => linha.trim())

    expect(achados).toEqual([])
  })
})

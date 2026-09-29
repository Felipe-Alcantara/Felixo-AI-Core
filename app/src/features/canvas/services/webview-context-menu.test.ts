import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { webviewLinkMenu } from './webview-context-menu'

const LINK = 'https://example.com/docs'

describe('webviewLinkMenu', () => {
  // Os pontos do experimento no Electron 41.10.7 (ver o comentário da função):
  // o `context-menu` já entrega o clique no espaço da janela. Somar o
  // retângulo do webview de novo, como antes, punha o menu do primeiro caso
  // em (650,425).
  it.each([
    ['webview em (300,200), clique em (350,225)', 350, 225],
    ['link dentro de um iframe da página', 520, 215],
    ['pai do webview com scale(0.5), como o zoom do canvas', 325, 212],
  ])('%s: o menu nasce no ponto que o Electron entregou', (_label, x, y) => {
    expect(webviewLinkMenu({ linkURL: LINK, x, y }, 1)).toEqual({ url: LINK, anchor: { x, y } })
  })

  it('com zoom da janela, divide pelo fator: o menu mede em pixels CSS', () => {
    // Fator 1,5: o clique no ponto CSS (325,212) chegou como (488,318), já
    // arredondado pelo Electron; o menu nasce a menos de meio pixel dele.
    const anchor = webviewLinkMenu({ linkURL: LINK, x: 488, y: 318 }, 1.5)?.anchor
    expect(anchor?.x).toBeCloseTo(325, 0)
    expect(anchor?.y).toBeCloseTo(212, 5)
    expect(webviewLinkMenu({ linkURL: LINK, x: 100, y: 60 }, 0.5)?.anchor).toEqual({ x: 200, y: 120 })
  })

  it('fator que não é zoom (sem a ponte do preload) vale 1', () => {
    for (const factor of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      expect(webviewLinkMenu({ linkURL: LINK, x: 40, y: 30 }, factor)?.anchor).toEqual({ x: 40, y: 30 })
    }
  })

  it('longe de um link não há menu: a página segue com o dela', () => {
    expect(webviewLinkMenu({ linkURL: '', x: 40, y: 30 }, 1)).toBeNull()
  })

  it('link javascript: chega como o marcador do Chromium e vale como sem link', () => {
    // O Chromium não repassa o destino: o menu diria "endereços about: não
    // abrem" e copiaria o marcador, que não é o que a página escreveu.
    expect(webviewLinkMenu({ linkURL: 'about:blank#blocked', x: 40, y: 30 }, 1)).toBeNull()
  })

  it('só o marcador exato: outro endereço about: segue para o menu, que explica a recusa', () => {
    for (const linkURL of ['about:blank', 'about:blank#topo']) {
      expect(webviewLinkMenu({ linkURL, x: 40, y: 30 }, 1)?.url).toBe(linkURL)
    }
  })
})

describe('zoom da janela pela ponte do preload', () => {
  // O bloco lê `window.felixo.windowZoom.getFactor()`, e o preload é .cjs: o
  // tipo do vite-env.d.ts não confere o outro lado. Um nome trocado em um dos
  // dois faria o fator cair em 1 calado, e com zoom o menu voltaria a nascer
  // longe do clique.
  it('o preload expõe o fator do webFrame e o vite-env.d.ts declara a ponte', () => {
    const preload = readFileSync(new URL('../../../../electron/preload.cjs', import.meta.url), 'utf8')
    const types = readFileSync(new URL('../../../vite-env.d.ts', import.meta.url), 'utf8')

    expect(preload).toMatch(/windowZoom: \{\s*getFactor: \(\) => webFrame\.getZoomFactor\(\),\s*\}/)
    expect(preload).toMatch(/const \{[^}]*\bwebFrame\b[^}]*\} = require\('electron'\)/)
    expect(types).toMatch(/windowZoom\?: \{\s*getFactor: \(\) => number\s*\}/)
  })
})

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { EXCALIDRAW_ASSETS_DIR, excalidrawAssetPath } from './excalidraw-asset-path'

const require = createRequire(import.meta.url)

describe('excalidrawAssetPath', () => {
  it('no app instalado aponta para a pasta das fontes ao lado do index.html, com acento e espaço', () => {
    expect(excalidrawAssetPath('file:///C:/Users/Ana%20Maria/AppData/Local/Programs/Felixo%20AI%20Core/resources/app.asar/dist/index.html')).toBe(
      'file:///C:/Users/Ana%20Maria/AppData/Local/Programs/Felixo%20AI%20Core/resources/app.asar/dist/excalidraw-assets/',
    )
    expect(excalidrawAssetPath('file:///J:/Programação/app/dist/index.html')).toBe(
      'file:///J:/Programa%C3%A7%C3%A3o/app/dist/excalidraw-assets/',
    )
    expect(excalidrawAssetPath('file:///opt/Felixo%20AI%20Core/resources/app.asar/dist/index.html?benchmark=x#y')).toBe(
      'file:///opt/Felixo%20AI%20Core/resources/app.asar/dist/excalidraw-assets/',
    )
  })

  it('no app instalado (app://felixo) aponta para a pasta do build servida pelo protocolo', () => {
    expect(excalidrawAssetPath('app://felixo/index.html')).toBe('app://felixo/excalidraw-assets/')
  })

  it('em dev aponta para o dev server, que serve as fontes do node_modules', () => {
    expect(excalidrawAssetPath('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173/excalidraw-assets/')
  })

  it('o resultado é absoluto e termina em "/": o Excalidraw não resolve contra o origin "null" do file://', () => {
    const base = excalidrawAssetPath('file:///x/dist/index.html')
    expect(new URL(base).protocol).toBe('file:')
    expect(base.endsWith('/')).toBe(true)
    expect(new URL('./fonts/Excalifont/a.woff2', base).href).toBe('file:///x/dist/excalidraw-assets/fonts/Excalifont/a.woff2')
  })

  it('usa a mesma pasta em que o build emite as fontes', () => {
    expect(EXCALIDRAW_ASSETS_DIR).toBe(require('../scripts/excalidraw-fonts.cjs').EXCALIDRAW_ASSETS_DIR)
  })
})

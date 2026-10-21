import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { readTailwindPalette, renderLightPaletteCss } from './paleta-tema-claro'

const themeCss = readFileSync(
  new URL('../../../../node_modules/tailwindcss/theme.css', import.meta.url),
  'utf8',
)

describe('paleta do tema claro', () => {
  it('espelha cada degrau no oposto da mesma família e devolve o original na ilha escura', () => {
    const css = renderLightPaletteCss(themeCss)
    const zinc = readTailwindPalette(themeCss).get('zinc')!
    const [claro, ilha] = css.split('.felixo-paleta-escura')

    expect(claro).toContain(`--color-zinc-400: ${zinc.get('600')};`)
    expect(claro).toContain(`--color-zinc-950: ${zinc.get('50')};`)
    expect(ilha).toContain(`--color-zinc-400: ${zinc.get('400')};`)
    // O meio da escala não muda; não precisa estar no arquivo.
    expect(css).not.toContain('--color-zinc-500:')
  })

  it('cobre todas as famílias da paleta instalada', () => {
    const css = renderLightPaletteCss(themeCss)
    for (const family of readTailwindPalette(themeCss).keys()) {
      expect(css, family).toContain(`--color-${family}-50:`)
    }
  })

  it('o arquivo gravado é o que o Tailwind instalado gera', async () => {
    await expect(renderLightPaletteCss(themeCss)).toMatchFileSnapshot('./paleta-tema-claro.css')
  })
})

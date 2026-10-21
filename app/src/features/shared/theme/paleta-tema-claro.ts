/**
 * Gera `paleta-tema-claro.css`: a paleta do Tailwind espelhada para o tema claro.
 *
 * Os componentes foram escritos para o escuro com classes como `text-zinc-400`,
 * `bg-zinc-900` e `text-sky-300`. No Tailwind 4 cada uma delas é só
 * `var(--color-zinc-400)` etc., então o tema claro não reescreve componente:
 * troca o valor da variável pelo do degrau oposto da mesma família (50↔950,
 * 100↔900, 200↔800, 300↔700, 400↔600). Texto claro sobre fundo escuro vira
 * texto escuro sobre fundo claro, e o tom de fundo escuro vira um tom claro, na
 * mesma matiz. O 500 é o meio da escala e fica igual.
 *
 * O segundo bloco devolve a paleta original dentro de `.felixo-paleta-escura`:
 * o terminal continua escuro no tema claro, e a nota é papel claro desenhado
 * sobre a mesa escura. Os dois precisam das cores com que foram desenhados.
 *
 * Os valores vêm do `theme.css` do Tailwind instalado. Se uma atualização do
 * Tailwind mudar a paleta, o teste deste arquivo falha até a paleta ser
 * gerada de novo (`npm run tema:paleta-clara`).
 */

const SHADE_MIRROR: Record<string, string> = {
  '50': '950',
  '100': '900',
  '200': '800',
  '300': '700',
  '400': '600',
  '600': '400',
  '700': '300',
  '800': '200',
  '900': '100',
  '950': '50',
}

const SHADE_ORDER = ['50', '100', '200', '300', '400', '600', '700', '800', '900', '950']

type Palette = Map<string, Map<string, string>>

export function readTailwindPalette(themeCss: string): Palette {
  const palette: Palette = new Map()
  for (const match of themeCss.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
    const [, family, shade, value] = match
    if (!palette.has(family)) palette.set(family, new Map())
    palette.get(family)!.set(shade, value.trim())
  }
  return palette
}

export function renderLightPaletteCss(themeCss: string): string {
  const palette = readTailwindPalette(themeCss)
  const families = [...palette.keys()].sort()
  const mirrored: string[] = []
  const original: string[] = []

  for (const family of families) {
    const shades = palette.get(family)!
    for (const shade of SHADE_ORDER) {
      const own = shades.get(shade)
      const opposite = shades.get(SHADE_MIRROR[shade])
      if (!own || !opposite) {
        throw new Error(`A família ${family} do Tailwind não tem os degraus ${shade} e ${SHADE_MIRROR[shade]}.`)
      }
      mirrored.push(`    --color-${family}-${shade}: ${opposite};`)
      original.push(`    --color-${family}-${shade}: ${own};`)
    }
  }

  return [
    '/* GERADO por src/features/shared/theme/paleta-tema-claro.ts a partir do',
    '   theme.css do Tailwind instalado. Não edite à mão: rode',
    '   `npm run tema:paleta-clara`. O porquê está no topo do gerador. */',
    '@layer base {',
    "  :root[data-theme='light'] {",
    ...mirrored,
    '  }',
    '',
    "  :root[data-theme='light'] .felixo-paleta-escura {",
    ...original,
    '  }',
    '}',
    '',
  ].join('\n')
}

import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

/**
 * Classe que o Tailwind não reconhece some do CSS sem aviso no build. Foi assim
 * que "Tentar de novo" ficou invisível no aviso de falha das CLIs: no Tailwind 3,
 * `bg-[var(--x)]/90` não gerava CSS, e o texto escuro do botão ficava sobre o
 * fundo escuro do aviso. O Tailwind 4 gera essa forma (a canônica é
 * `bg-(--x)/90`), então a guarda deixou de caçar um padrão e passou a compilar:
 * toda classe das listas de classe dos .tsx desta pasta (e da do tutorial do
 * canvas, que também só usa classes próprias) precisa sair no CSS — utility do
 * Tailwind ou classe própria (`felixo-*`) do index.css.
 */
const directory = dirname(fileURLToPath(import.meta.url))
const scannedDirectories = [directory, join(directory, '../onboarding')]
const indexCssPath = join(directory, '../../index.css')
const resolveModule = createRequire(import.meta.url).resolve

/**
 * Marcadores que não geram CSS de propósito: `group`/`peer` só existem dentro do
 * seletor de outra classe, e `nokey` é lido pelo React Flow em JS (o foco num
 * elemento com ela não apaga blocos com Delete/Backspace).
 */
const MARKER_CLASSES = new Set(['group', 'peer', 'nokey'])

async function compileAppCss() {
  return compile(readFileSync(indexCssPath, 'utf8'), {
    base: dirname(indexCssPath),
    async loadStylesheet(id, base) {
      const path = id.startsWith('.')
        ? join(base, id)
        : resolveModule(id === 'tailwindcss' ? 'tailwindcss/index.css' : id)
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') }
    },
  })
}

/** Pedaços estáticos de cada literal de string ('…', "…", `…` sem os ${}). */
function stringLiterals(source: string) {
  return [...source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
    (match) => (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' '),
  )
}

/** Mesmo escape de seletor que o Tailwind usa (o de `CSS.escape`). */
function escapeClassName(value: string) {
  let escaped = ''
  for (const [index, char] of [...value].entries()) {
    const code = char.codePointAt(0) ?? 0
    const startsWithDigit = /\d/.test(char) && (index === 0 || (index === 1 && value[0] === '-'))
    if (startsWithDigit) escaped += `\\${code.toString(16)} `
    else if (/[\w-]/.test(char) || code >= 0x80) escaped += char
    else escaped += `\\${char}`
  }
  return escaped
}

function hasSelector(css: string, className: string) {
  const selector = escapeClassName(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\.${selector}(?![\\w\\\\-])`).test(css)
}

describe('classes Tailwind da preparação das CLIs', () => {
  it('toda classe usada nos componentes gera CSS', async () => {
    const compiler = await compileAppCss()
    const files = scannedDirectories.flatMap((folder) =>
      readdirSync(folder)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => join(folder, file)),
    )
    const listsByFile = files.map((path) => ({
      // Caminho relativo a features/, com `/` em qualquer sistema (Windows usa `\\`).
      file: relative(join(directory, '..'), path).split(sep).join('/'),
      lists: stringLiterals(readFileSync(path, 'utf8')).map((literal) =>
        literal.split(/\s+/).filter(Boolean),
      ),
    }))
    const css = compiler.build([...new Set(listsByFile.flatMap(({ lists }) => lists.flat()))])
    const generates = (token: string) => MARKER_CLASSES.has(token) || hasSelector(css, token)

    // Um literal é lista de classes quando ao menos metade dos tokens gera CSS;
    // texto de interface, caminhos de import e chaves não passam desse corte.
    const offenders = listsByFile.flatMap(({ file, lists }) =>
      lists
        .filter((tokens) => tokens.filter(generates).length * 2 >= tokens.length)
        .flatMap((tokens) => tokens.filter((token) => !generates(token)))
        .map((token) => `${file}: ${token}`),
    )

    expect(offenders).toEqual([])
    // A guarda só vale se enxergar as listas de verdade: o botão do aviso e o card do tutorial.
    expect(hasSelector(css, 'bg-(--f-core-white)/90')).toBe(true)
    expect(listsByFile.some(({ file }) => file.includes('onboarding/'))).toBe(true)
    expect(hasSelector(css, 'felixo-onboarding-card')).toBe(true)
  })
})

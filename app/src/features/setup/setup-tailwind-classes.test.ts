import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * O Tailwind 3 do projeto não gera CSS para modificador de opacidade sobre
 * cor arbitrária com `var()` (`bg-[var(--x)]/90`): a classe some sem aviso no
 * build. No aviso de falha das CLIs, isso deixava "Tentar de novo" sem fundo —
 * texto escuro sobre o aviso escuro, praticamente invisível. A forma que o
 * Tailwind entende é `bg-[color-mix(in_srgb,var(--x)_90%,transparent)]`.
 *
 * O padrão ainda aparece em outras telas; esta guarda cobre a pasta do
 * aviso das CLIs, onde o defeito foi visto e corrigido.
 */
const VAR_COLOR_WITH_OPACITY = /[\w:-]+-\[var\(--[\w-]+\)\]\/\d+/g

describe('classes Tailwind da preparação das CLIs', () => {
  it('não usa opacidade sobre cor var(), que compila para nada', () => {
    const directory = fileURLToPath(new URL('.', import.meta.url))
    const offenders = readdirSync(directory)
      .filter((file) => file.endsWith('.tsx'))
      .flatMap((file) =>
        (readFileSync(join(directory, file), 'utf8').match(VAR_COLOR_WITH_OPACITY) ?? []).map(
          (className) => `${file}: ${className}`,
        ),
      )

    expect(offenders).toEqual([])
  })
})

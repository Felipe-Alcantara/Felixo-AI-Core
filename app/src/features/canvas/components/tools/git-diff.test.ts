import { describe, expect, it } from 'vitest'
import { parseDiff } from './git-diff'

const DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -10,4 +10,5 @@ function exemplo() {',
  ' contexto antes',
  '-linha removida',
  '+linha nova A',
  '+linha nova B',
  ' contexto depois',
].join('\n')

describe('parseDiff', () => {
  it('numera cada lado conforme o tipo da linha', () => {
    const linhas = parseDiff(DIFF)
    const conteudo = linhas.filter((linha) => linha.kind !== 'meta' && linha.kind !== 'hunk')

    expect(conteudo.map((linha) => [linha.kind, linha.oldNumber, linha.newNumber])).toEqual([
      // O trecho começa na linha 10 dos dois lados.
      ['context', 10, 10],
      // Removida só existe no lado antigo.
      ['removed', 11, null],
      // Adicionadas só no lado novo, e seguem da 11 porque a removida não
      // ocupa posição lá.
      ['added', null, 11],
      ['added', null, 12],
      // O contexto seguinte já reflete o descompasso entre os dois lados.
      ['context', 12, 13],
    ])
  })

  it('classifica cabeçalhos como metadado, sem numerá-los', () => {
    const linhas = parseDiff(DIFF)
    const meta = linhas.filter((linha) => linha.kind === 'meta')

    expect(meta).toHaveLength(4)
    expect(meta.every((linha) => linha.oldNumber === null && linha.newNumber === null)).toBe(true)
    expect(linhas.filter((linha) => linha.kind === 'hunk')).toHaveLength(1)
  })

  it('remove o marcador da coluna e preserva o conteúdo da linha', () => {
    const linhas = parseDiff(DIFF)
    const adicionadas = linhas.filter((linha) => linha.kind === 'added')

    expect(adicionadas.map((linha) => linha.text)).toEqual(['linha nova A', 'linha nova B'])
  })

  it('lê um segundo trecho a partir do próprio cabeçalho', () => {
    const comDoisTrechos = [
      '@@ -1,2 +1,2 @@',
      '-um',
      '+dois',
      '@@ -50,1 +50,2 @@',
      ' cinquenta',
      '+cinquenta e um',
    ].join('\n')

    const linhas = parseDiff(comDoisTrechos)
    const ultima = linhas[linhas.length - 1]

    // Sem reler o cabeçalho a numeração continuaria de 2, e não de 50.
    expect(ultima).toMatchObject({ kind: 'added', newNumber: 51 })
  })

  it('trata o aviso de arquivo sem quebra final como metadado', () => {
    const linhas = parseDiff(['@@ -1 +1 @@', '-a', '+b', '\\ No newline at end of file'].join('\n'))

    expect(linhas[linhas.length - 1].kind).toBe('meta')
  })

  it('devolve lista vazia quando não há diff', () => {
    expect(parseDiff(null)).toEqual([])
    expect(parseDiff('')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { isMarkdownFileName, resolvePreviewKind } from './file-node-preview'

describe('resolvePreviewKind', () => {
  it('formata markdown nos arquivos em que isso significa alguma coisa', () => {
    expect(resolvePreviewKind('notas.md')).toBe('markdown')
    expect(resolvePreviewKind('LEIAME.markdown')).toBe('markdown')
    expect(resolvePreviewKind('doc.mdx')).toBe('markdown')
  })

  it('mostra texto puro em código e configuração', () => {
    // Formatar markdown num .py comeria a indentação, que ali é o programa.
    expect(resolvePreviewKind('script.py')).toBe('plain')
    expect(resolvePreviewKind('config.json')).toBe('plain')
    expect(resolvePreviewKind('anotacao.txt')).toBe('plain')
    expect(resolvePreviewKind('README')).toBe('plain')
  })

  it('trata arquivo sem nome ou indefinido como texto puro', () => {
    expect(resolvePreviewKind(undefined)).toBe('plain')
    expect(resolvePreviewKind('')).toBe('plain')
  })
})

describe('isMarkdownFileName', () => {
  it('ignora a caixa da extensão', () => {
    expect(isMarkdownFileName('NOTAS.MD')).toBe(true)
    expect(isMarkdownFileName('Leiame.Md')).toBe(true)
  })

  it('aceita caminho completo, não só o nome', () => {
    expect(isMarkdownFileName('/home/user/projeto/README.md')).toBe(true)
    expect(isMarkdownFileName('C:\\projetos\\notas.md')).toBe(true)
  })

  it('olha só o último segmento, para uma pasta não decidir pelo arquivo', () => {
    expect(isMarkdownFileName('/home/user/docs.md/notas.txt')).toBe(false)
    expect(isMarkdownFileName('C:\\docs.md\\script.py')).toBe(false)
  })

  it('não confunde arquivo oculto sem extensão com markdown', () => {
    expect(isMarkdownFileName('.md')).toBe(false)
    expect(isMarkdownFileName('.gitignore')).toBe(false)
  })

  it('exige a extensão inteira, não um sufixo parecido', () => {
    expect(isMarkdownFileName('notas.mdo')).toBe(false)
    expect(isMarkdownFileName('arquivo.amd')).toBe(false)
    expect(isMarkdownFileName('mdfile')).toBe(false)
  })
})

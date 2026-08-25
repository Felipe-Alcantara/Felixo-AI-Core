import { describe, expect, it, vi } from 'vitest'
import {
  buildDroppedFileReference,
  formatDroppedFileReferences,
  resolveDroppedFilePaths,
} from './terminal-dropped-files'

function file(name: string): File {
  return { name } as File
}

describe('arquivos arrastados para o terminal', () => {
  it('resolve arquivos comuns e diretórios pela ponte sem ler conteúdo', () => {
    const resolver = vi.fn((item: File) => `/home/felipe/${item.name}`)

    expect(resolveDroppedFilePaths([file('foto.png'), file('projeto')], resolver)).toEqual({
      paths: ['/home/felipe/foto.png', '/home/felipe/projeto'],
      missingCount: 0,
    })
    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('deduplica caminhos e conta entradas sem caminho', () => {
    const result = buildDroppedFileReference(
      [file('a.txt'), file('a-cópia.txt'), file('sem-path')],
      (item) => (item.name === 'sem-path' ? '' : '/tmp/área/a.txt'),
    )

    expect(result.paths).toEqual(['/tmp/área/a.txt'])
    expect(result.missingCount).toBe(1)
    expect(result.text).toContain('- "/tmp/área/a.txt"')
    expect(result.text).toContain('1 arquivo(s) sem caminho disponível')
  })

  it('preserva espaços, aspas, barras e Unicode na referência textual', () => {
    const text = formatDroppedFileReferences(['/tmp/pasta com "aspas"/ação.txt'])

    expect(text).toBe('\n\nArquivos arrastados:\n- "/tmp/pasta com \\"aspas\\"/ação.txt"\n')
    expect(text).not.toContain('\r')
  })

  it('não cria texto nem efeito para uma lista vazia', () => {
    expect(formatDroppedFileReferences([])).toBe('')
  })
})

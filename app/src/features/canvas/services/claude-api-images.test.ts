import { describe, expect, it } from 'vitest'
import {
  CLAUDE_API_IMAGE_LIMITS,
  acceptAttachmentCount,
  encodingFor,
  imageFilesFromTransfer,
  needsReencode,
  scaledSize,
} from './claude-api-images'

function fakeFile(name: string, type: string) {
  return { name, type } as File
}

describe('imagens coladas no bloco do Claude por chave', () => {
  it('pega só os arquivos de imagem da área de transferência', () => {
    const png = fakeFile('a.png', 'image/png')
    const texto = fakeFile('b.txt', 'text/plain')
    const transfer = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => png },
        { kind: 'file', type: 'text/plain', getAsFile: () => texto },
      ],
      files: [],
    } as unknown as DataTransfer
    expect(imageFilesFromTransfer(transfer)).toEqual([png])
    // Sem items (soltar arquivo em alguns casos), cai na lista de arquivos.
    const bmp = fakeFile('c.bmp', 'image/bmp')
    expect(imageFilesFromTransfer({ items: [], files: [bmp, texto] } as unknown as DataTransfer)).toEqual([bmp])
    expect(imageFilesFromTransfer(null)).toEqual([])
  })

  it('limita a quantidade por mensagem e explica o que ficou de fora', () => {
    const max = CLAUDE_API_IMAGE_LIMITS.maxImagesPerMessage
    expect(acceptAttachmentCount(0, 3)).toEqual({ accept: 3, message: null })
    expect(acceptAttachmentCount(max - 1, 3)).toEqual({ accept: 1, message: `Até ${max} imagens por mensagem: 2 ficaram de fora.` })
    expect(acceptAttachmentCount(max, 1)).toEqual({ accept: 0, message: `Até ${max} imagens por mensagem: 1 ficou de fora.` })
  })

  it('só recodifica o que a API não aceita como está', () => {
    expect(needsReencode('image/png', 1000, 1920, 1080)).toBe(false)
    expect(needsReencode('image/bmp', 1000, 100, 100)).toBe(true)
    expect(needsReencode('image/png', CLAUDE_API_IMAGE_LIMITS.maxBase64Chars + 4, 100, 100)).toBe(true)
    expect(needsReencode('image/jpeg', 1000, CLAUDE_API_IMAGE_LIMITS.maxDimension + 1, 100)).toBe(true)
    // JPEG continua JPEG; o resto vira PNG, que não perde nitidez em texto.
    expect(encodingFor('image/jpeg')).toEqual({ mediaType: 'image/jpeg', quality: 0.9 })
    expect(encodingFor('image/bmp')).toEqual({ mediaType: 'image/png' })
    expect(encodingFor('image/webp')).toEqual({ mediaType: 'image/png' })
  })

  it('reduz mantendo a proporção e respeitando o lado máximo', () => {
    expect(scaledSize(16000, 9000, 8000, 1)).toEqual({ width: 8000, height: 4500 })
    expect(scaledSize(1920, 1080, 8000, 0.5)).toEqual({ width: 960, height: 540 })
    expect(scaledSize(3, 1, 8000, 0.1)).toEqual({ width: 1, height: 1 })
  })
})

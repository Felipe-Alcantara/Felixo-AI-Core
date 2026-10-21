/**
 * Imagens coladas (ou soltas) no campo do bloco do Claude por chave de API.
 *
 * O bloco manda a imagem dentro da mensagem, em base64, como a API da
 * Anthropic recebe; o processo principal confere de novo antes de escrever no
 * Claude Code (`electron/services/claude-api/claude-api-images.cjs`). Os
 * limites vêm do mesmo JSON nos dois lados.
 *
 * O que dá para mandar como está vai como está, sem perder nitidez. Só passa
 * pelo canvas o que a API recusaria: formato fora da lista (BMP, AVIF, SVG...),
 * lado maior que o máximo ou arquivo acima de 5 MB. Aí a imagem é reduzida até
 * caber.
 */

import limits from '../../../../electron/services/claude-api/claude-api-image-limits.json'
import type { ClaudeApiImageType } from '../../shared/types/claude-api'

export const CLAUDE_API_IMAGE_LIMITS = limits as {
  types: ClaudeApiImageType[]
  maxImagesPerMessage: number
  maxBase64Chars: number
  maxDimension: number
}

/** Imagem pronta no campo: o que vai para a API e a miniatura que fica no bloco. */
export type ClaudeApiAttachment = {
  id: string
  name: string
  mediaType: ClaudeApiImageType
  /** Bytes em base64, sem o prefixo `data:`. */
  data: string
  /** Miniatura pequena (data URL JPEG), guardada na conversa do bloco. */
  thumb: string
  width: number
  height: number
}

const THUMB_MAX_SIDE = 160
const MAX_SHRINK_STEPS = 8

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)
}

/** Arquivos de imagem de um colar ou de um soltar; texto e outros arquivos ficam de fora. */
export function imageFilesFromTransfer(transfer: Pick<DataTransfer, 'items' | 'files'> | null): File[] {
  if (!transfer) return []
  const fromItems = Array.from(transfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file) && isImageFile(file as File))
  if (fromItems.length > 0) return fromItems
  return Array.from(transfer.files ?? []).filter(isImageFile)
}

/** Quantas cabem na mensagem, e o aviso do que ficou de fora. */
export function acceptAttachmentCount(current: number, incoming: number): { accept: number; message: string | null } {
  const max = CLAUDE_API_IMAGE_LIMITS.maxImagesPerMessage
  const accept = Math.max(0, Math.min(incoming, max - current))
  const left = incoming - accept
  if (left === 0) return { accept, message: null }
  return { accept, message: `Até ${max} imagens por mensagem: ${left} ${left === 1 ? 'ficou' : 'ficaram'} de fora.` }
}

export function needsReencode(sourceType: string, base64Chars: number, width: number, height: number): boolean {
  return (
    !(CLAUDE_API_IMAGE_LIMITS.types as string[]).includes(sourceType) ||
    base64Chars > CLAUDE_API_IMAGE_LIMITS.maxBase64Chars ||
    Math.max(width, height) > CLAUDE_API_IMAGE_LIMITS.maxDimension
  )
}

/** Formato de saída quando é preciso recodificar: JPEG continua JPEG; o resto vira PNG, sem perda em texto. */
export function encodingFor(sourceType: string): { mediaType: ClaudeApiImageType; quality?: number } {
  return sourceType === 'image/jpeg' ? { mediaType: 'image/jpeg', quality: 0.9 } : { mediaType: 'image/png' }
}

export function scaledSize(width: number, height: number, maxDimension: number, factor: number) {
  const fit = Math.min(1, maxDimension / Math.max(width, height)) * factor
  return { width: Math.max(1, Math.round(width * fit)), height: Math.max(1, Math.round(height * fit)) }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('leitura falhou'))
    reader.readAsDataURL(file)
  })
}

function base64Of(dataUrl: string) {
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

type DecodedImage = { source: CanvasImageSource; width: number; height: number; close: () => void }

/**
 * Abre a imagem para desenhar. `createImageBitmap` é o caminho rápido, mas o
 * Chromium não abre SVG por ele (medido no app: "placa.svg" falhava); o
 * `<img>` abre SVG e o resto que o navegador conhece.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const width = image.naturalWidth
      const height = image.naturalHeight
      if (!width || !height) throw new Error('sem tamanho')
      return { source: image, width, height, close: () => URL.revokeObjectURL(url) }
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
  }
}

function draw(bitmap: CanvasImageSource, width: number, height: number, background?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas indisponível')
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
  }
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function attachmentId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

/**
 * Lê o arquivo e devolve a imagem pronta para a API. Falha com mensagem para a
 * pessoa quando o arquivo não é uma imagem que o navegador consegue abrir.
 */
export async function prepareClaudeApiAttachment(file: File): Promise<ClaudeApiAttachment> {
  let decoded: DecodedImage
  try {
    decoded = await decodeImage(file)
  } catch {
    throw new Error(`Não foi possível abrir "${file.name || 'a imagem'}" como imagem.`)
  }
  const bitmap = decoded.source
  try {
    const { width, height } = decoded
    let mediaType = file.type as ClaudeApiImageType
    let data = base64Of(await readAsDataUrl(file))
    if (needsReencode(file.type, data.length, width, height)) {
      const target = encodingFor(file.type)
      mediaType = target.mediaType
      let factor = 1
      for (let step = 0; ; step += 1) {
        const size = scaledSize(width, height, CLAUDE_API_IMAGE_LIMITS.maxDimension, factor)
        // JPEG não tem transparência: fundo branco em vez de preto.
        const canvas = draw(bitmap, size.width, size.height, mediaType === 'image/jpeg' ? '#ffffff' : undefined)
        data = base64Of(canvas.toDataURL(mediaType, target.quality))
        if (data.length <= CLAUDE_API_IMAGE_LIMITS.maxBase64Chars) break
        if (step >= MAX_SHRINK_STEPS) throw new Error(`"${file.name || 'A imagem'}" é grande demais, mesmo reduzida.`)
        factor *= 0.75
      }
    }
    const thumbSize = scaledSize(width, height, THUMB_MAX_SIDE, 1)
    const thumb = draw(bitmap, thumbSize.width, thumbSize.height, '#ffffff').toDataURL('image/jpeg', 0.72)
    return { id: attachmentId(), name: file.name || 'imagem colada', mediaType, data, thumb, width, height }
  } finally {
    decoded.close()
  }
}

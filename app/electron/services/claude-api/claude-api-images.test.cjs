'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CLAUDE_API_IMAGE_LIMITS,
  buildClaudeApiUserContent,
  normalizeClaudeApiImages,
} = require('./claude-api-images.cjs')

// Só o começo de cada formato importa para a assinatura.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString('base64')
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64')
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1').toString('base64')
const WEBP = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1').toString('base64')

test('aceita PNG, JPEG, GIF e WebP com os bytes do tipo declarado', () => {
  const result = normalizeClaudeApiImages([
    { mediaType: 'image/png', data: PNG },
    { mediaType: 'image/jpeg', data: JPEG },
    { mediaType: 'image/gif', data: GIF },
    { mediaType: 'image/webp', data: WEBP, extra: 'ignorado' },
  ])
  assert.equal(result.ok, true)
  assert.deepEqual(result.images.map((image) => image.mediaType), ['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
  assert.deepEqual(Object.keys(result.images[3]), ['mediaType', 'data'])
})

test('sem imagens é lista vazia, não erro', () => {
  assert.deepEqual(normalizeClaudeApiImages(undefined), { ok: true, images: [] })
  assert.deepEqual(normalizeClaudeApiImages([]), { ok: true, images: [] })
})

test('recusa tipo fora da lista, bytes que não batem com o tipo e base64 inválido', () => {
  assert.equal(normalizeClaudeApiImages([{ mediaType: 'image/svg+xml', data: PNG }]).ok, false)
  const trocado = normalizeClaudeApiImages([{ mediaType: 'image/jpeg', data: PNG }])
  assert.equal(trocado.ok, false)
  assert.match(trocado.message, /não é uma imagem JPEG/)
  assert.equal(normalizeClaudeApiImages([{ mediaType: 'image/png', data: 'não é base64!' }]).ok, false)
  assert.equal(normalizeClaudeApiImages([{ mediaType: 'image/png' }]).ok, false)
  assert.equal(normalizeClaudeApiImages('x').ok, false)
})

test('recusa imagens demais e imagem acima do limite da API', () => {
  const muitas = Array.from({ length: CLAUDE_API_IMAGE_LIMITS.maxImagesPerMessage + 1 }, () => ({ mediaType: 'image/png', data: PNG }))
  assert.match(normalizeClaudeApiImages(muitas).message, /no máximo 10 imagens/)
  const grande = PNG + 'A'.repeat(CLAUDE_API_IMAGE_LIMITS.maxBase64Chars)
  assert.match(normalizeClaudeApiImages([{ mediaType: 'image/png', data: grande.slice(0, grande.length - (grande.length % 4)) }]).message, /5 MB/)
})

test('mensagem: só texto continua string; com imagem vira blocos, imagens antes do texto', () => {
  assert.equal(buildClaudeApiUserContent('oi', []), 'oi')
  assert.deepEqual(buildClaudeApiUserContent('o que é isto?', [{ mediaType: 'image/png', data: PNG }]), [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
    { type: 'text', text: 'o que é isto?' },
  ])
  // Só imagem, sem texto: nenhum bloco de texto vazio.
  assert.deepEqual(buildClaudeApiUserContent('  ', [{ mediaType: 'image/png', data: PNG }]), [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
  ])
})

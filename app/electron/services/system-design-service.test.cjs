const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseMarkdownTitleAndSummary,
} = require('./system-design-service.cjs')

test('parseMarkdownTitleAndSummary extracts h1 and first paragraph', () => {
  const content = '# Backend Design\n\nPrincipios e padroes para apps backend Felixo.\n\n## Outra seção'
  const result = parseMarkdownTitleAndSummary(content, 'fallback.md')
  assert.equal(result.title, 'Backend Design')
  assert.match(result.summary, /Principios e padroes/)
})

test('parseMarkdownTitleAndSummary uses fallback path when no h1', () => {
  const content = 'Apenas texto sem titulo.\nLinha 2.'
  const result = parseMarkdownTitleAndSummary(content, 'docs/sem-titulo.md')
  assert.equal(result.title, 'docs/sem-titulo.md')
  assert.equal(result.summary, '')
})

test('parseMarkdownTitleAndSummary truncates long summaries', () => {
  const longLine = 'a'.repeat(500)
  const content = `# Titulo\n\n${longLine}`
  const result = parseMarkdownTitleAndSummary(content, 'x.md')
  assert.ok(result.summary.length <= 241)
  assert.ok(result.summary.endsWith('…'))
})

import { describe, expect, it } from 'vitest'
import { normalizeUrlInput } from './url-utils'

describe('normalizeUrlInput', () => {
  it('prefixa https:// em endereço digitado sem protocolo', () => {
    // O caso mais comum do bloco de Página Web: a pessoa digita como
    // digitaria numa barra de endereços de navegador.
    expect(normalizeUrlInput('google.com')).toBe('https://google.com/')
    expect(normalizeUrlInput('www.exemplo.com.br')).toBe('https://www.exemplo.com.br/')
  })

  it('preserva o protocolo quando já informado, inclusive http', () => {
    expect(normalizeUrlInput('https://exemplo.com/')).toBe('https://exemplo.com/')
    // http é permitido de propósito — o bloco não restringe a https.
    expect(normalizeUrlInput('http://localhost:3000/')).toBe('http://localhost:3000/')
  })

  it('reconhece o protocolo sem diferenciar maiúsculas', () => {
    expect(normalizeUrlInput('HTTPS://Exemplo.com')).toBe('https://exemplo.com/')
    expect(normalizeUrlInput('HtTp://exemplo.com')).toBe('http://exemplo.com/')
  })

  it('apara espaços em volta do endereço', () => {
    expect(normalizeUrlInput('   google.com   ')).toBe('https://google.com/')
  })

  it('preserva caminho, query e fragmento', () => {
    expect(normalizeUrlInput('exemplo.com/a/b?c=1#d')).toBe('https://exemplo.com/a/b?c=1#d')
  })

  it('devolve undefined para entrada vazia', () => {
    expect(normalizeUrlInput('')).toBeUndefined()
    expect(normalizeUrlInput('    ')).toBeUndefined()
  })

  it('rejeita protocolos que não sejam http(s)', () => {
    // javascript: e data: seriam vetores de execução dentro do webview;
    // file: daria acesso ao disco local a partir de um endereço digitado.
    expect(normalizeUrlInput('javascript:alert(1)')).toBeUndefined()
    expect(normalizeUrlInput('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(normalizeUrlInput('file:///etc/passwd')).toBeUndefined()
  })

  it('trata host:porta como endereço, não como esquema', () => {
    // Regressão: uma checagem de esquema genérica (`^[a-z]+:`) leria
    // "localhost" como esquema e rejeitaria o endereço de um servidor local,
    // que é justamente o que se abre num bloco de Página Web durante o dev.
    expect(normalizeUrlInput('localhost:3000')).toBe('https://localhost:3000/')
    expect(normalizeUrlInput('exemplo.com:8080/painel')).toBe(
      'https://exemplo.com:8080/painel',
    )
    expect(normalizeUrlInput('127.0.0.1:5173')).toBe('https://127.0.0.1:5173/')
  })

  it('rejeita texto que não forma uma URL válida', () => {
    expect(normalizeUrlInput('http://')).toBeUndefined()
  })
})

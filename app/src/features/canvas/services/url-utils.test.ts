import { describe, expect, it } from 'vitest'
import {
  classifyExternalUrl,
  EXTERNAL_WEB_SCHEMES,
  MAX_EXTERNAL_URL_CHARS,
} from '../../shared/external-url-policy'
import { normalizeUrlInput, persistableNavigationUrl } from './url-utils'

// Montados por código, e não digitados no fonte, para o teste não depender de
// um caractere invisível sobreviver a editor, diff e revisão.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const TAB = String.fromCharCode(9)

describe('normalizeUrlInput', () => {
  it('prefixa https:// em endereço digitado sem protocolo', () => {
    // O caso mais comum do bloco de Página Web: a pessoa digita como
    // digitaria numa barra de endereços de navegador.
    expect(normalizeUrlInput('google.com')).toBe('https://google.com/')
    expect(normalizeUrlInput('example.com')).toBe('https://example.com/')
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

  it('trata host:porta como endereço e usa http no loopback local', () => {
    // Servidores de desenvolvimento locais normalmente não oferecem TLS.
    // Sem o protocolo explícito, o bloco deve abrir a porta HTTP em vez de
    // tentar um handshake HTTPS contra ela.
    expect(normalizeUrlInput('localhost:3000')).toBe('http://localhost:3000/')
    expect(normalizeUrlInput('exemplo.com:8080/painel')).toBe(
      'https://exemplo.com:8080/painel',
    )
    expect(normalizeUrlInput('127.0.0.1:5173')).toBe('http://127.0.0.1:5173/')
    expect(normalizeUrlInput('[::1]:5173')).toBe('http://[::1]:5173/')
  })

  it('preserva https explícito mesmo em host local', () => {
    expect(normalizeUrlInput('https://localhost:3000/')).toBe('https://localhost:3000/')
  })

  it('rejeita texto que não forma uma URL válida', () => {
    expect(normalizeUrlInput('http://')).toBeUndefined()
  })

  it('rejeita usuário e senha no endereço, com ou sem protocolo', () => {
    // A barra aceitava e o bloco gravava; o processo principal recusa o mesmo
    // `src` no attach do webview, e o bloco reabria em branco no remount.
    expect(normalizeUrlInput('https://usuario:senha@example.com/')).toBeUndefined()
    expect(normalizeUrlInput('usuario:senha@example.com')).toBeUndefined()
    expect(normalizeUrlInput('usuario:senha@localhost:3000')).toBeUndefined()
    // O disfarce clássico: diz "google.com" e abre evil.example.
    expect(normalizeUrlInput('https://google.com@evil.example/')).toBeUndefined()
  })

  it('rejeita espaço no meio do endereço em vez de codificá-lo', () => {
    // Antes o parser transformava o espaço em `%20` e a barra aceitava
    // `https://example.com/a%20b`. Agora a barra segue a política única de
    // URL, que recusa espaço interno (quem lê e quem abre discordam de onde a
    // URL termina) — a mesma decisão que o processo principal toma.
    expect(normalizeUrlInput('https://example.com/a b')).toBeUndefined()
    expect(normalizeUrlInput('example.com/a b')).toBeUndefined()
    expect(normalizeUrlInput(`example.com/a${TAB}b`)).toBeUndefined()
  })

  it('rejeita caractere invisível no host', () => {
    // O IDNA descarta o U+200B e abriria `example.com`, não o que foi lido.
    expect(normalizeUrlInput(`exam${ZERO_WIDTH_SPACE}ple.com`)).toBeUndefined()
  })

  it('rejeita endereço acima do limite da política', () => {
    const prefix = 'https://example.com/#'
    const atLimit = `${prefix}${'a'.repeat(MAX_EXTERNAL_URL_CHARS - prefix.length)}`
    expect(normalizeUrlInput(atLimit)).toBe(atLimit)
    expect(normalizeUrlInput(`${atLimit}a`)).toBeUndefined()
  })

  it('rejeita esquemas sem barra dupla, que o protocolo implícito não salva', () => {
    expect(normalizeUrlInput('about:blank')).toBeUndefined()
    expect(normalizeUrlInput('mailto:alguem@example.com')).toBeUndefined()
  })

  it('só devolve endereço que a política aceita como página web', () => {
    // O contrato que impede a regressão: o que a barra aceita o processo
    // principal também aceita como `src`, então o bloco nunca grava um
    // endereço que não reabre.
    const inputs = [
      'google.com',
      'localhost:3000',
      '[::1]:5173',
      'HTTPS://Exemplo.com',
      'exemplo.com/a/b?c=1#d',
      'münchen.de',
      'https://example.com/a b',
      'usuario:senha@example.com',
      'file:///etc/passwd',
    ]
    for (const input of inputs) {
      const normalized = normalizeUrlInput(input)
      if (normalized === undefined) continue
      expect(classifyExternalUrl(normalized, EXTERNAL_WEB_SCHEMES)).toEqual({
        ok: true,
        url: normalized,
        scheme: new URL(normalized).protocol,
      })
    }
  })
})

describe('persistableNavigationUrl', () => {
  it('grava a página web em que o webview caiu, na serialização da política', () => {
    expect(persistableNavigationUrl('https://example.com/artigo?x=1#topo')).toBe(
      'https://example.com/artigo?x=1#topo',
    )
    expect(persistableNavigationUrl('HTTPS://Example.com')).toBe('https://example.com/')
    expect(persistableNavigationUrl('http://localhost:5173/')).toBe('http://localhost:5173/')
  })

  it('não grava fragmento que passa do limite', () => {
    // O achado: um SPA com estado no hash passava de 8192 caracteres, o bloco
    // gravava, e o processo principal recusava esse `src` no remount.
    const longHash = `https://example.com/app#${'a'.repeat(MAX_EXTERNAL_URL_CHARS)}`
    expect(persistableNavigationUrl(longHash)).toBeUndefined()
  })

  it('não troca a URL salva pelo about:blank de um popup', () => {
    expect(persistableNavigationUrl('about:blank')).toBeUndefined()
  })

  it('não grava endereço com credenciais nem fora da web', () => {
    expect(persistableNavigationUrl('https://usuario:senha@example.com/')).toBeUndefined()
    expect(persistableNavigationUrl('file:///C:/Windows/win.ini')).toBeUndefined()
    expect(persistableNavigationUrl('chrome-error://chromewebdata/')).toBeUndefined()
  })

  it('não grava nada quando o webview não informa endereço', () => {
    expect(persistableNavigationUrl('')).toBeUndefined()
    expect(persistableNavigationUrl(undefined)).toBeUndefined()
  })
})

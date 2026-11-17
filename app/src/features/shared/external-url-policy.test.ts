import { describe, expect, it } from 'vitest'
import cases from '../../../electron/services/external-url-policy.cases.json'
// O mesmo módulo que o processo principal carrega antes do shell.openExternal.
// @ts-expect-error CommonJS runtime module has no generated TypeScript types.
import * as mainPolicyModule from '../../../electron/services/external-url-policy.cjs'
import * as rendererPolicy from './external-url-policy'
import {
  EXTERNAL_OPENER_SCHEMES,
  EXTERNAL_WEB_SCHEMES,
  classifyExternalUrl,
  decodePunycode,
  hasInvalidPunycodeLabel,
  describeExternalUrlForLog,
  hasHiddenUrlCharacters,
  revealHiddenUrlCharacters,
} from './external-url-policy'

// Mesma superfície pública; o diferencial abaixo prova que o conteúdo também é.
const mainPolicy = mainPolicyModule as typeof rendererPolicy

/**
 * A tabela é a mesma que `external-url-policy.test.cjs` roda no processo
 * principal; o diferencial abaixo prova que as duas implementações dizem a
 * mesma coisa também fora dela.
 */
describe('política de URL externa: tabela compartilhada', () => {
  it.each(cases.casos.map((caso) => [JSON.stringify(caso.entrada), caso] as const))(
    '%s',
    (_label, caso) => {
      const schemes = caso.esquemas === 'web' ? EXTERNAL_WEB_SCHEMES : EXTERNAL_OPENER_SCHEMES
      const decision = classifyExternalUrl(caso.entrada, schemes)

      if (caso.esperado === 'ok') {
        expect(decision).toEqual({ ok: true, url: caso.url, scheme: new URL(caso.url!).protocol })
      } else {
        expect(decision).toMatchObject({ ok: false, reason: caso.esperado })
      }
    },
  )
})

// Pedaços que, combinados, cobrem o que a task pede: esquemas perigosos e
// disfarçados, separadores, CR/LF e controles, invisíveis, espaços Unicode,
// entidades, userinfo, barra invertida, IPs e IDN.
const FRAGMENTS = [
  'https:', 'http:', 'mailto:', 'javascript:', 'JaVaScRiPt:', 'data:', 'blob:', 'file:', 'vscode:',
  'ms-msdt:', 'about:', 'c:', '//', '\\\\', '/', '@', ':', '?', '#', '&#106;', '&colon;', '%0a',
  '%2F', 'example.com', 'evil.example', 'pessoa:senha', 'google.com', '127.0.0.1', '0x7f.1',
  '[::1]', 'xn--xample-2of.com', '\u0435xample.com', 'café', 'SEGREDO', 'a', '1', '.',
  ' ', '\t', '\n', '\r', '\u0000', '\u001b', '\u007f', '\u0085', '\u00A0', '\u00AD', '\u200B',
  '\u202E', '\u2028', '\u3000', '\uFEFF', '：',
]

function seededRandom(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomUrlLike(random: () => number): string {
  const pieces = 1 + Math.floor(random() * 7)
  let value = ''
  for (let index = 0; index < pieces; index += 1) {
    value += FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]
  }
  return value
}

const SAMPLES = 20_000
// 20 mil amostras levam de 6 a 9 s num notebook de 4 threads ocupado (medido
// em 29/09/2026, com o app e um navegador abertos). O padrão de 5 s do Vitest
// reprovava por tempo, não por decisão errada.
const PROPERTY_TIMEOUT_MS = 60_000
const INVISIBLE_OR_CONTROL =
  // eslint-disable-next-line no-control-regex -- o teste procura exatamente os bytes que a política recusa.
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Default_Ignorable_Code_Point}\p{Cf}\s]/u

describe('política de URL externa: propriedades', { timeout: PROPERTY_TIMEOUT_MS }, () => {
  it('renderer e processo principal decidem igual para qualquer entrada', () => {
    const random = seededRandom(0x5eed_0001)
    for (let index = 0; index < SAMPLES; index += 1) {
      const value = randomUrlLike(random)
      for (const schemes of [EXTERNAL_OPENER_SCHEMES, EXTERNAL_WEB_SCHEMES]) {
        expect(mainPolicy.classifyExternalUrl(value, schemes), JSON.stringify(value)).toEqual(
          classifyExternalUrl(value, schemes),
        )
      }
      expect(mainPolicy.describeExternalUrlForLog(value)).toBe(describeExternalUrlForLog(value))
    }
  })

  it('o que passa tem esquema aprovado, destino, nenhum invisível e é ponto fixo', () => {
    const random = seededRandom(0x5eed_0002)
    let allowed = 0
    for (let index = 0; index < SAMPLES; index += 1) {
      const value = randomUrlLike(random)
      const decision = classifyExternalUrl(value)
      if (!decision.ok) continue

      allowed += 1
      const parsed = new URL(decision.url)
      expect(EXTERNAL_OPENER_SCHEMES, JSON.stringify(value)).toContain(parsed.protocol)
      expect(decision.url, JSON.stringify(value)).not.toMatch(INVISIBLE_OR_CONTROL)
      if (parsed.protocol === 'mailto:') expect(parsed.pathname).not.toBe('')
      else expect(parsed.hostname).not.toBe('')
      // Reclassificar o que já saiu não muda nada: o main recebe a URL
      // serializada pelo renderer e precisa chegar à mesma decisão.
      expect(classifyExternalUrl(decision.url)).toEqual(decision)
    }
    // Sem isso o teste passaria vazio se o gerador parasse de produzir URLs válidas.
    expect(allowed).toBeGreaterThan(100)
  })

  it('a descrição para log nunca carrega caminho, query, fragmento ou credenciais', () => {
    const random = seededRandom(0x5eed_0003)
    for (let index = 0; index < SAMPLES; index += 1) {
      const host = random() < 0.5 ? 'example.com' : '127.0.0.1'
      const value = `https://pessoa:SEGREDO@${host}/${randomUrlLike(random)}SEGREDO?t=SEGREDO#SEGREDO`
      expect(describeExternalUrlForLog(value), JSON.stringify(value)).not.toContain('SEGREDO')
    }
  })

  it('o href aprovado nunca passa do limite, mesmo quando a serialização cresce', () => {
    const cjk = 'https://zh.wikipedia.org/w/index.php?search=' + '中'.repeat(1000)
    expect(classifyExternalUrl(cjk)).toEqual({ ok: false, reason: 'longa', scheme: 'https:' })
    expect(mainPolicy.classifyExternalUrl(cjk)).toEqual(classifyExternalUrl(cjk))
  })

  it('nunca lança, qualquer que seja a entrada', () => {
    const random = seededRandom(0x5eed_0004)
    for (let index = 0; index < SAMPLES; index += 1) {
      const value = randomUrlLike(random)
      expect(() => classifyExternalUrl(value)).not.toThrow()
      expect(() => describeExternalUrlForLog(value)).not.toThrow()
    }
  })
})

describe('revealHiddenUrlCharacters', { timeout: PROPERTY_TIMEOUT_MS }, () => {
  it('troca cada invisível ou controle pelo código, e deixa o resto como está', () => {
    const zwsp = String.fromCharCode(0x200b)
    const rlo = String.fromCharCode(0x202e)
    const esc = String.fromCharCode(0x1b)
    expect(revealHiddenUrlCharacters(`https://exa${zwsp}mple.com/${rlo}gpj.exe`)).toBe(
      'https://exa⟨U+200B⟩mple.com/⟨U+202E⟩gpj.exe',
    )
    expect(revealHiddenUrlCharacters(`${esc}[31mx`)).toBe('⟨U+001B⟩[31mx')
    expect(revealHiddenUrlCharacters('https://exemplo.café/ação')).toBe('https://exemplo.café/ação')
  })

  it('invisível fora do plano básico (tag Unicode) também aparece, com o código inteiro', () => {
    const tag = String.fromCodePoint(0xe0041)
    expect(revealHiddenUrlCharacters(`a${tag}b`)).toBe('a⟨U+E0041⟩b')
  })

  it('o resultado nunca tem mais nada escondido', () => {
    const random = seededRandom(0x5eed_0005)
    for (let index = 0; index < SAMPLES; index += 1) {
      const value = randomUrlLike(random)
      expect(hasHiddenUrlCharacters(revealHiddenUrlCharacters(value)), JSON.stringify(value)).toBe(false)
    }
  })
})

describe('decodePunycode', () => {
  it('decodifica rótulos legítimos', () => {
    expect(decodePunycode('xample-2of')).toBe('еxample')
    expect(decodePunycode('e1afmkfd')).toBe('пример')
    expect(decodePunycode('bcher-kva')).toBe('bücher')
  })

  it('devolve null para entrada inválida, sem lançar', () => {
    // vazio de dígitos, delimitador sozinho, caractere fora do alfabeto, não-ASCII no trecho básico
    for (const bad of ['-a', 'a-', 'ab--c', '!', 'a-é', 'a-zzzzzzzzzzzzzzzzzzzz']) {
      expect(() => decodePunycode(bad), bad).not.toThrow()
    }
    expect(decodePunycode('-a')).toBeNull()
    expect(decodePunycode('!')).toBeNull()
    expect(decodePunycode('a-é')).toBeNull()
    // estouro de inteiro
    expect(decodePunycode('zzzzzzzzzzzzzzzzzzzz')).toBeNull()
  })

  it('recusa ponto de código acima de U+10FFFF e surrogate', () => {
    // U+110000 (en32g) é inválido, U+10FFFF (dn32g) é o último válido
    expect(decodePunycode('en32g')).toBeNull()
    expect(decodePunycode('dn32g')).toBe(String.fromCodePoint(0x10ffff))
    // U+D800 (ib9b), gerado com um codificador de referência
    expect(decodePunycode('ib9b')).toBeNull()
  })
})

describe('política de URL externa: rótulos xn--', { timeout: PROPERTY_TIMEOUT_MS }, () => {
  // O Chromium aprova rótulos que o Node recusa; no Node só dá para provar que o
  // renderer nunca aprova o que o main recusa. O inverso pode acontecer em
  // Punycode não canônico (`xn---sor`: o Node aceita, recodificar não devolve o
  // rótulo): o renderer recusa e falha fechado, sem link clicável que o main
  // aceitaria.
  it('rótulos xn-- aleatórios: o renderer nunca aprova o que o main recusa', () => {
    const random = seededRandom(0x5eed_0006)
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789--'
    for (let index = 0; index < SAMPLES; index += 1) {
      let label = 'xn--'
      for (let n = 1 + Math.floor(random() * 10); n > 0; n -= 1) {
        label += alphabet[Math.floor(random() * alphabet.length)]
      }
      const value = `https://${random() < 0.2 ? label.toUpperCase() : label}.com/`
      if (classifyExternalUrl(value).ok) expect(mainPolicy.classifyExternalUrl(value).ok, value).toBe(true)
    }
  })

  it('IDN legítimo, em Unicode ou em punycode, continua aprovado', () => {
    const random = seededRandom(0x5eed_0007)
    const alphabet = ['а', 'б', 'в', 'ü', 'é', 'ñ', '中', '文', 'ж', 'a', 'b', '1', '-']
    let approved = 0
    for (let index = 0; index < 5_000; index += 1) {
      let label = ''
      for (let n = 1 + Math.floor(random() * 8); n > 0; n -= 1) {
        label += alphabet[Math.floor(random() * alphabet.length)]
      }
      for (const host of [label, new URL(`https://${label}/`).hostname]) {
        const value = `https://${host}.example/`
        const decision = classifyExternalUrl(value)
        expect(decision, value).toEqual(mainPolicy.classifyExternalUrl(value))
        if (decision.ok) approved += 1
      }
    }
    expect(approved).toBeGreaterThan(1_000)
  })
})

describe('hasInvalidPunycodeLabel', () => {
  // Chamada direto porque, no Node, `new URL` já recusa estes hosts antes da
  // política; o Chromium os aprova e é ali que esta checagem decide.
  it('recusa os rótulos que o Chromium aprova e o Node recusa', () => {
    for (const host of ['xn--a.com', 'xn--ab--c.com', 'xn---a.com', 'xn--a-ecp.ru', 'www.xn--a.com', 'xn--']) {
      expect(hasInvalidPunycodeLabel(host), host).toBe(true)
    }
  })

  it('aceita IDN legítimo e host sem punycode', () => {
    for (const host of ['xn--xample-2of.com', 'xn--e1afmkfd.xn--p1ai', 'xn--bcher-kva.example', 'example.com', '127.0.0.1']) {
      expect(hasInvalidPunycodeLabel(host), host).toBe(false)
    }
  })
})

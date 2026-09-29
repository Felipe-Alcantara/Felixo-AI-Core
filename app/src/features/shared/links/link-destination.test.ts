import { describe, expect, it, vi } from 'vitest'

import {
  MAX_SHOWN_ADDRESS_CHARS,
  allowedSchemesFor,
  describeLinkDestination,
  describeRefusal,
  linkChoiceEntries,
  runLinkChoice,
  shortenAddress,
  type LinkChoice,
  type LinkOrigin,
} from './link-destination'

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e)

function effects() {
  return { openExternal: vi.fn(), openWebpage: vi.fn(), copy: vi.fn() }
}

describe('describeLinkDestination', () => {
  it('página web aprovada: a forma serializada e o host como título', () => {
    const destination = describeLinkDestination(' HTTPS://Example.com/a?b=1 ', 'terminal')
    expect(destination).toEqual({
      ok: true,
      url: 'https://example.com/a?b=1',
      kind: 'web',
      headline: 'example.com',
    })
  })

  it('domínio com acento aparece em Punycode, a forma que não se confunde', () => {
    const destination = describeLinkDestination('https://exemplo.café/', 'markdown')
    expect(destination.ok && destination.headline).toBe('exemplo.xn--caf-dma')
  })

  it('mailto só vale no Markdown, com o destinatário como título', () => {
    const markdown = describeLinkDestination('mailto:fulana@example.com?subject=Oi', 'markdown')
    expect(markdown).toMatchObject({ ok: true, kind: 'email', headline: 'fulana@example.com' })

    for (const origin of ['terminal', 'pagina-web'] as const) {
      const refused = describeLinkDestination('mailto:fulana@example.com', origin)
      expect(refused).toMatchObject({
        ok: false,
        reason: 'endereços mailto: não abrem pelo app, só http e https',
      })
    }
  })

  it('recusado: motivo legível, o texto com o disfarce à mostra e o texto cru para copiar', () => {
    const raw = `https://exa${ZERO_WIDTH_SPACE}mple.com/`
    const destination = describeLinkDestination(` ${raw} `, 'terminal')
    expect(destination).toEqual({
      ok: false,
      reason: 'o endereço tem caracteres invisíveis, que podem disfarçar o destino',
      shownText: 'https://exa⟨U+200B⟩mple.com/',
      copyText: raw,
    })
  })

  it('invisível codificado no destinatário de um mailto fica à mostra no título', () => {
    const destination = describeLinkDestination('mailto:ful%E2%80%8Bana@example.com', 'markdown')
    expect(destination.ok && destination.headline).toBe('ful⟨U+200B⟩ana@example.com')
  })

  it('host gigante (a política aprova até 8.192) vira um título curto que termina no domínio', () => {
    const destination = describeLinkDestination(`https://${'a'.repeat(8100)}.example/`, 'terminal')
    expect(destination.ok && Array.from(destination.headline).length).toBe(MAX_SHOWN_ADDRESS_CHARS)
    expect(destination.ok && destination.headline.endsWith('aaa.example')).toBe(true)
  })

  it('mailto com 300 destinatários também não estica o título', () => {
    const recipients = Array.from({ length: 300 }, (_, index) => `pessoa${index}@example.com`)
    const destination = describeLinkDestination(`mailto:${recipients.join(',')}`, 'markdown')
    expect(destination.ok && Array.from(destination.headline).length).toBe(MAX_SHOWN_ADDRESS_CHARS)
    // O primeiro e o último destinatário continuam à vista.
    expect(destination.ok && destination.headline.startsWith('pessoa0@example.com,')).toBe(true)
    expect(destination.ok && destination.headline.endsWith(',pessoa299@example.com')).toBe(true)
  })

  it.each<[LinkOrigin, readonly string[]]>([
    ['terminal', ['http:', 'https:']],
    ['pagina-web', ['http:', 'https:']],
    ['markdown', ['http:', 'https:', 'mailto:']],
  ])('esquemas aceitos por origem: %s', (origin, schemes) => {
    expect(allowedSchemesFor(origin)).toEqual(schemes)
  })
})

describe('shortenAddress', () => {
  it('endereço até o limite aparece inteiro', () => {
    const host = `${'a'.repeat(MAX_SHOWN_ADDRESS_CHARS - 8)}.example`
    expect(shortenAddress(host)).toBe(host)
  })

  it('corta pelo meio e guarda o fim, que diz de quem é o site', () => {
    // Cortar o fim deixaria à vista só o disfarce: "paypal.com.xxxx…".
    const host = `paypal.com.${'x'.repeat(300)}.evil.example`
    const shown = shortenAddress(host)
    expect(Array.from(shown)).toHaveLength(MAX_SHOWN_ADDRESS_CHARS)
    expect(shown.startsWith('paypal.com.x')).toBe(true)
    expect(shown.endsWith('x.evil.example')).toBe(true)
    expect(shown).toContain('…')
  })

  it('conta caracteres, não metades de um emoji', () => {
    const shown = shortenAddress('😀'.repeat(50), 10)
    expect(Array.from(shown)).toEqual([...'😀'.repeat(3), '…', ...'😀'.repeat(6)])
  })
})

describe('describeRefusal', () => {
  const web = ['http:', 'https:']

  it.each([
    ['vazia', 'o endereço está vazio'],
    ['longa', 'o endereço passa de 8.192 caracteres'],
    ['controle', 'o endereço tem caracteres de controle, que mudam o que se lê'],
    ['espaco', 'o endereço tem espaço no meio'],
    ['sem-esquema', 'falta o começo do endereço (como https://)'],
    ['malformada', 'o endereço está malformado'],
    ['sem-destino', 'o endereço não diz para onde vai'],
    ['parametro', 'o link de e-mail traz um campo que o app não repassa, como anexo'],
    ['credenciais', 'o endereço traz usuário ou senha, que podem disfarçar o destino'],
  ] as const)('%s', (reason, text) => {
    expect(describeRefusal(reason, undefined, web)).toBe(text)
  })

  it('esquema: diz qual veio e quais o app abre', () => {
    expect(describeRefusal('esquema', 'file:', web)).toBe(
      'endereços file: não abrem pelo app, só http e https',
    )
    expect(describeRefusal('esquema', 'javascript:', ['http:', 'https:', 'mailto:'])).toBe(
      'endereços javascript: não abrem pelo app, só http, https e mailto',
    )
    expect(describeRefusal('esquema', undefined, web)).toBe('o app só abre http e https')
  })

  it('um esquema gigante não estica a frase', () => {
    const text = describeRefusal('esquema', `${'x'.repeat(500)}:`, web)
    expect(text.length).toBeLessThan(80)
  })
})

describe('linkChoiceEntries', () => {
  it('página web com canvas: navegador, Página Web e copiar, nessa ordem', () => {
    const destination = describeLinkDestination('https://example.com/', 'terminal')
    expect(linkChoiceEntries(destination, { canOpenWebpage: true })).toEqual([
      { choice: 'abrir-no-navegador', label: 'Abrir no navegador' },
      { choice: 'abrir-como-pagina-web', label: 'Abrir como Página Web' },
      { choice: 'copiar-link', label: 'Copiar link' },
    ])
  })

  it('sem canvas (tela do chat) não oferece a Página Web', () => {
    const destination = describeLinkDestination('https://example.com/', 'markdown')
    expect(linkChoiceEntries(destination, { canOpenWebpage: false }).map((entry) => entry.choice)).toEqual([
      'abrir-no-navegador',
      'copiar-link',
    ])
  })

  it('e-mail abre no app de e-mail e nunca vira Página Web', () => {
    const destination = describeLinkDestination('mailto:fulana@example.com', 'markdown')
    expect(linkChoiceEntries(destination, { canOpenWebpage: true })).toEqual([
      { choice: 'abrir-no-navegador', label: 'Abrir no app de e-mail' },
      { choice: 'copiar-link', label: 'Copiar endereço' },
    ])
  })

  it.each([
    'file:///C:/Users/pessoa/relatorio.txt',
    'vscode://file/C:/projeto/main.ts',
    'javascript:alert(1)',
    `https://example.com/${RIGHT_TO_LEFT_OVERRIDE}gpj.exe`,
  ])('link recusado (%s) aparece, mas só para copiar', (uri) => {
    const destination = describeLinkDestination(uri, 'terminal')
    expect(linkChoiceEntries(destination, { canOpenWebpage: true })).toEqual([
      { choice: 'copiar-link', label: 'Copiar link' },
    ])
  })
})

describe('runLinkChoice', () => {
  it('copiar só copia: nem o navegador nem o bloco', () => {
    const spies = effects()
    runLinkChoice('copiar-link', ' HTTPS://Example.com/a ', 'terminal', spies)
    expect(spies.copy).toHaveBeenCalledWith('https://example.com/a')
    expect(spies.openExternal).not.toHaveBeenCalled()
    expect(spies.openWebpage).not.toHaveBeenCalled()
  })

  it('abrir no navegador entrega a forma serializada, que o processo principal revalida', () => {
    const spies = effects()
    runLinkChoice('abrir-no-navegador', 'HTTPS://Example.com/a', 'terminal', spies)
    expect(spies.openExternal).toHaveBeenCalledWith('https://example.com/a')
    expect(spies.copy).not.toHaveBeenCalled()
  })

  it('abrir como Página Web usa o bloco, só para página web', () => {
    const spies = effects()
    runLinkChoice('abrir-como-pagina-web', 'https://example.com/', 'pagina-web', spies)
    expect(spies.openWebpage).toHaveBeenCalledWith('https://example.com/')
    expect(spies.openExternal).not.toHaveBeenCalled()

    const mail = effects()
    runLinkChoice('abrir-como-pagina-web', 'mailto:fulana@example.com', 'markdown', mail)
    expect(mail.openWebpage).not.toHaveBeenCalled()
  })

  it.each<LinkChoice>(['abrir-no-navegador', 'abrir-como-pagina-web'])(
    'link recusado nunca abre, mesmo pedindo %s direto',
    (choice) => {
      const spies = effects()
      runLinkChoice(choice, 'file:///C:/segredo.txt', 'terminal', spies)
      runLinkChoice(choice, 'mailto:fulana@example.com', 'terminal', spies)
      expect(spies.openExternal).not.toHaveBeenCalled()
      expect(spies.openWebpage).not.toHaveBeenCalled()
    },
  )

  it('link recusado copia o texto cru: quem cola decide', () => {
    const spies = effects()
    runLinkChoice('copiar-link', ' file:///C:/Users/pessoa/notas.txt ', 'terminal', spies)
    expect(spies.copy).toHaveBeenCalledWith('file:///C:/Users/pessoa/notas.txt')
  })

  it('sem canvas, "Página Web" não faz nada', () => {
    const spies = { openExternal: vi.fn(), copy: vi.fn() }
    runLinkChoice('abrir-como-pagina-web', 'https://example.com/', 'markdown', spies)
    expect(spies.openExternal).not.toHaveBeenCalled()
  })
})

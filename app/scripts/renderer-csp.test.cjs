'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const {
  EXCALIDRAW_EMBED_FRAME_HOSTS,
  EXCALIDRAW_EMBED_LINK_HOSTS,
  ISOLATED_EMBED_SANDBOX,
  RENDERER_CSP_DIRECTIVES,
  buildRendererCsp,
  extractInlineScripts,
  hashInlineScript,
  hashInlineScripts,
  injectRendererCsp,
  verifyRendererCsp,
} = require('./renderer-csp.cjs')

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')

function pagina(scriptInline) {
  return [
    '<!doctype html>',
    '<html><head><meta charset="UTF-8" />',
    '<title>t</title>',
    '<script type="module" crossorigin src="./assets/index.js"></script>',
    '</head><body>',
    `<script>${scriptInline}</script>`,
    '</body></html>',
  ].join('\n')
}

function diretivas(policy) {
  return new Map(
    policy.split(';').map((directive) => {
      const [name, ...values] = directive.trim().split(/\s+/)
      return [name, values]
    }),
  )
}

test('hash de um script inline bate com o vetor do exemplo da especificação CSP', () => {
  // Exemplo clássico da CSP Level 2/3 (e do MDN): <script>alert('Hello, world.');</script>.
  assert.equal(
    hashInlineScript("alert('Hello, world.');"),
    "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='",
  )
})

test('o hash na política é o sha256 do texto exato do script inline', () => {
  const texto = "\n      document.getElementById('boot-retry')?.focus()\n    "
  const esperado = `'sha256-${createHash('sha256').update(texto, 'utf8').digest('base64')}'`
  const { policy, scriptHashes } = buildRendererCsp(pagina(texto))

  assert.deepEqual(scriptHashes, [esperado])
  assert.ok(diretivas(policy).get('script-src').includes(esperado))
})

test('alterar o script inline muda o hash, e a política antiga deixa de valer', () => {
  const original = pagina('window.location.reload()')
  const alterado = pagina('window.location.reload() ')

  assert.notDeepEqual(hashInlineScripts(original), hashInlineScripts(alterado))

  // A meta calculada para o original, colada num HTML com o script mudado,
  // tem de ser reprovada: é o cenário do hash desatualizado.
  const meta = /<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(injectRendererCsp(original))[0]
  const misturado = alterado.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />${meta}`)
  assert.equal(verifyRendererCsp(misturado).length, 1)
})

test('CRLF e CR soltos são normalizados para LF antes do hash, como faz o parser HTML', () => {
  const lf = "a()\nb()\n"
  assert.equal(hashInlineScript("a()\r\nb()\r\n"), hashInlineScript(lf))
  assert.equal(hashInlineScript("a()\rb()\r"), hashInlineScript(lf))
})

test('script externo e script dentro de comentário não entram nos hashes', () => {
  const html = [
    '<head><meta charset="UTF-8"></head><body>',
    '<!-- <script>naoConta()</script> -->',
    '<script src="./a.js"></script>',
    '<script type="module" src="./b.js"></script>',
    '<script>conta()</script>',
    '</body>',
  ].join('\n')

  assert.deepEqual(extractInlineScripts(html), ['conta()'])
})

test('os scripts inline do index.html real recebem hash', () => {
  const scripts = extractInlineScripts(INDEX_HTML)
  // O do <head> aplica o tema salvo antes da primeira pintura; o do <body>
  // liga o botão "Recarregar interface" do fallback de boot.
  assert.equal(scripts.length, 2)
  assert.match(scripts[0], /felixo-ai-core\.theme/)
  assert.match(scripts[1], /boot-retry/)
  assert.deepEqual(hashInlineScripts(INDEX_HTML), scripts.map(hashInlineScript))
})

test('as diretivas perigosas estão fechadas', () => {
  const { policy } = buildRendererCsp(INDEX_HTML)
  const mapa = diretivas(policy)

  assert.deepEqual(mapa.get('object-src'), ["'none'"])
  assert.deepEqual(mapa.get('base-uri'), ["'none'"])
  assert.deepEqual(mapa.get('form-action'), ["'none'"])
  assert.deepEqual(mapa.get('default-src'), ["'self'"])
})

test("nenhuma diretiva libera 'unsafe-eval' e o script-src não tem 'unsafe-inline'", () => {
  const { policy } = buildRendererCsp(INDEX_HTML)
  const mapa = diretivas(policy)

  for (const [name, values] of mapa) {
    assert.ok(!values.includes("'unsafe-eval'"), `${name} libera 'unsafe-eval'`)
  }
  const scriptSrc = mapa.get('script-src')
  assert.ok(!scriptSrc.includes("'unsafe-inline'"))
  assert.ok(!scriptSrc.includes('data:'))
  assert.ok(!scriptSrc.includes('blob:'))
  assert.ok(!scriptSrc.some((value) => /^https?:/.test(value)))
  // Sem fallback: se script-src-elem/-attr existissem, poderiam reabrir o inline.
  assert.ok(!mapa.has('script-src-elem'))
  assert.ok(!mapa.has('script-src-attr'))
})

test('nenhuma diretiva libera file:: o renderer é app://felixo, e a imagem local vem pela rota do próprio app', () => {
  const mapa = diretivas(buildRendererCsp(INDEX_HTML).policy)
  for (const [name, values] of mapa) {
    assert.ok(!values.some((value) => /^file:/i.test(value)), `${name} libera file:`)
  }
  assert.deepEqual(mapa.get('img-src'), ["'self'", 'data:', 'blob:'])
})

// Regra de 17/11/2026 (substitui a de 16/11, "nenhum host remoto"): a lista
// inteira do Excalidraw volta, mas só como frame. Nenhuma outra diretiva
// ganha host de rede, e o script-src do documento principal continua só 'self'.
test('só o frame-src tem host de rede: os embeds do Excalidraw, e as fontes saem do build', () => {
  const mapa = diretivas(buildRendererCsp(INDEX_HTML).policy)
  // Host sem esquema (`esm.sh`, `*.cdn.com`) também é origem de rede numa CSP.
  const rede = (value) => /^(?:https?|wss?):|\*/.test(value) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(value)

  for (const [name, values] of mapa) {
    if (name === 'frame-src') continue
    assert.deepEqual(values.filter(rede), [], `${name} libera origem de rede`)
  }
  assert.deepEqual(mapa.get('font-src'), ["'self'", 'data:'])
  assert.deepEqual(mapa.get('script-src').filter(rede), [])
  assert.deepEqual(mapa.get('connect-src'), ["'self'"])
})

test('o frame-src tem exatamente os hosts dos 14 domínios do Excalidraw, só https', () => {
  const frameSrc = diretivas(buildRendererCsp(INDEX_HTML).policy).get('frame-src')
  assert.deepEqual(frameSrc, [...EXCALIDRAW_EMBED_FRAME_HOSTS])
  assert.deepEqual(frameSrc, [
    'https://www.youtube.com', // youtube.com, youtu.be
    'https://player.vimeo.com', // vimeo.com, player.vimeo.com
    'https://www.figma.com', // figma.com
    'https://link.excalidraw.com',
    'https://gist.github.com',
    'https://platform.twitter.com', // twitter.com, x.com
    'https://embed.reddit.com', // reddit.com
    'https://*.simplepdf.eu',
    'https://stackblitz.com',
    'https://val.town',
    'https://giphy.com',
  ])
  assert.equal(EXCALIDRAW_EMBED_LINK_HOSTS.length, 14)
  for (const host of frameSrc) {
    assert.match(host, /^https:\/\/(?:\*\.)?[a-z0-9.-]+$/, `${host} não é só host https`)
  }
  assert.ok(!frameSrc.includes("'none'"))
  assert.ok(!frameSrc.includes('*'))
})

test('a meta entra logo depois do charset, antes de qualquer script, estilo ou link', () => {
  const html = injectRendererCsp(INDEX_HTML)
  const meta = html.indexOf('http-equiv="Content-Security-Policy"')

  assert.ok(meta > html.indexOf('<meta charset'))
  assert.ok(meta < html.indexOf('<link'))
  assert.ok(meta < html.indexOf('<style'))
  assert.ok(meta < html.indexOf('<script'))
  assert.deepEqual(verifyRendererCsp(html), [])
})

test('injetar duas vezes é recusado, para não somar duas políticas', () => {
  assert.throws(() => injectRendererCsp(injectRendererCsp(INDEX_HTML)), /já tem uma meta/)
})

test('HTML sem <head> é recusado em vez de sair sem política', () => {
  assert.throws(() => injectRendererCsp('<p>sem head</p>'), /não tem <head>/)
})

test('a verificação acusa HTML sem meta e meta depois de um script', () => {
  assert.deepEqual(verifyRendererCsp(pagina('x()')), ['nenhuma meta Content-Security-Policy no HTML'])

  const { policy } = buildRendererCsp(pagina('x()'))
  const tarde = pagina('x()').replace(
    '</head>',
    `<meta http-equiv="Content-Security-Policy" content="${policy}"></head>`,
  )
  assert.equal(verifyRendererCsp(tarde).length, 1)
  assert.match(verifyRendererCsp(tarde)[0], /vem depois/)
})

// Estático de propósito: o plugin só roda num `vite build` inteiro. Sem esta
// trava, tirar o plugin da lista (ou trocar o `apply`) deixaria o build verde
// e o instalador sem CSP, e nenhum teste perceberia.
test('o vite.config.ts liga o plugin da CSP no build', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'vite.config.ts'), 'utf8')
  const plugins = /plugins:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? ''
  assert.match(plugins, /felixoRendererCspPlugin\(\)/)
  assert.match(config, /name:\s*'felixo-renderer-csp'[\s\S]*?apply:\s*'build'/)
  assert.match(config, /verifyRendererCsp\(/)
})

// As barreiras andam juntas: o frame-src (hosts dos frames), o validador do
// Excalidraw (o que ele aceita montar) e o frame isolado dos embeds com script.
test('o Excalidraw aceita os 14 domínios, e X, Reddit e Gist vão por frame sem allow-same-origin', () => {
  const dir = path.join(__dirname, '..', 'src', 'features', 'canvas')
  const canvas = fs.readFileSync(path.join(dir, 'components', 'ExcalidrawCanvas.tsx'), 'utf8')
  assert.match(canvas, /validateEmbeddable=\{isExcalidrawEmbedLink\}/)
  assert.doesNotMatch(canvas, /validateEmbeddable=\{(?:false|true)\}/)
  assert.match(canvas, /renderEmbeddable=/)

  const embeds = fs.readFileSync(path.join(dir, 'services', 'excalidraw-embeds.ts'), 'utf8')
  for (const host of EXCALIDRAW_EMBED_LINK_HOSTS) assert.ok(embeds.includes(`'${host}'`), host)

  assert.ok(!ISOLATED_EMBED_SANDBOX.split(' ').includes('allow-same-origin'))
  assert.ok(!ISOLATED_EMBED_SANDBOX.split(' ').includes('allow-top-navigation'))
  assert.ok(ISOLATED_EMBED_SANDBOX.split(' ').includes('allow-scripts'))
})

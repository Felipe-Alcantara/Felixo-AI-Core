'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const {
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

test('o script inline do index.html real recebe hash', () => {
  const scripts = extractInlineScripts(INDEX_HTML)
  assert.equal(scripts.length, 1)
  assert.match(scripts[0], /boot-retry/)
  assert.deepEqual(hashInlineScripts(INDEX_HTML), [hashInlineScript(scripts[0])])
})

test('as diretivas perigosas estão fechadas', () => {
  const { policy } = buildRendererCsp(INDEX_HTML)
  const mapa = diretivas(policy)

  assert.deepEqual(mapa.get('object-src'), ["'none'"])
  assert.deepEqual(mapa.get('base-uri'), ["'none'"])
  assert.deepEqual(mapa.get('form-action'), ["'none'"])
  assert.deepEqual(mapa.get('frame-src'), ["'none'"])
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

test('a única origem de rede é https://esm.sh, e só em font-src', () => {
  const mapa = diretivas(buildRendererCsp(INDEX_HTML).policy)
  const rede = (value) => /^(?:https?|wss?):|\*/.test(value) || value.includes('esm.sh')

  assert.deepEqual(mapa.get('font-src').filter(rede), ['https://esm.sh'])
  for (const name of ['script-src', 'connect-src', 'default-src']) {
    assert.ok(!mapa.get(name).some((value) => value.includes('esm.sh')), `${name} libera esm.sh`)
  }
  for (const [name, values] of mapa) {
    if (name === 'font-src') continue
    assert.deepEqual(values.filter(rede), [], `${name} libera origem de rede`)
  }
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

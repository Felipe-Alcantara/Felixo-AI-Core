require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const { redactUrlSecrets } = require('./url-secret-redaction.cjs')

const CASOS = [
  // [entrada, saída esperada, o que prova]
  ['https://x.com/cb?code=abc#access_token=def', 'https://x.com/cb', 'retorno de OAuth: query e fragmento'],
  ['https://x.com/cb?code=abc&state=xyz#access_token=def&token_type=bearer', 'https://x.com/cb?state=xyz#token_type=bearer', 'só o sensível sai'],
  ['https://www.google.com/search?q=felixo%20ai&hl=pt-BR', 'https://www.google.com/search?q=felixo%20ai&hl=pt-BR', 'busca fica intacta, sem reserializar'],
  ['https://docs.exemplo.com/d/abc123/edit#heading=h.1', 'https://docs.exemplo.com/d/abc123/edit#heading=h.1', 'documento com fragmento inofensivo'],
  ['https://exemplo.com/guia#instalacao', 'https://exemplo.com/guia#instalacao', 'âncora comum'],
  ['https://app.exemplo.com/reset?token=Zm9vYmFy&email=a%40b.com', 'https://app.exemplo.com/reset?email=a%40b.com', 'redefinição de senha'],
  ['https://app.exemplo.com/login?magic_link=1&otp=123456', 'https://app.exemplo.com/login', 'login mágico e código de uso único'],
  [
    'https://bucket.s3.amazonaws.com/a.pdf?X-Amz-Algorithm=AWS4&X-Amz-Credential=AKIA%2F&X-Amz-Signature=deadbeef&response-content-type=pdf',
    'https://bucket.s3.amazonaws.com/a.pdf?response-content-type=pdf',
    'URL pré-assinada da AWS',
  ],
  ['https://storage.googleapis.com/b/o?X-Goog-Signature=abc&X-Goog-Expires=60', 'https://storage.googleapis.com/b/o', 'URL pré-assinada do Google'],
  ['https://conta.blob.core.windows.net/c/a.png?sv=2022&sig=abc%2Bdef', 'https://conta.blob.core.windows.net/c/a.png?sv=2022', 'SAS do Azure'],
  ['https://api.exemplo.com/v1?api_key=k123&access_token=t1&Password=x', 'https://api.exemplo.com/v1', 'nomes sensíveis do redator do git, sem distinguir maiúsculas'],
  ['https://x.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123', 'https://x.com/', 'valor com cara de JWT num nome inocente'],
  ['https://pessoa:senha@x.com/painel', 'https://x.com/painel', 'usuário e senha na URL'],
  ['http://127.0.0.1:8787/?session=abc', 'http://127.0.0.1:8787/', 'http também'],
  ['about:blank', 'about:blank', 'o que não é página web volta igual'],
  ['não é url', 'não é url', 'texto qualquer volta igual'],
]

test('redator de URL, por tabela: só o sensível sai; o resto da URL fica como estava', () => {
  for (const [entrada, esperada, motivo] of CASOS) {
    assert.equal(redactUrlSecrets(entrada), esperada, motivo)
  }
  assert.equal(redactUrlSecrets(undefined), '')
  assert.equal(redactUrlSecrets(42), '')
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  TENTATIVAS_PADRAO,
  comandoDeReproducao,
  criarRelatorio,
  fecharRelatorio,
  gravarEvidencia,
  limparTexto,
  resumoMarkdown,
  rodarSessaoComTentativas,
  tentativasDaExecucao,
} = require('./canvas-smoke-evidencia.cjs')

const LIMPEZA = { home: '/home/maria', usuario: 'maria' }

function relatorioNovo(sessoes = ['A', 'B']) {
  return criarRelatorio({ versao: '0.1.432', commit: 'abc1234def', origem: 'fonte (dev)', sessoes, tentativas: 3 })
}

function relogio() {
  let agora = 0
  return () => {
    agora += 100
    return agora
  }
}

test('sessão que passa de primeira não é instável e não repete', async () => {
  const relatorio = relatorioNovo()
  let chamadas = 0
  const registro = await rodarSessaoComTentativas(relatorio, {
    sessao: 'A',
    tentativas: 3,
    agora: relogio(),
    executar: async () => { chamadas += 1 },
  })

  assert.equal(chamadas, 1)
  assert.equal(registro.resultado, 'passou')
  assert.equal(registro.instavel, false)
  assert.deepEqual(registro.tentativas, [{ tentativa: 1, ok: true, duracaoMs: 100 }])
})

test('qualquer falha repete (até 2 vezes) e a sessão que passa na repetição sai instável, com cada erro e captura', async () => {
  const relatorio = relatorioNovo()
  const repeticoes = []
  const registro = await rodarSessaoComTentativas(relatorio, {
    sessao: 'B',
    tentativas: 3,
    agora: relogio(),
    capturaDaTentativa: (tentativa) => `build/canvas-smoke-failure-onboarding-linux-tentativa-${tentativa}.png`,
    aoRepetir: (tentativa) => repeticoes.push(tentativa),
    limpeza: LIMPEZA,
    executar: async (tentativa) => {
      // Falha de verificação (não de infraestrutura): também repete, por decisão.
      if (tentativa === 1) throw new Error('[canvas-smoke] grupo fixture ocluido por sidebar')
      if (tentativa === 2) throw new Error('APP NÃO MONTOU em /home/maria/projeto')
    },
  })

  assert.deepEqual(repeticoes, [1, 2])
  assert.equal(registro.resultado, 'passou')
  assert.equal(registro.instavel, true)
  assert.equal(registro.tentativas.length, 3)
  assert.equal(registro.tentativas[0].erro, '[canvas-smoke] grupo fixture ocluido por sidebar')
  assert.equal(registro.tentativas[1].erro, 'APP NÃO MONTOU em ~/projeto')
  assert.equal(registro.tentativas[1].captura, 'build/canvas-smoke-failure-onboarding-linux-tentativa-2.png')

  fecharRelatorio(relatorio)
  assert.equal(relatorio.resultado, 'passou-com-instabilidade')
  assert.deepEqual(relatorio.sessoesInstaveis, ['B'])
  assert.deepEqual(relatorio.sessoesNaoRodadas, ['A'])
})

test('sem nenhuma tentativa verde, lança o último erro e a execução falha', async () => {
  const relatorio = relatorioNovo(['C'])
  await assert.rejects(
    rodarSessaoComTentativas(relatorio, {
      sessao: 'C',
      tentativas: 3,
      agora: relogio(),
      executar: async (tentativa) => { throw new Error(`falha ${tentativa}`) },
    }),
    /falha 3/,
  )

  fecharRelatorio(relatorio, new Error('falha 3'))
  assert.equal(relatorio.resultado, 'falhou')
  assert.equal(relatorio.sessoes[0].tentativas.length, 3)
  assert.ok(relatorio.sessoes[0].tentativas.every((tentativa) => !tentativa.ok))
})

test('FELIXO_SMOKE_TENTATIVAS escolhe de 1 a 3; fora disso vale o padrão ou o limite', () => {
  assert.equal(TENTATIVAS_PADRAO, 3)
  assert.equal(tentativasDaExecucao({}), 3)
  assert.equal(tentativasDaExecucao({ FELIXO_SMOKE_TENTATIVAS: '1' }), 1)
  assert.equal(tentativasDaExecucao({ FELIXO_SMOKE_TENTATIVAS: '0' }), 1)
  assert.equal(tentativasDaExecucao({ FELIXO_SMOKE_TENTATIVAS: '9' }), 3)
  assert.equal(tentativasDaExecucao({ FELIXO_SMOKE_TENTATIVAS: 'muitas' }), 3)
})

test('limpa segredos, pasta pessoal e usuário do que vai para o artefato público', () => {
  const sujo = [
    'token sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA e ghp_BBBBBBBBBBBBBBBBBBBBBBBBBB',
    'Authorization: Bearer abcdefghijklmnop.qrstu',
    'AIzaSyCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.assinatura',
    'pasta /home/maria/.config/felixo e usuário maria em C:\\Users\\maria\\app',
  ].join('\n')

  const limpo = limparTexto(sujo, LIMPEZA)

  assert.doesNotMatch(limpo, /sk-ant|ghp_|AIza|eyJhbGci|abcdefghijklmnop/)
  assert.doesNotMatch(limpo, /\/home\/maria|\bmaria\b/)
  assert.match(limpo, /Bearer <segredo>/)
  assert.match(limpo, /~\/\.config\/felixo/)
  assert.match(limpo, /C:\\Users\\<usuario>\\app/)
})

test('o comando de reprodução roda só a sessão, sem repetição, e no Linux com Xvfb', () => {
  assert.equal(
    comandoDeReproducao({ sessao: 'D', plataforma: 'linux' }),
    'cd app && xvfb-run -a --server-args="-screen 0 1280x800x24" env FELIXO_SMOKE_SESSOES=D FELIXO_SMOKE_TENTATIVAS=1 npm run test:canvas-smoke',
  )
  assert.equal(
    comandoDeReproducao({ sessao: 'F', plataforma: 'win32', empacotado: true }),
    'cd app && FELIXO_SMOKE_SESSOES=F FELIXO_SMOKE_TENTATIVAS=1 FELIXO_SMOKE_PACKAGED=<executável do app empacotado> npm run test:canvas-smoke',
  )
})

test('o resumo da run mostra a instabilidade, as falhas por tentativa e como reproduzir', async () => {
  const relatorio = relatorioNovo(['A', 'B', 'C'])
  await rodarSessaoComTentativas(relatorio, { sessao: 'A', tentativas: 3, agora: relogio(), executar: async () => {} })
  await rodarSessaoComTentativas(relatorio, {
    sessao: 'B',
    tentativas: 3,
    agora: relogio(),
    executar: async (tentativa) => { if (tentativa === 1) throw new Error('canvas não montou\nlinha 2') },
  })
  fecharRelatorio(relatorio)

  const resumo = resumoMarkdown(relatorio)

  assert.match(resumo, /⚠️ passou-com-instabilidade/)
  assert.match(resumo, /\| A \| ✅ passou \| 1 \|/)
  assert.match(resumo, /\| B \| ⚠️ passou na repetição \(instável\) \| 2 \|/)
  assert.match(resumo, /\| C \| não rodou \| 0 \| — \|/)
  assert.match(resumo, /- B, tentativa 1: canvas não montou$/m)
  assert.match(resumo, /FELIXO_SMOKE_SESSOES=B/)
  assert.match(resumo, /commit `abc1234`/)
})

test('grava o relatório, o resumo e só a cópia limpa do log', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'evidencia-'))
  try {
    const log = path.join(pasta, 'electron.log')
    const resumo = path.join(pasta, 'resumo.md')
    fs.writeFileSync(log, 'abriu /home/maria/app com ghp_DDDDDDDDDDDDDDDDDDDDDDDD\n')
    const relatorio = fecharRelatorio(relatorioNovo([]))
    const destino = path.join(pasta, 'evidencia')

    const arquivo = gravarEvidencia(relatorio, { pasta: destino, logs: [log, path.join(pasta, 'nao-existe.log')], resumo, limpeza: LIMPEZA })

    assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).resultado, 'passou')
    assert.equal(fs.readFileSync(path.join(destino, 'electron.log'), 'utf8'), 'abriu ~/app com <segredo>\n')
    assert.match(fs.readFileSync(resumo, 'utf8'), /Smoke do canvas — ✅ passou/)
    assert.deepEqual(fs.readdirSync(destino).sort(), ['electron.log', `relatorio-${process.platform}.json`])
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

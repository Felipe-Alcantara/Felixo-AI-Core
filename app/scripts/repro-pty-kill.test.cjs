'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  LIMITE_DEPOIS_DO_KILL_MS,
  SAIDAS,
  classificarExecucao,
  julgar,
  main,
  resumir,
} = require('./repro-pty-kill.cjs')

const relatorio = (extra = {}) => JSON.stringify({ killEmMs: 800, onExitEmMs: 900, saiuEmMs: 1900, ...extra })
const cru = (extra = {}) => ({ erro: null, stdout: `${relatorio(extra)}\n`, stderr: '' })
const resumo = (extra = {}) => ({
  execucoes: 5,
  comRuido: 0,
  travamentos: 0,
  lentas: 0,
  semEventoDeSaida: 0,
  depoisDoKillMs: { min: 1000, mediana: 1100, max: 1200 },
  ...extra,
})

test('uma execução limpa não tem ruído, não travou e mede o tempo depois do kill', () => {
  assert.deepEqual(classificarExecucao(cru()), {
    travou: false,
    ruido: false,
    depoisDoKillMs: 1100,
    lenta: false,
    semEventoDeSaida: false,
  })
})

test('o ruído do AttachConsole no stderr é reconhecido, inclusive pelo nome do auxiliar', () => {
  assert.equal(classificarExecucao({ ...cru(), stderr: 'Error: AttachConsole failed' }).ruido, true)
  assert.equal(classificarExecucao({ ...cru(), stderr: 'at conpty_console_list_agent.js:13:26' }).ruido, true)
  assert.equal(classificarExecucao({ ...cru(), stderr: 'outro aviso qualquer' }).ruido, false)
})

test('travamento: o filho foi encerrado pelo teto de tempo ou morreu sem imprimir o relatório', () => {
  assert.equal(classificarExecucao({ erro: new Error('timeout'), stdout: '', stderr: '' }).travou, true)
  assert.equal(classificarExecucao({ erro: null, stdout: '', stderr: '' }).travou, true)
  assert.equal(classificarExecucao({ erro: null, stdout: 'lixo que não é JSON\n', stderr: '' }).travou, true)
})

test('demorar o tempo do timer do node-pty depois do kill é lento; um pouco abaixo do limite não', () => {
  assert.equal(classificarExecucao(cru({ killEmMs: 800, saiuEmMs: 5900 })).lenta, true)
  assert.equal(classificarExecucao(cru({ killEmMs: 800, saiuEmMs: 800 + LIMITE_DEPOIS_DO_KILL_MS })).lenta, true)
  assert.equal(classificarExecucao(cru({ killEmMs: 800, saiuEmMs: 800 + LIMITE_DEPOIS_DO_KILL_MS - 1 })).lenta, false)
})

test('sem o evento de saída da PTY a execução é marcada, mesmo que o processo tenha saído', () => {
  assert.equal(classificarExecucao(cru({ onExitEmMs: null })).semEventoDeSaida, true)
})

test('resumir conta cada defeito e dá mínimo, mediana e máximo do tempo', () => {
  const execucoes = [
    { travou: false, ruido: false, depoisDoKillMs: 1300, lenta: false, semEventoDeSaida: false },
    { travou: false, ruido: true, depoisDoKillMs: 5100, lenta: true, semEventoDeSaida: false },
    { travou: true, ruido: false, depoisDoKillMs: null, lenta: false, semEventoDeSaida: false },
    { travou: false, ruido: false, depoisDoKillMs: 1000, lenta: false, semEventoDeSaida: true },
  ]

  assert.deepEqual(resumir(execucoes), {
    execucoes: 4,
    comRuido: 1,
    travamentos: 1,
    lentas: 1,
    semEventoDeSaida: 1,
    depoisDoKillMs: { min: 1000, mediana: 1300, max: 5100 },
  })
  assert.equal(resumir([]).depoisDoKillMs, null)
})

test('veredito ok: a correção limpa e, no Windows, o controle reproduz o defeito', () => {
  const julgamento = julgar({ comCorrecao: resumo(), controle: resumo({ comRuido: 5 }), plataforma: 'win32' })

  assert.equal(julgamento.veredito, 'ok')
  assert.equal(julgamento.codigo, SAIDAS.ok)
})

test('veredito correcao-falhou para cada defeito da execução com a correção', () => {
  const casos = [
    [{ comRuido: 1 }, /AttachConsole/],
    [{ travamentos: 1 }, /travaram/],
    [{ lentas: 1 }, /demoraram/],
    [{ semEventoDeSaida: 1 }, /evento de saída/],
  ]
  for (const [defeito, padrao] of casos) {
    const julgamento = julgar({ comCorrecao: resumo(defeito), controle: resumo({ comRuido: 5 }), plataforma: 'win32' })

    assert.equal(julgamento.veredito, 'correcao-falhou', JSON.stringify(defeito))
    assert.equal(julgamento.codigo, SAIDAS['correcao-falhou'])
    assert.match(julgamento.motivo, padrao)
  }
})

test('a correção falhar vale mais que o controle não reproduzir', () => {
  const julgamento = julgar({ comCorrecao: resumo({ travamentos: 1 }), controle: resumo(), plataforma: 'win32' })

  assert.equal(julgamento.veredito, 'correcao-falhou')
})

test('no Windows, um controle sem ruído é inconclusivo: o ambiente não reproduz o defeito', () => {
  const julgamento = julgar({ comCorrecao: resumo(), controle: resumo({ comRuido: 0 }), plataforma: 'win32' })

  assert.equal(julgamento.veredito, 'controle-nao-reproduziu')
  assert.equal(julgamento.codigo, SAIDAS['controle-nao-reproduziu'])
})

test('fora do Windows o controle não é exigido', () => {
  for (const plataforma of ['linux', 'darwin']) {
    assert.equal(julgar({ comCorrecao: resumo(), controle: resumo(), plataforma }).veredito, 'ok')
  }
})

test('main roda N vezes com a correção e N vezes sem, escreve o resumo e devolve o código do veredito', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-pty-kill-'))
  const chamadas = []
  const executar = async ({ semCorrecao }) => {
    chamadas.push(semCorrecao)
    return semCorrecao ? { ...cru(), stderr: 'Error: AttachConsole failed' } : cru()
  }
  const arquivoResumo = path.join(pasta, 'resumo.md')
  const arquivoRelatorio = path.join(pasta, 'relatorio.json')
  const silencio = console.log
  console.log = () => {}
  try {
    const codigo = await main(['--runs', '3', '--summary', arquivoResumo, '--report', arquivoRelatorio], {
      executar,
      plataforma: 'win32',
    })

    assert.equal(codigo, SAIDAS.ok)
  } finally {
    console.log = silencio
  }

  assert.deepEqual(chamadas, [false, false, false, true, true, true])
  assert.match(fs.readFileSync(arquivoResumo, 'utf8'), /Veredito: ok/)
  const salvo = JSON.parse(fs.readFileSync(arquivoRelatorio, 'utf8'))
  assert.equal(salvo.comCorrecao.execucoes, 3)
  assert.equal(salvo.controle.comRuido, 3)
  fs.rmSync(pasta, { recursive: true, force: true })
})

test('main devolve 1 quando a correção deixa ruído e 2 quando o controle não reproduz', async () => {
  const silencio = console.log
  console.log = () => {}
  try {
    const comRuido = await main(['--runs', '1'], {
      executar: async () => ({ ...cru(), stderr: 'Error: AttachConsole failed' }),
      plataforma: 'win32',
    })
    const semReproduzir = await main(['--runs', '1'], { executar: async () => cru(), plataforma: 'win32' })

    assert.equal(comRuido, SAIDAS['correcao-falhou'])
    assert.equal(semReproduzir, SAIDAS['controle-nao-reproduziu'])
  } finally {
    console.log = silencio
  }
})

test('main recusa argumentos inválidos em vez de rodar com um padrão qualquer', async () => {
  await assert.rejects(main(['--runs', '0']), /inteiro maior que zero/)
  await assert.rejects(main(['--runs', 'abc']), /inteiro maior que zero/)
  await assert.rejects(main(['--nada']), /argumento desconhecido/)
})

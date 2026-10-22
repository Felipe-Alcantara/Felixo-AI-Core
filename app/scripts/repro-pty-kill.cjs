'use strict'

/**
 * Reprodução do encerramento de uma PTY nativa (`kill()` do node-pty) no SO em
 * que roda. Executa N vezes o filho `electron/__fixtures__/pty-kill-and-exit.cjs`
 * COM a correção (`electron/services/node-pty-windows-kill.cjs`) e N vezes SEM
 * ela (controle, `FELIXO_PTY_KILL_SEM_CORRECAO=1`), cada uma num processo novo,
 * e mede três coisas por execução:
 *
 * - ruído: o auxiliar do node-pty escreve "Error: AttachConsole failed" no stderr;
 * - tempo: quanto o processo leva para sair sozinho depois do `kill()` (o timer
 *   do node-pty é de 5 s);
 * - travamento: o processo não sair no teto de tempo (foi o que fez duas
 *   tentativas de correção anteriores serem revertidas, e só aparecia na segunda
 *   execução, por isso o script repete).
 *
 * Códigos de saída:
 *
 *   0  ok                       a correção não fez ruído, não travou e saiu rápido
 *   1  correcao-falhou          alguma execução COM a correção teve ruído, travou,
 *                               demorou ou não recebeu o evento de saída da PTY
 *   2  controle-nao-reproduziu  no Windows, nenhuma execução SEM a correção fez
 *                               ruído: o ambiente não reproduz o defeito, então o
 *                               "ok" acima não prova nada
 *   3  erro-do-script
 *
 * Fora do Windows o defeito não existe: o controle não é exigido e o script só
 * prova que a correção não piorou nada.
 *
 * Uso:
 *   node scripts/repro-pty-kill.cjs [--runs 5] [--summary resumo.md] [--report relatorio.json]
 */

const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const FIXTURE = path.join(__dirname, '..', 'electron', '__fixtures__', 'pty-kill-and-exit.cjs')
const PADRAO_DO_RUIDO = /AttachConsole|conpty_console_list_agent/i
// O timer do node-pty é de 5 s a partir do kill(); com a correção o processo sai em ~1 s.
const LIMITE_DEPOIS_DO_KILL_MS = 4_500
const TEMPO_LIMITE_DO_FILHO_MS = 30_000
const EXECUCOES_PADRAO = 5

const SAIDAS = { ok: 0, 'correcao-falhou': 1, 'controle-nao-reproduziu': 2, 'erro-do-script': 3 }

/** Roda o filho uma vez e devolve o resultado cru. */
function executarFixture({ semCorrecao, execFileImpl = execFile }) {
  return new Promise((resolve) => {
    execFileImpl(
      process.execPath,
      [FIXTURE],
      {
        env: { ...process.env, FELIXO_PTY_KILL_SEM_CORRECAO: semCorrecao ? '1' : '' },
        timeout: TEMPO_LIMITE_DO_FILHO_MS,
        encoding: 'utf8',
        windowsHide: true,
      },
      (erro, stdout, stderr) => resolve({ erro, stdout: stdout ?? '', stderr: stderr ?? '' }),
    )
  })
}

/** Transforma o resultado cru de uma execução no que o veredito precisa. */
function classificarExecucao({ erro, stdout, stderr }) {
  let relatorio = null
  try {
    relatorio = JSON.parse(String(stdout).trim().split(/\r?\n/).pop())
  } catch {
    // sem relatório: o filho morreu ou travou antes de imprimir
  }
  const depoisDoKillMs =
    relatorio && typeof relatorio.saiuEmMs === 'number' && typeof relatorio.killEmMs === 'number'
      ? relatorio.saiuEmMs - relatorio.killEmMs
      : null
  return {
    travou: erro != null || relatorio === null,
    ruido: PADRAO_DO_RUIDO.test(String(stderr)),
    depoisDoKillMs,
    lenta: depoisDoKillMs !== null && depoisDoKillMs >= LIMITE_DEPOIS_DO_KILL_MS,
    semEventoDeSaida: relatorio !== null && typeof relatorio.onExitEmMs !== 'number',
  }
}

function resumir(execucoes) {
  const tempos = execucoes
    .map((execucao) => execucao.depoisDoKillMs)
    .filter((valor) => valor !== null)
    .sort((a, b) => a - b)
  return {
    execucoes: execucoes.length,
    comRuido: execucoes.filter((execucao) => execucao.ruido).length,
    travamentos: execucoes.filter((execucao) => execucao.travou).length,
    lentas: execucoes.filter((execucao) => execucao.lenta).length,
    semEventoDeSaida: execucoes.filter((execucao) => execucao.semEventoDeSaida).length,
    depoisDoKillMs: tempos.length
      ? { min: tempos[0], mediana: tempos[Math.floor(tempos.length / 2)], max: tempos[tempos.length - 1] }
      : null,
  }
}

/** @returns {{ veredito: string, codigo: number, motivo: string }} */
function julgar({ comCorrecao, controle, plataforma = process.platform }) {
  const falhas = []
  if (comCorrecao.comRuido > 0) falhas.push(`${comCorrecao.comRuido} com AttachConsole no stderr`)
  if (comCorrecao.travamentos > 0) falhas.push(`${comCorrecao.travamentos} travaram`)
  if (comCorrecao.lentas > 0) falhas.push(`${comCorrecao.lentas} demoraram ${LIMITE_DEPOIS_DO_KILL_MS} ms ou mais para sair`)
  if (comCorrecao.semEventoDeSaida > 0) falhas.push(`${comCorrecao.semEventoDeSaida} sem o evento de saída da PTY`)
  if (falhas.length) {
    return { veredito: 'correcao-falhou', codigo: SAIDAS['correcao-falhou'], motivo: `Com a correção: ${falhas.join('; ')}.` }
  }
  if (plataforma === 'win32' && controle.comRuido === 0) {
    return {
      veredito: 'controle-nao-reproduziu',
      codigo: SAIDAS['controle-nao-reproduziu'],
      motivo: 'Sem a correção nenhuma execução fez ruído de AttachConsole: este ambiente não reproduz o defeito.',
    }
  }
  return { veredito: 'ok', codigo: SAIDAS.ok, motivo: 'A correção não fez ruído, não travou e saiu rápido.' }
}

function formatarResumo({ plataforma, comCorrecao, controle, julgamento }) {
  const linha = (rotulo, r) =>
    `| ${rotulo} | ${r.execucoes} | ${r.comRuido} | ${r.travamentos} | ` +
    (r.depoisDoKillMs
      ? `${r.depoisDoKillMs.min} / ${r.depoisDoKillMs.mediana} / ${r.depoisDoKillMs.max}`
      : 'sem medida') +
    ' |'
  return [
    `### Encerramento da PTY nativa (${plataforma}, Node ${process.version})`,
    '',
    '| Caminho | Execuções | Com AttachConsole | Travamentos | Saída depois do kill, ms (mín / mediana / máx) |',
    '| --- | ---: | ---: | ---: | --- |',
    linha('Com a correção', comCorrecao),
    linha('Controle, sem a correção', controle),
    '',
    `**Veredito: ${julgamento.veredito}.** ${julgamento.motivo}`,
    '',
  ].join('\n')
}

async function repetir(execucoes, semCorrecao, executar) {
  const resultados = []
  for (let indice = 0; indice < execucoes; indice += 1) {
    resultados.push(classificarExecucao(await executar({ semCorrecao })))
  }
  return resultados
}

function lerArgumentos(argv) {
  const opcoes = { execucoes: EXECUCOES_PADRAO, resumo: '', relatorio: '' }
  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice]
    if (argumento === '--runs') opcoes.execucoes = Number.parseInt(argv[(indice += 1)], 10)
    else if (argumento === '--summary') opcoes.resumo = argv[(indice += 1)]
    else if (argumento === '--report') opcoes.relatorio = argv[(indice += 1)]
    else throw new Error(`argumento desconhecido: ${argumento}`)
  }
  if (!Number.isInteger(opcoes.execucoes) || opcoes.execucoes < 1) {
    throw new Error('--runs precisa de um inteiro maior que zero')
  }
  return opcoes
}

async function main(argv = process.argv.slice(2), { executar = executarFixture, plataforma = process.platform } = {}) {
  const opcoes = lerArgumentos(argv)
  const comCorrecao = resumir(await repetir(opcoes.execucoes, false, executar))
  const controle = resumir(await repetir(opcoes.execucoes, true, executar))
  const julgamento = julgar({ comCorrecao, controle, plataforma })
  const resumo = formatarResumo({ plataforma, comCorrecao, controle, julgamento })

  console.log(resumo)
  if (opcoes.resumo) fs.appendFileSync(opcoes.resumo, `${resumo}\n`)
  if (opcoes.relatorio) {
    fs.writeFileSync(opcoes.relatorio, `${JSON.stringify({ plataforma, comCorrecao, controle, julgamento }, null, 2)}\n`)
  }
  return julgamento.codigo
}

module.exports = { classificarExecucao, resumir, julgar, formatarResumo, main, SAIDAS, LIMITE_DEPOIS_DO_KILL_MS }

if (require.main === module) {
  main().then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.error(`[repro-pty-kill] ${erro instanceof Error ? erro.message : erro}`)
      process.exit(SAIDAS['erro-do-script'])
    },
  )
}

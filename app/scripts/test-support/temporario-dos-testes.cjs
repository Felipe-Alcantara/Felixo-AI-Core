'use strict'

/**
 * Diretório temporário só da suíte de testes Node (`scripts/run-node-unit-tests.cjs`).
 *
 * Por quê: cerca de 22 arquivos de teste criam pastas `felixo-*` com
 * `mkdtempSync` e não as removem. Medido em 04/11/2026, uma execução do
 * `npm test` deixava 203 entradas no temporário do sistema; na máquina de
 * desenvolvimento havia 23.509 acumuladas. No Windows e no macOS nem o reboot
 * limpa. Em vez de consertar cada teste e depender de o próximo também lembrar,
 * a suíte inteira roda com `TEMP`/`TMP`/`TMPDIR` apontando para uma pasta
 * própria, que o executor apaga no fim. O que os testes deixam fica contado e
 * aparece na saída, para a sujeira continuar visível.
 *
 * O nome leva o pid de quem criou: uma execução interrompida (Ctrl+C, timeout
 * do agente) deixa a pasta, e a próxima execução apaga as de pids que já não
 * existem. Um pid reaproveitado só faz a pasta ficar até a seguinte.
 *
 * Mantenha o nome curto: o teste do `/status` do Codex falha quando o `TEMP`
 * passa de ~115 caracteres (medido: 112 passa, 116 falha), e esta pasta soma
 * cerca de 27 caracteres ao `TEMP` de quem roda.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PREFIXO = 'felixo-testes-'
const PADRAO_PASTA = /^felixo-testes-(\d+)-[A-Za-z0-9]{6}$/
/** Sufixo aleatório do `mkdtemp`: o que sobra à esquerda é o prefixo do teste. */
const PADRAO_MKDTEMP = /^(.+-)[A-Za-z0-9]{6}$/

function processoVivo(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (erro) {
    return erro.code === 'EPERM'
  }
}

function remover(caminho) {
  fs.rmSync(caminho, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

/** Apaga as pastas de execuções que já terminaram sem limpar. Nunca falha a suíte. */
function removerAbandonadas({ base = os.tmpdir(), pid = process.pid, vivo = processoVivo } = {}) {
  const removidas = []
  let nomes = []
  try {
    nomes = fs.readdirSync(base)
  } catch {
    return removidas
  }
  for (const nome of nomes) {
    const dono = PADRAO_PASTA.exec(nome)?.[1]
    if (dono === undefined || Number(dono) === pid || vivo(Number(dono))) continue
    try {
      remover(path.join(base, nome))
      removidas.push(nome)
    } catch {
      // Em uso ou sem permissão: fica para a próxima execução.
    }
  }
  return removidas
}

/** Cria a pasta desta execução, depois de limpar as abandonadas. */
function criarTemporario({ base = os.tmpdir(), pid = process.pid, vivo = processoVivo } = {}) {
  removerAbandonadas({ base, pid, vivo })
  return fs.mkdtempSync(path.join(base, `${PREFIXO}${pid}-`))
}

/** O que os testes deixaram na pasta, agrupado pelo prefixo do `mkdtemp`, do maior para o menor. */
function resumirSobras(dir) {
  const grupos = new Map()
  const nomes = fs.readdirSync(dir)
  for (const nome of nomes) {
    const prefixo = PADRAO_MKDTEMP.exec(nome)?.[1] ?? nome
    grupos.set(prefixo, (grupos.get(prefixo) ?? 0) + 1)
  }
  return { total: nomes.length, porPrefixo: [...grupos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) }
}

/** Conta o que sobrou, apaga a pasta e devolve o resumo. */
function descartarTemporario(dir) {
  const sobras = resumirSobras(dir)
  try {
    remover(dir)
    return { ...sobras, removida: true, erro: null }
  } catch (erro) {
    return { ...sobras, removida: false, erro: erro.code ?? erro.message }
  }
}

/** Uma linha para o fim da saída, ou `null` quando os testes não deixaram nada. */
function descreverSobras({ total, porPrefixo, removida, erro }, dir, maiores = 4) {
  if (total === 0 && removida) return null
  const principais = porPrefixo.slice(0, maiores).map(([prefixo, n]) => `${prefixo} ${n}`).join(', ')
  const detalhe = total === 0 ? '' : ` (as maiores: ${principais})`
  return removida
    ? `[test] os testes deixaram ${total} entradas no diretório temporário, já removidas${detalhe}`
    : `[test] não foi possível remover ${dir} (${erro}); os testes deixaram ${total} entradas${detalhe}`
}

module.exports = { criarTemporario, descartarTemporario, descreverSobras, removerAbandonadas, resumirSobras }

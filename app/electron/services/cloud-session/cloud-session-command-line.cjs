'use strict'

/**
 * Linha de comando do Windows montada à mão, para a tarefa chegar ao `claude`
 * como UM argumento, seja qual for o texto.
 *
 * Por que não deixar o node-pty montar: o `argsToCommandLine` dele não cita um
 * argumento que "já parece citado" (começa ou termina com `"`), então uma
 * tarefa como `"abc" --settings=x "def"` vira vários argumentos, e o pedaço
 * `--settings=x` chega ao `claude` como opção. O node-pty aceita uma linha já
 * pronta (`args` como string), e esta é a regra documentada pela Microsoft para
 * `CommandLineToArgvW` e o argv do CRT.
 */

/**
 * Cita um argumento: vazio ou com espaço, tabulação, quebra de linha ou aspas
 * vai entre aspas; dentro delas, as aspas ganham `\` e as barras invertidas que
 * as antecedem (ou que ficam antes do fecho) são dobradas.
 *
 * @param {unknown} arg
 * @returns {string}
 */
function quoteWindowsArg(arg) {
  const text = String(arg)
  if (text.length > 0 && !/[\s"]/.test(text)) return text

  let result = '"'
  let backslashes = 0
  for (const char of text) {
    if (char === '\\') {
      backslashes += 1
    } else if (char === '"') {
      result += `${'\\'.repeat(backslashes * 2 + 1)}"`
      backslashes = 0
    } else {
      result += `${'\\'.repeat(backslashes)}${char}`
      backslashes = 0
    }
  }
  return `${result}${'\\'.repeat(backslashes * 2)}"`
}

/**
 * @param {readonly unknown[]} args
 * @returns {string} Argumentos já citados, separados por espaço (sem o executável).
 */
function buildWindowsCommandLine(args) {
  return args.map(quoteWindowsArg).join(' ')
}

/**
 * Linha de `sh -c` (macOS) em que cada argumento é lido de uma variável de
 * ambiente entre aspas duplas: `exec <comando> "${FELIXO_ARG_0}" "${FELIXO_ARG_1}"`.
 *
 * Por que variável e não escape: o `escapeArg` do app não cobre `\n`, `\t` nem
 * `\r`, e escapar para um shell é sempre uma lista de casos. O valor de uma
 * variável entre aspas duplas não é reinterpretado pelo shell (nada de `$()`,
 * crase, aspas ou quebra de linha), seja qual for o texto. Quem chama coloca os
 * valores no ambiente do processo como `FELIXO_ARG_0`, `FELIXO_ARG_1`, ...
 *
 * @param {string} escapedCommand Comando já escapado para o shell (ex.: `'claude'`).
 * @param {number} argCount
 * @returns {string}
 */
function buildPosixExecLine(escapedCommand, argCount) {
  const refs = Array.from({ length: argCount }, (_, index) => `"\${FELIXO_ARG_${index}}"`)
  return ['exec', escapedCommand, ...refs].join(' ')
}

module.exports = { buildPosixExecLine, buildWindowsCommandLine, quoteWindowsArg }

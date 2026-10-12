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

module.exports = { buildWindowsCommandLine, quoteWindowsArg }

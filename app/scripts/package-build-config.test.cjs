const test = require('node:test')
const assert = require('node:assert/strict')

const pkg = require('../package.json')

/**
 * node-pty precisa do binário `spawn-helper` (macOS/Linux) como arquivo real
 * em disco: node-pty o invoca via posix_spawnp, e um arquivo dentro do
 * app.asar não é um executável válido para essa chamada. Sem `asarUnpack`
 * cobrindo node-pty, todo terminal do app empacotado falha ao abrir com
 * "posix_spawnp failed" — só aparece no build, não no `npm run dev`.
 */
test('build.asarUnpack mantém node-pty fora do app.asar', () => {
  const unpack = pkg.build?.asarUnpack ?? []
  const coversNodePty = unpack.some((pattern) => /node[-_]?pty/i.test(pattern))

  assert.ok(
    coversNodePty,
    'build.asarUnpack deve incluir um padrão que desempacote node_modules/node-pty (ex.: "**/node_modules/node-pty/**")',
  )
})

test('build.afterPack restaura execução do helper POSIX do node-pty', () => {
  assert.equal(
    pkg.build?.afterPack,
    'scripts/fix-native-pty-permissions.cjs',
    'build.afterPack deve preparar a permissão do spawn-helper do node-pty',
  )
})

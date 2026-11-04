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

/**
 * O electron-builder 26 monta a linha `MimeType` do `.desktop` com
 * `asArray(linux.mimeTypes)`, que devolve o próprio array da configuração, e
 * empurra nele os tipos das `fileAssociations`. Cada alvo Linux (AppImage x64,
 * AppImage arm64, deb) repetia os três tipos mais uma vez: o `.desktop`
 * instalado pelo `.deb` saía com eles repetidos (relato de 25/09/2026). As
 * `fileAssociations` já declaram os tipos; `linux.mimeTypes` fica de fora.
 */
test('o .desktop de cada alvo Linux lista cada MimeType uma vez só', async () => {
  const { LinuxTargetHelper } = require('app-builder-lib/out/targets/LinuxTargetHelper')
  const linux = pkg.build.linux
  const helper = new LinuxTargetHelper({
    appInfo: { productName: pkg.build.productName, productFilename: pkg.build.productName, sanitizedName: pkg.name, description: pkg.description, version: pkg.version },
    executableName: pkg.name,
    info: { metadata: { desktopName: `${pkg.name}.desktop` } },
    fileAssociations: pkg.build.fileAssociations,
    config: { protocols: [] },
    platformSpecificBuildOptions: linux,
  })
  const esperados = pkg.build.fileAssociations.map((associacao) => associacao.mimeType)
  // Um `.desktop` por alvo e arquitetura, como no `electron-builder --linux`.
  for (const _alvo of linux.target.flatMap((alvo) => alvo.arch)) {
    const entrada = await helper.computeDesktopEntry(linux, pkg.name, {})
    const tipos = (entrada.match(/^MimeType=(.*)$/m)?.[1] ?? '').split(';').filter(Boolean)
    assert.deepEqual(tipos, esperados)
  }
})

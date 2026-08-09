const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { rendererBuildPath } = require('./paths.cjs')

// O app empacotado carrega o renderer por `loadFile()`, ou seja, protocolo
// file://. Um caminho de asset que comece com "/" resolve para a raiz do
// disco nesse protocolo — o script nunca carrega e a janela abre em branco.
// Só o build de produção tem esse risco; em dev o Vite serve por http://.
const buildExists = fs.existsSync(rendererBuildPath)

test(
  'o HTML de produção referencia assets por caminho relativo, não absoluto',
  { skip: buildExists ? false : 'dist/index.html ausente — rode `npm run build`' },
  () => {
    const html = fs.readFileSync(rendererBuildPath, 'utf8')
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    const locais = refs.filter((ref) => !/^(https?:)?\/\//.test(ref))

    assert.ok(locais.length > 0, 'o HTML deveria referenciar ao menos um asset local')

    const absolutos = locais.filter((ref) => ref.startsWith('/'))
    assert.deepEqual(
      absolutos,
      [],
      `assets com caminho absoluto quebram sob file://: ${absolutos.join(', ')}`,
    )
  },
)

test(
  'os assets referenciados existem de fato ao lado do index.html',
  { skip: buildExists ? false : 'dist/index.html ausente — rode `npm run build`' },
  () => {
    const html = fs.readFileSync(rendererBuildPath, 'utf8')
    const dir = path.dirname(rendererBuildPath)
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((ref) => !/^(https?:)?\/\//.test(ref))

    for (const ref of refs) {
      const alvo = path.resolve(dir, ref.replace(/^\.?\//, ''))
      assert.ok(fs.existsSync(alvo), `asset referenciado não existe no build: ${ref}`)
    }
  },
)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const AJUDANTE = path.join(__dirname, 'pasta-do-teste.cjs')

/** Roda um filho que carrega o ajudante e depois executa `codigo`, com `base` como temporário de partida. */
function filho(codigo, base) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(AJUDANTE)}); ${codigo}`], {
    encoding: 'utf8',
    env: { ...process.env, TEMP: base, TMP: base, TMPDIR: base },
  })
}

function baseDeTeste(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-ajudante-teste-'))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  return base
}

test('o processo enxerga uma pasta própria dentro do temporário e ela some ao sair', (t) => {
  const base = baseDeTeste(t)
  const r = filho(
    "const p = process.env.TEMP; require('node:fs').writeFileSync(require('node:path').join(p, 'sujo.txt'), 'x'); process.stdout.write(p)",
    base,
  )

  assert.equal(r.status, 0, r.stderr)
  assert.equal(path.dirname(r.stdout), base)
  assert.equal(fs.existsSync(r.stdout), false)
  assert.deepEqual(fs.readdirSync(base), [])
})

test('a pasta some mesmo quando o processo sai com process.exit', (t) => {
  const base = baseDeTeste(t)
  const r = filho('process.stdout.write(process.env.TEMP); process.exit(3)', base)

  assert.equal(r.status, 3)
  assert.equal(fs.existsSync(r.stdout), false)
  assert.deepEqual(fs.readdirSync(base), [])
})

test('os processos filhos do teste herdam a mesma pasta', (t) => {
  const base = baseDeTeste(t)
  const r = filho(
    "const { spawnSync } = require('node:child_process'); const neto = spawnSync(process.execPath, ['-e', 'process.stdout.write(process.env.TEMP)'], { encoding: 'utf8' }); process.stdout.write(process.env.TEMP + '|' + neto.stdout)",
    base,
  )

  assert.equal(r.status, 0, r.stderr)
  const [pai, neto] = r.stdout.split('|')
  assert.equal(neto, pai)
})

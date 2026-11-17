'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  dentroDeLibraryPython,
  ehPep668,
  nomesDosPacotes,
  pacotesNovos,
  parsearFreeze,
} = require('./openia-macos-limpo.cjs')

test('o diff de pip list --user devolve só o que o pip adicionou, ordenado', () => {
  const antes = parsearFreeze('requests==2.31.0\n\nsix==1.16.0\n')
  const depois = parsearFreeze('typer==0.12.0\nrequests==2.31.0\nopenia==0.1.0\nsix==1.16.0\n')

  const novos = pacotesNovos(antes, depois)

  assert.deepEqual(novos, ['openia==0.1.0', 'typer==0.12.0'])
  assert.deepEqual(nomesDosPacotes(novos), ['openia', 'typer'])
  assert.deepEqual(pacotesNovos(depois, depois), [])
})

test('só ~/Library/Python/<x.y>/bin conta como a pasta de scripts do pip --user no macOS', () => {
  const home = '/Users/runner'
  assert.equal(dentroDeLibraryPython('/Users/runner/Library/Python/3.13/bin/openia', home), true)
  assert.equal(dentroDeLibraryPython('/Users/runner/Library/Python/3.9/bin/openia', home), true)
  assert.equal(dentroDeLibraryPython('/opt/homebrew/bin/openia', home), false)
  assert.equal(dentroDeLibraryPython('/Users/runner/.local/bin/openia', home), false)
  assert.equal(dentroDeLibraryPython('/Users/outro/Library/Python/3.13/bin/openia', home), false)
  assert.equal(dentroDeLibraryPython(null, home), false)
})

test('reconhece a recusa do pip por PEP 668 (Homebrew)', () => {
  assert.equal(ehPep668('error: externally-managed-environment\n\n× This environment is externally managed'), true)
  assert.equal(ehPep668('ERROR: No matching distribution found'), false)
  assert.equal(ehPep668(undefined), false)
})

'use strict'
require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { analisarDesktop, listarProcessosPrincipais, lerAmbiente } = require('./linux-instalado-e2e.cjs')

test('o .desktop com os tipos repetidos é acusado, e o certo passa', () => {
  const repetido = analisarDesktop('[Desktop Entry]\nMimeType=a/x;b/y;c/z;a/x;b/y;c/z;\n')
  assert.equal(repetido.tipos.length, 6)
  assert.deepEqual(repetido.repetidos, ['a/x', 'b/y', 'c/z'])
  const certo = analisarDesktop('[Desktop Entry]\nMimeType=a/x;b/y;c/z;\n')
  assert.deepEqual({ linhas: certo.linhas, repetidos: certo.repetidos }, { linhas: 1, repetidos: [] })
})

test('só o processo principal do AppImage conta, sem os filhos do Chromium nem o AppRun', () => {
  const proc = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-falso-'))
  const processo = (pid, argv, environ = '') => {
    fs.mkdirSync(path.join(proc, String(pid)))
    fs.writeFileSync(path.join(proc, String(pid), 'cmdline'), `${argv.join('\0')}\0`)
    fs.writeFileSync(path.join(proc, String(pid), 'environ'), environ)
  }
  try {
    const montagem = '/tmp/.mount_FelixoABC123'
    processo(10, [`${montagem}/felixo-ai-core`, '--no-sandbox'])
    processo(11, [`${montagem}/felixo-ai-core`, '--type=zygote'])
    processo(12, [`${montagem}/chrome_crashpad_handler`, '--database=x'])
    processo(13, [`${montagem}/AppRun`])
    processo(14, ['/tmp/appimage_extracted_9f/felixo-ai-core'], 'DRI_PRIME=1\0FELIXO_GPU_ENV_SANITIZED=1\0')
    processo(15, ['/usr/bin/bash'])
    fs.mkdirSync(path.join(proc, 'self'))

    assert.deepEqual(listarProcessosPrincipais(proc).map((p) => p.pid).sort(), [10, 14])
    assert.equal(lerAmbiente(14, proc).get('FELIXO_GPU_ENV_SANITIZED'), '1')
    assert.equal(lerAmbiente(14, proc).has('__NV_PRIME_RENDER_OFFLOAD'), false)
  } finally {
    fs.rmSync(proc, { recursive: true, force: true })
  }
})

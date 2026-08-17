'use strict'

/**
 * Teste de integração com PTY **de verdade**: o payload grande precisa chegar
 * inteiro ao processo filho.
 *
 * Os testes de unidade da fila usam um `escrever` falso — eles provam o
 * fatiamento, a ordem e o dreno, mas não provam que o dado atravessa uma PTY.
 * E o bug era exatamente perda em trânsito: `write()` aceitava e o outro lado
 * recebia menos do que foi mandado, em silêncio.
 *
 * Aqui o texto passa pelo `PtyProcessManager` real, pelo `node-pty` real, e é
 * gravado em arquivo pelo `cat` do outro lado. O que o arquivo contém é o que o
 * processo filho de fato recebeu.
 *
 * Cobertura honesta: isto roda em POSIX e prova o mecanismo. **Não** prova o
 * ConPTY do Windows, que é onde o sintoma apareceu — ver o `IA.md`.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const { PtyProcessManager } = require('./pty-process-manager.cjs')

/** Payload realista: tamanho de um prompt inicial grande, com acento e emoji. */
function textoGrande(linhas = 700) {
  const corpo = Array.from(
    { length: linhas },
    (_, indice) =>
      `linha ${indice} — padrão de qualidade 🔥 contexto do canvas e identidade do agente`,
  )
  return `${corpo.join('\n')}\n`
}

const ehWindows = process.platform === 'win32'

test(
  'payload grande chega INTEIRO ao processo filho por uma PTY real',
  { skip: ehWindows ? 'usa cat/sh; no Windows o caminho é outro' : false },
  async () => {
    const destino = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-')),
      'recebido.txt',
    )
    const manager = new PtyProcessManager()
    const payload = textoGrande()

    const encerrou = new Promise((resolve) => {
      manager.spawn('teste-integracao', {
        command: '/bin/sh',
        args: ['-c', `cat > ${JSON.stringify(destino)}`],
        cwd: os.tmpdir(),
        cols: 120,
        rows: 30,
        onExit: resolve,
      })
    })

    manager.write('teste-integracao', payload)
    // Espera o dreno antes do EOF: mandar Ctrl-D com a carga ainda saindo
    // truncaria a entrada — é o mesmo erro de "aceito ≠ entregue".
    await manager.aguardarEscritas('teste-integracao')
    manager.write('teste-integracao', '')

    await Promise.race([
      encerrou,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('o cat não encerrou a tempo')), 20000),
      ),
    ])

    const recebido = fs.readFileSync(destino, 'utf8')
    // A PTY normaliza \n em \r\n na entrada; comparar o conteúdo, não os bytes
    // de fim de linha, que não são o objeto do teste.
    const normalizar = (texto) => texto.replace(/\r\n/g, '\n')

    assert.equal(
      normalizar(recebido).length,
      payload.length,
      `chegou truncado: ${normalizar(recebido).length} de ${payload.length} caracteres`,
    )
    assert.equal(normalizar(recebido), payload)

    manager.dispose?.()
  },
)

test(
  'emoji não é partido ao atravessar a PTY',
  { skip: ehWindows ? 'usa cat/sh; no Windows o caminho é outro' : false },
  async () => {
    const destino = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-')),
      'emoji.txt',
    )
    const manager = new PtyProcessManager()
    // Muitos emoji, com quebras de linha como num prompt real: se o corte
    // fosse por unidade UTF-16, um par surrogate quebraria no limite do bloco.
    const payload = `${Array.from({ length: 120 }, () => '🔥👍🚀'.repeat(10)).join('\n')}\n`

    const encerrou = new Promise((resolve) => {
      manager.spawn('teste-emoji', {
        command: '/bin/sh',
        args: ['-c', `cat > ${JSON.stringify(destino)}`],
        cwd: os.tmpdir(),
        cols: 120,
        rows: 30,
        onExit: resolve,
      })
    })

    manager.write('teste-emoji', payload)
    await manager.aguardarEscritas('teste-emoji')
    manager.write('teste-emoji', '')

    await Promise.race([
      encerrou,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('o cat não encerrou a tempo')), 20000),
      ),
    ])

    const recebido = fs.readFileSync(destino, 'utf8').replace(/\r\n/g, '\n')

    assert.equal(recebido, payload)
    assert.ok(!recebido.includes('�'), 'apareceu caractere de substituição')

    manager.dispose?.()
  },
)


test(
  'LIMITE CONHECIDO: linha unica acima de 4096 bytes e cortada pelo proprio tty',
  { skip: ehWindows ? 'usa cat/sh; no Windows o caminho é outro' : false },
  async () => {
    // Isto NAO e defeito da fila: em modo canonico o tty tem um buffer de linha
    // (MAX_CANON, 4096 bytes) e descarta o excedente de uma linha sem quebra.
    // Medido: 14.401 bytes numa linha só chegaram como 4.096, com o corte
    // caindo no meio de um emoji.
    //
    // Fica registrado como fronteira, e não como bug, porque nenhum prompt real
    // tem essa forma — a maior linha do prompt padrão tem 745 bytes. Se um dia
    // alguém gerar uma linha gigante (um transcript de handoff sem quebras, por
    // exemplo), o sintoma vai ser este, e o conserto é outro: bracketed paste
    // ou garantir que o consumidor esteja em modo raw.
    const destino = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-')),
      'linha-gigante.txt',
    )
    const manager = new PtyProcessManager()
    const payload = `${'a'.repeat(14000)}\n`

    const encerrou = new Promise((resolve) => {
      manager.spawn('teste-linha-gigante', {
        command: '/bin/sh',
        args: ['-c', `cat > ${JSON.stringify(destino)}`],
        cwd: os.tmpdir(),
        cols: 120,
        rows: 30,
        onExit: resolve,
      })
    })

    manager.write('teste-linha-gigante', payload)
    await manager.aguardarEscritas('teste-linha-gigante')
    manager.write('teste-linha-gigante', '\u0004')

    await Promise.race([
      encerrou,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('o cat não encerrou a tempo')), 20000),
      ),
    ])

    const recebido = fs.readFileSync(destino, 'utf8')

    assert.equal(
      Buffer.byteLength(recebido),
      4096,
      'o limite do tty mudou — reavaliar a nota acima',
    )

    manager.dispose?.()
  },
)

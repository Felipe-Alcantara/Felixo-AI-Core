const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  aspasPosix,
  construirShimPosix,
  instalarComandoDoAgente,
} = require('./agent-command-install.cjs')

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-bin-'))
}

test('o shim aguenta caminho com espaço e acento', () => {
  // O caminho real de instalação nesta máquina é
  // "Programação/Github/Repositórios/…": um shim sem aspas quebra ali.
  const shim = construirShimPosix({
    execPath: '/opt/Felixo AI Core/felixo',
    entrypoint: '/home/pessoa/Programação/app/electron/cli/felixo.cjs',
  })

  assert.match(shim, /'\/opt\/Felixo AI Core\/felixo'/)
  assert.match(shim, /'\/home\/pessoa\/Programação\/app\/electron\/cli\/felixo\.cjs'/)
  assert.match(shim, /ELECTRON_RUN_AS_NODE=1/)
})

test('o shim leva o userData do app para o processo Node', () => {
  const shim = construirShimPosix({
    execPath: '/opt/Felixo AI Core/felixo',
    entrypoint: '/home/pessoa/app/electron/cli/felixo.cjs',
    userData: "/home/pessoa/.config/Felixo AI Core",
  })

  assert.match(shim, /FELIXO_USER_DATA_DIR='\/home\/pessoa\/\.config\/Felixo AI Core'/)
})

test('aspasPosix não deixa apóstrofo escapar do argumento', () => {
  assert.equal(aspasPosix("/home/d'angelo/app"), `'/home/d'\\''angelo/app'`)
})

test('instalar cria o comando executável e é idempotente', () => {
  const binDir = path.join(pastaTemporaria(), 'bin')
  const alvo = { execPath: '/usr/bin/node', entrypoint: '/app/felixo.cjs' }
  const chmods = []
  const sistemaDeArquivos = {
    ...fs,
    chmodSync(caminho, modo) {
      chmods.push({ caminho, modo })
    },
  }

  const primeira = instalarComandoDoAgente({
    binDir,
    ...alvo,
    plataforma: 'linux',
    sistemaDeArquivos,
  })

  assert.equal(primeira.escrito, true)
  assert.deepEqual(chmods, [{ caminho: primeira.caminho, modo: 0o755 }])

  const segunda = instalarComandoDoAgente({
    binDir,
    ...alvo,
    plataforma: 'linux',
    sistemaDeArquivos,
  })

  // Reescrever a cada abertura trocaria o inode de um arquivo em execução.
  assert.equal(segunda.escrito, false)
  assert.equal(chmods.length, 1)
})

test('mudança de caminho do app reescreve o shim', () => {
  const binDir = path.join(pastaTemporaria(), 'bin')
  instalarComandoDoAgente({
    binDir,
    execPath: '/versao/antiga/felixo',
    entrypoint: '/app/felixo.cjs',
    plataforma: 'linux',
  })

  const depois = instalarComandoDoAgente({
    binDir,
    execPath: '/versao/nova/felixo',
    entrypoint: '/app/felixo.cjs',
    plataforma: 'linux',
  })

  assert.equal(depois.escrito, true)
  assert.match(fs.readFileSync(depois.caminho, 'utf8'), /versao\/nova/)
})

test('no Windows o comando vira .cmd e não recebe chmod', () => {
  const binDir = path.join(pastaTemporaria(), 'bin')

  const { caminho } = instalarComandoDoAgente({
    binDir,
    execPath: 'C:\\Program Files\\Felixo\\felixo.exe',
    entrypoint: 'C:\\Program Files\\Felixo\\felixo.cjs',
    userData: 'C:\\Users\\pessoa\\AppData\\Roaming\\felixo-ai-core',
    plataforma: 'win32',
  })

  assert.equal(path.basename(caminho), 'felixo.cmd')
  assert.match(fs.readFileSync(caminho, 'utf8'), /set ELECTRON_RUN_AS_NODE=1/)
  assert.match(
    fs.readFileSync(caminho, 'utf8'),
    /set "FELIXO_USER_DATA_DIR=C:\\Users\\pessoa\\AppData\\Roaming\\felixo-ai-core"/,
  )
})

test('o comando instalado roda de verdade e responde a ajuda', (t) => {
  if (process.platform === 'win32') {
    t.skip('shim POSIX não se aplica ao Windows')
    return
  }

  const binDir = path.join(pastaTemporaria(), 'bin')
  const { caminho } = instalarComandoDoAgente({
    binDir,
    execPath: process.execPath,
    entrypoint: path.join(__dirname, '..', 'cli', 'felixo.cjs'),
    userData: path.join(binDir, 'profile'),
    plataforma: 'linux',
  })

  // Executa o shim como um terminal executaria: é a única forma de provar que
  // o arquivo gerado é mesmo um comando, e não um texto bem formatado.
  const saida = execFileSync(caminho, [], { encoding: 'utf8' })

  assert.match(saida, /felixo fetch-all/)
  assert.match(saida, /pedir-execucao/)
})

test('o shim executado grava pedidos no userData recebido do app', () => {
  if (process.platform === 'win32') {
    return
  }

  const root = pastaTemporaria()
  const binDir = path.join(root, 'bin')
  const userData = path.join(root, 'Felixo AI Core profile')
  const { caminho } = instalarComandoDoAgente({
    binDir,
    execPath: process.execPath,
    entrypoint: path.join(__dirname, '..', 'cli', 'felixo.cjs'),
    userData,
    plataforma: 'linux',
  })

  const saida = execFileSync(caminho, ['fetch-all', 'pedir-execucao'], {
    encoding: 'utf8',
  })
  const arquivos = fs.readdirSync(path.join(userData, 'agent-requests'))

  assert.match(saida, /Pedido registrado:/)
  assert.equal(arquivos.length, 1)
  assert.match(arquivos[0], /\.json$/)
})

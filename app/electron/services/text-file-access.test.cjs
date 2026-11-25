require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createTextFileAccess } = require('./text-file-access.cjs')

/**
 * Dubla o `realpath`: as chaves sao caminhos e os valores o destino real, o que
 * permite montar link simbolico sem tocar o disco. Caminho ausente = inexistente.
 */
function fakeRealPath(map) {
  return (filePath) => {
    const resolved = path.resolve(filePath)
    if (!(resolved in map)) {
      const error = new Error('ENOENT')
      error.code = 'ENOENT'
      throw error
    }
    return map[resolved]
  }
}

const projeto = path.resolve('/home/user/projeto')
const arquivoNoProjeto = path.join(projeto, 'README.md')
const arquivoDeFora = path.resolve('/etc/senhas')
const arquivoEscolhido = path.resolve('/home/user/Documentos/notas.txt')

const realPathPadrao = fakeRealPath({
  [projeto]: projeto,
  [arquivoNoProjeto]: arquivoNoProjeto,
  [arquivoDeFora]: arquivoDeFora,
  [arquivoEscolhido]: arquivoEscolhido,
})

function criar(roots = [projeto], realPath = realPathPadrao) {
  return createTextFileAccess({ listProjectRoots: () => roots, realPath })
}

test('um arquivo dentro de um projeto registrado e autorizado sem escolha previa', () => {
  assert.equal(criar().authorize(arquivoNoProjeto), arquivoNoProjeto)
})

test('um arquivo fora dos projetos e recusado enquanto ninguem o escolheu', () => {
  assert.throws(() => criar().authorize(arquivoDeFora), /fora dos projetos/)
})

test('a raiz do sistema nao concede acesso a arquivos de texto', () => {
  const systemRoot = path.parse(projeto).root
  const access = createTextFileAccess({
    listProjectRoots: () => [systemRoot],
    realPath: fakeRealPath({
      [systemRoot]: systemRoot,
      [arquivoNoProjeto]: arquivoNoProjeto,
    }),
  })

  assert.throws(() => access.authorize(arquivoNoProjeto), /fora dos projetos/)
})

test('escolher um arquivo no dialogo e o que o autoriza', () => {
  const access = criar()

  assert.throws(() => access.authorize(arquivoEscolhido), /fora dos projetos/)
  access.grant(arquivoEscolhido)
  assert.equal(access.authorize(arquivoEscolhido), arquivoEscolhido)
})

test('a concessao vale para aquele arquivo, e nao para a pasta dele', () => {
  const vizinho = path.resolve('/home/user/Documentos/outro.txt')
  const access = createTextFileAccess({
    listProjectRoots: () => [],
    realPath: fakeRealPath({
      [arquivoEscolhido]: arquivoEscolhido,
      [vizinho]: vizinho,
    }),
  })

  access.grant(arquivoEscolhido)

  assert.throws(() => access.authorize(vizinho), /fora dos projetos/)
})

test('um link simbolico apontando para fora do projeto nao entra pela porta do projeto', () => {
  // O caso que uma comparacao de texto deixaria passar: o caminho comeca dentro
  // do projeto, mas o arquivo de verdade esta fora dele.
  const atalho = path.join(projeto, 'atalho.md')
  const access = criar(
    [projeto],
    fakeRealPath({
      [projeto]: projeto,
      [atalho]: arquivoDeFora,
      [arquivoDeFora]: arquivoDeFora,
    }),
  )

  assert.throws(() => access.authorize(atalho), /fora dos projetos/)
})

test('`..` no caminho nao escapa do projeto', () => {
  const escapando = path.join(projeto, '..', 'senhas')
  const access = criar(
    [projeto],
    fakeRealPath({
      [projeto]: projeto,
      [path.resolve(escapando)]: path.resolve(escapando),
    }),
  )

  assert.throws(() => access.authorize(escapando), /fora dos projetos/)
})

test('a raiz do projeto e consultada a cada verificacao, entao registrar vale na hora', () => {
  let roots = []
  const access = createTextFileAccess({
    listProjectRoots: () => roots,
    realPath: realPathPadrao,
  })

  assert.throws(() => access.authorize(arquivoNoProjeto), /fora dos projetos/)
  roots = [projeto]
  assert.equal(access.authorize(arquivoNoProjeto), arquivoNoProjeto)
})

test('uma raiz que sumiu do disco nao autoriza nada nem derruba a checagem', () => {
  const access = criar([path.resolve('/projeto/apagado'), projeto])

  assert.equal(access.authorize(arquivoNoProjeto), arquivoNoProjeto)
  assert.throws(() => access.authorize(arquivoDeFora), /fora dos projetos/)
})

test('arquivo inexistente e caminho vazio sao recusados com mensagem propria', () => {
  const access = criar()

  assert.throws(() => access.authorize('/nao/existe'), /nao encontrado/i)
  assert.throws(() => access.authorize(''), /invalido/i)
  assert.throws(() => access.authorize(null), /invalido/i)
  assert.throws(() => access.authorize(42), /invalido/i)
})

test('revokeAll devolve as concessoes, mas nao mexe nos projetos', () => {
  const access = criar()
  access.grant(arquivoEscolhido)

  access.revokeAll()

  assert.throws(() => access.authorize(arquivoEscolhido), /fora dos projetos/)
  assert.equal(access.authorize(arquivoNoProjeto), arquivoNoProjeto)
})

test('grant devolve o caminho resolvido, que e o que deve circular daqui pra frente', () => {
  const atalho = path.resolve('/home/user/atalho.txt')
  const access = createTextFileAccess({
    listProjectRoots: () => [],
    realPath: fakeRealPath({
      [atalho]: arquivoEscolhido,
      [arquivoEscolhido]: arquivoEscolhido,
    }),
  })

  assert.equal(access.grant(atalho), arquivoEscolhido)
  assert.equal(access.authorize(arquivoEscolhido), arquivoEscolhido)
})

test('imagem do Markdown: dentro do projeto, ou na pasta (e subpastas) de um arquivo escolhido', () => {
  const imagemNoProjeto = path.join(projeto, 'assets', 'logo.png')
  const imagemPerto = path.resolve('/home/user/Documentos/img/foto.png')
  const imagemLonge = path.resolve('/home/user/Imagens/foto.png')
  const access = criar(
    [projeto],
    fakeRealPath({
      [projeto]: projeto,
      [imagemNoProjeto]: imagemNoProjeto,
      [arquivoEscolhido]: arquivoEscolhido,
      [imagemPerto]: imagemPerto,
      [imagemLonge]: imagemLonge,
    }),
  )

  assert.equal(access.authorizeImageNear(imagemNoProjeto), imagemNoProjeto)
  // Antes de a pessoa escolher o .md, a pasta dele não autoriza nada.
  assert.throws(() => access.authorizeImageNear(imagemPerto), /fora dos projetos/)
  access.grant(arquivoEscolhido)
  assert.equal(access.authorizeImageNear(imagemPerto), imagemPerto)
  assert.throws(() => access.authorizeImageNear(imagemLonge), /fora dos projetos/)
  // A regra de texto continua só o arquivo exato.
  assert.throws(() => access.authorize(imagemPerto), /fora dos projetos/)
})

test('imagem do Markdown: link simbólico para fora não passa, nem pela pasta do arquivo escolhido', () => {
  const linkNoProjeto = path.join(projeto, 'assets', 'link.png')
  const linkPerto = path.resolve('/home/user/Documentos/link.png')
  const segredo = path.resolve('/home/user/.ssh/foto.png')
  const access = criar(
    [projeto],
    fakeRealPath({
      [projeto]: projeto,
      [arquivoEscolhido]: arquivoEscolhido,
      [linkNoProjeto]: segredo,
      [linkPerto]: segredo,
      [segredo]: segredo,
    }),
  )
  access.grant(arquivoEscolhido)

  assert.throws(() => access.authorizeImageNear(linkNoProjeto), /fora dos projetos/)
  assert.throws(() => access.authorizeImageNear(linkPerto), /fora dos projetos/)
})

test('imagem do Markdown: um arquivo escolhido na raiz do disco não abre o disco inteiro', () => {
  const naRaiz = path.resolve('/notas.md')
  const qualquer = path.resolve('/home/user/foto.png')
  const access = criar([], fakeRealPath({ [naRaiz]: naRaiz, [qualquer]: qualquer }))
  access.grant(naRaiz)
  assert.throws(() => access.authorizeImageNear(qualquer), /fora dos projetos/)
})

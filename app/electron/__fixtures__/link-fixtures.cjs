'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * Fixtures de link para os testes que verificam que o produto nao segue um
 * reparse point para fora de uma raiz autorizada.
 *
 * Por que existe: criar symlink no Windows exige Developer Mode ou elevacao;
 * sem isso `fs.symlinkSync` devolve EPERM. Os testes reagiam a isso de tres
 * formas diferentes — quebrando, pulando, ou engolindo o erro e passando sem
 * verificar nada. A ultima e a pior: a regra sob teste e de seguranca (nao
 * vazar caminho para fora da raiz) e ficava sem cobertura nenhuma no Windows,
 * reportada como PASS.
 *
 * A saida e separar o que o teste precisa do que a plataforma oferece:
 *
 *   macOS e Linux ............. symlink real, sem privilegio.
 *   Windows com Developer Mode  symlink real tambem.
 *   Windows sem privilegio .... junction.
 *
 * A junction serve aqui, e so aqui, porque as duas mecanicas que o produto
 * consulta se comportam identicamente nela:
 *
 *   1. `fs.lstatSync(link).isSymbolicLink()` devolve true
 *      (usado por measureTree, via isDirectory/isRegularFile);
 *   2. `fs.realpathSync(link)` resolve para fora da raiz
 *      (usado por resolvePathInside e resolveAuthorizedImagePath).
 *
 * Isso nao e assumido: `assegurarSemanticaDeLink` verifica as duas na hora da
 * criacao. Se uma versao futura do Windows ou do Node mudar esse
 * comportamento, o teste falha alto em vez de passar sem exercer a regra.
 *
 * A junction NAO e um substituto geral de symlink — ela so existe para
 * diretorio e tem semantica propria de resolucao. Por isso o link de arquivo
 * nao troca de tipo: ele e modelado atravessando um diretorio ligado, que
 * produz exatamente o mesmo escape de containment sem precisar de privilegio.
 */

let capacidadesEmCache = null

function detectarCapacidades() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-link-cap-'))
  const alvoDiretorio = path.join(base, 'alvo-dir')
  const alvoArquivo = path.join(base, 'alvo-arquivo.txt')
  fs.mkdirSync(alvoDiretorio)
  fs.writeFileSync(alvoArquivo, 'alvo', 'utf8')

  const consegue = (destino, nome, tipo) => {
    try {
      fs.symlinkSync(destino, path.join(base, nome), tipo)
      return true
    } catch {
      return false
    }
  }

  try {
    return {
      symlinkDeDiretorio: consegue(alvoDiretorio, 'teste-dir', 'dir'),
      symlinkDeArquivo: consegue(alvoArquivo, 'teste-arquivo', 'file'),
      junction: consegue(alvoDiretorio, 'teste-junction', 'junction'),
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
}

/** Capacidades reais desta maquina, medidas uma vez por processo. */
function capacidadesDeLink() {
  if (!capacidadesEmCache) capacidadesEmCache = detectarCapacidades()
  return capacidadesEmCache
}

/**
 * Garante que o link criado tem as duas propriedades das quais o produto
 * depende. Sem isto, uma fixture degradada passaria despercebida e o teste
 * viraria verde sem exercer a regra.
 */
function assegurarSemanticaDeLink(caminho, destino, tipo) {
  const estado = fs.lstatSync(caminho)
  if (!estado.isSymbolicLink()) {
    throw new Error(
      `Fixture de link invalida: ${tipo} em ${caminho} nao e reportado como ` +
        'reparse point por lstat, entao nao modela o caso sob teste.',
    )
  }

  const resolvido = fs.realpathSync(caminho)
  const esperado = fs.realpathSync(destino)
  if (resolvido !== esperado) {
    throw new Error(
      `Fixture de link invalida: ${tipo} em ${caminho} resolve para ` +
        `${resolvido}, e nao para ${esperado}.`,
    )
  }
}

/**
 * Cria um link de diretorio em `caminho` apontando para `destino`, usando o
 * recurso mais fiel que a plataforma permitir. Devolve o tipo efetivamente
 * usado para o teste poder registrar no relatorio o que foi exercido.
 */
function criarLinkDeDiretorio(destino, caminho) {
  const capacidades = capacidadesDeLink()
  const tipo = capacidades.symlinkDeDiretorio
    ? 'dir'
    : capacidades.junction
      ? 'junction'
      : null

  if (!tipo) {
    throw new Error(
      'Nenhuma forma de link de diretorio esta disponivel nesta plataforma; ' +
        'o teste de containment nao pode ser modelado aqui.',
    )
  }

  fs.symlinkSync(destino, caminho, tipo)
  assegurarSemanticaDeLink(caminho, destino, tipo)
  return { tipo }
}

/**
 * Devolve um caminho dentro de `dentro` que resolve para `arquivoExterno`,
 * que esta fora dela. Usa symlink de arquivo quando a plataforma permite; no
 * Windows sem privilegio, liga o diretorio que contem o arquivo e devolve o
 * caminho atraves dele. Nos dois casos `realpath` sai da raiz, que e a regra
 * que os chamadores verificam.
 */
function criarCaminhoDeArquivoQueEscapa({ dentro, arquivoExterno, nome }) {
  const capacidades = capacidadesDeLink()

  if (capacidades.symlinkDeArquivo) {
    const caminho = path.join(dentro, nome ?? path.basename(arquivoExterno))
    fs.symlinkSync(arquivoExterno, caminho, 'file')
    assegurarSemanticaDeLink(caminho, arquivoExterno, 'file')
    return { caminho, tipo: 'file' }
  }

  const diretorioLigado = path.join(dentro, 'diretorio-externo')
  const { tipo } = criarLinkDeDiretorio(path.dirname(arquivoExterno), diretorioLigado)
  return {
    caminho: path.join(diretorioLigado, path.basename(arquivoExterno)),
    tipo,
  }
}

module.exports = {
  capacidadesDeLink,
  criarLinkDeDiretorio,
  criarCaminhoDeArquivoQueEscapa,
}

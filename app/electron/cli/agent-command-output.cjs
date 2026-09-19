'use strict'

/**
 * @module agent-command-output
 * Como o plano do Fetch All vira texto para um agente ler.
 *
 * Separado do executável de propósito: aqui não há disco, processo nem
 * `process.exit`, então o formato tem teste de verdade. O executável só junta
 * as peças.
 *
 * O texto é escrito para um leitor que decide o que fazer a seguir, não para um
 * humano admirar: primeiro o número, depois a lista, e sempre a frase que diz
 * o que o próprio agente **não** pode fazer.
 */

const { REPO_STATE_LABELS } = require('../services/fetch-all/repo-analyzer.cjs')

/** Frase que fecha toda saída de varredura. É a regra do produto, não enfeite. */
const AVISO_ESCRITA =
  'Escrita (pull/push/commit) não acontece por este comando. Use ' +
  '`felixo fetch-all pedir-execucao` para deixar um pedido; quem confirma é a ' +
  'pessoa, no painel do Fetch All.'

/**
 * Resume o plano em texto.
 *
 * @param {object} plano - o `plan` devolvido pelo serviço.
 * @param {object} [extras]
 * @param {string} [extras.modo] - como a varredura foi feita (cache ou completa).
 * @param {string} [extras.relatorio] - caminho do relatório Markdown gravado.
 * @returns {string}
 */
function formatarPlano(plano, extras = {}) {
  if (!plano || typeof plano !== 'object') {
    return 'Nenhum plano disponível. Rode `felixo fetch-all varrer` primeiro.'
  }

  const linhas = [
    `Fetch All — ${plano.total ?? 0} repositório(s) analisado(s)${
      extras.modo ? ` (varredura ${extras.modo})` : ''
    }`,
    '',
    `  em dia:        ${contar(plano.upToDate)}`,
    `  precisam pull: ${contar(plano.toPull)}`,
    `  precisam push: ${contar(plano.toPush)}`,
    `  com problema:  ${contar(plano.problems)}`,
  ]

  for (const [titulo, lista] of [
    ['Precisam de pull', plano.toPull],
    ['Precisam de push', plano.toPush],
    ['Com problema', plano.problems],
  ]) {
    const itens = Array.isArray(lista) ? lista : []

    if (itens.length === 0) {
      continue
    }

    linhas.push('', `${titulo}:`)
    for (const repositorio of itens) {
      linhas.push(`  - ${descreverRepositorio(repositorio)}`)
    }
  }

  if (extras.relatorio) {
    linhas.push('', `Relatório completo: ${extras.relatorio}`)
  }

  linhas.push('', AVISO_ESCRITA)
  return linhas.join('\n')
}

/**
 * Uma linha por repositório: caminho, estado legível e o que está pendente.
 *
 * @param {object} repositorio
 * @returns {string}
 */
function descreverRepositorio(repositorio) {
  const rotulo = REPO_STATE_LABELS[repositorio?.state] ?? repositorio?.state ?? 'desconhecido'
  const detalhes = []

  if (repositorio?.behind > 0) detalhes.push(`${repositorio.behind} atrás`)
  if (repositorio?.ahead > 0) detalhes.push(`${repositorio.ahead} à frente`)
  if (repositorio?.branch) detalhes.push(repositorio.branch)

  const sufixo = detalhes.length > 0 ? ` (${detalhes.join(', ')})` : ''
  return `${repositorio?.path ?? '?'} — ${rotulo}${sufixo}`
}

/**
 * @param {unknown} lista
 * @returns {number}
 */
function contar(lista) {
  return Array.isArray(lista) ? lista.length : 0
}

/**
 * Uma linha por elemento do canvas: id (pra usar em `canvas ler`), tipo e
 * rótulo. `leituraSuportada:false` fica marcado — evita que o agente tente
 * ler um tipo ainda sem suporte só pra descobrir isso na segunda chamada.
 *
 * @param {Array<{ id: string, type: string, label: string, leituraSuportada: boolean }>} elementos
 * @returns {string}
 */
function formatarElementos(elementos) {
  if (!Array.isArray(elementos) || elementos.length === 0) {
    return 'Nenhum elemento neste canvas.'
  }

  const linhas = elementos.map((item) => {
    const aviso = item.leituraSuportada ? '' : '  (leitura ainda não suportada nesta fatia)'
    return `  ${item.id}  [${item.type}]  ${item.label}${aviso}`
  })
  return [`${elementos.length} elemento(s) no canvas:`, '', ...linhas].join('\n')
}

/**
 * @param {{ ok: boolean, id: string, type?: string, label?: string, content?: string, message?: string }} resultado
 * @returns {string}
 */
function formatarLeitura(resultado) {
  if (!resultado?.ok) {
    return `Não foi possível ler "${resultado?.id}": ${resultado?.message ?? 'motivo desconhecido'}.`
  }

  const cabecalho = `${resultado.label ?? resultado.id} [${resultado.type}]`
  const partes = [cabecalho, ''.padStart(cabecalho.length, '─'), resultado.content || '(vazio)']
  if (resultado.message) partes.push('', resultado.message)
  return partes.join('\n')
}

/** Texto de ajuda. É a primeira coisa que um agente lê ao descobrir o comando. */
const AJUDA = `felixo fetch-all — varre os repositórios git da máquina e reporta o que está fora de sincronia.

  felixo fetch-all varrer [--cache] [--json] [--todos-discos]
      Analisa os repositórios e imprime o plano. Só lê; não escreve em nada.
      --cache  reaproveita a lista de repositórios da última varredura completa.
      --json   imprime o plano cru, para processar em vez de ler.
      --todos-discos  confirma explicitamente a varredura ampla quando não há
                      raízes configuradas; sem esta opção, configure uma raiz.

  felixo fetch-all estado [--json]
      Mostra o plano da última varredura, sem varrer de novo.

  felixo fetch-all pedir-execucao [--com-commit]
      Deixa um pedido para o app aplicar o plano (pull/push). A pessoa confirma
      no painel do Fetch All; este comando nunca escreve por conta própria.
      --com-commit  inclui no pedido os repositórios cuja única pendência é commitar.

  felixo fetch-all ver-pedido <id> [--json]
      Diz se um pedido já foi confirmado, recusado ou continua esperando.

  felixo browser open <url> [--embedded] [--json]
      Pede ao app para abrir uma página no navegador do sistema. Com
      --embedded, a página vira um bloco Webpage persistido no canvas.

  felixo browser status <id> [--json]
      Mostra o desfecho de um pedido de abertura.

  felixo context read <nome-do-artefato>
      Lê um artefato temporário pelo nome portátil. Também aceito:
      felixo contexto ler <nome-do-artefato>.

  felixo canvas listar [--json]
      Lista os elementos do canvas desta instância (terminais, notas,
      arquivos, páginas...), com o id que "canvas ler" usa. Só leitura; não
      precisa de confirmação — o app responde na hora.

  felixo canvas ler <id> [--json]
      Lê o conteúdo de um elemento: terminal (últimas linhas, redigidas),
      nota (Markdown) ou arquivo. Outros tipos ainda não têm leitura nesta
      fatia da task, e o comando diz isso em vez de falhar sem explicação.

  felixo canvas escrever <id> <conteúdo> [--json]
      Pede para substituir o conteúdo de uma nota. NUNCA escreve sozinho:
      fica pendente até a pessoa confirmar no painel "Pedidos de escrita" do
      canvas — este comando só registra o pedido e devolve na hora, sem
      esperar a confirmação. Só "note" aceita escrita nesta fatia.

  felixo perguntar "<pergunta>" "<opção 1>" "<opção 2>" [... até 4] [--json]
      Faz uma pergunta com 2 a 4 opções e BLOQUEIA até a pessoa clicar numa
      delas no diálogo do app; imprime o texto da opção escolhida (código 0).
      Código 3 = a pessoa dispensou a pergunta; código 1 = ninguém respondeu em
      5 minutos (o id do pedido fica no texto, para conferir depois com
      "felixo canvas ver-pedido <id>"). Quem responde é sempre uma pessoa.

  felixo canvas ver-pedido <id> [--json]
      Confere o desfecho de um pedido de canvas (leitura ou escrita).

  Também são aceitos os equivalentes em português: navegador abrir,
  navegador ver-pedido e --embutido.

${AVISO_ESCRITA}`

/** Ajuda do leitor portátil de artefatos temporários de contexto. */
const AJUDA_CONTEXT = `felixo context read <nome-do-artefato>
    Lê um artefato temporário somente leitura criado pelo Felixo no perfil
    ativo. O nome é portátil entre Linux, macOS e Windows; não use nem peça
    um caminho absoluto de outra máquina ou perfil.

Também aceito em português: felixo contexto ler <nome-do-artefato>.`

module.exports = {
  AJUDA,
  AJUDA_CONTEXT,
  AVISO_ESCRITA,
  descreverRepositorio,
  formatarElementos,
  formatarLeitura,
  formatarPlano,
}

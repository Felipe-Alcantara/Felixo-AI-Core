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

  felixo browser open <url> [--embedded] [--profile=<nome>] [--json]
      Pede ao app para abrir uma página. NUNCA abre sozinho: o app mostra o
      pedido e a pessoa escolhe entre o navegador do sistema, um bloco Página
      Web no canvas ou recusar. Sem flag, a sugestão é o navegador; com
      --embedded, a Página Web; com --profile=<nome> (só junto de
      --embedded) o bloco abre nesse perfil do navegador interno — logins
      separados por perfil. "Padrão" é o perfil que já existia. Perfil
      inexistente falha na hora em vez de cair no Padrão. Devolve na hora,
      sem esperar a escolha. O pedido expira em 1 h sem resposta.

  felixo browser status <id> [--json]
      Mostra o desfecho de um pedido de abertura: esperando a pessoa, aberto
      (no navegador ou na Página Web) ou recusado, e por quem. Só "recusado
      pela pessoa" (recusadoPor "pessoa" no --json) é resposta dela: não
      repita o pedido sem ela pedir. "recusado pelo app" (recusadoPor "app")
      traz o motivo — URL, perfil, formato — e não é resposta dela. "expirou"
      = ninguém respondeu em 1 h.

  felixo browser click <id-do-bloco> <x> <y> [--json]
  felixo browser type <id-do-bloco> "<texto>" [--json]
  felixo browser scroll <id-do-bloco> <dy> [--json]
  felixo browser key <id-do-bloco> <Enter|Tab|Escape|Backspace|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End> [--json]
      scroll rola dy pixels na vertical (positivo desce); key aperta uma tecla da lista
      fechada. Mesma sessão curta; Enter ou outra tecla com foco em campo de senha ou
      pagamento pede confirmação da pessoa. Depois de rolar, rode "read" de novo.
      Agem num bloco Página Web, só dentro de uma SESSÃO CURTA (5 min) que a
      pessoa abre no cartão do app. Sem sessão, o comando BLOQUEIA até ela
      permitir (5 min); com sessão, age na hora. click usa x,y em pixels CSS
      da página (os retângulos de "read"); type digita no campo em foco, então
      clique nele antes. Campo de senha ou de pagamento pede uma confirmação
      da pessoa a cada digitação, mesmo na sessão. O texto digitado nunca
      volta nem fica registrado. Recusa da pessoa dá código 3: não repita.

  felixo browser capture <id-do-bloco> [--json]
  felixo browser read <id-do-bloco> [--json]
  felixo browser logs <id-do-bloco> [--json]
  felixo browser script add "<nome>" --match=<padrão>[,<padrão>] --arquivo=<script.js> [--mundo=pagina|isolado]
  felixo browser script list [--json]
  felixo browser script remove|enable|disable <id-do-script>
      "Tampermonkey nativo": scripts de usuário que o app injeta em TODA página aberta num
      bloco Página Web cujo endereço case com o --match (esquema://host/caminho, * curinga;
      ex.: "https://*.exemplo.com/*"), quando o DOM fica pronto. Escreva o script num arquivo
      e passe com --arquivo. "add" NUNCA instala sozinho: a pessoa lê o código e o alcance
      no painel de aprovações e aceita (acompanhe com "felixo browser status <id>"). O
      script roda dentro da página, com a sessão que ela tiver; --mundo=isolado limita a
      mexer no que se vê. Disponíveis: GM_addStyle(css) e GM_log(...). Erros e execuções
      aparecem em "felixo browser logs". remove/enable/disable o app atende sozinho.
  felixo browser dom <id-do-bloco> [--seletor=<css>] [--profundidade=N] [--json]
      Olham um bloco Página Web (o id vem de "felixo canvas listar"): capture
      salva um PNG da página e diz o caminho, o tamanho e o devicePixelRatio;
      read lista os elementos interativos (papel, nome e retângulo em pixels
      CSS da página, para achar onde algo está) e o texto visível. BLOQUEIAM
      até a pessoa permitir no cartão do app (5 min): a página pode estar
      logada como ela, então cada pedido vale uma vez. Só olham: não clicam,
      não digitam, não leem cookies, senhas nem valores de campos, e tokens
      saem redigidos. Código 3 = recusado (se foi a pessoa, não repita sem ela
      pedir); código 1 = ninguém respondeu a tempo.
      dom devolve a estrutura COMPLETA da página para estudar o front: até 2000 elementos
      com tag, id, classes, atributos, texto próprio, retângulo e estilos calculados, mais
      folhas de estilo, scripts e iframes. Salva o JSON inteiro em arquivo e imprime a
      árvore resumida; --seletor foca num trecho e --profundidade (1 a 40) limita a descida.
      Não lê valor de campo, conteúdo de script nem atributos de campo de senha ou pagamento.
      logs devolve as últimas 200 entradas de console, navegação e falha de carga
      do bloco (segredos redigidos; sem rede, cookies nem senhas). Passo a passo:
      skill "Controlar uma página web do canvas".

  felixo context read <nome-do-artefato>
      Lê um artefato temporário pelo nome portátil. Também aceito:
      felixo contexto ler <nome-do-artefato>.

  felixo revisao enviar|pendentes|ler|aprovar|recusar|status
      Pareamento produtor x checador: o resultado do produtor só sai depois de o
      checador aprovar; a recusa grava o motivo. Detalhes: felixo revisao.

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

  felixo canvas abrir-agentes "<task 1>" "<task 2>" ... [--json]
      Coordenador: pede um agente por task (a primeira linha de cada task é o
      título; o resto é o contexto). Máximo de 20 tasks por pedido. NUNCA abre
      sozinho: fica pendente até a pessoa aceitar no painel de aprovações do
      canvas, e o app respeita "Agentes por rodada" e "Agentes no total" do
      orquestrador; o excedente é recusado e o desfecho diz quais, para você
      pedir de novo na rodada seguinte. O comando só registra e devolve na
      hora. Você coordena: não execute nenhuma dessas tasks.

  felixo canvas ver-pedido <id> [--json]
      Confere o desfecho de um pedido de canvas (leitura, escrita ou agentes).

  Também são aceitos os equivalentes em português: navegador abrir,
  navegador ver-pedido e --embutido.

${AVISO_ESCRITA}`

/** Ajuda do leitor portátil de artefatos temporários de contexto. */
const AJUDA_CONTEXT = `felixo context read <nome-do-artefato>
    Lê um artefato temporário somente leitura criado pelo Felixo no perfil
    ativo. O nome é portátil entre Linux, macOS e Windows; não use nem peça
    um caminho absoluto de outra máquina ou perfil.
    Se o terminal que recebeu o artefato já foi encerrado, o comando recupera
    sozinho a cópia que o app guarda por 30 dias e avisa disso no topo da saída.

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

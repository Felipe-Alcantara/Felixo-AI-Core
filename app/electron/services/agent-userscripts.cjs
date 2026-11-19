'use strict'

/**
 * @module agent-userscripts
 * "Tampermonkey nativo": scripts de usuário que rodam em toda página aberta
 * num bloco Página Web do canvas cujo endereço case com um padrão `@match`.
 *
 * Por que não o Tampermonkey de loja: ele depende da API `userScripts` do
 * Chrome, que o Electron não tem. Aqui o app guarda os scripts e injeta em
 * cada webview quando o DOM fica pronto (`dom-ready`), no mundo da página
 * (podem mexer nas variáveis dela, como no Tampermonkey) ou num mundo isolado.
 *
 * Um agente propõe o script (`felixo browser script add`); ele só é gravado e
 * só roda depois de a pessoa ler o código e aceitar. Roda com os dados da
 * página aberta (logada como ela), por isso o cartão mostra o código e o
 * alcance (`@match`) antes de qualquer coisa.
 */

const fs = require('node:fs')

const MAX_SCRIPTS = 50
const NOME_MAX = 60
const CODIGO_MAX = 100_000
const MATCH_MAX = 10
const PADRAO_MAX = 200
const MUNDOS = ['pagina', 'isolado']
/** Mundo isolado dos scripts de usuário (distinto do da leitura de DOM e das ações). */
const MUNDO_ISOLADO_SCRIPTS = 1158

/**
 * Padrão `@match` ao estilo do Tampermonkey: `esquema://host/caminho` com `*`
 * como curinga. Devolve a RegExp, ou lança com o motivo.
 *
 * - esquema: `http`, `https` ou `*` (os dois; nunca `file`, `data` nem `javascript`);
 * - host: `*` (qualquer), `*.exemplo.com` (o domínio e os subdomínios) ou exato, com porta opcional;
 * - caminho: obrigatório, com `*` casando qualquer trecho.
 */
function compilarPadrao(padrao) {
  if (typeof padrao !== 'string' || padrao.length === 0 || padrao.length > PADRAO_MAX) {
    throw new Error(`Padrão @match inválido (texto de 1 a ${PADRAO_MAX} caracteres).`)
  }
  const partes = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(padrao)
  if (!partes) {
    throw new Error(`Padrão @match inválido: "${padrao}". Use esquema://host/caminho, por exemplo https://*.exemplo.com/*.`)
  }
  const [, esquema, host, caminho] = partes
  if (!/^(\*|\*\.[a-z0-9.-]+|[a-z0-9.-]+)(:\d{1,5})?$/i.test(host)) {
    throw new Error(`Host inválido no padrão @match: "${host}".`)
  }
  const escapar = (texto) => texto.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const esquemaRe = esquema === '*' ? 'https?' : esquema
  let hostRe
  if (host === '*') hostRe = '[^/]+'
  else if (host.startsWith('*.')) hostRe = `([^/.]+\\.)*${escapar(host.slice(2))}`
  else hostRe = escapar(host)
  const caminhoRe = caminho.split('*').map(escapar).join('.*')
  return new RegExp(`^${esquemaRe}:\\/\\/${hostRe}${caminhoRe}$`, 'i')
}

/** Alcance em linguagem humana, para o cartão: "todas as páginas" é dito com todas as letras. */
function descreverAlcance(matches) {
  return matches.some((m) => /^(\*|https?):\/\/\*\/\*$/.test(m)) ? 'TODAS as páginas web' : matches.join(', ')
}

function casaUrl(matches, url) {
  let alvo
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    alvo = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`
  } catch {
    return false
  }
  return matches.some((padrao) => {
    try {
      return compilarPadrao(padrao).test(alvo)
    } catch {
      return false
    }
  })
}

/** Valida o que um agente propôs e devolve o registro normalizado (ainda sem id). */
function normalizarScript(dados) {
  const nome = typeof dados?.nome === 'string' ? dados.nome.trim() : ''
  if (!nome || nome.length > NOME_MAX) throw new Error(`Dê um nome ao script (até ${NOME_MAX} caracteres).`)
  const brutos = Array.isArray(dados?.match) ? dados.match : []
  if (brutos.length === 0 || brutos.length > MATCH_MAX) throw new Error(`Informe de 1 a ${MATCH_MAX} padrões @match.`)
  const match = brutos.map((m) => String(m).trim())
  match.forEach(compilarPadrao)
  const codigo = typeof dados?.codigo === 'string' ? dados.codigo : ''
  if (!codigo.trim()) throw new Error('O script está vazio.')
  if (codigo.length > CODIGO_MAX) throw new Error(`Script grande demais (máximo ${CODIGO_MAX} caracteres).`)
  const mundo = dados?.mundo === undefined ? 'pagina' : String(dados.mundo)
  if (!MUNDOS.includes(mundo)) throw new Error(`Mundo inválido: "${mundo}". Aceitos: ${MUNDOS.join(', ')}.`)
  return { nome, match, codigo, mundo }
}

/** Código que roda na página: erro do script vai ao console (aparece em `browser logs`), nunca derruba a página. */
function embrulhar(script) {
  // O nome vem de um agente: entra no código só como literal JSON, nunca colado em um template.
  const rotulo = JSON.stringify(`[felixo-script ${script.nome}]`)
  return [
    '(function () {',
    '  try {',
    `    const GM_log = (...a) => console.log(${rotulo}, ...a)`,
    "    const GM_addStyle = (css) => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s }",
    script.codigo,
    '  } catch (erro) {',
    `    console.error(${rotulo}, 'erro:', erro)`,
    '  }',
    '})()',
    `//# sourceURL=felixo-userscript-${script.id}`,
  ].join('\n')
}

/**
 * @param {{ arquivo: string, sistemaDeArquivos?: typeof fs }} opcoes
 */
function criarGerenciadorDeScripts({ arquivo, sistemaDeArquivos = fs }) {
  function ler() {
    try {
      const dados = JSON.parse(sistemaDeArquivos.readFileSync(arquivo, 'utf8'))
      return Array.isArray(dados?.scripts) ? dados.scripts : []
    } catch {
      return []
    }
  }

  function gravar(scripts) {
    sistemaDeArquivos.mkdirSync(require('node:path').dirname(arquivo), { recursive: true })
    sistemaDeArquivos.writeFileSync(arquivo, `${JSON.stringify({ scripts }, null, 2)}\n`, 'utf8')
  }

  return {
    listar: ler,
    adicionar(dados, { agora = new Date(), novoId = () => Math.random().toString(36).slice(2, 10) } = {}) {
      const script = normalizarScript(dados)
      const scripts = ler()
      if (scripts.length >= MAX_SCRIPTS) throw new Error(`Limite de ${MAX_SCRIPTS} scripts instalados: remova algum antes.`)
      const registro = { id: `us-${novoId()}`, ...script, ativo: true, instaladoEm: agora.toISOString() }
      gravar([...scripts, registro])
      return registro
    },
    remover(id) {
      const scripts = ler()
      if (!scripts.some((s) => s.id === id)) return false
      gravar(scripts.filter((s) => s.id !== id))
      return true
    },
    definirAtivo(id, ativo) {
      const scripts = ler()
      if (!scripts.some((s) => s.id === id)) return false
      gravar(scripts.map((s) => (s.id === id ? { ...s, ativo } : s)))
      return true
    },
    paraUrl: (url) => ler().filter((s) => s.ativo && casaUrl(s.match, url)),
  }
}

/** @type {ReturnType<typeof criarGerenciadorDeScripts> | null} */
let gerenciadorAtual = null
function definirGerenciador(gerenciador) {
  gerenciadorAtual = gerenciador
}

/** Roda num webContents os scripts que casam com o endereço dele. Devolve quantos rodaram. */
async function executarScriptsEm(wc, gerenciador = gerenciadorAtual, aoRodar = () => {}) {
  if (!gerenciador || !wc || wc.isDestroyed?.()) return 0
  const url = wc.getURL?.() ?? ''
  let rodados = 0
  for (const script of gerenciador.paraUrl(url)) {
    try {
      const codigo = embrulhar(script)
      if (script.mundo === 'isolado') await wc.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO_SCRIPTS, [{ code: codigo }])
      else await wc.executeJavaScript(codigo)
      rodados += 1
      aoRodar(wc, script)
    } catch (erro) {
      aoRodar(wc, script, erro)
    }
  }
  return rodados
}

/** Liga a injeção a um webview: roda os scripts quando o DOM da página fica pronto. */
function observarScripts(wc, aoRodar) {
  if (!wc || typeof wc.on !== 'function') return
  wc.on('dom-ready', () => void executarScriptsEm(wc, gerenciadorAtual, aoRodar))
}

module.exports = {
  CODIGO_MAX,
  MAX_SCRIPTS,
  MUNDOS,
  casaUrl,
  compilarPadrao,
  criarGerenciadorDeScripts,
  definirGerenciador,
  descreverAlcance,
  embrulhar,
  executarScriptsEm,
  normalizarScript,
  observarScripts,
}

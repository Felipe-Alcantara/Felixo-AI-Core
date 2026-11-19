'use strict'

/**
 * @module agent-webpage-structure
 * A estrutura COMPLETA de uma página (todos os elementos, não só os clicáveis),
 * para o agente estudar o front: tag, id, classes, atributos úteis, texto
 * próprio, retângulo e um punhado de estilos calculados. Só leitura, lida no
 * mundo isolado, como o `read`.
 *
 * O que nunca sai: valor de campo, conteúdo de `<script>` e `<style>` (só o
 * endereço do recurso), atributo de campo de senha ou de pagamento (o nó
 * entra marcado como sensível, sem nome) e endereços com token (redigidos).
 */

const { redactSensitiveText } = require('./git-secret-redaction.cjs')
const { enderecoSemSegredo } = require('./agent-webpage-inspect.cjs')
const { classificarCampo } = require('./agent-webpage-field.cjs')

const NOS_MAX = 2000
const PROFUNDIDADE_PADRAO = 14
const PROFUNDIDADE_MAX = 40
const SELETOR_MAX = 200
const OUTLINE_LINHAS = 120

/** Roda na página (via `toString`): sem acesso a nada fora dos argumentos. */
function lerEstruturaNaPagina(limites, classificar) {
  const IGNORAR_CONTEUDO = new Set(['script', 'style', 'noscript', 'template'])
  const ATRIBUTOS = ['role', 'aria-label', 'aria-labelledby', 'aria-expanded', 'aria-hidden', 'name', 'type', 'href', 'src', 'alt', 'title', 'placeholder', 'for', 'rel', 'target', 'action', 'method', 'lang', 'contenteditable', 'disabled', 'checked']
  const ESTILOS = ['display', 'position', 'z-index', 'color', 'background-color', 'font-size', 'font-weight', 'opacity', 'overflow']
  const raiz = limites.seletor ? document.querySelector(limites.seletor) : document.documentElement
  if (!raiz) return { erro: `Nenhum elemento casa com o seletor "${limites.seletor}".` }

  const nos = []
  let truncado = false
  const visitar = (el, pai, prof, noShadow) => {
    if (nos.length >= limites.nos) {
      truncado = true
      return
    }
    const tag = el.tagName.toLowerCase()
    const tipo = (el.getAttribute('type') || '').toLowerCase()
    const sensivel = classificar({
      tag,
      type: tipo,
      autocomplete: el.getAttribute('autocomplete'),
      name: el.getAttribute('name'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
    })
    const r = el.getBoundingClientRect()
    const css = getComputedStyle(el)
    const no = { i: nos.length, p: pai, prof, tag }
    if (noShadow) no.shadow = true
    if (sensivel) {
      no.sensivel = sensivel
    } else {
      if (el.id) no.id = el.id
      const classes = [...el.classList].slice(0, 8)
      if (classes.length) no.classes = classes
      const attrs = {}
      for (const nome of ATRIBUTOS) {
        const valor = el.getAttribute(nome)
        if (valor !== null) attrs[nome] = valor.slice(0, 200)
      }
      for (const nome of el.getAttributeNames()) {
        if (nome.startsWith('data-') && Object.keys(attrs).length < 24) attrs[nome] = (el.getAttribute(nome) || '').slice(0, 80)
      }
      if (Object.keys(attrs).length) no.attrs = attrs
      if (!IGNORAR_CONTEUDO.has(tag)) {
        const proprio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join(' ').replace(/\s+/g, ' ').trim()
        if (proprio) no.texto = proprio.slice(0, 120)
      }
    }
    no.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    no.estilo = {}
    for (const prop of ESTILOS) no.estilo[prop] = css.getPropertyValue(prop)
    nos.push(no)
    if (IGNORAR_CONTEUDO.has(tag) || sensivel || prof >= limites.profundidade) return
    if (el.shadowRoot) for (const filho of el.shadowRoot.children) visitar(filho, no.i, prof + 1, true)
    for (const filho of el.children) visitar(filho, no.i, prof + 1, false)
  }
  visitar(raiz, -1, 0, false)

  const recursos = {
    meta: [...document.querySelectorAll('head meta')].slice(0, 40).map((m) => ({ nome: m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || '', conteudo: (m.getAttribute('content') || '').slice(0, 160) })).filter((m) => m.nome),
    estilos: [...document.querySelectorAll('link[rel~="stylesheet"]')].slice(0, 40).map((l) => l.href),
    scripts: [...document.querySelectorAll('script[src]')].slice(0, 60).map((s) => s.src),
    iframes: [...document.querySelectorAll('iframe')].slice(0, 20).map((f) => f.src || '(sem src)'),
  }
  return {
    viewport: { largura: window.innerWidth, altura: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    titulo: document.title,
    idioma: document.documentElement.lang || '',
    nos,
    truncado,
    recursos,
  }
}

/** Passa o retrato pela redação: texto e endereços saem sem token. */
function redigirEstrutura(dom, redact = redactSensitiveText) {
  const endereco = (v) => (/^data:/i.test(v) ? 'data:…' : enderecoSemSegredo(v))
  return {
    ...dom,
    titulo: redact(dom.titulo ?? ''),
    nos: dom.nos.map((no) => ({
      ...no,
      ...(no.texto ? { texto: redact(no.texto) } : {}),
      ...(no.attrs
        ? {
            attrs: Object.fromEntries(
              Object.entries(no.attrs).map(([k, v]) => [k, k === 'href' || k === 'src' || k === 'action' ? endereco(String(v)) : redact(String(v))]),
            ),
          }
        : {}),
    })),
    recursos: {
      meta: dom.recursos.meta.map((m) => ({ nome: m.nome, conteudo: redact(m.conteudo) })),
      estilos: dom.recursos.estilos.map(endereco),
      scripts: dom.recursos.scripts.map(endereco),
      iframes: dom.recursos.iframes.map(endereco),
    },
  }
}

/** Uma linha por nó, com recuo pela profundidade: o agente lê a árvore sem abrir o arquivo. */
function resumoEmArvore(nos, linhas = OUTLINE_LINHAS) {
  return nos.slice(0, linhas).map((no) => {
    const marca = `${no.tag}${no.id ? `#${no.id}` : ''}${no.classes?.length ? `.${no.classes.slice(0, 3).join('.')}` : ''}`
    const extra = [no.sensivel ? `[campo ${no.sensivel}]` : '', no.texto ? `"${no.texto.slice(0, 50)}"` : '', no.rect ? `${no.rect.x},${no.rect.y} ${no.rect.w}x${no.rect.h}` : ''].filter(Boolean).join(' ')
    return `${'  '.repeat(no.prof)}${marca}${extra ? ` ${extra}` : ''}`
  })
}

/** O seletor vai para dentro de `querySelector`: só texto de tamanho razoável, sem controle. */
function seletorValido(valor) {
  return typeof valor === 'string' && valor.trim() !== '' && valor.length <= SELETOR_MAX && !/[\u0000-\u001f]/.test(valor)
}

const CODIGO_ESTRUTURA = (limites) =>
  `(${lerEstruturaNaPagina.toString()})(${JSON.stringify(limites)}, ${classificarCampo.toString()})`

module.exports = {
  CODIGO_ESTRUTURA,
  NOS_MAX,
  PROFUNDIDADE_MAX,
  PROFUNDIDADE_PADRAO,
  SELETOR_MAX,
  lerEstruturaNaPagina,
  redigirEstrutura,
  resumoEmArvore,
  seletorValido,
}

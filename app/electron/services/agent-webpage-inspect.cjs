'use strict'

/**
 * @module agent-webpage-inspect
 * O que um agente pode ver de um bloco Página Web depois que a pessoa permitiu:
 * uma captura de tela ou um retrato do DOM. Só leitura — nada aqui clica,
 * digita, navega nem alcança cookie, storage ou cabeçalho.
 *
 * O DOM é lido num mundo isolado (`executeJavaScriptInIsolatedWorld`): a
 * página, que pode ser hostil, não enxerga o script nem troca os métodos que
 * ele usa. Valor de campo (`value`) nunca é lido; campo de senha entra na
 * lista só como "sensível", sem nome. Tudo o que vai ao agente passa pela
 * redação de segredos.
 */

const fs = require('node:fs')
const path = require('node:path')

const { redactSensitiveText } = require('./git-secret-redaction.cjs')
const { redactUrlSecrets } = require('./url-secret-redaction.cjs')
const { classificarCampo } = require('./agent-webpage-field.cjs')

const ELEMENTOS_MAX = 200
const TEXTO_MAX = 8000
const NOME_MAX = 120
/** Mundo isolado só deste recurso, longe do mundo da página e dos de outras extensões. */
const MUNDO_ISOLADO = 1157

const NAO_E_BLOCO = 'Esse bloco não é uma Página Web carregada neste app.'

/**
 * Confere que o webContents é mesmo um <webview> da janela principal. O id vem
 * do renderer (que mostrou o cartão), então nunca basta existir: sem isto, um
 * id de outra janela ou do próprio app seria capturado e lido.
 *
 * @param {any} guest
 * @param {any} janelaPrincipal
 */
function guestValido(guest, janelaPrincipal) {
  if (!guest || guest.isDestroyed?.()) return false
  if (guest.getType?.() !== 'webview') return false
  const anfitriao = guest.hostWebContents
  return Boolean(anfitriao && janelaPrincipal?.webContents && anfitriao.id === janelaPrincipal.webContents.id)
}

/** A página sem query nem hash: o endereço pode carregar token, e o agente não precisa dele. */
function enderecoSemSegredo(url) {
  return redactUrlSecrets(typeof url === 'string' ? url : '').split('#')[0]
}

/** Roda no mundo isolado da página. Retorna só dados simples (serializável). */
function lerDomNaPagina(limites, classificar) {
  const visivel = (el, r) => {
    if (r.width <= 0 || r.height <= 0) return false
    const css = getComputedStyle(el)
    return css.visibility !== 'hidden' && css.display !== 'none'
  }
  const nomeDe = (el) => {
    const aria = el.getAttribute('aria-label')
    if (aria) return aria
    const ref = el.getAttribute('aria-labelledby')
    if (ref) {
      const texto = ref.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim()
      if (texto) return texto
    }
    if (el.labels && el.labels.length) return Array.from(el.labels).map((l) => l.textContent).join(' ')
    return el.innerText || el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder') || ''
  }
  const seletor = 'a[href],button,input,select,textarea,summary,[role],[tabindex],[contenteditable="true"]'
  const elementos = []
  for (const el of document.querySelectorAll(seletor)) {
    if (elementos.length >= limites.elementos) break
    const r = el.getBoundingClientRect()
    if (!visivel(el, r)) continue
    const tag = el.tagName.toLowerCase()
    const tipo = (el.getAttribute('type') || '').toLowerCase()
    if (tag === 'input' && tipo === 'hidden') continue
    const sensivel = Boolean(
      classificar({
        tag,
        type: tipo,
        autocomplete: el.getAttribute('autocomplete'),
        name: el.getAttribute('name'),
        id: el.id,
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
      }),
    )
    elementos.push({
      tag,
      ...(tipo ? { tipo } : {}),
      papel: el.getAttribute('role') || '',
      nome: sensivel ? '' : String(nomeDe(el)).replace(/\s+/g, ' ').trim().slice(0, limites.nome),
      ...(sensivel ? { sensivel: true } : {}),
      ...(tag === 'a' ? { href: el.href } : {}),
      ...(el.disabled ? { desativado: true } : {}),
      retangulo: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        largura: Math.round(r.width),
        altura: Math.round(r.height),
      },
    })
  }
  return {
    viewport: {
      largura: window.innerWidth,
      altura: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      rolagemX: Math.round(window.scrollX),
      rolagemY: Math.round(window.scrollY),
    },
    titulo: document.title,
    elementos,
    texto: (document.body?.innerText || '').slice(0, limites.texto),
  }
}

/** Passa o retrato pela redação: nada que o agente recebe sai com token. */
function redigirDom(dom, redact = redactSensitiveText) {
  return {
    viewport: dom.viewport,
    titulo: redact(dom.titulo),
    elementos: (dom.elementos ?? []).slice(0, ELEMENTOS_MAX).map((item) => ({
      ...item,
      nome: redact(item.nome),
      ...(item.href ? { href: enderecoSemSegredo(item.href) } : {}),
    })),
    texto: redact(dom.texto),
  }
}

/**
 * @param {{ guest: any, tipo: 'captura' | 'dom', pastaCapturas: string, idDoPedido: string, redact?: Function }} params
 * @returns {Promise<object>} resultado para o pedido (`ok: true` ou `ok: false` com `message`)
 */
async function inspecionarPagina({ guest, tipo, pastaCapturas, idDoPedido, redact }) {
  const url = enderecoSemSegredo(guest.getURL?.())
  if (tipo === 'captura') {
    const imagem = await guest.capturePage()
    const { width, height } = imagem.getSize()
    const dom = await guest.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [
      { code: '({ dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight })' },
    ])
    fs.mkdirSync(pastaCapturas, { recursive: true })
    // O nome vem do id gerado pelo repositório (ID_SEGURO), nunca do agente.
    const arquivo = path.join(pastaCapturas, `${idDoPedido}.png`)
    fs.writeFileSync(arquivo, imagem.toPNG())
    return {
      ok: true,
      tipo,
      url,
      arquivo,
      imagem: { largura: width, altura: height },
      viewport: { largura: dom?.w, altura: dom?.h, devicePixelRatio: dom?.dpr },
    }
  }
  const bruto = await guest.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [
    {
      code: `(${lerDomNaPagina.toString()})(${JSON.stringify({ elementos: ELEMENTOS_MAX, nome: NOME_MAX, texto: TEXTO_MAX })}, ${classificarCampo.toString()})`,
    },
  ])
  return { ok: true, tipo, url, ...redigirDom(bruto, redact) }
}

module.exports = { NAO_E_BLOCO, guestValido, inspecionarPagina, enderecoSemSegredo, redigirDom, lerDomNaPagina }

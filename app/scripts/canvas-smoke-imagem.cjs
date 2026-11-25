'use strict'

/**
 * Popover "Gerar imagem" da sidebar (task 3f491f95-497e-8126-b0ec-fab2a600214a), com o Openia roteirizado
 * (FELIXO_DEVTOOLS_FAKE_OPENIA=1; electron/services/devtools-fake-openia.cjs): nenhuma chamada à OpenRouter nem ao Openia real.
 * O desfecho de cada geração vem de uma marca na descrição: [lento], [saldo], [antigo]; sem marca, gera um PNG.
 *
 * Os cliques são `dispatchEvent` (a janela escondida não entrega RAF).
 */

const { esperar, exigirClique, falhar, prepararJanela, preencher } = require('./canvas-smoke-paineis.cjs')

const POPOVER = '[role="group"][aria-label="Gerar imagem com o Openia"]'
const GATILHO_TEXTO = '^(Gerar imagem|Gerando imagem)'

function ambienteDaImagem() {
  return { FELIXO_DEVTOOLS_FAKE_OPENIA: '1' }
}

// O rodapé conta todos os blocos; `.react-flow__node` só tem os visíveis (o canvas virtualiza).
const CONTAGEM = () => Number.parseInt(document.querySelector('.felixo-statusbar-count')?.textContent ?? '', 10)
const blocos = (page) => page.evaluate(CONTAGEM)
const clicarGatilho = (page) =>
  page.evaluate((fonte) => {
    const botao = [...document.querySelectorAll('.felixo-sidebar-content button')].find((b) => new RegExp(fonte).test(b.textContent?.trim() ?? ''))
    if (!botao) return false
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }, GATILHO_TEXTO)

async function abrirPopover(page) {
  if (!(await clicarGatilho(page))) falhar('gatilho "Gerar imagem" ausente')
  await page.locator(POPOVER).waitFor({ state: 'visible', timeout: 20_000 })
}

/** Espera o texto do popover bater com o padrão. */
const esperarTexto = (page, padrao, mensagem) =>
  esperar(page, ([sel, fonte]) => new RegExp(fonte).test(document.querySelector(sel)?.innerText ?? ''), [POPOVER, padrao.source], mensagem)

async function esperarBlocos(page, esperado, mensagem) {
  await esperar(page, (n) => Number.parseInt(document.querySelector('.felixo-statusbar-count')?.textContent ?? '', 10) === n, esperado, mensagem)
}

/** Depois de um desfecho, a contagem de blocos precisa continuar a mesma: nada de bloco duplicado ou tardio. */
async function blocosEstaveis(page, esperado, mensagem) {
  await page.waitForTimeout(600)
  const atual = await blocos(page)
  if (atual !== esperado) falhar(mensagem, { esperado, atual })
}

async function gerar(page, descricao) {
  await preencher(page, `${POPOVER} textarea`, descricao)
  await exigirClique(page, POPOVER, /^Gerar$/, 'Gerar')
}

const confirmacao = (page) => page.evaluate(() => Boolean(document.querySelector('[aria-label="Confirmar o custo da geração"]')))

async function esperarConfirmacao(page, visivel, mensagem) {
  await esperar(page, (v) => Boolean(document.querySelector('[aria-label="Confirmar o custo da geração"]')) === v, visivel, mensagem)
}

async function checarPopoverGerarImagem(page) {
  await prepararJanela(page)
  const inicial = await blocos(page)
  await abrirPopover(page)

  // Catálogo: a primeira consulta roteirizada falha, "Tentar de novo" consulta de novo.
  await esperarTexto(page, /Tentar de novo/, 'o catálogo que falhou não mostrou "Tentar de novo"')
  await exigirClique(page, POPOVER, /Tentar de novo/, 'Tentar de novo')
  await exigirClique(page, POPOVER, /Escolha o modelo/, 'seletor de modelo')
  await exigirClique(page, '[role="listbox"]', /Modelo roteirizado/, 'modelo roteirizado')
  await esperar(page, () => document.querySelector('[data-image-pricing]')?.getAttribute('data-image-pricing') === 'ready', null, 'o preço do modelo não chegou')

  // Custo: o primeiro Gerar pede confirmação; Voltar não gera nada.
  await gerar(page, 'um gato astronauta')
  await esperarConfirmacao(page, true, 'o primeiro Gerar não pediu a confirmação de custo')
  await exigirClique(page, POPOVER, /^Voltar$/, 'Voltar')
  await esperarConfirmacao(page, false, 'Voltar não fechou a confirmação')
  await blocosEstaveis(page, inicial, 'Voltar da confirmação gerou um bloco')

  // Confirmar e gerar: exatamente um bloco novo.
  await exigirClique(page, POPOVER, /^Gerar$/, 'Gerar')
  await exigirClique(page, POPOVER, /^Confirmar e gerar$/, 'Confirmar e gerar')
  await esperarTexto(page, /Imagem adicionada ao canvas\./, 'a geração não terminou com "Imagem adicionada ao canvas."')
  await esperarBlocos(page, inicial + 1, 'a imagem gerada não entrou no canvas')
  await blocosEstaveis(page, inicial + 1, 'a imagem gerada duplicou o bloco')

  // "Não perguntar de novo para este modelo": o próximo Gerar é direto.
  await exigirClique(page, POPOVER, /^Gerar$/, 'Gerar')
  await esperarConfirmacao(page, true, 'o segundo Gerar não pediu confirmação (ainda não havia lembrado)')
  await page.evaluate(() => {
    document.querySelector('[aria-label="Confirmar o custo da geração"] input[type="checkbox"]')?.click()
  })
  await exigirClique(page, POPOVER, /^Confirmar e gerar$/, 'Confirmar e gerar (lembrando)')
  await esperarBlocos(page, inicial + 2, 'a segunda imagem não entrou no canvas')
  await exigirClique(page, POPOVER, /^Gerar$/, 'Gerar (sem confirmação)')
  await esperarBlocos(page, inicial + 3, 'com a escolha lembrada, o Gerar não gerou direto')
  if (await confirmacao(page)) falhar('a confirmação de custo apareceu apesar de lembrada')
  await blocosEstaveis(page, inicial + 3, 'a geração direta duplicou o bloco')

  // "Voltar a perguntar" restaura a confirmação.
  await exigirClique(page, POPOVER, /^Voltar a perguntar$/, 'Voltar a perguntar')
  await exigirClique(page, POPOVER, /^Gerar$/, 'Gerar')
  await esperarConfirmacao(page, true, 'Voltar a perguntar não restaurou a confirmação')
  await exigirClique(page, POPOVER, /^Voltar$/, 'Voltar')

  // Cancelar no meio: nenhum bloco entra.
  await gerar(page, '[lento] uma imagem que não termina')
  await exigirClique(page, POPOVER, /^Confirmar e gerar$/, 'Confirmar e gerar (lento)')
  await esperarTexto(page, /Gerando imagem…/, 'a geração lenta não ficou em andamento')
  await exigirClique(page, POPOVER, /^Cancelar$/, 'Cancelar')
  await esperarTexto(page, /A geração de imagem foi cancelada\./, 'Cancelar não mostrou "cancelada"')
  await blocosEstaveis(page, inicial + 3, 'o Cancelar deixou a imagem entrar no canvas')

  // Falta de créditos com o popover fechado: alerta no gatilho; aberto de novo, a mensagem de saldo.
  await gerar(page, '[saldo] sem créditos')
  await exigirClique(page, POPOVER, /^Confirmar e gerar$/, 'Confirmar e gerar (saldo)')
  if (!(await clicarGatilho(page))) falhar('gatilho ausente ao fechar o popover')
  await page.locator(POPOVER).waitFor({ state: 'hidden', timeout: 20_000 })
  await esperar(
    page,
    () => [...document.querySelectorAll('.felixo-sidebar-content button')].some((b) => /falhou/.test(b.title ?? '')),
    null,
    'a falha com o popover fechado não gerou o alerta no gatilho',
  )
  await abrirPopover(page)
  await esperarTexto(page, /falta de créditos/, 'a mensagem de falta de créditos não apareceu')
  await blocosEstaveis(page, inicial + 3, 'a falha por créditos criou um bloco')

  // Openia antigo: oferta de atualizar, confirmação, atualização roteirizada e geração depois dela.
  await gerar(page, '[antigo] com o Openia velho')
  await exigirClique(page, POPOVER, /^Confirmar e gerar$/, 'Confirmar e gerar (antigo)')
  await esperarTexto(page, /Este Openia é antigo/, 'o Openia antigo não ofereceu a atualização')
  await exigirClique(page, POPOVER, /^Atualizar o Openia$/, 'Atualizar o Openia')
  await exigirClique(page, POPOVER, /^Confirmar atualização$/, 'Confirmar atualização')
  await esperarTexto(page, /Openia atualizado\. Clique em Gerar de novo\./, 'a atualização não terminou')
  await exigirClique(page, POPOVER, /^Gerar$/, 'Gerar (depois de atualizar)')
  await exigirClique(page, POPOVER, /^Confirmar e gerar$/, 'Confirmar e gerar (atualizado)')
  await esperarBlocos(page, inicial + 4, 'depois de atualizar o Openia a imagem não entrou no canvas')
  await blocosEstaveis(page, inicial + 4, 'a geração depois da atualização duplicou o bloco')
}

module.exports = { ambienteDaImagem, checarPopoverGerarImagem }

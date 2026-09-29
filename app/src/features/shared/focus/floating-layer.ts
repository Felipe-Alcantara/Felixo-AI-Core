/**
 * Camada flutuante: algo desenhado num portal, fora de onde a pessoa está
 * trabalhando, mas que faz parte do que ela está fazendo ali — o menu de
 * destino de um link e o cartão de pedido de agente. Quem a desenha marca o
 * elemento com `data-felixo-floating-layer`, e clicar nela não é "clicar
 * fora" da gaveta do terminal (senão "Copiar link" ou "Recusar" fechavam a
 * gaveta com o agente). O próximo overlay precisa da marca para não repetir
 * esse defeito.
 */
export const FLOATING_LAYER_ATTRIBUTE = 'data-felixo-floating-layer'
export const FLOATING_LAYER_SELECTOR = `[${FLOATING_LAYER_ATTRIBUTE}]`

/**
 * Foco passageiro: um elemento que some quando a janela perde o foco (o menu
 * de link fecha no blur). O foco nele não substitui quem tinha o foco antes:
 * senão, na volta da janela, o foco caía num item que já não existe, e não
 * no terminal. Marca separada da camada flutuante de propósito: o cartão de
 * pedido também é camada flutuante, mas continua na tela, e o botão dele pode
 * ser lembrado.
 */
export const TRANSIENT_FOCUS_ATTRIBUTE = 'data-felixo-focus-transient'
export const TRANSIENT_FOCUS_SELECTOR = `[${TRANSIENT_FOCUS_ATTRIBUTE}]`

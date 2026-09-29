/**
 * Camada flutuante: algo desenhado num portal, fora de onde a pessoa está
 * trabalhando, mas que faz parte do que ela está fazendo ali — o menu de
 * destino de um link e o cartão de pedido de agente. Quem a desenha marca o
 * elemento com `data-felixo-floating-layer`.
 *
 * Duas regras dependem da marca, e o próximo overlay precisa dela para não
 * repetir os defeitos que ela corrigiu:
 * - clicar nela não é "clicar fora" da gaveta do terminal (senão "Copiar
 *   link" ou "Recusar" fechavam a gaveta com o agente);
 * - ter o foco nela não substitui quem tinha o foco antes (senão, ao voltar
 *   para a janela, o foco caía num item que já sumiu, e não no terminal).
 */
export const FLOATING_LAYER_ATTRIBUTE = 'data-felixo-floating-layer'
export const FLOATING_LAYER_SELECTOR = `[${FLOATING_LAYER_ATTRIBUTE}]`

/**
 * Regra do rodapé de status da toolbar do canvas.
 *
 * A toolbar é uma **coluna**. Elementos informativos que aparecem e somem
 * sozinhos — indicador de atualização, progresso de instalação das CLIs — foram
 * parar no **meio** da fileira de botões, e cada vez que apareciam empurravam
 * para baixo todos os botões seguintes. Um botão que muda de lugar sem ninguém
 * encostar nele é o oposto do que uma barra de ferramentas promete: alvo fixo.
 *
 * A correção é de posição, não de estilo: informação vai para um rodapé, depois
 * do último botão. Estando por último, ela pode crescer e encolher à vontade
 * **sem mover nada**, porque não há nada abaixo dela.
 *
 * Esta função existe para não sobrar um separador solto na tela quando não há
 * nada a dizer — a única decisão do rodapé que dá para testar sem renderizar.
 */

export type EstadoDoRodape = {
  /** Versão instalada; ausente fora do Electron ou antes do IPC responder. */
  versao: string | null
  /** Se o indicador de atualização está visível agora. */
  atualizacaoVisivel: boolean
}

/**
 * Se o rodapé de status deve ser desenhado.
 *
 * O indicador de instalação de CLI **não entra na conta** de propósito: o
 * estado dele mora dentro do próprio componente, por decisão registrada lá (subir
 * a assinatura do IPC faria a árvore redesenhar a cada linha de progresso). Ele
 * aparece dentro do rodapé quando existe, e no app empacotado o rodapé já está
 * de pé porque a versão está sempre presente.
 */
export function deveMostrarRodapeDeStatus(estado: EstadoDoRodape): boolean {
  return Boolean(estado.versao?.trim()) || estado.atualizacaoVisivel
}

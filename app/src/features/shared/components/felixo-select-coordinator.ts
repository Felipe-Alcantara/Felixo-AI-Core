type SelectCloser = () => void

let activeSelectCloser: SelectCloser | null = null

/**
 * Mantém somente uma lista de seleção aberta por vez.
 *
 * Os selects são portaled para o body para não serem cortados pelas sidebars;
 * por isso o controle de exclusividade precisa viver fora da árvore React de
 * cada formulário. A função devolvida libera apenas o dono que a registrou,
 * sem conseguir desmontar um select que tenha sido aberto depois.
 */
export function claimFelixoSelect(close: SelectCloser): () => void {
  if (activeSelectCloser && activeSelectCloser !== close) {
    activeSelectCloser()
  }
  activeSelectCloser = close

  return () => releaseFelixoSelect(close)
}

export function releaseFelixoSelect(close: SelectCloser): void {
  if (activeSelectCloser === close) {
    activeSelectCloser = null
  }
}

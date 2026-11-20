/** Próximo índice do percurso de um menu (setas e Home/End, com volta ao outro lado); `null` quando a tecla não é de navegação. */
export function proximoItemDoMenu(tecla: string, atual: number, total: number): number | null {
  if (total <= 0) return null
  if (tecla === 'Home') return 0
  if (tecla === 'End') return total - 1
  if (tecla === 'ArrowRight' || tecla === 'ArrowDown') return (atual + 1 + total) % total
  if (tecla === 'ArrowLeft' || tecla === 'ArrowUp') return (atual - 1 + total) % total
  return null
}

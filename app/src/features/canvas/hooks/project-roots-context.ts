import { createContext, useContext } from 'react'

/**
 * Pastas dos projetos abertos no canvas. O bloco de arquivo usa para achar a
 * raiz autorizada das imagens relativas do Markdown (`markdownImageRoot`).
 * Fora do canvas a lista é vazia, e a raiz vira a pasta do próprio arquivo.
 */
export const ProjectRootsContext = createContext<readonly string[]>([])

export function useProjectRoots(): readonly string[] {
  return useContext(ProjectRootsContext)
}

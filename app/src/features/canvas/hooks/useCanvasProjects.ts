// Estado dos projetos disponíveis no canvas: carga inicial, recarga e o fluxo
// "Adicionar pasta…" (escolher pasta, detectar repositórios e registrá-los).
import { useCallback, useEffect, useState } from 'react'

export type CanvasProject = { id: string; name: string; path: string }

export function useCanvasProjects() {
  const [projects, setProjects] = useState<CanvasProject[]>([])

  const reloadProjects = useCallback(() => {
    void window.felixo?.projects?.list().then((result) => {
      if (result?.ok && Array.isArray(result.projects)) {
        setProjects(
          (result.projects as CanvasProject[]).filter(
            (project) => project && typeof project.path === 'string',
          ),
        )
      }
    })
  }, [])

  // Pick a folder, register its repos as projects, refresh the list and return
  // the new project ids — used by the terminal menu's "Adicionar pasta…".
  const addProjectFolder = useCallback(async (): Promise<string[]> => {
    const bridge = window.felixo?.projects
    if (!bridge) {
      return []
    }

    const folder = await bridge.pickFolder()
    if (!folder) {
      return []
    }

    const repos = await bridge.detectRepos(folder)
    const picked =
      repos.length > 0
        ? repos
        : [{ name: folder.split('/').filter(Boolean).pop() ?? folder, path: folder }]

    const existingByPath = new Map(projects.map((project) => [project.path, project.id]))
    const ids: string[] = []
    for (const repo of picked) {
      const existingId = existingByPath.get(repo.path)
      if (existingId) {
        ids.push(existingId)
        continue
      }
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
      await bridge.save({ id, name: repo.name, path: repo.path })
      ids.push(id)
    }

    reloadProjects()
    return ids
  }, [reloadProjects, projects])

  useEffect(() => {
    let cancelled = false

    void window.felixo?.projects?.list().then((result) => {
      if (cancelled || !result.ok || !Array.isArray(result.projects)) {
        return
      }

      const loaded = (result.projects as CanvasProject[]).filter(
        (project) => project && typeof project.path === 'string',
      )
      setProjects(loaded)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { projects, reloadProjects, addProjectFolder }
}

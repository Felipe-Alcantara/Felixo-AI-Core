import type { Project } from '../types'

const PROJECTS_STORAGE_KEY = 'felixo-ai-core.projects'
const ACTIVE_PROJECT_IDS_STORAGE_KEY = 'felixo-ai-core.activeProjectIds'

export function loadProjects() {
  try {
    const rawProjects = window.localStorage.getItem(PROJECTS_STORAGE_KEY)

    if (!rawProjects) {
      return []
    }

    const parsedProjects = JSON.parse(rawProjects)

    if (!Array.isArray(parsedProjects)) {
      return []
    }

    return parsedProjects.flatMap((value) => {
      const project = normalizeProject(value)
      return project ? [project] : []
    })
  } catch {
    return []
  }
}

export function saveProjects(projects: Project[]) {
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}

export function loadActiveProjectIds(projects: Project[]) {
  try {
    const rawIds = window.localStorage.getItem(ACTIVE_PROJECT_IDS_STORAGE_KEY)

    if (!rawIds) {
      return new Set<string>()
    }

    const parsedIds = JSON.parse(rawIds)

    if (!Array.isArray(parsedIds)) {
      return new Set<string>()
    }

    const knownIds = new Set(projects.map((project) => project.id))
    return new Set(
      parsedIds.filter((value): value is string => (
        typeof value === 'string' && knownIds.has(value)
      )),
    )
  } catch {
    return new Set<string>()
  }
}

export function saveActiveProjectIds(projectIds: Set<string>) {
  window.localStorage.setItem(
    ACTIVE_PROJECT_IDS_STORAGE_KEY,
    JSON.stringify([...projectIds]),
  )
}

function normalizeProject(value: unknown): Project | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const project = value as Record<string, unknown>

  if (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.path === 'string'
  ) {
    return {
      id: project.id,
      name: project.name,
      path: project.path,
    }
  }

  return null
}

import type { Project } from '../types'

const PROJECTS_STORAGE_KEY = 'felixo-ai-core.projects'
const ACTIVE_PROJECT_IDS_STORAGE_KEY = 'felixo-ai-core.activeProjectIds'
const PROJECTS_BACKEND_MIGRATION_KEY = 'felixo-ai-core.projects.sqlite-migrated'

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

export async function loadProjectsFromBackend(): Promise<Project[] | null> {
  if (!window.felixo?.projects?.list) {
    return null
  }

  try {
    const result = await window.felixo.projects.list()

    if (!result.ok || !Array.isArray(result.projects)) {
      return null
    }

    return result.projects.flatMap((value) => {
      const project = normalizeProject(value)
      return project ? [project] : []
    })
  } catch {
    return null
  }
}

export async function saveProjectToBackend(project: Project): Promise<boolean> {
  if (!window.felixo?.projects?.save) {
    return false
  }

  const normalizedProject = normalizeProject(project)

  if (!normalizedProject) {
    return false
  }

  try {
    const result = await window.felixo.projects.save(normalizedProject)
    return result.ok
  } catch {
    return false
  }
}

export async function saveProjectsToBackend(projects: Project[]): Promise<boolean> {
  if (!window.felixo?.projects?.save) {
    return false
  }

  const results = await Promise.all(
    projects.map((project) => saveProjectToBackend(project)),
  )
  return results.every(Boolean)
}

export async function deleteProjectFromBackend(projectId: string): Promise<boolean> {
  if (!window.felixo?.projects?.delete) {
    return false
  }

  try {
    const result = await window.felixo.projects.delete(projectId)
    return result.ok
  } catch {
    return false
  }
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

export async function loadActiveProjectIdsFromBackend(
  projects: Project[],
): Promise<Set<string> | null> {
  if (!window.felixo?.projects?.loadActiveIds) {
    return null
  }

  try {
    const result = await window.felixo.projects.loadActiveIds()

    if (!result.ok || !Array.isArray(result.projectIds)) {
      return null
    }

    return normalizeActiveProjectIds(result.projectIds, projects)
  } catch {
    return null
  }
}

export async function saveActiveProjectIdsToBackend(
  projectIds: Set<string>,
): Promise<boolean> {
  if (!window.felixo?.projects?.saveActiveIds) {
    return false
  }

  try {
    const result = await window.felixo.projects.saveActiveIds([...projectIds])
    return result.ok
  } catch {
    return false
  }
}

export function hasProjectsBackendMigrationRun() {
  try {
    return window.localStorage.getItem(PROJECTS_BACKEND_MIGRATION_KEY) === '1'
  } catch {
    return false
  }
}

export function markProjectsBackendMigrationRun() {
  try {
    window.localStorage.setItem(PROJECTS_BACKEND_MIGRATION_KEY, '1')
  } catch {
    // localStorage can be unavailable in non-browser test environments.
  }
}

function normalizeActiveProjectIds(values: unknown[], projects: Project[]) {
  const knownIds = new Set(projects.map((project) => project.id))

  return new Set(
    values.filter(
      (value): value is string =>
        typeof value === 'string' && knownIds.has(value),
    ),
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
      instructions: typeof project.instructions === 'string' ? project.instructions : undefined,
      docsDirectory: typeof project.docsDirectory === 'string' ? project.docsDirectory : undefined,
    }
  }

  return null
}

export type DocsIndexEntry = { filename: string; summary: string }

export async function buildDocsIndexForProject(
  project: Project,
): Promise<{ entries: DocsIndexEntry[]; docsPath: string } | null> {
  if (!project.docsDirectory || !window.felixo?.projects?.buildDocsIndex) {
    return null
  }

  try {
    const result = await window.felixo.projects.buildDocsIndex({
      projectPath: project.path,
      docsDirectory: project.docsDirectory,
    })
    return result.ok && result.entries && result.docsPath
      ? { entries: result.entries, docsPath: result.docsPath }
      : null
  } catch {
    return null
  }
}

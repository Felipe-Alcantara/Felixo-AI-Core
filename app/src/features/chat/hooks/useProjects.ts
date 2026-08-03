import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteProjectFromBackend,
  hasProjectsBackendMigrationRun,
  loadActiveProjectIds,
  loadActiveProjectIdsFromBackend,
  loadProjects,
  loadProjectsFromBackend,
  markProjectsBackendMigrationRun,
  saveActiveProjectIds,
  saveActiveProjectIdsToBackend,
  saveProjectToBackend,
  saveProjects,
  saveProjectsToBackend,
} from '../services/project-storage'
import type { Project } from '../types'

/**
 * Owns projects and which ones are active: local-first state, the
 * local<->backend migration/sync dance (projects and active-ids sync
 * together since the second depends on the first's backend load), and the
 * add/remove/update/toggle mutations. Extracted from ChatWorkspace so
 * migration bookkeeping doesn't sit alongside chat streaming and UI state.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects())
  const [activeProjectIds, setActiveProjectIds] = useState<Set<string>>(() =>
    loadActiveProjectIds(loadProjects()),
  )
  const projectsRef = useRef(projects)
  const activeProjectIdsRef = useRef(activeProjectIds)
  const projectsBackendLoadedRef = useRef(false)
  const projectsUserEditedRef = useRef(false)
  const activeProjectIdsUserEditedRef = useRef(false)

  const activeProjects = useMemo(
    () => projects.filter((project) => activeProjectIds.has(project.id)),
    [activeProjectIds, projects],
  )

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    activeProjectIdsRef.current = activeProjectIds
  }, [activeProjectIds])

  useEffect(() => {
    let cancelled = false

    async function loadBackendProjects() {
      const backendProjects = await loadProjectsFromBackend()

      if (cancelled || backendProjects === null) {
        return
      }

      let currentProjects = projectsRef.current

      if (backendProjects.length > 0) {
        markProjectsBackendMigrationRun()

        if (projectsUserEditedRef.current) {
          void saveProjectsToBackend(currentProjects)
        } else {
          currentProjects = backendProjects
          setProjects(backendProjects)
        }
      } else if (!hasProjectsBackendMigrationRun() && currentProjects.length > 0) {
        const saved = await saveProjectsToBackend(currentProjects)

        if (saved) {
          markProjectsBackendMigrationRun()
        }
      } else {
        markProjectsBackendMigrationRun()
      }

      const backendActiveIds = await loadActiveProjectIdsFromBackend(currentProjects)

      if (cancelled) {
        return
      }

      if (backendActiveIds !== null) {
        if (activeProjectIdsUserEditedRef.current) {
          void saveActiveProjectIdsToBackend(activeProjectIdsRef.current)
        } else {
          setActiveProjectIds(backendActiveIds)
        }
      } else if (currentProjects.length > 0) {
        void saveActiveProjectIdsToBackend(activeProjectIdsRef.current)
      }

      projectsBackendLoadedRef.current = true
    }

    void loadBackendProjects()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveProjects(projects)
    if (projectsBackendLoadedRef.current) {
      void saveProjectsToBackend(projects)
    }
  }, [projects])

  useEffect(() => {
    saveActiveProjectIds(activeProjectIds)
    if (projectsBackendLoadedRef.current) {
      void saveActiveProjectIdsToBackend(activeProjectIds)
    }
  }, [activeProjectIds])

  function addProjects(incoming: Project[]) {
    projectsUserEditedRef.current = true
    setProjects((prev) => {
      const existingPaths = new Set(prev.map((p) => p.path))
      const newProjects = incoming.filter((p) => !existingPaths.has(p.path))

      for (const project of newProjects) {
        void saveProjectToBackend(project)
      }

      return [...prev, ...newProjects]
    })
  }

  function removeProject(project: Project) {
    projectsUserEditedRef.current = true
    activeProjectIdsUserEditedRef.current = true
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    setActiveProjectIds((prev) => {
      const next = new Set(prev)
      next.delete(project.id)
      return next
    })
    void deleteProjectFromBackend(project.id)
  }

  function updateProject(updated: Project) {
    projectsUserEditedRef.current = true
    setProjects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p)),
    )
    void saveProjectToBackend(updated)
  }

  function toggleProject(project: Project) {
    activeProjectIdsUserEditedRef.current = true
    setActiveProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(project.id)) {
        next.delete(project.id)
      } else {
        next.add(project.id)
      }
      return next
    })
  }

  return {
    projects,
    activeProjectIds,
    activeProjects,
    addProjects,
    removeProject,
    updateProject,
    toggleProject,
  }
}

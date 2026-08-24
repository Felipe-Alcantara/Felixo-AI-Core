import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultAutomations } from '../../shared/data/automations'
import {
  createAutomationId,
  deleteAutomationFromBackend,
  hasAutomationsBackendMigrationRun,
  loadAutomationsFromBackend,
  loadCustomAutomations,
  markAutomationsBackendMigrationRun,
  mergeAutomationsForBackendMigration,
  saveAutomationsToBackend,
  saveCustomAutomations,
} from '../services/automation-storage'
import type { AutomationDefinition } from '../types'

/**
 * Owns custom automations: local-first state, the local<->backend
 * migration/sync dance, and the add/remove mutations. Combines with the
 * built-in `defaultAutomations` to produce the full list shown in the UI.
 * Extracted from ChatWorkspace so migration bookkeeping doesn't sit
 * alongside chat streaming and UI state.
 */
export function useAutomations() {
  const [customAutomations, setCustomAutomations] = useState<AutomationDefinition[]>(
    () => loadCustomAutomations(),
  )
  const automationsRef = useRef(customAutomations)
  const automationsUserEditedRef = useRef(false)
  const automationsBackendLoadedRef = useRef(false)

  const automations = useMemo(
    () => [...defaultAutomations, ...customAutomations],
    [customAutomations],
  )

  useEffect(() => {
    automationsRef.current = customAutomations
  }, [customAutomations])

  useEffect(() => {
    let cancelled = false

    loadAutomationsFromBackend()
      .then((backendAutomations) => {
        if (cancelled || backendAutomations === null) {
          return
        }

        automationsBackendLoadedRef.current = true

        if (backendAutomations.length > 0) {
          if (automationsUserEditedRef.current) {
            void saveAutomationsToBackend(automationsRef.current).then((saved) => {
              if (saved) {
                markAutomationsBackendMigrationRun()
              }
            })
            return
          }

          const migrationAlreadyRan = hasAutomationsBackendMigrationRun()
          const mergedAutomations = migrationAlreadyRan
            ? backendAutomations
            : mergeAutomationsForBackendMigration(
                backendAutomations,
                automationsRef.current,
              )

          setCustomAutomations(mergedAutomations)

          if (migrationAlreadyRan || mergedAutomations.length === backendAutomations.length) {
            markAutomationsBackendMigrationRun()
            return
          }

          void saveAutomationsToBackend(mergedAutomations).then((saved) => {
            if (saved) {
              markAutomationsBackendMigrationRun()
            }
          })
          return
        }

        if (
          !hasAutomationsBackendMigrationRun() &&
          automationsRef.current.length > 0
        ) {
          void saveAutomationsToBackend(automationsRef.current).then(
            (saved) => {
              if (saved) {
                markAutomationsBackendMigrationRun()
              }
            },
          )
          return
        }

        markAutomationsBackendMigrationRun()
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveCustomAutomations(customAutomations)
    if (automationsBackendLoadedRef.current) {
      void saveAutomationsToBackend(customAutomations)
    }
  }, [customAutomations])

  function addCustomAutomation(
    automation: Pick<
      AutomationDefinition,
      'description' | 'name' | 'prompt' | 'scope'
    >,
  ) {
    const now = new Date().toISOString()
    automationsUserEditedRef.current = true
    setCustomAutomations((currentAutomations) => [
      {
        ...automation,
        id: createAutomationId(automation.name),
        createdAt: now,
        updatedAt: now,
      },
      ...currentAutomations,
    ])
  }

  function removeCustomAutomation(automationId: string) {
    automationsUserEditedRef.current = true
    if (automationsBackendLoadedRef.current) {
      void deleteAutomationFromBackend(automationId)
    }
    setCustomAutomations((currentAutomations) =>
      currentAutomations.filter((automation) => automation.id !== automationId),
    )
  }

  return {
    automations,
    customAutomations,
    addCustomAutomation,
    removeCustomAutomation,
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  announceSystemDesignProjects,
  subscribeSystemDesignConfig,
  subscribeSystemDesignProjects,
} from './system-design-events'
import type { SystemDesignProject } from './types'

/**
 * Raízes cujos guias git já foram sincronizados nesta execução do app — como o
 * sync dos guias do usuário, uma vez por sessão (o módulo vive enquanto o app
 * vive; o canvas e o chat compartilham).
 */
const syncedProjectRoots = new Set<string>()

/** Quanto a criação de um terminal espera a camada do projeto antes de seguir sem ela. */
const ENSURE_TIMEOUT_MS = 1500

type ResolveBridge = {
  resolveProject?: (directory: string) => Promise<{ ok: boolean; project?: SystemDesignProject; message?: string }>
  sync?: (request?: { projectRoot?: string }) => Promise<{ ok: boolean }>
}

function bridge(): ResolveBridge | undefined {
  return window.felixo?.systemDesign as ResolveBridge | undefined
}

/**
 * Sincroniza, uma vez por sessão, os guias git que JÁ VALEM num projeto
 * (escolha no app e arquivo confirmado — o processo principal nem inclui um
 * arquivo pendente na camada). Depois avisa as telas para relerem.
 */
function syncProjectOnce(project: SystemDesignProject): void {
  const root = project.root
  if (!root || project.layer !== 'projeto' || syncedProjectRoots.has(root)) return
  if (!project.guides.some((guide) => guide.kind === 'git')) return
  syncedProjectRoots.add(root)
  void bridge()?.sync?.({ projectRoot: root }).then(() => announceSystemDesignProjects(root))
}

/**
 * A camada de projeto de cada pasta pedida (cwd de terminal, projeto ativo do
 * chat). Relê quando a configuração do usuário ou a de algum projeto muda.
 *
 * `ensure` é para quem vai CRIAR um terminal: espera a resolução da pasta (com
 * prazo) para o lembrete já nascer com os guias certos.
 */
export function useProjectGuides(directories: readonly string[]) {
  const wanted = useMemo(
    () => [...new Set(directories.filter((directory): directory is string => typeof directory === 'string' && directory.length > 0))].sort(),
    [directories],
  )
  const wantedKey = wanted.join('\n')
  const [projects, setProjects] = useState<Record<string, SystemDesignProject>>({})
  // Pastas cuja resolução TERMINOU (com ou sem resultado): quem segura um
  // terminal esperando a camada solta quando a pasta assenta, mesmo se falhou.
  const [settled, setSettled] = useState<Record<string, true>>({})
  const projectsRef = useRef(projects)
  const inFlight = useRef(new Map<string, Promise<SystemDesignProject | null>>())

  const store = useCallback((directory: string, project: SystemDesignProject) => {
    setProjects((current) => {
      const next = { ...current, [directory]: project }
      projectsRef.current = next
      return next
    })
    syncProjectOnce(project)
  }, [])

  const resolve = useCallback(
    (directory: string): Promise<SystemDesignProject | null> => {
      const resolver = bridge()?.resolveProject
      if (!resolver) return Promise.resolve(null)
      const pending = inFlight.current.get(directory)
      if (pending) return pending
      const request = resolver(directory)
        .then((result) => {
          if (result.ok && result.project) {
            store(directory, result.project)
            return result.project
          }
          return null
        })
        .catch(() => null)
        .finally(() => {
          inFlight.current.delete(directory)
          setSettled((current) => (current[directory] ? current : { ...current, [directory]: true }))
        })
      inFlight.current.set(directory, request)
      return request
    },
    [store],
  )

  // Pastas novas: resolve só o que ainda não tem resultado.
  useEffect(() => {
    for (const directory of wanted) {
      if (!projectsRef.current[directory]) void resolve(directory)
    }
    // `wantedKey` resume `wanted` (que é um array novo a cada render do pai).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, resolve])

  // Mudou a lista do usuário, ou a camada de algum projeto: relê o que está na tela.
  useEffect(() => {
    const rereadAll = () => {
      for (const directory of Object.keys(projectsRef.current)) void resolve(directory)
    }
    const offConfig = subscribeSystemDesignConfig(rereadAll)
    const offProjects = subscribeSystemDesignProjects(rereadAll)
    return () => {
      offConfig()
      offProjects()
    }
  }, [resolve])

  /** Espera a camada destas pastas (até o prazo) — para criar terminais com o lembrete certo. */
  const ensure = useCallback(
    async (pending: readonly (string | undefined)[]) => {
      const missing = [...new Set(pending.filter((directory): directory is string => Boolean(directory)))]
        .filter((directory) => !projectsRef.current[directory])
      if (!missing.length) return
      await Promise.race([
        Promise.all(missing.map((directory) => resolve(directory))),
        new Promise((done) => window.setTimeout(done, ENSURE_TIMEOUT_MS)),
      ])
    },
    [resolve],
  )

  /** Leitura síncrona para quem monta texto fora do render (refs). */
  const getProject = useCallback((directory: string | undefined) => (directory ? projectsRef.current[directory] : undefined), [])

  return { projects, settled, ensure, getProject, refresh: resolve }
}

/** Só para testes: esquece as raízes já sincronizadas nesta sessão. */
export function resetProjectGuidesSessionForTests(): void {
  syncedProjectRoots.clear()
}

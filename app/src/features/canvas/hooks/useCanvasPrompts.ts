import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  DEFAULT_FILE_LINK_PROMPT,
  DEFAULT_FILE_BOOTSTRAP_PROMPT,
} from '../services/file-link-prompt'
import {
  DEFAULT_QUALITY_STANDARD_PROMPT,
  qualityStandardGuidesFrom,
  qualityStandardSourceFrom,
  resolveQualityStandardPrompt,
  type QualityStandardGuides,
  type QualityStandardSource,
} from '../services/quality-standard-prompt'
import { subscribeSystemDesignConfig } from '../../shared/system-design/system-design-events'
import { useProjectGuides } from '../../shared/system-design/useProjectGuides'
import type { CanvasNodeData, CanvasSkill } from '../types'

/**
 * Textos que o canvas entrega aos agentes: as instruções de arquivo ligado a
 * terminal, o catálogo de skills e o lembrete do padrão de qualidade — com a
 * fonte do System Design que vale agora e os guias de cada projeto.
 */
export function useCanvasPrompts(nodes: Node<CanvasNodeData>[]) {
  // Editable instructions injected when a file links to a terminal: the normal
  // shared-scratchpad prompt, and the bootstrap prompt for the empty-md-in-repo case.
  const fileLinkPromptRef = useRef(DEFAULT_FILE_LINK_PROMPT)
  const bootstrapPromptRef = useRef(DEFAULT_FILE_BOOTSTRAP_PROMPT)
  // Standing "follow the quality standard" instruction for agent terminals.
  // State drives the rendered-nodes memo (so a backend load or a settings save
  // recomputes each terminal's initialText); the ref mirrors it for callbacks
  // that read it outside render (addTerminalNode).
  const [qualityStandard, setQualityStandard] = useState({
    prompt: DEFAULT_QUALITY_STANDARD_PROMPT,
    enabled: true,
  })
  const qualityStandardRef = useRef(qualityStandard)
  // Catálogo de skills disponíveis (biblioteca do app + terceiros + as da
  // pessoa). Só a LISTA entra no prompt inicial do agente; o conteúdo de cada
  // skill ele lê do arquivo quando a tarefa combinar.
  const availableSkillsRef = useRef<CanvasSkill[]>([])
  useEffect(() => {
    let cancelled = false
    void window.felixo?.canvas?.listAvailableSkills?.().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.skills)) {
        availableSkillsRef.current = result.skills
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  const applyQualityStandard = useCallback(
    (value: { prompt: string; enabled: boolean }) => {
      qualityStandardRef.current = value
      setQualityStandard(value)
    },
    [],
  )
  // O texto que vai para o agente é resolvido em UM lugar, a partir de três
  // entradas: o que a pessoa gravou (`stored`, vazio = "sem personalização"),
  // se o lembrete está ligado e a fonte do System Design que vale agora.
  // Criação, retomada e reabertura de terminal leem o mesmo resultado (é o
  // `qualityStandard` acima), então a fonte citada não pode divergir entre elas.
  const qualityStoredPromptRef = useRef<string | null>(null)
  const qualityEnabledRef = useRef(true)
  // Camada do usuário (lista de guias); a do projeto entra por `qualityPromptFor`.
  const qualitySourceRef = useRef<QualityStandardSource | QualityStandardGuides | null>(null)
  // As mesmas entradas, como ESTADO, para o render montar o lembrete de cada
  // projeto (o render não pode ler ref: não re-renderizaria quando mudasse).
  const [qualityInputs, setQualityInputs] = useState<{
    stored: string | null
    source: QualityStandardSource | QualityStandardGuides | null
  }>({ stored: null, source: null })
  const refreshQualityStandard = useCallback(() => {
    applyQualityStandard({
      prompt: resolveQualityStandardPrompt({
        stored: qualityStoredPromptRef.current,
        source: qualitySourceRef.current,
      }),
      enabled: qualityEnabledRef.current,
    })
    setQualityInputs({ stored: qualityStoredPromptRef.current, source: qualitySourceRef.current })
  }, [applyQualityStandard])
  const applySavedQualityStandard = useCallback(
    (value: { prompt: string; enabled: boolean }) => {
      qualityStoredPromptRef.current = value.prompt
      qualityEnabledRef.current = value.enabled
      refreshQualityStandard()
    },
    [refreshQualityStandard],
  )
  // Guias por PROJETO: cada terminal cita os guias da pasta em que trabalha
  // (arquivo confirmado, escolha no app ou pasta de guias), e os da pessoa
  // quando o projeto não traz nenhum.
  const terminalCwds = useMemo(
    () =>
      nodes
        .filter((node) => node.type === 'terminal' && typeof node.data.cwd === 'string' && node.data.cwd)
        .map((node) => node.data.cwd as string),
    [nodes],
  )
  const projectGuides = useProjectGuides(terminalCwds)
  const getProjectGuides = projectGuides.getProject
  const qualityPromptFor = useCallback(
    (cwd: string | undefined) => {
      const project = getProjectGuides(cwd)
      return resolveQualityStandardPrompt({
        stored: qualityStoredPromptRef.current,
        source: (project ? qualityStandardGuidesFrom(project) : null) ?? qualitySourceRef.current,
      })
    },
    [getProjectGuides],
  )

  useEffect(() => {
    void window.felixo?.canvas?.getFileLinkPrompt().then((result) => {
      if (result?.ok && typeof result.prompt === 'string' && result.prompt.trim()) {
        fileLinkPromptRef.current = result.prompt
      }
    })
    void window.felixo?.canvas?.getFileBootstrapPrompt?.().then((result) => {
      if (result?.ok && typeof result.prompt === 'string' && result.prompt.trim()) {
        bootstrapPromptRef.current = result.prompt
      }
    })
    void Promise.all([
      window.felixo?.canvas?.getQualityStandard?.(),
      window.felixo?.systemDesign?.getConfig?.(),
    ]).then(([quality, systemDesign]) => {
      if (systemDesign?.ok) {
        qualitySourceRef.current =
          qualityStandardGuidesFrom(systemDesign.config) ?? qualityStandardSourceFrom(systemDesign.config)
      }
      if (quality?.ok) {
        qualityStoredPromptRef.current = typeof quality.prompt === 'string' ? quality.prompt : null
        qualityEnabledRef.current = quality.enabled !== false
        refreshQualityStandard()
      }
    })
  }, [refreshQualityStandard])

  // A fonte do System Design pode mudar com o canvas aberto (o painel de
  // configurações troca a fonte, a sincronização falha ou termina). Terminais
  // já abertos não são reescritos; os próximos citam a fonte de agora.
  useEffect(
    () =>
      subscribeSystemDesignConfig((config) => {
        qualitySourceRef.current = qualityStandardGuidesFrom(config) ?? qualityStandardSourceFrom(config)
        refreshQualityStandard()
      }),
    [refreshQualityStandard],
  )

  return {
    applySavedQualityStandard,
    availableSkillsRef,
    bootstrapPromptRef,
    fileLinkPromptRef,
    projectGuides,
    qualityInputs,
    qualityPromptFor,
    qualityStandard,
    qualityStandardRef,
  }
}

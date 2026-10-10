import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { registerWebpageOpener } from '../../shared/links/link-chooser-store'
import {
  findFreeNodePosition,
  findFreeNodePositionNearNode,
  getDefaultNodeSize,
  type CanvasBounds,
} from '../services/node-geometry'
import { webpageProfileForLinkSource } from '../services/webview-context-menu'
import type { CanvasNodeType } from '../types'
import type { CanvasFlowNode } from './useCanvasPersistence'

type WebpageOpenersOptions = {
  addNode: (
    type: CanvasNodeType,
    data?: Record<string, unknown>,
    position?: { x: number; y: number },
  ) => string
  centerNodeInSafeArea: (
    position: { x: number; y: number },
    size: { width: number; height: number },
    zoom: number,
    duration: number,
  ) => Promise<boolean> | undefined
  nodes: CanvasFlowNode[]
  setNodes: Dispatch<SetStateAction<CanvasFlowNode[]>>
  visibleCanvasBounds: () => CanvasBounds | undefined
}

/**
 * Os dois caminhos que criam um bloco Página Web sem passar pela sidebar: o
 * menu de link (global, montado no App) e o pedido de um agente
 * (`felixo browser open --embedded`).
 */
export function useWebpageOpeners({
  addNode,
  centerNodeInSafeArea,
  nodes,
  setNodes,
  visibleCanvasBounds,
}: WebpageOpenersOptions) {
  /**
   * Bloco Página Web pedido pelo menu de link (terminal, Markdown ou outra
   * Página Web). Nasce ao lado do bloco de onde o link veio; sem bloco de
   * origem no canvas (painel do Notion, System Design), numa área livre da
   * tela. Vindo de outra Página Web, nasce no perfil dela. Devolve o id para
   * o menu levar o foco ao bloco novo.
   */
  const openWebpageFromLink = useCallback(
    (url: string, sourceId?: string) => {
      const webpageSize = getDefaultNodeSize('webpage', window.innerWidth)
      const source = sourceId ? nodes.find((node) => node.id === sourceId) : undefined
      const position = source
        ? findFreeNodePositionNearNode(nodes, source.id, webpageSize)
        : findFreeNodePosition(nodes, webpageSize, visibleCanvasBounds())
      // Como o pedido de agente com `--profile`: o link de uma página logada
      // no perfil "Trabalho" continua logado nele, e não no Padrão.
      const profileId = webpageProfileForLinkSource(source)
      const id = addNode('webpage', { url, ...(profileId ? { profileId } : {}) }, position)
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: node.id === id })),
      )
      const cameraSettled = centerNodeInSafeArea(position, webpageSize, 0.9, 220)
      return { id, cameraSettled }
    },
    [addNode, centerNodeInSafeArea, nodes, setNodes, visibleCanvasBounds],
  )

  const openWebpageFromAgent = useCallback(
    (url: string, profileId?: string) => {
      const webpageSize = getDefaultNodeSize('webpage', window.innerWidth)
      const position = findFreeNodePosition(nodes, webpageSize, visibleCanvasBounds())
      // `felixo browser open --embedded --profile=Nome`: o processo principal
      // já resolveu o nome; o Padrão é o bloco sem `profileId`.
      const id = addNode(
        'webpage',
        { url, ...(profileId && profileId !== 'default' ? { profileId } : {}) },
        position,
      )
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: node.id === id })),
      )
      centerNodeInSafeArea(position, webpageSize, 0.9, 220)
    },
    [addNode, centerNodeInSafeArea, nodes, setNodes, visibleCanvasBounds],
  )

  useEffect(() => {
    const unsubscribe = window.felixo?.canvas?.onAgentBrowserOpen?.(({ url, profileId }) => {
      if (typeof url === 'string' && url.trim()) {
        openWebpageFromAgent(url, typeof profileId === 'string' ? profileId : undefined)
      }
    })

    return () => unsubscribe?.()
  }, [openWebpageFromAgent])

  // O menu de link é global (montado no App) e chama sempre a versão atual,
  // pela ref, sem re-registrar a cada mudança de `nodes`. Registrar é o que
  // faz o menu oferecer "Abrir como Página Web": na tela do chat não há canvas.
  const openWebpageFromLinkRef = useRef(openWebpageFromLink)
  useEffect(() => {
    openWebpageFromLinkRef.current = openWebpageFromLink
  }, [openWebpageFromLink])
  useEffect(
    () =>
      registerWebpageOpener((url, sourceId) => openWebpageFromLinkRef.current(url, sourceId)),
    [],
  )
}

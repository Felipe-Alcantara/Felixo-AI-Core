/**
 * Lê qual GPU está desenhando agora, pelo renderer que o próprio Chromium
 * informa ao WebGL (a mesma string do ANGLE que o CDP `SystemInfo.getInfo`
 * mostra, ex.: "ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA GeForce 920MX ...))").
 *
 * Existe porque o processo principal não tem uma fonte confiável: no Linux,
 * `app.getGPUInfo()` devolve a coleta feita antes do processo de GPU subir
 * (medido em 26/09/2026: renderer vazio e a NVIDIA marcada como ativa mesmo
 * renderizando na Intel). O contexto é criado só quando a pessoa abre a
 * opção, e descartado em seguida.
 */

/** O pedaço do contexto WebGL que a leitura usa; os testes injetam um falso. */
type RendererContext = {
  RENDERER: number
  getExtension(name: string): unknown
  getParameter(parameter: number): unknown
}

type CanvasLike = {
  getContext(kind: 'webgl2' | 'webgl'): RendererContext | null
}

function createDomCanvas(): CanvasLike {
  return document.createElement('canvas') as unknown as CanvasLike
}

export function readActiveGpuRenderer(createCanvas: () => CanvasLike = createDomCanvas): string | null {
  try {
    const canvas = createCanvas()
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return null
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null
    const renderer: unknown = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
    const loseContext = gl.getExtension('WEBGL_lose_context') as { loseContext: () => void } | null
    loseContext?.loseContext()
    return typeof renderer === 'string' && renderer.trim() ? renderer.trim() : null
  } catch {
    return null
  }
}

/** SwiftShader é a rasterização por software do Chromium, não uma placa. */
export function isSoftwareRenderer(renderer: string | null): boolean {
  return !renderer || /swiftshader|llvmpipe|software/i.test(renderer)
}

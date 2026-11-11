/**
 * Controle de fluxo PTY↔xterm por marca d'água.
 *
 * O xterm processa a saída em fatias de ~12 ms e descarta, com exceção, o que
 * passa de 50 MB pendentes (`WriteBuffer.ts`, "write data discarded"). Aqui o
 * renderer conta o que entregou ao `terminal.write` e ainda não foi processado
 * e pede ao processo principal para pausar o PTY acima da marca alta e
 * retomar abaixo da baixa; pausado, a CLI bloqueia ao escrever e nada se perde.
 *
 * As marcas são altas de propósito: só uma enxurrada (um `cat` enorme) chega
 * a 2 M caracteres pendentes. Com a janela minimizada o Chromium desacelera os
 * timers e o xterm escoa devagar; uma marca baixa frearia os agentes em
 * segundo plano no ritmo normal deles. E pausar pouco importa no Linux e no
 * macOS: lá o node-pty destrói o socket 200 ms depois do fim do processo se ele
 * ainda estiver pausado, e o resto do buffer do sistema se perderia.
 */
export const FLOW_HIGH_WATERMARK_CHARS = 2_000_000
export const FLOW_LOW_WATERMARK_CHARS = 500_000

export type FlowControl = {
  /** Entregou `chars` ao `terminal.write`. */
  written: (chars: number) => void
  /** O xterm terminou de processar `chars` (callback do `write`, ou o write lançou). */
  parsed: (chars: number) => void
  /** O xterm vai embora: se estava pausado, retoma. */
  release: () => void
  readonly paused: boolean
}

export function createFlowControl(onChange: (paused: boolean) => void): FlowControl {
  let pending = 0
  let paused = false

  const set = (next: boolean) => {
    if (paused === next) return
    paused = next
    onChange(next)
  }

  return {
    written(chars) {
      pending += chars
      if (pending > FLOW_HIGH_WATERMARK_CHARS) set(true)
    },
    parsed(chars) {
      pending = Math.max(0, pending - chars)
      if (pending < FLOW_LOW_WATERMARK_CHARS) set(false)
    },
    release() {
      set(false)
    },
    get paused() {
      return paused
    },
  }
}

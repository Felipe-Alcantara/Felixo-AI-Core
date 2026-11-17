import { describe, expect, it, vi } from 'vitest'
import { writeFileNodeContent } from './file-node-write'

type Bridges = Parameters<typeof writeFileNodeContent>[0]

function bridges(overrides: Record<string, unknown>): Bridges {
  return overrides as unknown as Bridges
}

describe('writeFileNodeContent', () => {
  it('grava o .md do app pelo canvasFiles e confirma', async () => {
    const write = vi.fn().mockResolvedValue({ ok: true })
    const outcome = await writeFileNodeContent(
      bridges({ canvasFiles: { write } }),
      { fileName: 'nota.md' },
      'oi',
    )
    expect(outcome).toEqual({ ok: true })
    expect(write).toHaveBeenCalledWith({ name: 'nota.md', content: 'oi' })
  })

  it('devolve a falha quando o disco responde ok:false, em vez de fingir que gravou', async () => {
    const write = vi.fn().mockResolvedValue({ ok: false, message: 'Sem permissão.' })
    const outcome = await writeFileNodeContent(
      bridges({ textFiles: { write } }),
      { filePath: 'C:/x.md' },
      'oi',
    )
    expect(outcome).toEqual({ ok: false, message: 'Sem permissão.' })
  })

  it('transforma exceção do IPC em falha', async () => {
    const write = vi.fn().mockRejectedValue(new Error('IPC caiu'))
    const outcome = await writeFileNodeContent(
      bridges({ canvasFiles: { write } }),
      { fileName: 'nota.md' },
      'oi',
    )
    expect(outcome).toEqual({ ok: false, message: 'IPC caiu' })
  })
})

import { describe, expect, it } from 'vitest'
import { buildClaudeFolderArgs, folderRejection } from './agent-folders'
import { buildAgentArgs } from './agent-launch-options'

const raw = String.raw

describe('pastas liberadas do agente', () => {
  it('recusa raiz, sistema, rede e caminho relativo', () => {
    const ruins = [raw`C:\\`, 'C:', '/', raw`\\servidor\pasta`, raw`C:\Windows\System32`, '/etc', 'pasta', raw`C:\a\..\b`, ' ']
    for (const p of ruins) expect(folderRejection(p), p).not.toBeNull()
    expect(folderRejection(raw`C:\Users\Felipe Martins\Imagens`)).toBeNull()
    expect(folderRejection(raw`J:\Programação\Fotos\\`)).toBeNull()
  })

  it('monta --add-dir e nega Edit só nas pastas de leitura (espaço e acento)', () => {
    expect(
      buildClaudeFolderArgs([
        { path: raw`C:\Users\Felipe Martins\Imagens`, mode: 'leitura' },
        { path: raw`J:\Programação\Docs`, mode: 'escrita' },
        { path: raw`C:\\`, mode: 'escrita' },
      ]),
    ).toEqual([
      raw`--add-dir=C:\Users\Felipe Martins\Imagens`,
      raw`--add-dir=J:\Programação\Docs`,
      '--disallowedTools=Edit(//c/Users/Felipe Martins/Imagens/**)',
    ])
  })

  it('padrão não amplia nada e outras CLIs ignoram', () => {
    expect(buildAgentArgs({ agentId: 'claude' })).toEqual([])
    expect(buildAgentArgs({ agentId: 'codex', folders: [{ path: raw`C:\x\y`, mode: 'escrita' }] })).toEqual([])
    expect(buildAgentArgs({ agentId: 'claude', folders: [{ path: raw`C:\x\y`, mode: 'escrita' }] })).toEqual([raw`--add-dir=C:\x\y`])
  })
})

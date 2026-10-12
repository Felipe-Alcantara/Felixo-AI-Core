import { describe, expect, it } from 'vitest'
import {
  AGENTS,
  buildAgentArgs,
  codexRejectedRepeatedYolo,
  describeLaunch,
  dropRepeatedYoloFlags,
  getAgent,
  getEffortLevels,
  isDirectOpeniaLaunch,
  isKnownAgentCommand,
  supportsFastMode,
  withoutCodexYoloFlags,
} from './agent-launch-options'

describe('Openia como launcher configurado pela interface', () => {
  it('fica disponível no seletor sem virar um modelo nativo do Felixo', () => {
    const openia = getAgent('openia')

    expect(openia).toMatchObject({
      command: 'openia',
      isLauncher: true,
      models: [],
    })
    expect(AGENTS.some((agent) => agent.id === 'openia')).toBe(true)
  })

  it('não injeta modelo, esforço ou yolo no comando do Openia', () => {
    expect(
      buildAgentArgs({
        agentId: 'openia',
        model: 'provider/modelo',
        effort: 'high',
        yolo: true,
      }),
    ).toEqual([])
  })

  it('separa o comando manual antigo do spawn direto configurado', () => {
    expect(isKnownAgentCommand('openia')).toBe(false)
    expect(isDirectOpeniaLaunch('openia', ['run', 'orchat'])).toBe(true)
    expect(isDirectOpeniaLaunch('openia', [])).toBe(false)
    expect(isKnownAgentCommand('codex')).toBe(true)
  })
})

describe('modo fast do Codex', () => {
  const codex = getAgent('codex')

  it('passa service_tier=priority só para Codex em modelo compatível', () => {
    expect(buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol', fast: true })).toEqual([
      '--model', 'gpt-5.6-sol', '-c', 'service_tier=priority',
    ])
    // Modelo padrão (vazio) também aceita: todo modelo listado suporta o tier.
    expect(buildAgentArgs({ agentId: 'codex', fast: true })).toEqual(['-c', 'service_tier=priority'])
  })

  it('sem fast, ou fast desligado, não envia nada', () => {
    expect(buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol' })).toEqual(['--model', 'gpt-5.6-sol'])
    expect(buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol', fast: false })).toEqual(['--model', 'gpt-5.6-sol'])
  })

  it('ignora fast em modelo fora da lista e em agente sem o modo', () => {
    expect(buildAgentArgs({ agentId: 'codex', model: 'modelo-antigo', fast: true })).toEqual(['--model', 'modelo-antigo'])
    expect(buildAgentArgs({ agentId: 'claude', model: 'opus', fast: true })).toEqual(['--model', 'opus'])
    expect(buildAgentArgs({ agentId: 'gemini', fast: true })).toEqual([])
  })

  it('fica junto de esforço e yolo sem se misturar', () => {
    expect(
      buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-sol', effort: 'high', fast: true, yolo: true }),
    ).toEqual([
      '--model', 'gpt-5.6-sol',
      '-c', 'model_reasoning_effort=high',
      '-c', 'service_tier=priority',
      '--dangerously-bypass-approvals-and-sandbox',
    ])
  })

  it('supportsFastMode: só Codex, com modelo da lista ou padrão', () => {
    expect(supportsFastMode(codex, 'gpt-5.6-terra')).toBe(true)
    expect(supportsFastMode(codex, '')).toBe(true)
    expect(supportsFastMode(codex, 'outro')).toBe(false)
    expect(supportsFastMode(getAgent('claude'), 'opus')).toBe(false)
    expect(supportsFastMode(undefined, '')).toBe(false)
  })

  it('o rótulo do terminal mostra o fast (gasta mais limite) e só quando ele vale', () => {
    expect(describeLaunch({ agentId: 'codex', model: 'gpt-5.6-sol', fast: true })).toBe('Codex gpt-5.6-sol ⚡ fast')
    expect(describeLaunch({ agentId: 'codex', model: 'gpt-5.6-sol' })).toBe('Codex gpt-5.6-sol')
    expect(describeLaunch({ agentId: 'claude', model: 'opus', fast: true })).toBe('Claude opus')
  })
})

describe('effort do Claude Code', () => {
  it('oferece os níveis do `claude --help` 2.1.285, na mesma ordem, com xhigh', () => {
    expect(getEffortLevels(getAgent('claude')!, 'opus')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(buildAgentArgs({ agentId: 'claude', model: 'opus', effort: 'xhigh' })).toEqual([
      '--model',
      'opus',
      '--effort',
      'xhigh',
    ])
  })
})


describe('flag de yolo repetida no Codex', () => {
  const LONGA = '--dangerously-bypass-approvals-and-sandbox'

  // Medido com o `codex` 0.162.1: duas flags de yolo antes do subcomando fazem a
  // CLI recusar o lançamento ("cannot be used multiple times") antes de olhar
  // conta ou modelo, e o `--yolo` é apelido da mesma opção. Relato real: um
  // bloco Codex em conta free, com yolo, nasceu "encerrado" com esse erro.
  it('mantém uma só ocorrência da flag longa e diz o que descartou', () => {
    expect(dropRepeatedYoloFlags('codex', ['--model', 'gpt-5', LONGA, LONGA])).toEqual({
      args: ['--model', 'gpt-5', LONGA],
      removed: [LONGA],
    })
  })

  it('trata o apelido --yolo como a mesma opção e mantém a primeira grafia', () => {
    expect(dropRepeatedYoloFlags('codex', [LONGA, '--yolo'])).toEqual({ args: [LONGA], removed: ['--yolo'] })
    expect(dropRepeatedYoloFlags('codex', ['--yolo', LONGA])).toEqual({ args: ['--yolo'], removed: [LONGA] })
  })

  it('funciona nos argumentos de retomada, com o ID no fim', () => {
    expect(dropRepeatedYoloFlags('codex', ['resume', LONGA, LONGA, 'id-da-conversa'])).toEqual({
      args: ['resume', LONGA, 'id-da-conversa'],
      removed: [LONGA],
    })
  })

  it('não mexe no que não está repetido', () => {
    const args = ['--model', 'gpt-5', '-c', 'a=1', '-c', 'b=2', LONGA]
    expect(dropRepeatedYoloFlags('codex', args)).toEqual({ args, removed: [] })
    expect(dropRepeatedYoloFlags('codex', ['--yolo'])).toEqual({ args: ['--yolo'], removed: [] })
    expect(dropRepeatedYoloFlags('codex', [])).toEqual({ args: [], removed: [] })
  })

  it('só vale para o Codex: o Claude e o Gemini aceitam a repetição e ficam como vieram', () => {
    const claude = ['--dangerously-skip-permissions', '--dangerously-skip-permissions']
    const gemini = ['--yolo', '--yolo']
    expect(dropRepeatedYoloFlags('claude', claude).args).toEqual(claude)
    expect(dropRepeatedYoloFlags('gemini', gemini).args).toEqual(gemini)
    expect(dropRepeatedYoloFlags(undefined, [LONGA, LONGA]).args).toEqual([LONGA, LONGA])
  })

  it('não toca no que vem depois de "--", que já é texto e não opção', () => {
    expect(dropRepeatedYoloFlags('codex', [LONGA, '--', LONGA, LONGA])).toEqual({
      args: [LONGA, '--', LONGA, LONGA],
      removed: [],
    })
  })

  it('não altera a lista recebida', () => {
    const args = [LONGA, LONGA]
    dropRepeatedYoloFlags('codex', args)
    expect(args).toEqual([LONGA, LONGA])
  })
})

describe('recusa do Codex à flag de yolo repetida', () => {
  const LONGA = '--dangerously-bypass-approvals-and-sandbox'

  // A saída que a CLI imprime, copiada das capturas do relato (Windows).
  const ERRO = `error: the argument '${LONGA}' cannot be used multiple times\n\nUsage: codex [OPTIONS] [PROMPT]\n       codex [OPTIONS] <COMMAND> [ARGS]\n\nFor more information, try '--help'.`

  it('reconhece a mensagem, inclusive quebrada nas colunas do terminal', () => {
    expect(codexRejectedRepeatedYolo(ERRO)).toBe(true)
    expect(codexRejectedRepeatedYolo(ERRO.replace('cannot be used multiple', 'cannot be used\nmultiple'))).toBe(true)
    expect(codexRejectedRepeatedYolo(ERRO.replace('--dangerously-bypass-', '--dangerously-by\npass-'))).toBe(true)
    expect(codexRejectedRepeatedYolo(ERRO.replaceAll(LONGA, '--yolo'))).toBe(true)
  })

  it('não confunde com a recusa de outra opção nem com texto qualquer', () => {
    expect(codexRejectedRepeatedYolo("error: the argument '--model <MODEL>' cannot be used multiple times")).toBe(false)
    expect(codexRejectedRepeatedYolo("error: unexpected argument '--yolo' found")).toBe(false)
    expect(codexRejectedRepeatedYolo('Not logged in')).toBe(false)
    expect(codexRejectedRepeatedYolo('')).toBe(false)
  })

  it('withoutCodexYoloFlags tira as duas grafias e preserva o resto, só no Codex', () => {
    expect(withoutCodexYoloFlags('codex', ['--model', 'gpt-5', LONGA, '-c', 'a=1', '--yolo'])).toEqual([
      '--model',
      'gpt-5',
      '-c',
      'a=1',
    ])
    expect(withoutCodexYoloFlags('codex', [])).toEqual([])
    expect(withoutCodexYoloFlags('claude', ['--dangerously-skip-permissions'])).toEqual([
      '--dangerously-skip-permissions',
    ])
    expect(withoutCodexYoloFlags('gemini', ['--yolo'])).toEqual(['--yolo'])
  })

  it('withoutCodexYoloFlags não toca no que vem depois de "--" nem altera a lista recebida', () => {
    const args = [LONGA, '--', LONGA]
    expect(withoutCodexYoloFlags('codex', args)).toEqual(['--', LONGA])
    expect(args).toEqual([LONGA, '--', LONGA])
  })
})

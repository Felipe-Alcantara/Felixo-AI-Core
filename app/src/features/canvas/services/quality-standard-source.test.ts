import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUALITY_STANDARD_PROMPT,
  buildDefaultQualityStandardPrompt,
  isCustomizedQualityStandardPrompt,
  resolveQualityStandardPrompt,
  type QualityStandardGuide,
  type QualityStandardGuides,
  type QualityStandardSource,
} from './quality-standard-prompt'

/**
 * O texto exato que o app entregava aos agentes ANTES de a fonte do System Design
 * ser configurável (copiado do git em 21/09/2026). Para o default do app a
 * saída atual tem que continuar idêntica a ele, byte a byte: é a prova de que
 * mexer no contrato não mudou o que quem usa o padrão já recebia.
 */
const ORIGINAL_DEFAULT_PROMPT = `Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE do Felixo System Design (padrões de design, backend/frontend, política de git e o template de contexto IA.md). Procure os guias na pasta "Padrão de qualidade - Felixo System Design/" dentro do repositório; se ela não existir, use a fonte: https://github.com/Felipe-Alcantara/Felixo-System-Design. Leia o que for relevante para a tarefa e mantenha esse padrão em tudo que produzir (código, commits e documentação). Se estiver atualizando um arquivo de contexto ou plano, nunca encerre a resposta com o trabalho ainda marcado como "em andamento": faça a última edição do arquivo e deixe o estado final claro (concluído, bloqueado, aguardando decisão ou interrompido com motivo).

Quando precisar perguntar algo ao usuário (escolher entre opções, confirmar uma decisão que só ele pode tomar), use a ferramenta interativa de pergunta da sua própria CLI (ex.: AskUserQuestion), se ela existir — não escreva a pergunta como texto corrido no chat. Pergunta em texto vira só um parágrafo na conversa, sem botão nem campo pra responder; a ferramenta interativa é o que dá ao usuário uma UI de verdade para escolher.`

const DEFAULT_SOURCE: QualityStandardSource = {
  label: 'Felixo System Design',
  repoUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
  branch: 'main',
  sourceMode: 'default',
  syncState: 'synced',
}

const CUSTOM_SOURCE: QualityStandardSource = {
  label: 'System Design (padroes)',
  repoUrl: 'https://github.com/acme/padroes.git',
  branch: 'release',
  sourceMode: 'custom',
  syncState: 'synced',
}

describe('texto padrão do padrão de qualidade', () => {
  it('a constante continua idêntica ao texto original', () => {
    expect(DEFAULT_QUALITY_STANDARD_PROMPT).toBe(ORIGINAL_DEFAULT_PROMPT)
  })

  it('para o default do app, em qualquer estado normal, é idêntico ao original', () => {
    for (const syncState of ['synced', 'never-synced', 'disabled'] as const) {
      expect(buildDefaultQualityStandardPrompt({ ...DEFAULT_SOURCE, syncState })).toBe(
        ORIGINAL_DEFAULT_PROMPT,
      )
    }
  })

  it('sem fonte conhecida cai no texto original', () => {
    expect(buildDefaultQualityStandardPrompt(null)).toBe(ORIGINAL_DEFAULT_PROMPT)
    expect(buildDefaultQualityStandardPrompt({ ...DEFAULT_SOURCE, repoUrl: '' })).toBe(
      ORIGINAL_DEFAULT_PROMPT,
    )
  })

  it('fonte escolhida: cita o nome, a URL e a branch dela, não a do Felixo', () => {
    const prompt = buildDefaultQualityStandardPrompt(CUSTOM_SOURCE)

    expect(prompt).toContain('PADRÃO DE QUALIDADE do System Design (padroes)')
    expect(prompt).toContain('use a fonte: https://github.com/acme/padroes (branch: release).')
    expect(prompt).not.toContain('Felipe-Alcantara')
  })

  it('URL com credencial nunca chega ao texto', () => {
    const prompt = buildDefaultQualityStandardPrompt({
      ...CUSTOM_SOURCE,
      repoUrl: 'https://usuario:SEGREDO123@github.com/acme/padroes.git',
    })

    expect(prompt).not.toContain('SEGREDO123')
    expect(prompt).toContain('https://github.com/acme/padroes')
  })

  it('sincronização que falhou ou fonte trocada: avisa que o índice pode não ser o da fonte', () => {
    expect(
      buildDefaultQualityStandardPrompt({ ...CUSTOM_SOURCE, syncState: 'offline-fallback' }),
    ).toContain('a última sincronização dessa fonte falhou')
    expect(
      buildDefaultQualityStandardPrompt({ ...CUSTOM_SOURCE, syncState: 'pending-source-change' }),
    ).toContain('ainda não foi sincronizada')
    expect(
      buildDefaultQualityStandardPrompt({ ...DEFAULT_SOURCE, syncState: 'offline-fallback' }),
    ).toContain('a última sincronização dessa fonte falhou')
  })
})

describe('resolveQualityStandardPrompt', () => {
  it('nada guardado: usa o padrão da fonte atual', () => {
    expect(resolveQualityStandardPrompt({ stored: null, source: DEFAULT_SOURCE })).toBe(
      ORIGINAL_DEFAULT_PROMPT,
    )
    expect(resolveQualityStandardPrompt({ stored: '', source: CUSTOM_SOURCE })).toBe(
      buildDefaultQualityStandardPrompt(CUSTOM_SOURCE),
    )
    expect(resolveQualityStandardPrompt({ stored: '   ', source: CUSTOM_SOURCE })).toBe(
      buildDefaultQualityStandardPrompt(CUSTOM_SOURCE),
    )
  })

  it('o texto ORIGINAL gravado pelo painel não é personalização e acompanha a fonte', () => {
    // O painel salva o que está na caixa, inclusive o padrão intocado.
    expect(resolveQualityStandardPrompt({ stored: ORIGINAL_DEFAULT_PROMPT, source: CUSTOM_SOURCE })).toBe(
      buildDefaultQualityStandardPrompt(CUSTOM_SOURCE),
    )
  })

  it('o padrão gerado para outra fonte também não congela a fonte antiga', () => {
    const generatedForCustom = buildDefaultQualityStandardPrompt(CUSTOM_SOURCE)

    expect(resolveQualityStandardPrompt({ stored: generatedForCustom, source: DEFAULT_SOURCE })).toBe(
      ORIGINAL_DEFAULT_PROMPT,
    )
  })

  it('texto realmente personalizado é preservado, seja qual for a fonte', () => {
    const mine = 'Siga o guia da minha empresa e responda em português.'

    expect(resolveQualityStandardPrompt({ stored: mine, source: DEFAULT_SOURCE })).toBe(mine)
    expect(resolveQualityStandardPrompt({ stored: mine, source: CUSTOM_SOURCE })).toBe(mine)
    expect(isCustomizedQualityStandardPrompt(mine, CUSTOM_SOURCE)).toBe(true)
  })

  it('o original com uma edição mínima já é personalização', () => {
    expect(
      isCustomizedQualityStandardPrompt(`${ORIGINAL_DEFAULT_PROMPT}\nExtra.`, DEFAULT_SOURCE),
    ).toBe(true)
  })

  it('é a mesma função para criação, retomada e reabertura: mesma entrada, mesma saída', () => {
    const input = { stored: null, source: CUSTOM_SOURCE }

    expect(resolveQualityStandardPrompt(input)).toBe(resolveQualityStandardPrompt(input))
  })
})

const FELIXO_GUIDE: QualityStandardGuide = {
  label: 'Felixo System Design',
  repoUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
  branch: 'main',
  kind: 'git',
  origin: 'default',
  syncState: 'synced',
}
const DOKTOR_GUIDE: QualityStandardGuide = {
  label: 'System Design (Doktor-SystemDesign)',
  repoUrl: 'https://github.com/acme/Doktor-SystemDesign.git',
  branch: 'main',
  kind: 'git',
  origin: 'custom',
  syncState: 'synced',
}
const FOLDER_GUIDE: QualityStandardGuide = {
  label: 'Cliente X',
  repoUrl: '',
  branch: '',
  kind: 'local',
  path: '/repos/cliente/Padrão de qualidade - Cliente X',
  origin: 'projeto-pasta',
  syncState: 'synced',
}
const list = (layer: QualityStandardGuides['layer'], guides: QualityStandardGuide[], replaced: QualityStandardGuide[] = []): QualityStandardGuides =>
  ({ layer, guides, replaced })

describe('lista de guias por camada', () => {
  it('um guia só, fora do projeto, continua no texto de antes (padrão byte a byte)', () => {
    expect(buildDefaultQualityStandardPrompt(list('padrao', [FELIXO_GUIDE]))).toBe(ORIGINAL_DEFAULT_PROMPT)
    expect(buildDefaultQualityStandardPrompt(list('usuario', [{ ...CUSTOM_SOURCE, kind: 'git', origin: 'custom' }]))).toBe(
      buildDefaultQualityStandardPrompt(CUSTOM_SOURCE),
    )
  })

  it('dois guias da pessoa: o texto cita os dois, com URL e branch, sem aviso de projeto', () => {
    const prompt = buildDefaultQualityStandardPrompt(list('usuario', [FELIXO_GUIDE, DOKTOR_GUIDE]))

    expect(prompt).toContain('siga o PADRÃO DE QUALIDADE destes guias')
    expect(prompt).toContain('\n- Felixo System Design: https://github.com/Felipe-Alcantara/Felixo-System-Design (branch: main).')
    expect(prompt).toContain('\n- System Design (Doktor-SystemDesign): https://github.com/acme/Doktor-SystemDesign (branch: main).')
    expect(prompt).toContain('\nLeia o que for relevante')
    expect(prompt).not.toContain('Estes guias são do projeto')
    expect(prompt).toContain('AskUserQuestion')
  })

  it('guias do projeto: cita a pasta do repositório e avisa quais guias gerais substituiu', () => {
    const prompt = buildDefaultQualityStandardPrompt(list('projeto', [FOLDER_GUIDE, DOKTOR_GUIDE], [FELIXO_GUIDE]))

    expect(prompt).toContain('\n- Cliente X: pasta "Padrão de qualidade - Cliente X/" dentro deste repositório.')
    expect(prompt).toContain(
      'Estes guias são do projeto e valem aqui no lugar dos guias gerais do app (Felixo System Design). Leia o que for relevante',
    )
  })

  it('um guia de projeto sozinho já usa o texto de lista, para dizer de qual camada veio', () => {
    const prompt = buildDefaultQualityStandardPrompt(list('projeto', [DOKTOR_GUIDE], [FELIXO_GUIDE]))

    expect(prompt).toContain('Estes guias são do projeto')
    expect(prompt).not.toBe(buildDefaultQualityStandardPrompt({ ...DOKTOR_GUIDE, sourceMode: 'custom' }))
  })

  it('cada guia avisa a própria falha e nenhuma credencial chega ao texto', () => {
    const prompt = buildDefaultQualityStandardPrompt(
      list('usuario', [
        { ...FELIXO_GUIDE, syncState: 'offline-fallback' },
        { ...DOKTOR_GUIDE, repoUrl: 'https://usuario:SEGREDO123@github.com/acme/Doktor-SystemDesign.git' },
      ]),
    )

    expect(prompt).toContain('a última sincronização desse guia falhou')
    expect(prompt).not.toContain('SEGREDO123')
  })

  it('lista vazia cai no texto original', () => {
    expect(buildDefaultQualityStandardPrompt(list('padrao', []))).toBe(ORIGINAL_DEFAULT_PROMPT)
  })

  it('o texto gerado para outra lista não é personalização e acompanha a lista atual', () => {
    const generatedForProject = buildDefaultQualityStandardPrompt(list('projeto', [FOLDER_GUIDE], [FELIXO_GUIDE]))
    const generatedForUser = buildDefaultQualityStandardPrompt(list('usuario', [FELIXO_GUIDE, DOKTOR_GUIDE]))

    expect(isCustomizedQualityStandardPrompt(generatedForProject, DEFAULT_SOURCE)).toBe(false)
    expect(isCustomizedQualityStandardPrompt(generatedForUser, DEFAULT_SOURCE)).toBe(false)
    expect(resolveQualityStandardPrompt({ stored: generatedForProject, source: list('padrao', [FELIXO_GUIDE]) })).toBe(
      ORIGINAL_DEFAULT_PROMPT,
    )
    expect(isCustomizedQualityStandardPrompt(`${generatedForUser}\nExtra.`, DEFAULT_SOURCE)).toBe(true)
  })
})

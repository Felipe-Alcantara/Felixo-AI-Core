import { describe, expect, it } from 'vitest'
import resumeFixtures from '../../../../electron/__fixtures__/agent-resume-versions.json'
import {
  RESUME_FAILURE_PHRASES,
  RESUME_OUTCOME_BUFFER_CHARS,
  createResumeOutcomeDetector,
  type ResumeFailurePhrase,
} from './resume-outcome-detector'

/*
 * Caracteres de controle montados por código, e não escritos como escape no
 * fonte: assim nenhum editor, shell ou ferramenta no caminho os transforma.
 */
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const CRLF = CR + LF
const MIDDLE_DOT = String.fromCharCode(0xb7)
const TUI_RESULT_GLYPH = String.fromCharCode(0x23bf) // ⎿, resultado de ferramenta na conversa do Claude
const TUI_BLOCK_GLYPH = String.fromCharCode(0x25a0) // ■, como o Codex abre o erro
const TUI_ASSISTANT_GLYPH = String.fromCharCode(0x23fa) // ⏺, mensagem do agente no Claude
const TUI_PROMPT_GLYPH = String.fromCharCode(0x276f) // ❯, a entrada do Claude
const BOX_LINE = String.fromCharCode(0x2500).repeat(40) // ─, a borda da entrada do Claude

/** Preâmbulo real do boot do Claude: só escapes, nada desenhado ainda. */
const BOOT = `${ESC}7${ESC}[r${ESC}8${ESC}[?25h${ESC}[?2004h${ESC}[>0q${ESC}[c${ESC}[?1049h${ESC}[2J${ESC}[H${ESC}]0;Claude Code${BEL}`

/** A conversa que o spawn dos testes tentou retomar (um UUID, como as CLIs gravam). */
const ATTEMPTED_ID = '0d8f5c1e-4b7a-4c1e-9f2a-3b5c7d9e1f20'
/** Outra conversa: pode aparecer no histórico redesenhado, nunca na resposta a ESTE spawn. */
const OTHER_ID = '7a1b2c3d-0000-4e5f-8a9b-abcdefabcdef'

function feedAll(chunks: string[], sessionId = ATTEMPTED_ID): Array<'expired' | 'auth' | null> {
  const detector = createResumeOutcomeDetector({ sessionId })
  return chunks.map((chunk) => detector.feed(chunk))
}

/** A linha como a CLI a imprime: as frases `expired` vêm seguidas do ID tentado (fora a que não traz ID). */
function sampleLine(rule: ResumeFailurePhrase): string {
  if (rule.withoutId) return `${rule.phrase}.`
  return rule.reason === 'expired' ? `${rule.phrase} ${ATTEMPTED_ID}` : rule.phrase
}

/** Alimenta a saída e, para a frase presa à saída do processo, encerra com o código medido. */
function recognize(rule: ResumeFailurePhrase, line: string): 'expired' | 'auth' | null {
  const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID })
  const fed = detector.feed(`${BOOT}${line}${CRLF}`)
  if (rule.exitCode === undefined) return fed
  expect(fed).toBeNull()
  return detector.exit(rule.exitCode)
}

describe('createResumeOutcomeDetector', () => {
  it.each(RESUME_FAILURE_PHRASES.map((rule) => [rule.phrase, rule.reason, rule] as const))(
    'reconhece "%s" como %s',
    (_phrase, reason, rule) => {
      expect(recognize(rule, sampleLine(rule))).toBe(reason)
    },
  )

  it.each(
    resumeFixtures.versions.flatMap((fixture) =>
      fixture.refusals.map((refusal) => [fixture.provider, fixture.version, refusal] as const),
    ),
  )('reconhece a recusa medida do %s %s', (provider, _version, refusal) => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID, provider })
    const fed = detector.feed(refusal.output.replaceAll('<id>', ATTEMPTED_ID))
    // Frase com código de saída medido só vale com a saída; as outras, na hora.
    const reason = fed ?? (refusal.exitCode === null ? null : detector.exit(refusal.exitCode))
    expect(reason).toBe(refusal.reason)
  })

  it('reconhece as mensagens inteiras como as CLIs medidas as imprimem', () => {
    expect(feedAll([`No conversation found with session ID: ${ATTEMPTED_ID}${CRLF}`])).toEqual(['expired'])
    expect(
      feedAll([
        `No saved session found with ID ${ATTEMPTED_ID}. Run \`codex resume\` without an ID to choose from existing sessions.${LF}`,
      ]),
    ).toEqual(['expired'])
    expect(feedAll([`Not logged in ${MIDDLE_DOT} Please run /login${CRLF}`])).toEqual(['auth'])
    expect(feedAll([`  Not logged in ${MIDDLE_DOT} Please run /login${CRLF}`])).toEqual(['auth'])
    expect(
      feedAll([
        `${TUI_BLOCK_GLYPH} Your access token could not be refreshed because your refresh token was already used.${CRLF}`,
      ]),
    ).toEqual(['auth'])
  })

  it('exige, para `expired`, o ID que o spawn tentou retomar na mesma linha', () => {
    const notThisSpawn = [
      // Outra conversa: uma linha antiga, não a resposta a este spawn.
      `No conversation found with session ID: ${OTHER_ID}${CRLF}`,
      `No saved session found with ID ${OTHER_ID}. Run \`codex resume\` without an ID to choose from existing sessions.${LF}`,
      // Sem ID nenhum, ou com o ID só na linha de baixo.
      `No conversation found with session ID${CRLF}`,
      `No saved session found with ID${CRLF}${ATTEMPTED_ID}${CRLF}`,
      // Um ID que só começa pelo tentado é outro ID.
      `No conversation found with session ID: ${ATTEMPTED_ID}0${CRLF}`,
      `No conversation found with session ID: ${ATTEMPTED_ID}-copia${CRLF}`,
      `No saved session found with ID ${ATTEMPTED_ID}.bak${CRLF}`,
    ]
    for (const text of notThisSpawn) {
      expect(feedAll([text]), text).toEqual([null])
    }
    // O ponto final da frase do Codex não faz parte do ID.
    expect(feedAll([`No saved session found with ID ${ATTEMPTED_ID}.${LF}`])).toEqual(['expired'])
  })

  it('sem ID tentado, nunca reconhece `expired`, e `auth` continua valendo', () => {
    expect(feedAll([`No conversation found with session ID: ${ATTEMPTED_ID}${CRLF}`], '')).toEqual([null])
    expect(feedAll([`No saved session found with ID ${ATTEMPTED_ID}${CRLF}`], '   ')).toEqual([null])
    expect(feedAll([`Not logged in${CRLF}`], '')).toEqual(['auth'])
  })

  it('ignora as frases medidas que nenhum spawn vigiado imprime', () => {
    // `-c` do Claude e `--resume` do Gemini: o app nunca sobe esses spawns de
    // retomada, então essas linhas só podem ser histórico ou citação.
    const neverWatched = [
      `No conversation found to continue${CRLF}`,
      `Error resuming session: Invalid session identifier "${ATTEMPTED_ID}".${LF}`,
      `No previous sessions found for this project.${LF}`,
    ]
    for (const text of neverWatched) {
      expect(feedAll([text]), text).toEqual([null])
    }
  })

  it('não diferencia caixa', () => {
    expect(feedAll([`NO CONVERSATION FOUND WITH SESSION ID: ${ATTEMPTED_ID}${LF}`])).toEqual(['expired'])
    expect(feedAll([`no saved session found with id ${ATTEMPTED_ID}${LF}`])).toEqual(['expired'])
    expect(feedAll(['not LOGGED in' + LF])).toEqual(['auth'])
  })

  it('ignora ANSI no meio da frase, inclusive no meio de uma palavra', () => {
    expect(
      feedAll([`No ${ESC}[1mconversation${ESC}[22m found with ${ESC}[31msession ID${ESC}[0m: ${ATTEMPTED_ID}${CRLF}`]),
    ).toEqual(['expired'])
    expect(feedAll([`No saved ses${ESC}[38;5;9msion found with ID ${ESC}[1m${ATTEMPTED_ID}${ESC}[0m${LF}`])).toEqual([
      'expired',
    ])
    // Espaço desenhado como "cursor para a frente", como uma TUI faz.
    expect(feedAll([`Invalid${ESC}[1CAPI key ${MIDDLE_DOT} Fix external API key${CRLF}`])).toEqual(['auth'])
  })

  it('trata posicionamento de cursor como troca de linha, como a TUI desenha', () => {
    // Sem quebra nenhuma: cada linha nasce de um "vá para linha;coluna".
    expect(feedAll([`${ESC}[1;1HOpenAI Codex${ESC}[3;1H${TUI_BLOCK_GLYPH} Not logged in`])).toEqual(['auth'])
  })

  it('reconhece a frase partida entre dois pedaços', () => {
    expect(feedAll(['No conversation fo', `und with session ID: ${ATTEMPTED_ID}${CRLF}`])).toEqual([null, 'expired'])
    // Partida no meio do ID: metade do ID ainda não é o ID.
    expect(feedAll([`No saved session found with ID ${ATTEMPTED_ID.slice(0, 10)}`, `${ATTEMPTED_ID.slice(10)}${LF}`])).toEqual([
      null,
      'expired',
    ])
    expect(feedAll(['Your access token could not ', 'be refreshed'])).toEqual([null, 'auth'])
  })

  it('reconhece a frase com um escape partido entre dois pedaços', () => {
    expect(feedAll([`${CRLF}${ESC}[3`, `1mNo saved session found with ID ${ATTEMPTED_ID}${LF}`])).toEqual([null, 'expired'])
    expect(feedAll([`${ESC}]0;Codex`, `${BEL}No saved session found with ID ${ATTEMPTED_ID}${LF}`])).toEqual([
      null,
      'expired',
    ])
  })

  it('avisa uma vez só, mesmo que a frase seja redesenhada', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID })
    expect(detector.feed(`No conversation found with session ID: ${ATTEMPTED_ID}${CRLF}`)).toBe('expired')
    expect(detector.feed(`No conversation found with session ID: ${ATTEMPTED_ID}${CRLF}`)).toBeNull()
    expect(detector.feed(`Not logged in${CRLF}`)).toBeNull()
  })

  it('não confunde texto parecido com falha', () => {
    const benign = [
      `Logged in as pessoa@example.com${CRLF}`,
      `Logged in using ChatGPT${CRLF}`,
      `Not logged into GitHub${CRLF}`,
      `Not logged in yet, but the agent keeps working${CRLF}`,
      // A listagem de MCP do Codex, que a taxonomia de contas também exclui.
      `  Auth: Not logged in${CRLF}`,
      `Invalid API keys are rejected by the server${CRLF}`,
      `Authentication requirements changed${CRLF}`,
    ]
    for (const line of benign) {
      expect(feedAll([line]), line).toEqual([null])
    }
  })

  it('não confunde a frase citada por um agente com a resposta da CLI', () => {
    const quoted = [
      // Num teste, num diff ou numa explicação: aspas, sinal ou texto antes.
      `  expect(output).toContain('No conversation found with session ID: ${ATTEMPTED_ID}')${CRLF}`,
      `+  { phrase: 'No saved session found with ID ${ATTEMPTED_ID}', reason: 'expired' },${CRLF}`,
      `A CLI responde "Not logged in ${MIDDLE_DOT} Please run /login" quando falta login.${CRLF}`,
      `O Codex imprime No saved session found with ID ${ATTEMPTED_ID} quando a conversa sumiu.${CRLF}`,
      `${TUI_ASSISTANT_GLYPH} O Claude diz: No conversation found with session ID: ${ATTEMPTED_ID}${CRLF}`,
    ]
    for (const line of quoted) {
      expect(feedAll([line]), line).toEqual([null])
    }
  })

  it('não confunde o histórico redesenhado de uma retomada que deu certo com a resposta da CLI', () => {
    // O boot de `claude --resume <id>` redesenha a conversa anterior: ⏺ abre a
    // mensagem do agente (e a chamada de ferramenta), ⎿ abre o resultado, e as
    // linhas seguintes do bloco só vêm recuadas.
    const history = [
      `> rode o claude sem login e depois retome outra conversa`,
      `${TUI_ASSISTANT_GLYPH} Bash(claude -p "oi")`,
      `  ${TUI_RESULT_GLYPH}  Error: Exit code 1`,
      `     Not logged in ${MIDDLE_DOT} Please run /login`,
      `     Invalid API key ${MIDDLE_DOT} Fix external API key`,
      '',
      `${TUI_ASSISTANT_GLYPH} Bash(claude --resume ${OTHER_ID})`,
      `  ${TUI_RESULT_GLYPH}  No conversation found with session ID: ${OTHER_ID}`,
      `  ${TUI_RESULT_GLYPH}  Not logged in ${MIDDLE_DOT} Please run /login`,
      // Nem o ID tentado torna uma linha da conversa a resposta deste spawn.
      `  ${TUI_RESULT_GLYPH}  No conversation found with session ID: ${ATTEMPTED_ID}`,
      `${TUI_ASSISTANT_GLYPH} Not logged in`,
      `  Your access token could not be refreshed`,
    ].join(CRLF)
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID })
    expect(detector.feed(`${BOOT}${history}${CRLF}`)).toBeNull()
    // Terminado o histórico, a entrada de pé: a conversa foi retomada.
    expect(detector.feed(`${BOX_LINE}${CRLF}${TUI_PROMPT_GLYPH} ${CRLF}${BOX_LINE}${CRLF}`)).toBeNull()
  })

  it('segue tratando como conversa a continuação de um bloco que chega noutro pedaço', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID })
    expect(detector.feed(`${TUI_ASSISTANT_GLYPH} Bash(claude -p "oi")${CRLF}  ${TUI_RESULT_GLYPH}  Error: Exit code 1${CRLF}`)).toBeNull()
    expect(detector.feed(`     Not logged in ${MIDDLE_DOT} Please ru`)).toBeNull()
    expect(detector.feed(`n /login${CRLF}`)).toBeNull()
    // Uma linha na coluna zero (a borda da entrada) fecha o bloco: a linha de
    // topo seguinte volta a valer como resposta da CLI.
    expect(detector.feed(`${BOX_LINE}${CRLF}`)).toBeNull()
    expect(detector.feed(`  Not logged in ${MIDDLE_DOT} Please run /login${CRLF}`)).toBe('auth')
  })

  it('não se perde com linhas longas sem quebra e não ancora no meio de uma linha cortada', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID })
    // Uma linha maior que o buffer, com texto antes da frase: não é falha.
    expect(detector.feed('x'.repeat(100))).toBeNull()
    expect(
      detector.feed(' '.repeat(RESUME_OUTCOME_BUFFER_CHARS) + `No conversation found with session ID: ${ATTEMPTED_ID}`),
    ).toBeNull()
    // O começo ("xxx") foi descartado e o que sobrou abre com espaços: sem a
    // marca de linha cortada, o próximo pedaço da MESMA linha casaria aqui.
    expect(detector.feed(' e continua na mesma linha')).toBeNull()
    // Na linha seguinte, a âncora volta a valer.
    expect(detector.feed(`${CRLF}No conversation found with session ID: ${ATTEMPTED_ID}${CRLF}`)).toBe('expired')
  })

  it('ignora pedaço vazio e o preâmbulo do boot', () => {
    expect(feedAll(['', BOOT, `${ESC}[?25l`])).toEqual([null, null, null])
  })
})

describe('recusas do Gemini: só com a saída 42', () => {
  const geminiRefusals = resumeFixtures.versions.find((fixture) => fixture.provider === 'gemini' && fixture.refusals.length > 0)!
    .refusals
  const invalidId = geminiRefusals[0].output
  const noSessions = geminiRefusals[1].output

  it('o ID entre aspas conta, e só com a saída 42', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID, provider: 'gemini' })
    expect(detector.feed(invalidId.replaceAll('<id>', ATTEMPTED_ID))).toBeNull()
    expect(detector.exit(1)).toBeNull()
    expect(detector.exit(42)).toBe('expired')
    // Avisa uma vez só.
    expect(detector.exit(42)).toBeNull()
  })

  it('o ID de outra conversa na mesma frase não conta, nem com a saída 42', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID, provider: 'gemini' })
    expect(detector.feed(invalidId.replaceAll('<id>', OTHER_ID))).toBeNull()
    expect(detector.exit(42)).toBeNull()
  })

  it('"No previous sessions…" sem ID conta com a saída 42, mesmo sem quebra no fim', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID, provider: 'gemini' })
    expect(detector.feed(noSessions.trimEnd())).toBeNull()
    expect(detector.exit(42)).toBe('expired')
  })

  it('a conversa redesenhada que cita a frase não vira recusa: o processo não sai com 42', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID, provider: 'gemini' })
    const MODEL_GLYPH = String.fromCharCode(0x2726) // ✦, mensagem do modelo no Gemini
    expect(detector.feed(` > por que deu erro?${CRLF}`)).toBeNull()
    expect(detector.feed(`${MODEL_GLYPH} ${noSessions}`)).toBeNull()
    // A pessoa fechou o Gemini normalmente depois da retomada.
    expect(detector.exit(0)).toBeNull()
  })

  it('o detector de outra CLI não usa as frases do Gemini', () => {
    for (const provider of ['claude', 'codex']) {
      const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID, provider })
      expect(detector.feed(noSessions)).toBeNull()
      expect(detector.exit(42)).toBeNull()
    }
  })

  it('o detector do Gemini não usa as frases de login do Claude e do Codex', () => {
    const detector = createResumeOutcomeDetector({ sessionId: ATTEMPTED_ID, provider: 'gemini' })
    expect(detector.feed(`Not logged in ${MIDDLE_DOT} Please run /login${CRLF}`)).toBeNull()
  })
})

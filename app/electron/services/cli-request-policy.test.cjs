// Testes de caracterização: capturam o comportamento que `ipc-handlers.cjs`
// já tinha antes da extração deste módulo, para que a refatoração possa ser
// verificada em vez de presumida. Escritos a partir da leitura do código
// original, ANTES de mover qualquer linha.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createOrchestrationLimits,
  isValidOrchestrationCliType,
  normalizeAvailableModel,
  normalizeAvailableModels,
  normalizeOrchestrationSettings,
  normalizeStringList,
  resolveCliCwd,
  toPositiveIntegerOrUndefined,
  validateCliRequest,
} = require('./cli-request-policy.cjs')

const VALID_MODEL = {
  id: 'm1',
  name: 'Claude',
  command: 'claude',
  source: 'official',
  cliType: 'claude',
}

test('toPositiveIntegerOrUndefined aceita apenas inteiros maiores que zero', () => {
  assert.equal(toPositiveIntegerOrUndefined(1), 1)
  assert.equal(toPositiveIntegerOrUndefined(42), 42)

  // Zero, negativos, fracionários e não-números viram undefined — o chamador
  // trata "não informado" e "inválido" da mesma forma, de propósito.
  assert.equal(toPositiveIntegerOrUndefined(0), undefined)
  assert.equal(toPositiveIntegerOrUndefined(-1), undefined)
  assert.equal(toPositiveIntegerOrUndefined(1.5), undefined)
  assert.equal(toPositiveIntegerOrUndefined('3'), undefined)
  assert.equal(toPositiveIntegerOrUndefined(null), undefined)
  assert.equal(toPositiveIntegerOrUndefined(undefined), undefined)
  assert.equal(toPositiveIntegerOrUndefined(Number.NaN), undefined)
})

test('normalizeStringList descarta entradas vazias e não-strings', () => {
  assert.deepEqual(normalizeStringList(['a', 'b']), ['a', 'b'])
  assert.deepEqual(normalizeStringList(['a', '', '   ', null, 7, 'b']), ['a', 'b'])

  // Qualquer coisa que não seja array vira lista vazia, nunca null/undefined,
  // para o chamador poder iterar sem checar.
  assert.deepEqual(normalizeStringList(null), [])
  assert.deepEqual(normalizeStringList(undefined), [])
  assert.deepEqual(normalizeStringList('a,b'), [])
})

test('isValidOrchestrationCliType reconhece exatamente as CLIs suportadas', () => {
  for (const cliType of ['claude', 'codex', 'codex-app-server', 'gemini', 'gemini-acp']) {
    assert.equal(isValidOrchestrationCliType(cliType), true, `${cliType} deveria ser válido`)
  }

  for (const cliType of ['unknown', 'ollama', '', null, undefined, 'Claude']) {
    assert.equal(isValidOrchestrationCliType(cliType), false, `${cliType} não deveria ser válido`)
  }
})

test('normalizeAvailableModel exige os campos obrigatórios e um cliType suportado', () => {
  assert.deepEqual(normalizeAvailableModel(VALID_MODEL), {
    id: 'm1',
    name: 'Claude',
    command: 'claude',
    source: 'official',
    cliType: 'claude',
    providerModel: undefined,
    reasoningEffort: undefined,
  })

  assert.equal(normalizeAvailableModel(null), null)
  assert.equal(normalizeAvailableModel('modelo'), null)
  assert.equal(normalizeAvailableModel({ ...VALID_MODEL, id: 42 }), null)
  assert.equal(normalizeAvailableModel({ ...VALID_MODEL, name: undefined }), null)
  assert.equal(normalizeAvailableModel({ ...VALID_MODEL, cliType: 'ollama' }), null)
})

test('normalizeAvailableModel apara providerModel e reasoningEffort, tratando vazio como ausente', () => {
  const model = normalizeAvailableModel({
    ...VALID_MODEL,
    providerModel: '  claude-sonnet-5  ',
    reasoningEffort: '  high  ',
  })

  assert.equal(model.providerModel, 'claude-sonnet-5')
  assert.equal(model.reasoningEffort, 'high')

  const blank = normalizeAvailableModel({
    ...VALID_MODEL,
    providerModel: '   ',
    reasoningEffort: '',
  })

  assert.equal(blank.providerModel, undefined)
  assert.equal(blank.reasoningEffort, undefined)
})

test('normalizeAvailableModels remove modelos inválidos e mantém a ordem', () => {
  const models = normalizeAvailableModels([
    VALID_MODEL,
    { ...VALID_MODEL, id: 'm2', cliType: 'ollama' },
    null,
    { ...VALID_MODEL, id: 'm3', cliType: 'gemini' },
  ])

  assert.deepEqual(
    models.map((model) => model.id),
    ['m1', 'm3'],
  )
})

test('normalizeAvailableModels devolve null quando a entrada não é uma lista', () => {
  // Distinto de lista vazia: null significa "o renderer não mandou modelos",
  // enquanto [] significa "mandou, mas nenhum é utilizável".
  assert.equal(normalizeAvailableModels(undefined), null)
  assert.equal(normalizeAvailableModels(null), null)
  assert.equal(normalizeAvailableModels('claude'), null)
  assert.deepEqual(normalizeAvailableModels([]), [])
})

test('normalizeOrchestrationSettings preenche listas e limites a partir de entrada parcial', () => {
  assert.deepEqual(
    normalizeOrchestrationSettings({
      preferredModelIds: ['a', '', 'b'],
      maxTurns: 3,
      maxAgentsPerTurn: 0,
    }),
    {
      preferredModelIds: ['a', 'b'],
      blockedModelIds: [],
      maxAgentsPerTurn: undefined,
      maxTurns: 3,
      maxTotalAgents: undefined,
      maxRuntimeMinutes: undefined,
    },
  )
})

test('normalizeOrchestrationSettings devolve null para entrada que não é objeto', () => {
  assert.equal(normalizeOrchestrationSettings(null), null)
  assert.equal(normalizeOrchestrationSettings(undefined), null)
  assert.equal(normalizeOrchestrationSettings('padrao'), null)
})

test('createOrchestrationLimits extrai só os limites, ignorando as listas de modelos', () => {
  const settings = normalizeOrchestrationSettings({
    preferredModelIds: ['a'],
    blockedModelIds: ['b'],
    maxAgentsPerTurn: 2,
    maxTurns: 4,
    maxTotalAgents: 8,
    maxRuntimeMinutes: 30,
  })

  assert.deepEqual(createOrchestrationLimits(settings), {
    maxAgentsPerTurn: 2,
    maxTurns: 4,
    maxTotalAgents: 8,
    maxRuntimeMinutes: 30,
  })
})

test('createOrchestrationLimits devolve undefined sem settings, para o runner cair no padrão', () => {
  assert.equal(createOrchestrationLimits(null), undefined)
  assert.equal(createOrchestrationLimits(undefined), undefined)
})

test('validateCliRequest extrai os campos da requisição, com threadId caindo no sessionId', () => {
  const result = validateCliRequest({
    sessionId: 's1',
    prompt: 'oi',
  })

  assert.equal(result.ok, true)
  assert.equal(result.streamSessionId, 's1')
  // Sem threadId próprio, a thread é a própria sessão de stream.
  assert.equal(result.threadId, 's1')
  assert.equal(result.prompt, 'oi')
})

test('validateCliRequest preserva um threadId distinto do sessionId', () => {
  const result = validateCliRequest({
    sessionId: 's1',
    threadId: 't1',
    prompt: 'oi',
  })

  assert.equal(result.ok, true)
  assert.equal(result.streamSessionId, 's1')
  assert.equal(result.threadId, 't1')
})

test('validateCliRequest rejeita requisição sem sessão ou sem prompt', () => {
  const semSessao = validateCliRequest({ prompt: 'oi' })
  assert.equal(semSessao.ok, false)
  assert.equal(semSessao.message, 'Prompt ou sessão inválidos.')

  const semPrompt = validateCliRequest({ sessionId: 's1' })
  assert.equal(semPrompt.ok, false)
  assert.equal(semPrompt.message, 'Prompt ou sessão inválidos.')

  // String vazia e espaços contam como ausente.
  assert.equal(validateCliRequest({ sessionId: 's1', prompt: '   ' }).ok, false)
  assert.equal(validateCliRequest({ sessionId: '', prompt: 'oi' }).ok, false)
  assert.equal(validateCliRequest(undefined).ok, false)
})

test('validateCliRequest devolve string vazia (não undefined) para os prompts opcionais ausentes', () => {
  // Espelha getRequiredString, que sempre devolve string — o restante do fluxo
  // usa `||` para decidir fallback, então a distinção vazio/undefined não
  // muda comportamento, mas o contrato é string.
  const result = validateCliRequest({ sessionId: 's1', prompt: 'oi' })

  assert.equal(result.resumePrompt, '')
  assert.equal(result.promptHint, '')
  assert.equal(result.projectCwd, null)
})

test('validateCliRequest apara espaços dos campos de texto', () => {
  const result = validateCliRequest({
    sessionId: '  s1  ',
    threadId: '  t1  ',
    prompt: '  oi  ',
    resumePrompt: '  retoma  ',
    promptHint: '  dica  ',
  })

  assert.equal(result.streamSessionId, 's1')
  assert.equal(result.threadId, 't1')
  assert.equal(result.prompt, 'oi')
  assert.equal(result.resumePrompt, 'retoma')
  assert.equal(result.promptHint, 'dica')
})

test('validateCliRequest só aceita cwd string não vazia, senão null', () => {
  assert.equal(validateCliRequest({ sessionId: 's', prompt: 'p', cwd: '/tmp' }).projectCwd, '/tmp')
  assert.equal(validateCliRequest({ sessionId: 's', prompt: 'p', cwd: '' }).projectCwd, null)
  assert.equal(validateCliRequest({ sessionId: 's', prompt: 'p', cwd: 42 }).projectCwd, null)
  assert.equal(validateCliRequest({ sessionId: 's', prompt: 'p' }).projectCwd, null)
})

test('resolveCliCwd devolve o home do usuário, com o cwd do processo como fallback', () => {
  const originalHome = process.env.HOME

  try {
    process.env.HOME = '/home/exemplo'
    // O cliType não influencia o resultado: o parâmetro existia num `if` cujos
    // dois ramos eram idênticos desde o commit inicial do backend.
    assert.equal(resolveCliCwd('codex'), '/home/exemplo')
    assert.equal(resolveCliCwd('claude'), '/home/exemplo')
    assert.equal(resolveCliCwd(undefined), '/home/exemplo')

    delete process.env.HOME
    assert.equal(resolveCliCwd('codex'), process.cwd())
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  }
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { discoverAgentSession, selectDiscoveryContext } = require('./agent-session-discovery.cjs')

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-session-'))
  return {
    root,
    cwd: path.join(root, 'repo'),
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('descobre somente o metadata do rollout Codex criado para o cwd', () => {
  const item = fixture()
  try {
    const file = path.join(item.root, '.codex', 'sessions', '2026', '08', '25', 'rollout-test.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      `${JSON.stringify({ type: 'session_meta', payload: { id: 'codex-session-123', cwd: item.cwd } })}\n` +
        `${JSON.stringify({ role: 'user', content: 'não deve ser lido' })}\n`,
    )
    const startedAt = Date.now()
    const result = discoverAgentSession({
      command: 'codex',
      cwd: item.cwd,
      startedAt,
      homeDir: item.root,
      now: Date.now(),
    })

    assert.deepEqual(result, {
      version: 1,
      provider: 'codex',
      sessionId: 'codex-session-123',
      cwd: item.cwd,
      capturedAt: result.capturedAt,
      source: 'cli-history',
    })
  } finally {
    item.dispose()
  }
})

test('não associa rollout de outro diretório nem sessão antiga', () => {
  const item = fixture()
  try {
    const file = path.join(item.root, '.codex', 'sessions', '2026', '08', '25', 'rollout-old.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ payload: { id: 'old-session', cwd: path.join(item.root, 'outro') } }))
    const result = discoverAgentSession({
      command: 'codex',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      now: Date.now(),
    })
    assert.equal(result, null)
  } finally {
    item.dispose()
  }
})

test('descobre a sessão Gemini usando somente a raiz de projeto e o cabeçalho', () => {
  const item = fixture()
  try {
    const project = path.join(item.root, '.gemini', 'tmp', 'hash')
    const file = path.join(project, 'chats', 'session-test.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(path.join(project, '.project_root'), `${item.cwd}\n`)
    fs.writeFileSync(file, `${JSON.stringify({ sessionId: 'gemini-session-123' })}\n`)
    const result = discoverAgentSession({
      command: 'gemini',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      now: Date.now(),
    })
    assert.equal(result?.provider, 'gemini')
    assert.equal(result?.sessionId, 'gemini-session-123')
    assert.equal(result?.cwd, item.cwd)
  } finally {
    item.dispose()
  }
})

test('descobre a sessão Claude no diretório de projeto codificado pela própria CLI', () => {
  const item = fixture()
  try {
    const encoded = item.cwd
      .split(path.sep)
      .join('-')
      .replace(/[^A-Za-z0-9_-]/g, '-')
    const file = path.join(item.root, '.claude', 'projects', encoded, 'session.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify({ type: 'mode', sessionId: 'claude-session-123' })}\n`)
    const result = discoverAgentSession({
      command: 'claude',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      now: Date.now(),
    })
    assert.equal(result?.provider, 'claude')
    assert.equal(result?.sessionId, 'claude-session-123')
  } finally {
    item.dispose()
  }
})

function writeClaudeSession(configRoot, cwd, sessionId) {
  const encoded = cwd
    .split(path.sep)
    .join('-')
    .replace(/[^A-Za-z0-9_-]/g, '-')
  const file = path.join(configRoot, 'projects', encoded, `${sessionId}.jsonl`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ type: 'mode', sessionId })}\n`)
}

test('Claude de conta própria: procura em CLAUDE_CONFIG_DIR/projects, não no ~/.claude do sistema', () => {
  const item = fixture()
  try {
    const perfil = path.join(item.root, 'cli-profiles', 'claude', 'conta-max')
    writeClaudeSession(perfil, item.cwd, 'claude-sessao-da-conta')
    // Outra conversa no MESMO diretório, aberta pelo login do sistema.
    writeClaudeSession(path.join(item.root, '.claude'), item.cwd, 'claude-sessao-do-sistema')

    const daConta = discoverAgentSession({
      command: 'claude',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      env: { CLAUDE_CONFIG_DIR: perfil },
      now: Date.now(),
    })
    assert.equal(daConta?.sessionId, 'claude-sessao-da-conta')

    const doSistema = discoverAgentSession({
      command: 'claude',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      env: {},
      now: Date.now(),
    })
    assert.equal(doSistema?.sessionId, 'claude-sessao-do-sistema')
  } finally {
    item.dispose()
  }
})

test('o contexto da descoberta leva só as pastas de histórico e a HOME do perfil', () => {
  assert.deepEqual(
    selectDiscoveryContext({
      PATH: '/usr/bin',
      CODEX_HOME: '/perfis/codex/a',
      CLAUDE_CONFIG_DIR: '',
      OPENAI_API_KEY: 'sk-sentinela',
      OPENROUTER_API_KEY: 'sk-or-sentinela',
      HOME: '/home/pessoa',
    }),
    { env: { CODEX_HOME: '/perfis/codex/a' }, homeDir: undefined },
  )
  assert.deepEqual(
    selectDiscoveryContext({ HOME: '/perfis/gemini/b', FELIXO_PROFILE_HOME: '/perfis/gemini/b', GEMINI_API_KEY: 'x' }),
    { env: {}, homeDir: '/perfis/gemini/b' },
  )
  assert.deepEqual(selectDiscoveryContext(undefined), { env: {}, homeDir: undefined })
})

function writeGeminiSession(homeDir, slug, projectRoot, sessionId) {
  const project = path.join(homeDir, '.gemini', 'tmp', slug)
  const file = path.join(project, 'chats', `session-${sessionId}.jsonl`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(path.join(project, '.project_root'), projectRoot)
  fs.writeFileSync(file, `${JSON.stringify({ sessionId, kind: 'main' })}\n`)
}

test('Gemini no Windows: casa o .project_root gravado em minúsculas com o cwd em outra caixa', () => {
  const item = fixture()
  try {
    // Medido no Gemini 0.57.0 instalado: no win32 o `.project_root` sai de
    // `path.resolve(cwd).toLowerCase()` (até a letra do disco e o "ç").
    const cwd = path.join(item.root, 'Programação', 'Repo-Felixo')
    writeGeminiSession(item.root, 'repo-felixo', cwd.toLowerCase(), 'gemini-sessao-win')

    const noWindows = discoverAgentSession({
      command: 'gemini',
      cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      now: Date.now(),
      platform: 'win32',
    })
    assert.equal(noWindows?.sessionId, 'gemini-sessao-win')
    assert.equal(noWindows?.cwd, cwd, 'a referência leva o cwd do terminal, não o normalizado')

    // Fora do Windows o Gemini preserva a caixa: pastas que diferem só na
    // caixa podem ser projetos diferentes, então não casam.
    for (const platform of ['linux', 'darwin']) {
      const fora = discoverAgentSession({
        command: 'gemini',
        cwd,
        startedAt: Date.now(),
        homeDir: item.root,
        now: Date.now(),
        platform,
      })
      assert.equal(fora, null, `${platform} não deveria ignorar a caixa`)
    }
  } finally {
    item.dispose()
  }
})

function writeClaudeFile(configRoot, cwd, relativeFile, firstLine) {
  const encoded = cwd
    .split(path.sep)
    .join('-')
    .replace(/[^A-Za-z0-9_-]/g, '-')
  const file = path.join(configRoot, 'projects', encoded, relativeFile)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(firstLine)}\n`)
  return file
}

function setMtime(file, ms) {
  const seconds = ms / 1000
  fs.utimesSync(file, seconds, seconds)
}

/** Espera de verdade (síncrona): a data de criação só o sistema escreve. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

test('Claude: subagente com o mesmo sessionId não vira falso "ambíguo"', () => {
  const item = fixture()
  try {
    const configRoot = path.join(item.root, '.claude')
    const sessionId = 'claude-sessao-com-subagente'
    const principal = writeClaudeFile(configRoot, item.cwd, `${sessionId}.jsonl`, { type: 'mode', sessionId })
    // Formato real (conferido em ~/.claude/projects): o subagente mora em
    // `<sessionId>/subagents/` e a primeira linha repete o sessionId da mãe.
    const subagente = writeClaudeFile(
      configRoot,
      item.cwd,
      path.join(sessionId, 'subagents', 'agent-a1b2c3.jsonl'),
      { isSidechain: true, agentId: 'a1b2c3', sessionId },
    )
    const agora = Date.now()
    setMtime(principal, agora)
    setMtime(subagente, agora)

    const result = discoverAgentSession({
      command: 'claude',
      cwd: item.cwd,
      startedAt: agora,
      homeDir: item.root,
      now: agora,
    })
    assert.equal(result?.sessionId, sessionId)
  } finally {
    item.dispose()
  }
})

test('a mesma sessão em dois arquivos conta uma vez; duas sessões juntas continuam ambíguas', () => {
  const item = fixture()
  try {
    const pasta = path.join(item.root, '.codex', 'sessions', '2026', '09', '29')
    fs.mkdirSync(pasta, { recursive: true })
    const agora = Date.now()
    const gravar = (nome, id) => {
      const file = path.join(pasta, nome)
      fs.writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { id, cwd: item.cwd } })}\n`)
      setMtime(file, agora)
    }
    gravar('rollout-a.jsonl', 'codex-sessao-unica')
    gravar('rollout-b.jsonl', 'codex-sessao-unica')
    const pedido = { command: 'codex', cwd: item.cwd, startedAt: agora, homeDir: item.root, now: agora }

    assert.equal(discoverAgentSession(pedido)?.sessionId, 'codex-sessao-unica')

    // Outra conversa mexida no mesmo instante: aí é ambíguo de verdade, e
    // recusar continua sendo melhor que retomar a conversa errada.
    gravar('rollout-c.jsonl', 'codex-sessao-outra')
    assert.equal(discoverAgentSession(pedido), null)

    // A que já pertence a outro terminal do app não concorre.
    assert.equal(
      discoverAgentSession({ ...pedido, excludeSessionIds: ['codex-sessao-outra'] })?.sessionId,
      'codex-sessao-unica',
    )
  } finally {
    item.dispose()
  }
})

test('busca ancorada na escrita: conversa ativa de outro terminal, nascida antes, não passa pela nova', (t) => {
  const item = fixture()
  try {
    const configRoot = path.join(item.root, '.claude')
    const spawnEm = Date.now() - 60_000
    const irma = writeClaudeFile(configRoot, item.cwd, 'claude-irma-antiga.jsonl', {
      type: 'mode',
      sessionId: 'claude-irma-antiga',
    })
    sleepSync(1200)

    // A pessoa escreve a primeira mensagem agora; só então a CLI cria o
    // arquivo desta conversa.
    const escritaEm = Date.now()
    const nova = writeClaudeFile(configRoot, item.cwd, 'claude-conversa-nova.jsonl', {
      type: 'mode',
      sessionId: 'claude-conversa-nova',
    })
    // O subagente da irmã nasce depois da escrita: não pode passar por
    // conversa nova.
    const subagenteDaIrma = writeClaudeFile(
      configRoot,
      item.cwd,
      path.join('claude-irma-antiga', 'subagents', 'agent-x.jsonl'),
      { isSidechain: true, sessionId: 'claude-irma-antiga' },
    )
    // As duas conversas seguem ativas: mtime idêntico e recente.
    const agora = Date.now()
    for (const file of [irma, nova, subagenteDaIrma]) setMtime(file, agora)

    const nascimentoDaIrma = fs.statSync(irma).birthtimeMs
    if (!(nascimentoDaIrma > 0 && nascimentoDaIrma < escritaEm - 1000)) {
      t.skip('sistema de arquivos sem data de criação confiável')
      return
    }

    // Pela regra da janela do spawn (mtime perto do spawn), as duas empatam.
    assert.equal(
      discoverAgentSession({ command: 'claude', cwd: item.cwd, startedAt: spawnEm, homeDir: item.root, now: agora }),
      null,
    )
    const ancorada = discoverAgentSession({
      command: 'claude',
      cwd: item.cwd,
      startedAt: spawnEm,
      createdAfter: escritaEm,
      homeDir: item.root,
      now: agora,
    })
    assert.equal(ancorada?.sessionId, 'claude-conversa-nova')
  } finally {
    item.dispose()
  }
})

test('busca ancorada na escrita: quem nasceu antes do Enter só vale quando ninguém nasceu depois', (t) => {
  const item = fixture()
  try {
    const configRoot = path.join(item.root, '.claude')
    const escritaEm = Date.now()
    const agora = escritaEm + 5_000
    const alheia = writeClaudeFile(configRoot, item.cwd, 'claude-alheia-antes.jsonl', {
      type: 'mode',
      sessionId: 'claude-alheia-antes',
    })
    const propria = writeClaudeFile(configRoot, item.cwd, 'claude-propria-depois.jsonl', {
      type: 'mode',
      sessionId: 'claude-propria-depois',
    })
    // A conversa de outro terminal nasceu 300 ms ANTES do Enter (dentro da
    // folga do disco) e a deste, 600 ms DEPOIS: pela distância absoluta, a
    // alheia ganhava. A data de criação só o sistema escreve, então o stat
    // devolve datas fixas: o teste não depende do disco nem do relógio.
    const nascimentos = new Map([
      [alheia, escritaEm - 300],
      [propria, escritaEm + 600],
    ])
    const statReal = fs.statSync
    t.mock.method(fs, 'statSync', (file, ...resto) => {
      const nascimento = nascimentos.get(file)
      return nascimento === undefined ? statReal(file, ...resto) : { mtimeMs: agora, birthtimeMs: nascimento }
    })
    const pedido = {
      command: 'claude',
      cwd: item.cwd,
      startedAt: escritaEm - 60_000,
      createdAfter: escritaEm,
      homeDir: item.root,
      now: agora,
    }

    assert.equal(discoverAgentSession(pedido)?.sessionId, 'claude-propria-depois')

    // Nascidas dos dois lados a menos de 250 ms uma da outra: a de antes não
    // concorre, então também não vira "ambíguo".
    nascimentos.set(alheia, escritaEm - 100)
    nascimentos.set(propria, escritaEm + 100)
    assert.equal(discoverAgentSession(pedido)?.sessionId, 'claude-propria-depois')

    // Ninguém nasceu depois do Enter: a folga para trás continua valendo
    // (disco que trunca a data no segundo), e a de fora da folga, não.
    nascimentos.set(alheia, escritaEm - 300)
    nascimentos.set(propria, escritaEm - 2_000)
    assert.equal(discoverAgentSession(pedido)?.sessionId, 'claude-alheia-antes')
  } finally {
    item.dispose()
  }
})

test('Gemini de conta própria procura dentro da HOME do perfil', () => {
  const item = fixture()
  try {
    const perfil = path.join(item.root, 'cli-profiles', 'gemini', 'conta-g')
    const project = path.join(perfil, '.gemini', 'tmp', 'hash')
    const file = path.join(project, 'chats', 'session-perfil.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(path.join(project, '.project_root'), `${item.cwd}\n`)
    fs.writeFileSync(file, `${JSON.stringify({ sessionId: 'gemini-sessao-do-perfil' })}\n`)

    const contexto = selectDiscoveryContext({ HOME: perfil, FELIXO_PROFILE_HOME: perfil })
    const result = discoverAgentSession({
      command: 'gemini',
      cwd: item.cwd,
      startedAt: Date.now(),
      now: Date.now(),
      ...contexto,
    })
    assert.equal(result?.sessionId, 'gemini-sessao-do-perfil')
  } finally {
    item.dispose()
  }
})

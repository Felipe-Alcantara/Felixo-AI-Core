const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)
const GIT_COMMAND_TIMEOUT_MS = 10000
const GIT_COMMAND_MAX_BUFFER = 1024 * 1024

async function getGitProjectSummary(projectPath) {
  const cwd = normalizeGitProjectPath(projectPath)
  const [statusOutput, diffStatOutput, commitsOutput, branchOutput] =
    await Promise.all([
      // `--untracked-files=all` porque o padrao colapsa uma pasta nova numa
      // linha unica ("sub/"), e assim nao da pra abrir nem adicionar um
      // arquivo de dentro dela pela interface.
      runGit(cwd, ['status', '--short', '--branch', '--untracked-files=all']),
      runGit(cwd, ['diff', '--stat']),
      runGit(cwd, ['log', '-5', '--oneline', '--decorate=short']),
      runGit(cwd, ['branch', '--show-current']),
    ])
  const statusLines = parseGitStatusLines(statusOutput)
  const branch = parseGitBranch(statusLines, branchOutput)
  const recentCommits = commitsOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    projectPath: cwd,
    branch,
    statusLines: statusLines.filter((line) => !line.startsWith('## ')),
    diffStat: diffStatOutput.trim(),
    recentCommits,
    isClean: statusLines.filter((line) => !line.startsWith('## ')).length === 0,
  }
}

async function stageAllChanges(projectPath) {
  const cwd = normalizeGitProjectPath(projectPath)
  await runGit(cwd, ['add', '--all'])
  return getGitProjectSummary(cwd)
}

async function unstageAllChanges(projectPath) {
  const cwd = normalizeGitProjectPath(projectPath)
  await runGit(cwd, ['restore', '--staged', '--', '.'])
  return getGitProjectSummary(cwd)
}

async function commitStagedChanges(projectPath, message) {
  const cwd = normalizeGitProjectPath(projectPath)
  const commitMessage = normalizeCommitMessage(message)
  const output = await runGit(cwd, ['commit', '-m', commitMessage])
  const summary = await getGitProjectSummary(cwd)

  return {
    output: output.trim(),
    summary,
  }
}

async function runGit(cwd, args, options = {}) {
  assertAllowedGitArgs(args)

  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_COMMAND_TIMEOUT_MS,
      maxBuffer: GIT_COMMAND_MAX_BUFFER,
    })

    return stdout
  } catch (error) {
    // `git diff --no-index` sai com codigo 1 quando ENCONTRA diferenca, que
    // e justamente o caso de sucesso ao pedir o diff de um arquivo novo.
    // Só esse codigo, e só quando quem chamou pediu, vira sucesso; qualquer
    // outra falha continua subindo.
    if (
      options.tolerarDiferenca &&
      error &&
      error.code === 1 &&
      typeof error.stdout === 'string'
    ) {
      return error.stdout
    }

    throw error
  }
}

function normalizeGitProjectPath(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('Caminho do projeto Git invalido.')
  }

  const resolvedPath = path.resolve(projectPath)
  const stat = fs.statSync(resolvedPath)

  if (!stat.isDirectory()) {
    throw new Error('O caminho selecionado nao e uma pasta.')
  }

  const gitPath = path.join(resolvedPath, '.git')

  if (!fs.existsSync(gitPath)) {
    throw new Error('A pasta selecionada nao contem um repositorio Git.')
  }

  return resolvedPath
}

function assertAllowedGitArgs(args) {
  if (!Array.isArray(args)) {
    throw new Error('Comando Git nao permitido.')
  }

  const key = args.join('\0')
  const allowed = new Set([
    ['status', '--short', '--branch'].join('\0'),
    ['status', '--short', '--branch', '--untracked-files=all'].join('\0'),
    ['diff', '--stat'].join('\0'),
    ['log', '-5', '--oneline', '--decorate=short'].join('\0'),
    ['branch', '--show-current'].join('\0'),
    ['add', '--all'].join('\0'),
    ['restore', '--staged', '--', '.'].join('\0'),
  ])

  if (allowed.has(key)) {
    return
  }

  if (isAllowedCommitArgs(args)) {
    return
  }

  if (isAllowedPathArgs(args)) {
    return
  }

  throw new Error('Comando Git nao permitido.')
}

/**
 * Formas cujo ultimo argumento e um caminho, e portanto variavel.
 *
 * A allowlist literal continua valendo para todo o resto: aqui so entra o
 * prefixo fixo do comando. O caminho e conferido por
 * `assertSafeRepoRelativePath`, que lanca se ele tentar virar opcao, sair da
 * raiz ou carregar byte nulo — entao um valor ruim derruba a chamada em vez
 * de escapar para o git. O `--` antes dele e a segunda barreira: com ele o
 * git nao interpreta o que vem depois como opcao, mesmo que a validacao
 * mude um dia.
 */
function isAllowedPathArgs(args) {
  const prefixos = [
    ['add', '--'],
    ['restore', '--staged', '--'],
    ['diff', '--unified=3', '--'],
    ['diff', '--staged', '--unified=3', '--'],
  ]

  for (const prefixo of prefixos) {
    if (args.length !== prefixo.length + 1) continue
    if (prefixo.every((valor, indice) => args[indice] === valor)) {
      assertSafeRepoRelativePath(args[args.length - 1])
      return true
    }
  }

  // Arquivo novo nao tem lado anterior: o git compara com o lado vazio,
  // escrito como /dev/null tambem no Windows (ver getFileDiff).
  if (
    args.length === 6 &&
    args[0] === 'diff' &&
    args[1] === '--no-index' &&
    args[2] === '--unified=3' &&
    args[3] === '--' &&
    args[4] === '/dev/null'
  ) {
    assertSafeRepoRelativePath(args[5])
    return true
  }

  return false
}

function isAllowedCommitArgs(args) {
  return (
    args.length === 3 &&
    args[0] === 'commit' &&
    args[1] === '-m' &&
    typeof args[2] === 'string' &&
    normalizeCommitMessage(args[2]) === args[2]
  )
}

function normalizeCommitMessage(message) {
  if (typeof message !== 'string') {
    throw new Error('Mensagem de commit invalida.')
  }

  const normalizedMessage = message.replace(/\s+/g, ' ').trim()

  if (!normalizedMessage) {
    throw new Error('Informe uma mensagem de commit.')
  }

  if (normalizedMessage.length > 200) {
    throw new Error('Mensagem de commit deve ter ate 200 caracteres.')
  }

  if (/[\r\n]/.test(message)) {
    throw new Error('Mensagem de commit deve ter apenas uma linha.')
  }

  return normalizedMessage
}

function parseGitStatusLines(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
}

function parseGitBranch(statusLines, fallbackOutput = '') {
  const branchLine = statusLines.find((line) => line.startsWith('## '))
  const fallback = String(fallbackOutput ?? '').trim()

  if (!branchLine) {
    return fallback || null
  }

  const normalizedLine = branchLine.replace(/^##\s+/, '')
  const branch = normalizedLine.split('...')[0]?.trim()

  return branch || fallback || null
}

/**
 * Entradas de status estruturadas, uma por arquivo.
 *
 * O painel antes mostrava as linhas cruas do `git status --short` como texto
 * monoespaçado. Isso serve para ler, não para operar: não dá pra saber, sem
 * decorar o formato porcelain, se um arquivo está no stage, fora dele, ou nos
 * dois ao mesmo tempo — que é o caso comum de quem editou depois de adicionar.
 *
 * Formato porcelain: dois caracteres de estado (X = índice, Y = árvore de
 * trabalho) e o caminho. Renomeação vem como "R  antigo -> novo".
 */
function parseGitStatusEntries(statusLines) {
  const entradas = []

  for (const linha of statusLines) {
    if (typeof linha !== 'string' || linha.startsWith('## ') || linha.length < 4) {
      continue
    }

    const indice = linha[0]
    const arvore = linha[1]
    const resto = linha.slice(3)
    if (!resto) continue

    const seta = resto.indexOf(' -> ')
    const caminho = seta === -1 ? resto : resto.slice(seta + 4)
    const origem = seta === -1 ? null : resto.slice(0, seta)

    entradas.push({
      path: descitarCaminho(caminho),
      originalPath: origem === null ? null : descitarCaminho(origem),
      index: indice,
      worktree: arvore,
      // Untracked ocupa as duas colunas com "?" e não pode ser tratado como
      // modificação: ele não tem versão anterior com que comparar.
      untracked: indice === '?' && arvore === '?',
      staged: indice !== ' ' && indice !== '?',
      unstaged: arvore !== ' ' && arvore !== '?',
    })
  }

  return entradas
}

/**
 * O git envolve em aspas o caminho que tem caractere fora do ASCII imprimível
 * (acento, espaço em alguns casos, etc.) quando `core.quotePath` está ligado,
 * que é o padrão. Sem desfazer isso, um arquivo com acento — comum aqui —
 * chegaria na interface como "src/configura\303\247\303\243o.ts".
 */
function descitarCaminho(valor) {
  const texto = String(valor ?? '').trim()
  if (!texto.startsWith('"') || !texto.endsWith('"') || texto.length < 2) {
    return texto
  }

  const corpo = texto.slice(1, -1)
  const bytes = []
  for (let i = 0; i < corpo.length; i += 1) {
    if (corpo[i] === String.fromCharCode(92) && i + 3 < corpo.length) {
      const octal = corpo.slice(i + 1, i + 4)
      if (/^[0-7]{3}$/.test(octal)) {
        bytes.push(Number.parseInt(octal, 8))
        i += 3
        continue
      }
    }
    bytes.push(corpo.charCodeAt(i))
  }

  try {
    return Buffer.from(bytes).toString('utf8')
  } catch {
    return corpo
  }
}

/**
 * Aceita apenas caminho relativo ao repositório, como o próprio git devolve no
 * status. É o que permite abrir a allowlist para um argumento variável sem
 * abrir mão dela: o valor não pode virar opção, sair da raiz, nem carregar
 * byte nulo. O `--` na linha de comando já separa opções de caminhos; isto
 * aqui é a segunda barreira, para o caso de o `--` ser removido um dia.
 */
function assertSafeRepoRelativePath(valor) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error('Caminho de arquivo invalido.')
  }
  if (valor.includes('\0')) {
    throw new Error('Caminho de arquivo invalido.')
  }
  if (valor.startsWith('-')) {
    throw new Error('Caminho de arquivo invalido.')
  }
  if (path.isAbsolute(valor) || /^[A-Za-z]:/.test(valor)) {
    throw new Error('Caminho precisa ser relativo ao repositorio.')
  }

  const normalizado = path.normalize(valor).split(path.sep).join('/')
  if (normalizado === '..' || normalizado.startsWith('../')) {
    throw new Error('Caminho fora do repositorio.')
  }

  return normalizado
}

/**
 * Diff de um arquivo so. Untracked nao tem lado anterior no indice, entao o
 * git compara com o lado vazio, escrito como /dev/null nos TRES sistemas.
 * Parece errado no Windows, mas e o que funciona: o git entende esse caminho
 * como "nada". Medido aqui, os.devNull vira \.
ul e o git responde
 * "Could not access" — trocar por ele quebra a feature.
 */
async function getFileDiff(projectPath, filePath, options = {}) {
  const cwd = normalizeGitProjectPath(projectPath)
  const relativo = assertSafeRepoRelativePath(filePath)
  const staged = Boolean(options.staged)
  const untracked = Boolean(options.untracked)

  if (untracked) {
    const saida = await runGit(
      cwd,
      ['diff', '--no-index', '--unified=3', '--', '/dev/null', relativo],
      { tolerarDiferenca: true },
    )
    return { path: relativo, staged: false, untracked: true, diff: saida }
  }

  const args = staged
    ? ['diff', '--staged', '--unified=3', '--', relativo]
    : ['diff', '--unified=3', '--', relativo]

  return { path: relativo, staged, untracked: false, diff: await runGit(cwd, args) }
}

/** Coloca um arquivo no stage, sem arrastar o resto da árvore junto. */
async function stageFile(projectPath, filePath) {
  const cwd = normalizeGitProjectPath(projectPath)
  const relativo = assertSafeRepoRelativePath(filePath)
  await runGit(cwd, ['add', '--', relativo])
  return getGitProjectSummary(cwd)
}

/** Tira um arquivo do stage preservando a edição na árvore de trabalho. */
async function unstageFile(projectPath, filePath) {
  const cwd = normalizeGitProjectPath(projectPath)
  const relativo = assertSafeRepoRelativePath(filePath)
  await runGit(cwd, ['restore', '--staged', '--', relativo])
  return getGitProjectSummary(cwd)
}

module.exports = {
  assertAllowedGitArgs,
  assertSafeRepoRelativePath,
  commitStagedChanges,
  getFileDiff,
  getGitProjectSummary,
  normalizeGitProjectPath,
  normalizeCommitMessage,
  parseGitBranch,
  parseGitStatusEntries,
  parseGitStatusLines,
  stageAllChanges,
  stageFile,
  unstageAllChanges,
  unstageFile,
}

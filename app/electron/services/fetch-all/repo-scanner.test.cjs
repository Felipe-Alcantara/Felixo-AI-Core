const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  darwinCloudStoragePaths,
  filterIgnoredRepos,
  findGitRepos,
  isInsidePath,
  isSkippedFilesystemType,
  listLocalDrives,
  listMounts,
  localMountPoints,
  mountSkipPaths,
  normalizeComparablePath,
  parseBsdMounts,
  parseLinuxMounts,
  resolveScanRoots,
} = require('./repo-scanner.cjs')

/**
 * Cria uma árvore de pastas temporária a partir de um mapa caminho → conteúdo.
 * Um valor `null` cria diretório; string cria arquivo com aquele conteúdo.
 */
function makeTree(entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-scanner-'))

  for (const [relativePath, content] of Object.entries(entries)) {
    const target = path.join(root, relativePath)

    if (content === null) {
      fs.mkdirSync(target, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
  }

  return root
}

test('parseLinuxMounts extrai ponto de montagem e tipo, desescapando espaços', () => {
  const mounts = parseLinuxMounts([
    'proc /proc proc rw,nosuid 0 0',
    '/dev/sda2 /mnt/meu\\040disco ext4 rw 0 0',
    'linha-invalida',
  ])

  assert.deepEqual(mounts, [
    { mountPoint: '/proc', filesystemType: 'proc' },
    { mountPoint: '/mnt/meu disco', filesystemType: 'ext4' },
  ])
})

test('parseBsdMounts entende a saída do comando mount', () => {
  const mounts = parseBsdMounts([
    '/dev/disk1s1 on / (apfs, local, journaled)',
    'map auto_home on /System/Volumes/Data/home (autofs, automounted)',
    'sem formato conhecido',
  ])

  assert.deepEqual(mounts, [
    { mountPoint: '/', filesystemType: 'apfs' },
    { mountPoint: '/System/Volumes/Data/home', filesystemType: 'autofs' },
  ])
})

test('listMounts lê /proc/mounts usando IO injetável', async () => {
  const calls = []
  const mounts = await listMounts({
    platform: 'linux',
    fsModule: {
      existsSync(candidate) {
        calls.push(['exists', candidate])
        return true
      },
    },
    fsPromises: {
      async readFile(candidate, encoding) {
        calls.push(['read', candidate, encoding])
        return 'dev /mnt/dados ext4 rw 0 0\nproc /proc proc rw 0 0\n'
      },
    },
    execFileAsync: async () => {
      throw new Error('não deve consultar mount quando /proc/mounts existe')
    },
  })

  assert.deepEqual(mounts, [
    { mountPoint: '/mnt/dados', filesystemType: 'ext4' },
    { mountPoint: '/proc', filesystemType: 'proc' },
  ])
  assert.deepEqual(calls, [
    ['exists', '/proc/mounts'],
    ['read', '/proc/mounts', 'utf8'],
  ])
})

test('listMounts usa o comando BSD quando /proc/mounts não existe', async () => {
  const calls = []
  const mounts = await listMounts({
    platform: 'darwin',
    fsModule: { existsSync: () => false },
    execFileAsync: async (command, args, options) => {
      calls.push([command, args, options])
      return {
        stdout: '/dev/disk3s1 on / (apfs, local)\nmap auto_home on /System/Volumes/Data/home (autofs, automounted)\n',
      }
    },
  })

  assert.deepEqual(mounts, [
    { mountPoint: '/', filesystemType: 'apfs' },
    { mountPoint: '/System/Volumes/Data/home', filesystemType: 'autofs' },
  ])
  assert.deepEqual(calls, [['mount', [], { timeout: 10_000 }]])
})

test('listMounts não consulta IO no Windows', async () => {
  const mounts = await listMounts({
    platform: 'win32',
    fsModule: {
      existsSync() {
        throw new Error('não deve consultar /proc/mounts no Windows')
      },
    },
  })

  assert.deepEqual(mounts, [])
})

test('darwinCloudStoragePaths aceita fixture de usuários sem ler o disco', () => {
  const existing = new Set(['/Users/ana/Library/CloudStorage'])
  const paths = darwinCloudStoragePaths('/Users', {
    fsModule: {
      readdirSync: () => ['ana', 'Shared'],
      existsSync: (candidate) => existing.has(candidate),
    },
  })

  assert.deepEqual(paths, ['/Users/ana/Library/CloudStorage'])
})

test('mountSkipPaths cobre rede, /System/Volumes e CloudStorage no macOS', async () => {
  const skips = await mountSkipPaths(
    [
      { mountPoint: '/', filesystemType: 'apfs' },
      { mountPoint: '/Volumes/rede', filesystemType: 'smbfs' },
      { mountPoint: '/Volumes/dados', filesystemType: 'apfs' },
    ],
    {
      platform: 'darwin',
      darwinCloudStoragePathsFn: () => ['/Users/ana/Library/CloudStorage'],
    },
  )

  assert.deepEqual(skips, [
    '/Volumes/rede',
    '/System/Volumes',
    '/Users/ana/Library/CloudStorage',
  ])
})

test('isSkippedFilesystemType pula virtuais e de rede, mas não ntfs-3g', () => {
  assert.equal(isSkippedFilesystemType('proc'), true)
  assert.equal(isSkippedFilesystemType('nfs4'), true)
  assert.equal(isSkippedFilesystemType('fuse.sshfs'), true)
  // fuseblk é ntfs-3g: disco local de verdade, precisa ser varrido.
  assert.equal(isSkippedFilesystemType('fuseblk'), false)
  assert.equal(isSkippedFilesystemType('ext4'), false)
})

test('localMountPoints devolve / mais os discos locais, sem /boot nem virtuais', () => {
  const points = localMountPoints([
    { mountPoint: '/', filesystemType: 'ext4' },
    { mountPoint: '/proc', filesystemType: 'proc' },
    { mountPoint: '/boot/efi', filesystemType: 'vfat' },
    { mountPoint: '/mnt/dados', filesystemType: 'ext4' },
    { mountPoint: '/media/pendrive', filesystemType: 'vfat' },
  ])

  assert.deepEqual(points, ['/', '/media/pendrive', '/mnt/dados'])
})

test('localMountPoints filtra /System no macOS sem perder volumes locais', () => {
  const points = localMountPoints(
    [
      { mountPoint: '/', filesystemType: 'apfs' },
      { mountPoint: '/System/Volumes/Data', filesystemType: 'apfs' },
      { mountPoint: '/System/Library/Assets', filesystemType: 'apfs' },
      { mountPoint: '/Volumes/Backup', filesystemType: 'apfs' },
      { mountPoint: '/Volumes/rede', filesystemType: 'smbfs' },
      { mountPoint: '/boot', filesystemType: 'apfs' },
    ],
    { platform: 'darwin' },
  )

  assert.deepEqual(points, ['/', '/Volumes/Backup'])
})

test('listLocalDrives cobre unidades fixas e removíveis sem consultar discos reais', async () => {
  const calls = []
  const drives = await listLocalDrives({
    platform: 'win32',
    fsModule: {
      statSync(candidate) {
        calls.push(candidate)

        if (candidate === 'C:\\' || candidate === 'F:\\') {
          return { isDirectory: () => true }
        }

        throw new Error('unidade indisponível ou de rede')
      },
    },
  })

  assert.deepEqual(drives, ['C:\\', 'F:\\'])
  assert.equal(calls.length, 26)
  assert.equal(calls.at(-1), 'Z:\\')
})

test('listLocalDrives usa montagens POSIX injetadas no macOS', async () => {
  const calls = []
  const drives = await listLocalDrives({
    platform: 'darwin',
    listMountsFn: async (options) => {
      calls.push(options)
      return [
        { mountPoint: '/', filesystemType: 'apfs' },
        { mountPoint: '/System/Volumes/Data', filesystemType: 'apfs' },
        { mountPoint: '/Volumes/Projetos', filesystemType: 'apfs' },
        { mountPoint: '/Volumes/rede', filesystemType: 'smbfs' },
      ]
    },
  })

  assert.deepEqual(drives, ['/', '/Volumes/Projetos'])
  assert.deepEqual(calls, [{ platform: 'darwin' }])
})

test('resolveScanRoots usa os caminhos configurados quando existem', async () => {
  assert.deepEqual(await resolveScanRoots(['/tmp/um', '  ']), ['/tmp/um'])
})

test('resolveScanRoots permite inventariar drives por fixture', async () => {
  let calls = 0
  const roots = await resolveScanRoots([], {
    listLocalDrivesFn: async () => {
      calls += 1
      return ['C:\\', 'F:\\']
    },
  })

  assert.deepEqual(roots, ['C:\\', 'F:\\'])
  assert.equal(calls, 1)
})

test('isInsidePath reconhece a própria pasta e as de dentro, não as irmãs', () => {
  assert.equal(isInsidePath('/a/b', '/a/b'), true)
  assert.equal(isInsidePath('/a/b/c', '/a/b'), true)
  assert.equal(isInsidePath('/a/bc', '/a/b'), false)
  assert.equal(isInsidePath('/a', '/a/b'), false)
})

test('comparação de caminhos Windows ignora caixa sem aceitar prefixos de irmãs', () => {
  const windows = { platform: 'win32' }

  assert.equal(
    normalizeComparablePath('C:\\Projetos\\App\\..\\App\\', windows),
    'c:\\projetos\\app',
  )
  assert.equal(
    isInsidePath('c:\\PROJETOS\\APP\\src', 'C:\\projetos\\app', windows),
    true,
  )
  assert.equal(
    isInsidePath('C:\\projetos\\application', 'c:\\projetos\\app', windows),
    false,
  )
  assert.deepEqual(
    filterIgnoredRepos(
      ['C:\\Projetos\\App', 'c:\\projetos\\application', 'D:\\outro'],
      ['c:\\projetos\\APP'],
      windows,
    ),
    ['c:\\projetos\\application', 'D:\\outro'],
  )
})

test('filterIgnoredRepos descarta repositórios dentro de uma pasta ignorada', () => {
  const repos = ['/projetos/um', '/projetos/arquivo/dois', '/outros/tres']

  assert.deepEqual(filterIgnoredRepos(repos, ['/projetos/arquivo']), [
    '/projetos/um',
    '/outros/tres',
  ])
  assert.deepEqual(filterIgnoredRepos(repos, []), repos)
})

test('findGitRepos encontra repositórios, inclusive aninhados, sem entrar no .git', async () => {
  const root = makeTree({
    'projeto-a/.git/HEAD': 'ref: refs/heads/main\n',
    // Um `.git` dentro de `.git` só existiria por engano; se a varredura
    // descesse ali, o repositório apareceria duas vezes no relatório.
    'projeto-a/.git/modules/x/.git': '',
    'projeto-a/submodulo/.git': 'gitdir: ../.git/modules/submodulo\n',
    'sem-git/leia.md': 'nada aqui',
  })

  const repos = await findGitRepos({ roots: [root], skipPaths: [] })

  assert.deepEqual(repos.map((repo) => path.relative(root, repo)).sort(), [
    'projeto-a',
    path.join('projeto-a', 'submodulo'),
  ])
})

test('findGitRepos poda pastas excluídas por nome e caminhos ignorados', async () => {
  const root = makeTree({
    'node_modules/pacote/.git/HEAD': '',
    'arquivo-morto/antigo/.git/HEAD': '',
    'ativo/.git/HEAD': '',
  })

  const repos = await findGitRepos({
    roots: [root],
    excludeDirs: ['node_modules'],
    ignoredPaths: [path.join(root, 'arquivo-morto')],
    skipPaths: [],
  })

  assert.deepEqual(
    repos.map((repo) => path.relative(root, repo)),
    ['ativo'],
  )
})

test('findGitRepos para no cancelamento e reporta progresso', async () => {
  const root = makeTree({ 'um/.git/HEAD': '', 'dois/.git/HEAD': '' })
  const controller = new AbortController()
  const seen = []

  controller.abort()

  const repos = await findGitRepos({
    roots: [root],
    skipPaths: [],
    signal: controller.signal,
    onProgress: (progress) => seen.push(progress),
  })

  assert.deepEqual(repos, [])
  assert.deepEqual(seen, [])
})

test('findGitRepos descarta raízes aninhadas para não varrer duas vezes', async () => {
  const root = makeTree({ 'interna/projeto/.git/HEAD': '' })
  const progressPaths = new Set()

  const repos = await findGitRepos({
    roots: [root, path.join(root, 'interna')],
    skipPaths: [],
    onProgress: (progress) => progressPaths.add(progress.currentPath),
  })

  assert.equal(repos.length, 1)
  // A pasta interna aparece uma vez só: a raiz aninhada foi descartada.
  assert.equal([...progressPaths].filter((item) => item === path.join(root, 'interna')).length, 1)
})

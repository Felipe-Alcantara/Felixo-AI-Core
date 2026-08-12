/**
 * O que acontece ao clicar num arquivo dentro de um projeto.
 *
 * Antes o clique sempre tentava **rodar** o arquivo, e para o que não tem
 * interpretador conhecido isso virava entregar o caminho nu ao shell — um
 * `README.md` respondia `README.md: comando não encontrado`, que não é um erro
 * útil, é uma ação que nunca fazia sentido.
 *
 * Agora o clique abre o arquivo num editor de terminal, que é o caso comum
 * (ler e editar), e rodar vira um botão à parte, oferecido só onde rodar
 * significa alguma coisa.
 */

/**
 * Extensões que não são texto. Lista de exclusão, e não de inclusão, porque
 * arquivo de texto sem extensão é comum num projeto (`Makefile`, `LICENSE`,
 * `Dockerfile`) e uma lista de inclusão deixaria todos eles de fora.
 */
const BINARY_EXTENSIONS = new Set([
  // imagem
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'ico', 'tif', 'tiff', 'psd',
  // áudio e vídeo
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'mp4', 'mkv', 'mov', 'avi', 'webm',
  // pacote e arquivo comprimido
  'zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'jar', 'deb', 'rpm', 'dmg',
  'appimage', 'iso', 'pkg', 'msi',
  // binário e documento fechado
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'class', 'pyc', 'wasm',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
  'sqlite', 'db', 'ttf', 'otf', 'woff', 'woff2', 'eot',
])

/** Extensões que o app sabe rodar — o mesmo conjunto de `run-file-command`. */
const RUNNABLE_EXTENSIONS = new Set([
  'py', 'js', 'mjs', 'cjs', 'ts', 'sh', 'ps1',
  // Executáveis diretos: rodar é a única coisa que faz sentido com eles.
  'exe', 'bat', 'cmd', 'appimage',
])

export type ProjectFileAction = 'edit' | 'run'

/**
 * @param fileName - Nome ou caminho do arquivo.
 * @returns `edit` para texto (o clique padrão), `run` para binário — abrir um
 *   `.png` num editor de terminal só mostraria lixo.
 */
export function resolveProjectFileClick(fileName: string): ProjectFileAction {
  return isBinaryFileName(fileName) ? 'run' : 'edit'
}

/**
 * Se vale oferecer o botão de rodar. Um `.md` ou um `.json` não roda, e um
 * botão que só produz "comando não encontrado" é pior que botão nenhum.
 *
 * @param fileName - Nome ou caminho do arquivo.
 */
export function canRunProjectFile(fileName: string): boolean {
  return RUNNABLE_EXTENSIONS.has(fileExtension(fileName))
}

/**
 * @param fileName - Nome ou caminho do arquivo.
 */
export function isBinaryFileName(fileName: string): boolean {
  return BINARY_EXTENSIONS.has(fileExtension(fileName))
}

/**
 * Extensão em minúsculas, sem o ponto. Vazia quando não há — e um ponto
 * inicial não conta, senão `.gitignore` teria extensão `gitignore` e cairia
 * numa regra que não é dele.
 */
function fileExtension(fileName: string): string {
  const name = typeof fileName === 'string' ? fileName : ''
  const baseName = name.split(/[\\/]/).pop() ?? ''
  const dotIndex = baseName.lastIndexOf('.')

  return dotIndex > 0 ? baseName.slice(dotIndex + 1).toLowerCase() : ''
}

/**
 * @module text-file-ipc-handlers
 * Abrir, ler, gravar e observar arquivos de texto do disco em blocos do canvas.
 *
 * Complementa `canvas-files-ipc-handlers`, que cuida dos `.md` da propria pasta
 * do app: la o bloco e dono do arquivo, aqui ele so aponta para um arquivo que
 * ja existe e e de outra pessoa (um README do projeto, um script, uma anotacao).
 * Por isso nada e criado nem apagado por aqui — so leitura, gravacao no lugar e
 * observacao.
 *
 * Quem pode ser aberto e decidido por {@link module:text-file-access}, nunca
 * pelo renderer.
 */

const { dialog, ipcMain } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { toErrorResult } = require('./ipc-result.cjs')
const { createTextFileAccess } = require('./text-file-access.cjs')

/**
 * Um arquivo de texto grande trava o bloco sem entregar nada util — o editor e
 * um `<textarea>`, nao um editor de codigo com virtualizacao. Recusar cedo, com
 * mensagem clara, e melhor do que congelar a janela.
 */
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024

/**
 * Extensoes oferecidas no seletor. Nao e uma checagem de seguranca — a pessoa
 * pode escolher "todos os arquivos"; e so o atalho para o caso comum.
 */
const TEXT_FILE_FILTERS = [
  {
    name: 'Arquivos de texto',
    extensions: [
      'md', 'markdown', 'mdx', 'txt', 'json', 'yml', 'yaml', 'toml', 'ini', 'env',
      'csv', 'log', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go',
      'rs', 'java', 'c', 'h', 'cpp', 'cs', 'sh', 'bash', 'ps1', 'sql', 'html',
      'css', 'scss', 'xml', 'gitignore',
    ],
  },
  { name: 'Todos os arquivos', extensions: ['*'] },
]

/**
 * @param {() => (import('electron').BrowserWindow | null)} getMainWindow
 * @param {object} options
 * @param {() => string[]} options.listProjectRoots
 * @returns {{ dispose: () => void, revokeAll: () => void }}
 */
function registerTextFileIpcHandlers(getMainWindow, options = {}) {
  const access = createTextFileAccess({ listProjectRoots: options.listProjectRoots })
  /** filePath -> listener do fs.watchFile, para nao observar o mesmo arquivo duas vezes. */
  const watchers = new Map()

  const send = (channel, payload) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('text-file:pick', async () => {
    try {
      const window = getMainWindow()
      const result = await dialog.showOpenDialog(window ?? undefined, {
        title: 'Abrir arquivo de texto no canvas',
        properties: ['openFile'],
        filters: TEXT_FILE_FILTERS,
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, canceled: true }
      }

      // A escolha da pessoa e o que autoriza o caminho — e o unico ponto em que
      // um arquivo fora dos projetos entra na lista.
      const filePath = access.grant(result.filePaths[0])

      return { ok: true, canceled: false, path: filePath, name: path.basename(filePath) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel abrir o seletor de arquivos.')
    }
  })

  ipcMain.handle('text-file:read', async (_event, params = {}) => {
    try {
      const filePath = access.authorize(params.path)
      const stats = await fsp.stat(filePath)

      if (!stats.isFile()) {
        return { ok: false, message: 'O caminho nao e um arquivo.' }
      }

      if (stats.size > MAX_TEXT_FILE_BYTES) {
        return { ok: false, message: 'Arquivo maior que o limite de 2 MB.' }
      }

      return {
        ok: true,
        path: filePath,
        name: path.basename(filePath),
        content: await fsp.readFile(filePath, 'utf8'),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel ler o arquivo.')
    }
  })

  ipcMain.handle('text-file:write', async (_event, params = {}) => {
    try {
      const filePath = access.authorize(params.path)
      await fsp.writeFile(filePath, String(params.content ?? ''), 'utf8')
      return { ok: true, path: filePath }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o arquivo.')
    }
  })

  /**
   * Autoriza um arquivo que a pessoa alcancou por dentro de um projeto
   * registrado — a aba Projetos ja navega essas pastas. Devolve o caminho
   * resolvido, que e o que o bloco guarda.
   */
  ipcMain.handle('text-file:open-in-project', (_event, params = {}) => {
    try {
      const filePath = access.authorize(params.path)
      return { ok: true, path: filePath, name: path.basename(filePath) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel abrir o arquivo.')
    }
  })

  ipcMain.handle('text-file:watch', (_event, params = {}) => {
    try {
      const filePath = access.authorize(params.path)

      if (!watchers.has(filePath)) {
        // Mesma escolha de `canvas-files`: `watchFile` faz polling, que e o que
        // funciona de forma previsivel com editor e agente gravando por fora.
        const listener = () => send('text-file:changed', { path: filePath })
        fs.watchFile(filePath, { interval: 500 }, listener)
        watchers.set(filePath, listener)
      }

      return { ok: true, path: filePath }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel observar o arquivo.')
    }
  })

  ipcMain.handle('text-file:unwatch', (_event, params = {}) => {
    try {
      // Sem `authorize`: parar de observar nunca expoe conteudo, e um arquivo
      // que saiu de um projeto registrado precisa poder ser desobservado.
      const filePath = path.resolve(String(params.path ?? ''))
      if (watchers.has(filePath)) {
        fs.unwatchFile(filePath)
        watchers.delete(filePath)
      }
      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel parar de observar o arquivo.')
    }
  })

  const dispose = () => {
    for (const filePath of watchers.keys()) {
      fs.unwatchFile(filePath)
    }
    watchers.clear()
  }

  return {
    dispose,
    /** Limpar o canvas tambem devolve as permissoes que os blocos carregavam. */
    revokeAll: () => {
      dispose()
      access.revokeAll()
    },
  }
}

module.exports = {
  MAX_TEXT_FILE_BYTES,
  TEXT_FILE_FILTERS,
  registerTextFileIpcHandlers,
}

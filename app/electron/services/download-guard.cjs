'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

/**
 * Downloads de toda sessão do app: a do renderer (exportar conversa) e as dos
 * blocos Página Web (decisão de 16/11/2026).
 *
 * - Todo download vai para o diálogo de salvar do sistema, que começa na pasta
 *   Downloads; cancelar não salva nada.
 * - Programa ou script (.exe, .ps1, .lnk, .dmg...) pergunta antes, numa janela
 *   do sistema, dizendo de que site veio. O padrão é Cancelar.
 * - O registro tem a origem (esquema + host), o nome, o tamanho e o resultado;
 *   nunca a URL com query.
 *
 * O arquivo baixa numa pasta temporária enquanto a pessoa decide e só é movido
 * para o destino escolhido no fim; recusar ou cancelar descarta o temporário.
 * Sem pausa: um download de `blob:` não retoma (medido: pausar e retomar a
 * exportação do chat terminava "interrupted"). Os diálogos são assíncronos: o
 * processo principal (terminais, IPC) não trava enquanto a pergunta está aberta.
 * O app não conta com o diálogo implícito do Electron (sem `setSavePath`).
 */

// Programas, scripts, atalhos e imagens de disco que executam ou montam algo ao
// abrir. Lista de Windows, macOS e Linux: o arquivo pode ir para qualquer um.
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'msp', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'drv',
  'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'wsc', 'hta', 'msc', 'inf', 'reg',
  'lnk', 'url', 'scf', 'application', 'appref-ms', 'gadget', 'jar', 'jnlp', 'iso', 'img', 'vhd', 'vhdx',
  'dmg', 'pkg', 'mpkg', 'app', 'command', 'workflow', 'action',
  'sh', 'bash', 'zsh', 'csh', 'run', 'bin', 'appimage', 'deb', 'rpm', 'desktop', 'apk',
])
// Arquivo sem extensão reconhecível que o site declarou como executável.
const DANGEROUS_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-ms-installer',
  'application/x-msi',
  'application/vnd.microsoft.portable-executable',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'application/java-archive',
  'application/x-apple-diskimage',
  'application/vnd.android.package-archive',
  'application/hta',
])

/** Extensão em minúsculas do último ponto (`relatorio.pdf.exe` → `exe`). */
function fileExtension(fileName) {
  const base = path.basename(String(fileName ?? '').trim()).replace(/[.\s]+$/, '')
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

/**
 * @param {{ fileName?: unknown, mimeType?: unknown }} item
 * @returns {{ dangerous: boolean, extension: string }}
 */
function classifyDownload({ fileName, mimeType } = {}) {
  const extension = fileExtension(fileName)
  if (DANGEROUS_EXTENSIONS.has(extension)) return { dangerous: true, extension }
  const mime = String(mimeType ?? '').split(';')[0].trim().toLowerCase()
  return { dangerous: !extension && DANGEROUS_MIME_TYPES.has(mime), extension }
}

/**
 * De onde veio o download, para o registro e para a pergunta: esquema + host,
 * nunca caminho nem query. Um `blob:` mostra a origem de dentro dele (é o
 * site que montou o arquivo); `data:` não tem origem.
 */
function describeDownloadSource(url) {
  const value = typeof url === 'string' ? url.trim() : ''
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'blob:') return parsed.origin && parsed.origin !== 'null' ? parsed.origin : 'blob:'
    if (parsed.protocol === 'data:') return 'data:'
    return parsed.host ? `${parsed.protocol}//${parsed.host}` : `${parsed.protocol}`
  } catch {
    return '[sem origem]'
  }
}

/** Nome seguro para a pasta temporária (o site escolhe o nome do arquivo). */
function safeFileName(fileName) {
  const base = path.basename(String(fileName ?? '').replace(/[\\/]/g, '_')).replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim()
  return (base || 'download').slice(0, 180)
}

/** Move o arquivo baixado para o destino; entre discos, copia e apaga. */
function moveFile(from, to, fileSystem = fs) {
  try {
    fileSystem.renameSync(from, to)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    fileSystem.copyFileSync(from, to)
    fileSystem.unlinkSync(from)
  }
}

/**
 * Trata um download (`will-download`). Tudo de fora é injetado: os diálogos, as
 * pastas, o registro e o sistema de arquivos, para o fluxo ser testável sem
 * Electron.
 *
 * @param {{
 *   item: import('electron').DownloadItem,
 *   dialogs: {
 *     confirmDangerous: (info: { fileName: string, source: string, extension: string }) => Promise<boolean>,
 *     chooseTarget: (info: { defaultPath: string, fileName: string }) => Promise<string | null>,
 *   },
 *   downloadsDir: string,
 *   tempDir: string,
 *   log?: (entry: { result: string, source: string, fileName: string, bytes: number, extension: string, dangerous: boolean }) => void,
 *   fileSystem?: typeof fs,
 * }} params
 * @returns {Promise<string>} o resultado registrado
 */
function handleDownload({ item, dialogs, downloadsDir, tempDir, log = () => {}, fileSystem = fs }) {
  const fileName = safeFileName(item.getFilename())
  const source = describeDownloadSource(item.getURL())
  const verdict = classifyDownload({ fileName, mimeType: item.getMimeType() })
  fileSystem.mkdirSync(tempDir, { recursive: true })
  const tempPath = path.join(tempDir, `${randomUUID()}-${fileName}`)
  item.setSavePath(tempPath)

  const finished = new Promise((resolve) => item.once('done', (_event, state) => resolve(state)))
  const record = (result) => {
    log({ result, source, fileName, bytes: Number(item.getTotalBytes?.() ?? 0) || 0, extension: verdict.extension, dangerous: verdict.dangerous })
    return result
  }
  const discard = async (result) => {
    if (item.getState() === 'progressing') item.cancel()
    await finished
    fileSystem.rmSync(tempPath, { force: true })
    return record(result)
  }

  return (async () => {
    try {
      if (verdict.dangerous) {
        const allowed = await dialogs.confirmDangerous({ fileName, source, extension: verdict.extension })
        if (!allowed) return await discard('recusado')
      }
      const target = await dialogs.chooseTarget({ defaultPath: path.join(downloadsDir, fileName), fileName })
      if (!target) return await discard('cancelado')
      const state = await finished
      if (state !== 'completed') {
        fileSystem.rmSync(tempPath, { force: true })
        return record(state === 'cancelled' ? 'cancelado' : 'falhou')
      }
      moveFile(tempPath, target, fileSystem)
      return record(verdict.dangerous ? 'salvo-com-confirmacao' : 'salvo')
    } catch {
      return discard('falhou')
    }
  })()
}

/**
 * Diálogos de verdade (Electron) ou, só na instância de automação que pediu
 * (`FELIXO_DEVTOOLS_DOWNLOAD_DIR`), respostas fixas: o smoke e o `felixo
 * devtools` conferem o fluxo sem abrir janela nenhuma na tela de quem usa.
 *
 * @param {{
 *   dialog: Pick<import('electron').Dialog, 'showMessageBox' | 'showSaveDialog'>,
 *   getParentWindow: () => import('electron').BrowserWindow | null,
 *   env?: Record<string, string | undefined>,
 *   devtoolsPort?: unknown,
 * }} options
 */
function createDownloadDialogs({ dialog, getParentWindow, env = {}, devtoolsPort }) {
  const port = typeof devtoolsPort === 'number' ? devtoolsPort : Number.parseInt(String(devtoolsPort ?? ''), 10)
  const automationDir = Number.isInteger(port) && port > 0 && port <= 65535 ? env.FELIXO_DEVTOOLS_DOWNLOAD_DIR : undefined
  if (typeof automationDir === 'string' && automationDir.trim()) {
    return {
      confirmDangerous: async () => env.FELIXO_DEVTOOLS_DOWNLOAD_CONFIRM === 'sim',
      chooseTarget: async ({ fileName }) => path.join(automationDir, fileName),
    }
  }

  const withParent = (options) => {
    const parent = getParentWindow()
    return parent && !parent.isDestroyed() ? [parent, options] : [options]
  }
  return {
    async confirmDangerous({ fileName, source, extension }) {
      const { response } = await dialog.showMessageBox(
        ...withParent({
          type: 'warning',
          title: 'Baixar um programa?',
          message: `${source} quer salvar "${fileName}" no seu computador.`,
          detail: `É um programa ou script (.${extension || 'executável'}): ele pode instalar ou executar coisas no computador. Só baixe se você confia neste site.`,
          buttons: ['Cancelar', 'Baixar mesmo assim'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        }),
      )
      return response === 1
    },
    async chooseTarget({ defaultPath }) {
      const result = await dialog.showSaveDialog(...withParent({ defaultPath }))
      return result.canceled || !result.filePath ? null : result.filePath
    },
  }
}

module.exports = {
  DANGEROUS_EXTENSIONS,
  classifyDownload,
  createDownloadDialogs,
  describeDownloadSource,
  fileExtension,
  handleDownload,
  safeFileName,
}

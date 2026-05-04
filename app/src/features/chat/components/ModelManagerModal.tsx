import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  CheckCircle2,
  Download,
  FilePlus,
  FolderOpen,
  KeyRound,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import type { Model, ModelFileSelection } from '../types'
import { createModelId, detectModelCliType } from '../services/model-storage'

type ModelManagerModalProps = {
  isOpen: boolean
  models: Model[]
  onClose: () => void
  onAddModel: (model: Model) => void
  onClearModels: () => void
  onRemoveModel: (model: Model) => void
}

type OfficialCliCatalogItem = {
  id: string
  name: string
  provider: string
  command: string
  detected: boolean
  version?: string | null
  path?: string | null
  error?: string | null
  installCommand: string
  loginCommand: string
  statusCommand?: string
  switchAccountCommand?: string
  supportsAccountSwitch?: boolean
  installUrl: string
  authUrl: string
  models: Model[]
}

export function ModelManagerModal({
  isOpen,
  models,
  onClose,
  onAddModel,
  onClearModels,
  onRemoveModel,
}: ModelManagerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formSource, setFormSource] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [officialClis, setOfficialClis] = useState<OfficialCliCatalogItem[]>([])
  const [isLoadingOfficialClis, setIsLoadingOfficialClis] = useState(false)
  const [busyOfficialCliId, setBusyOfficialCliId] = useState<string | null>(null)

  const loadOfficialCatalog = useCallback(async () => {
    if (!window.felixo?.cli?.listOfficial) {
      setOfficialClis([])
      return
    }

    setIsLoadingOfficialClis(true)

    try {
      const result = await window.felixo.cli.listOfficial()

      if (!result.ok) {
        setStatus(result.message ?? 'Falha ao detectar CLIs oficiais.')
        return
      }

      setOfficialClis(Array.isArray(result.clis) ? result.clis : [])
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Falha ao detectar CLIs oficiais.',
      )
    } finally {
      setIsLoadingOfficialClis(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const timer = window.setTimeout(() => {
      void loadOfficialCatalog()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [isOpen, loadOfficialCatalog])

  if (!isOpen) {
    return null
  }

  async function installOfficialCli(cli: OfficialCliCatalogItem) {
    if (!window.felixo?.cli?.installOfficial) {
      setStatus('Instalação automática disponível apenas no app desktop.')
      return
    }

    setBusyOfficialCliId(cli.id)
    setStatus(`Instalando ${cli.name}...`)

    try {
      const result = await window.felixo.cli.installOfficial({ id: cli.id })

      if (!result.ok) {
        setStatus(result.message ?? `Falha ao instalar ${cli.name}.`)
        return
      }

      if (result.cli && !result.cli.detected) {
        setStatus(
          `${cli.name} instalado, mas o comando ainda não apareceu no PATH.`,
        )
        await loadOfficialCatalog()
        return
      }

      importOfficialModels(result.models ?? cli.models)
      setStatus(`${cli.name} instalado e importado.`)
      await loadOfficialCatalog()
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : `Falha ao instalar ${cli.name}.`,
      )
    } finally {
      setBusyOfficialCliId(null)
    }
  }

  async function openOfficialLogin(cli: OfficialCliCatalogItem) {
    if (!window.felixo?.cli?.openOfficialLogin) {
      setStatus(`Abra ${cli.loginCommand} no terminal para autenticar.`)
      return
    }

    setBusyOfficialCliId(cli.id)

    try {
      const result = await window.felixo.cli.openOfficialLogin({ id: cli.id })

      if (!result.ok) {
        setStatus(
          result.manualCommand
            ? `${result.message} Comando: ${result.manualCommand}`
            : result.message ?? `Falha ao abrir login de ${cli.name}.`,
        )
        return
      }

      setStatus(result.message ?? `Login de ${cli.name} aberto no terminal.`)
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : `Falha ao abrir login de ${cli.name}.`,
      )
    } finally {
      setBusyOfficialCliId(null)
    }
  }

  async function checkOfficialAccountStatus(cli: OfficialCliCatalogItem) {
    if (!window.felixo?.cli?.getOfficialAccountStatus) {
      setStatus(`Rode ${cli.statusCommand ?? `${cli.command} login status`} no terminal.`)
      return
    }

    setBusyOfficialCliId(cli.id)

    try {
      const result = await window.felixo.cli.getOfficialAccountStatus({
        id: cli.id,
      })

      if (!result.ok) {
        setStatus(result.message ?? `Falha ao consultar conta de ${cli.name}.`)
        return
      }

      const label =
        result.authStatus === 'logged_in'
          ? 'conectado'
          : result.authStatus === 'logged_out'
            ? 'desconectado'
            : 'status desconhecido'

      setStatus(`${cli.name}: ${label}. ${result.message ?? ''}`.trim())
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : `Falha ao consultar conta de ${cli.name}.`,
      )
    } finally {
      setBusyOfficialCliId(null)
    }
  }

  async function switchOfficialAccount(cli: OfficialCliCatalogItem) {
    if (!window.felixo?.cli?.switchOfficialAccount) {
      setStatus(
        `Rode ${cli.switchAccountCommand ?? `${cli.command} logout`} e depois ${cli.loginCommand} no terminal.`,
      )
      return
    }

    setBusyOfficialCliId(cli.id)
    setStatus(`Desconectando conta atual de ${cli.name}...`)

    try {
      const result = await window.felixo.cli.switchOfficialAccount({
        id: cli.id,
      })

      if (!result.ok) {
        setStatus(
          result.manualCommand
            ? `${result.message} Comando: ${result.manualCommand}`
            : result.message ?? `Falha ao trocar conta de ${cli.name}.`,
        )
        return
      }

      setStatus(
        result.message ??
          `Conta de ${cli.name} desconectada. Login oficial aberto no terminal.`,
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : `Falha ao trocar conta de ${cli.name}.`,
      )
    } finally {
      setBusyOfficialCliId(null)
    }
  }

  function importOfficialModels(officialModels: Model[]) {
    const missingModels = officialModels.filter(
      (model) =>
        !models.some(
          (existingModel) =>
            existingModel.id === model.id ||
            existingModel.command === model.command,
        ),
    )

    for (const model of missingModels) {
      onAddModel(model)
    }

    if (missingModels.length === 0) {
      setStatus('Essas CLIs oficiais já estão importadas.')
      return
    }

    setStatus(
      missingModels.length === 1
        ? `Modelo "${missingModels[0].name}" importado.`
        : `${missingModels.length} modelos oficiais importados.`,
    )
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const selection = await createSelectionFromBrowserFile(file)
    setFormCommand(selection.command)
    if (!formName.trim()) setFormName(selection.name)
    if (!formSource.trim()) setFormSource(selection.source)
    setStatus(
      'Script selecionado — confira os campos e clique em "Adicionar CLI".',
    )
  }

  function removeModel(model: Model) {
    onRemoveModel(model)
    setStatus(`Modelo "${model.name}" excluído.`)
  }

  function clearModels() {
    onClearModels()
    setStatus('Todos os modelos foram excluídos.')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const command = formCommand.trim()
    const source = formSource.trim()
    const rawName = formName.trim()
    const name = rawName || inferModelName('', getFileNameFromCommand(command))

    if (!command) {
      setStatus('Informe o comando da CLI.')
      commandInputRef.current?.focus()
      return
    }

    const existingModel = models.find((model) => model.command === command)

    if (existingModel) {
      setStatus(`Modelo "${existingModel.name}" já está importado.`)
      return
    }

    onAddModel({
      id: createModelId(name),
      name,
      source: source || 'CLI instalada no sistema',
      command,
      cliType: detectModelCliType({
        command,
        name,
        source: source || 'CLI instalada no sistema',
      }),
    })

    setFormName('')
    setFormSource('')
    setFormCommand('')
    setStatus(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Gerenciar modelos
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Configure CLIs instaladas ou scripts legados.
            </p>
          </div>

          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-zinc-300">
              <span className="flex items-center gap-2">
                <FilePlus size={14} aria-hidden="true" />
                Modelos importados
              </span>
              {models.length > 0 && (
                <button
                  type="button"
                  onClick={clearModels}
                  className="rounded-full border border-theme-error/20 px-3 py-1 text-[11px] text-theme-error transition hover:bg-theme-error/10"
                >
                  Limpar todos
                </button>
              )}
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/15 p-2">
              {models.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-zinc-500">
                  Nenhum modelo importado ainda.
                </p>
              ) : (
                models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-zinc-300"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-zinc-100">
                          {model.name}
                        </span>
                        <span className="shrink-0 rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                          {model.cliType}
                        </span>
                      </div>
                      <code className="mt-1 block truncate font-mono text-[11px] text-zinc-500">
                        {model.command}
                      </code>
                    </div>
                    <button
                      type="button"
                      title="Remover"
                      onClick={() => removeModel(model)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-theme-error/10 hover:text-theme-error"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-zinc-300">
              <span className="flex items-center gap-2">
                <Terminal size={14} aria-hidden="true" />
                CLIs oficiais
              </span>
              <button
                type="button"
                title="Atualizar detecção"
                onClick={() => void loadOfficialCatalog()}
                disabled={isLoadingOfficialClis}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={isLoadingOfficialClis ? 'animate-spin' : ''}
                />
                <span className="sr-only">Atualizar detecção</span>
              </button>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-black/10 p-2">
              {officialClis.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-zinc-500">
                  Nenhuma CLI oficial detectada ainda.
                </p>
              ) : (
                officialClis.map((cli) => {
                  const missingModels = cli.models.filter(
                    (model) =>
                      !models.some(
                        (existingModel) =>
                          existingModel.id === model.id ||
                          existingModel.command === model.command,
                      ),
                  )
                  const isImported = missingModels.length === 0
                  const isAnyOfficialCliBusy = busyOfficialCliId !== null

                  return (
                    <div
                      key={cli.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-xs font-medium text-zinc-100">
                              {cli.name}
                            </span>
                            {cli.detected && (
                              <CheckCircle2
                                size={14}
                                aria-hidden="true"
                                className="shrink-0 text-theme-success"
                              />
                            )}
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <code className="font-mono">{cli.command}</code>
                            {cli.version && <span>v{cli.version}</span>}
                            <span>{cli.provider}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {cli.detected ? (
                            <button
                              type="button"
                              title={
                                isImported
                                  ? 'CLI já importada'
                                  : 'Importar CLI oficial'
                              }
                              onClick={() => importOfficialModels(cli.models)}
                              disabled={isImported || isAnyOfficialCliBusy}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus size={14} aria-hidden="true" />
                              <span className="sr-only">
                                {isImported
                                  ? 'CLI já importada'
                                  : 'Importar CLI oficial'}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              title={`Instalar ${cli.name}`}
                              onClick={() => void installOfficialCli(cli)}
                              disabled={isAnyOfficialCliBusy}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Download size={14} aria-hidden="true" />
                              <span className="sr-only">
                                Instalar {cli.name}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            title={`Login ${cli.name}`}
                            onClick={() => void openOfficialLogin(cli)}
                            disabled={!cli.detected || isAnyOfficialCliBusy}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LogIn size={14} aria-hidden="true" />
                            <span className="sr-only">Login {cli.name}</span>
                          </button>

                          {cli.supportsAccountSwitch && (
                            <>
                              <button
                                type="button"
                                title={`Status da conta ${cli.name}`}
                                onClick={() =>
                                  void checkOfficialAccountStatus(cli)
                                }
                                disabled={!cli.detected || isAnyOfficialCliBusy}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <KeyRound size={14} aria-hidden="true" />
                                <span className="sr-only">
                                  Status da conta {cli.name}
                                </span>
                              </button>

                              <button
                                type="button"
                                title={`Trocar conta ${cli.name}`}
                                onClick={() => void switchOfficialAccount(cli)}
                                disabled={!cli.detected || isAnyOfficialCliBusy}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-theme-error/10 hover:text-theme-error disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <LogOut size={14} aria-hidden="true" />
                                <span className="sr-only">
                                  Trocar conta {cli.name}
                                </span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <form className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3" onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <Plus size={14} aria-hidden="true" />
              Adicionar CLI
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />

            <label className="block text-xs text-zinc-400">
              Comando da CLI
              <div className="mt-1 flex gap-2">
                <input
                  ref={commandInputRef}
                  placeholder="codex, claude ou gemini"
                  value={formCommand}
                  onChange={(event) => setFormCommand(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
                <button
                  type="button"
                  title="Escolher script legado"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                >
                  <FolderOpen size={16} aria-hidden="true" />
                  <span className="sr-only">Escolher script legado</span>
                </button>
              </div>
            </label>

            <label className="block text-xs text-zinc-400">
              Nome
              <input
                placeholder="Codex CLI"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Origem
              <input
                placeholder="CLI instalada no sistema"
                value={formSource}
                onChange={(event) => setFormSource(event.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[var(--color-input)] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[var(--color-panel)]"
            >
              <Plus size={16} aria-hidden="true" />
              Adicionar CLI
            </button>

            {status && (
              <p className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-400">
                {status}
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  )
}

async function createSelectionFromBrowserFile(
  file: File,
): Promise<ModelFileSelection> {
  const content = await file.text().catch(() => '')
  const filePath = window.felixo?.getFilePath?.(file) ?? ''
  const name = inferModelName(content, file.name)
  const command = createCommandPath(file.name, filePath)

  return {
    name,
    command,
    source: 'Script local',
    cliType: detectModelCliType({
      command,
      name,
      source: 'Script local',
    }),
  }
}

function createCommandPath(fileName: string, filePath: string) {
  if (!filePath) {
    return `./ai-clis/${fileName}`
  }

  const normalizedPath = filePath.replaceAll('\\', '/')
  const aiClisSegment = '/ai-clis/'
  const aiClisIndex = normalizedPath.lastIndexOf(aiClisSegment)

  if (aiClisIndex >= 0) {
    return `./ai-clis/${normalizedPath.slice(
      aiClisIndex + aiClisSegment.length,
    )}`
  }

  return filePath
}

function inferModelName(content: string, fileName: string) {
  const commentName = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# ') || line.startsWith('#\t'))

  if (commentName) {
    return commentName.replace(/^#\s*/, '').trim()
  }

  return fileName
    .replace(/\.[^.]+$/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function getFileNameFromCommand(command: string) {
  if (!command) {
    return ''
  }

  return command.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? ''
}

import { useId, useRef, useState } from 'react'
import { RotateCw, Trash2 } from 'lucide-react'
import { SHELL_AGENT_VALUE, type AgentLaunchPreferences } from '../services/agent-launch-preferences'
import { ADD_FOLDER_VALUE, type AgentConfig, type AgentConfigProject } from '../hooks/useAgentConfig'

type Props = {
  config: AgentConfig
  projects: readonly AgentConfigProject[]
  /** Abre o seletor de pasta e devolve os ids dos projetos criados. */
  onAddFolder: () => Promise<string[]>
  /** `false` no diálogo de passagem: lá o nome vem da continuação. */
  showName?: boolean
  autoFocus?: boolean
}

const CAMPO =
  'w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10'
const ROTULO = 'mb-1 block text-xs font-medium text-zinc-400'

/**
 * Os campos de "como abrir um agente", sem nenhuma opinião sobre onde eles
 * aparecem: o menu da toolbar os coloca num flyout, o diálogo de passar
 * responsabilidade os coloca num modal. O estado inteiro vem do
 * `useAgentConfig`, então os dois oferecem exatamente as mesmas opções — que
 * era o que não acontecia quando a passagem escolhia o agente de destino
 * sozinha, em rodízio, sem perguntar nada.
 */
export function AgentConfigFields({
  config,
  projects,
  onAddFolder,
  showName = true,
  autoFocus = false,
}: Props) {
  const prefixo = useId()
  const planningFileInputRef = useRef<HTMLInputElement>(null)
  const openiaModelGroups = config.openiaModels.reduce<Record<string, typeof config.openiaModels>>(
    (groups, model) => {
      groups[model.vendor] ??= []
      groups[model.vendor].push(model)
      return groups
    },
    {},
  )
  const selectedOpeniaInterface = config.openiaInterfaces.find(
    (item) => item.key === config.openiaInterfaceKey,
  )

  const handleProjectChange = async (value: string) => {
    if (value !== ADD_FOLDER_VALUE) {
      config.setProjectId(value)
      return
    }
    const addedIds = await onAddFolder()
    config.setProjectId(addedIds[0] ?? '')
  }

  return (
    <>
      {showName && (
        <>
          <label htmlFor={`${prefixo}-name`} className={ROTULO}>
            Nome (opcional)
          </label>
          <input
            id={`${prefixo}-name`}
            autoFocus={autoFocus}
            value={config.name}
            onChange={(event) => config.setName(event.target.value)}
            placeholder="Ex.: Agente de testes"
            className={`${CAMPO} mb-3 outline-none placeholder:text-zinc-600 focus:ring-emerald-500/50`}
          />
        </>
      )}

      <label htmlFor={`${prefixo}-agent`} className={ROTULO}>
        Agente
      </label>
      <select
        id={`${prefixo}-agent`}
        value={config.agentValue}
        autoFocus={autoFocus && !showName}
        onChange={(event) =>
          config.changeAgent(event.target.value as AgentLaunchPreferences['agentValue'])
        }
        className={`${CAMPO} mb-3`}
      >
        <option value={SHELL_AGENT_VALUE}>Nenhum (shell)</option>
        {config.agents.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      {config.agentValue !== SHELL_AGENT_VALUE && (
        <CampoConta prefixo={prefixo} config={config} />
      )}

      {config.agent && (
        <>
          {config.agent.isLauncher ? (
            <div className="mb-3 rounded bg-zinc-900/70 px-2 py-2 ring-1 ring-white/10">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-200">Configuração do Openia</p>
                <button
                  type="button"
                  onClick={config.refreshOpenia}
                  disabled={config.openiaLoading}
                  className="felixo-btn-icon rounded p-0.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 disabled:opacity-50"
                  title="Atualizar interfaces, modelos e estado da chave"
                  aria-label="Atualizar configuração do Openia"
                >
                  <RotateCw size={11} className={config.openiaLoading ? 'animate-spin' : undefined} />
                </button>
              </div>

              <label htmlFor={`${prefixo}-openia-interface`} className={ROTULO}>
                Interface
              </label>
              <select
                id={`${prefixo}-openia-interface`}
                value={config.openiaInterfaceKey}
                onChange={(event) => config.setOpeniaInterfaceKey(event.target.value)}
                disabled={config.openiaLoading || config.openiaInterfaces.length === 0}
                className={`${CAMPO} mb-2`}
              >
                {config.openiaInterfaces.length === 0 ? (
                  <option value="">
                    {config.openiaLoading ? 'Carregando interfaces…' : 'Openia não disponível'}
                  </option>
                ) : (
                  config.openiaInterfaces.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.emoji} {item.name}
                    </option>
                  ))
                )}
              </select>
              {selectedOpeniaInterface?.description && (
                <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                  {selectedOpeniaInterface.description}
                </p>
              )}

              <label htmlFor={`${prefixo}-openia-model`} className={ROTULO}>
                Modelo
              </label>
              <select
                id={`${prefixo}-openia-model`}
                value={config.openiaModel}
                onChange={(event) => config.changeOpeniaModel(event.target.value)}
                disabled={config.openiaLoading || config.openiaModels.length === 0}
                className={`${CAMPO} mb-2`}
              >
                <option value="">Padrão da interface</option>
                {Object.entries(openiaModelGroups).map(([vendor, models]) => (
                  <optgroup key={vendor} label={vendor}>
                    {models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.completionPrice > 0
                          ? `$${(item.completionPrice * 1_000_000).toFixed(2)}/M`
                          : 'free'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                {selectedOpeniaInterface?.supportsModelSelection
                  ? 'O modelo escolhido será aplicado automaticamente antes da interface abrir.'
                  : 'Esta interface usa a configuração própria dela; o Openia abrirá com o modelo padrão.'}
              </p>

              <label htmlFor={`${prefixo}-openia-key`} className={ROTULO}>
                Chave do OpenRouter
              </label>
              <div className="mb-1.5 flex gap-1.5">
                <input
                  id={`${prefixo}-openia-key`}
                  type="password"
                  autoComplete="new-password"
                  value={config.openiaKeyDraft}
                  onChange={(event) => config.setOpeniaKeyDraft(event.target.value)}
                  placeholder={config.openiaKeyConfigured ? 'Chave já configurada' : 'sk-or-…'}
                  className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={() => void config.saveOpeniaKey()}
                  disabled={config.openiaSaving || !config.openiaKeyDraft.trim()}
                  className="felixo-btn rounded bg-zinc-700 px-2 text-[11px] text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
                >
                  {config.openiaSaving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {config.openiaKeyConfigured
                  ? 'Chave configurada no armazenamento do Openia. O Felixo não a lê nem a persiste.'
                  : 'A chave será enviada diretamente ao Openia e não ficará no canvas nem no comando.'}
              </p>
              {config.openiaError && (
                <p className="mt-2 text-[11px] leading-relaxed text-red-300">{config.openiaError}</p>
              )}
            </div>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor={`${prefixo}-model`} className="block text-xs font-medium text-zinc-400">
                  Modelo
                </label>
                <button
                  type="button"
                  onClick={config.refresh}
                  disabled={config.refreshing}
                  className="felixo-btn-icon rounded p-0.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 disabled:opacity-50"
                  title="Buscar de novo os modelos que as CLIs oferecem"
                  aria-label="Atualizar lista de modelos"
                >
                  <RotateCw size={11} className={config.refreshing ? 'animate-spin' : undefined} />
                </button>
              </div>
              <select
                id={`${prefixo}-model`}
                value={config.model}
                onChange={(event) => config.changeModel(event.target.value)}
                className={`${CAMPO} mb-3`}
              >
                <option value="">Padrão</option>
                {config.agent.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              {config.effortLevels && (
                <>
                  <label htmlFor={`${prefixo}-effort`} className={ROTULO}>
                    Esforço de raciocínio
                  </label>
                  <select
                    id={`${prefixo}-effort`}
                    value={config.effort}
                    onChange={(event) => config.setEffort(event.target.value)}
                    className={`${CAMPO} mb-3`}
                  >
                    <option value="">Padrão</option>
                    {config.effortLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
                <input
                  type="checkbox"
                  checked={config.yolo}
                  onChange={(event) => config.setYolo(event.target.checked)}
                  className="accent-emerald-600"
                />
                Yolo (acesso total, sem confirmações)
              </label>

              <label htmlFor={`${prefixo}-planning-file`} className={ROTULO}>
                Arquivo de planejamento
              </label>
              <div className="mb-3 flex gap-1.5">
                <input
                  id={`${prefixo}-planning-file`}
                  value={config.planningFile}
                  onChange={(event) => config.setPlanningFile(event.target.value)}
                  placeholder="Caminho para um arquivo (opcional)"
                  className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={() => planningFileInputRef.current?.click()}
                  className="felixo-btn-icon rounded bg-zinc-700 px-2 text-xs text-zinc-200 hover:bg-zinc-600"
                  title="Selecionar arquivo de planejamento"
                  aria-label="Selecionar arquivo de planejamento"
                >
                  …
                </button>
                <input
                  ref={planningFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    config.setPlanningFile(window.felixo?.getFilePath?.(file) || file.name)
                    event.target.value = ''
                  }}
                />
              </div>
            </>
          )}
        </>
      )}

      <label htmlFor={`${prefixo}-project`} className={ROTULO}>
        Projeto
      </label>
      <select
        id={`${prefixo}-project`}
        value={config.projectId}
        onChange={(event) => void handleProjectChange(event.target.value)}
        className={`${CAMPO} mb-3`}
      >
        <option value="">Local (sem projeto)</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
        <option value={ADD_FOLDER_VALUE}>+ Adicionar pasta…</option>
      </select>
    </>
  )
}

/** Valor da opção que abre o cadastro de uma conta nova. */
const NOVA_CONTA = '__nova__'

/**
 * Escolha da conta com que o terminal nasce, e o cadastro de contas novas.
 *
 * Os dois moram juntos porque é no momento de escolher que a pessoa descobre
 * que a conta que ela quer ainda não existe — mandá-la para outra tela ali
 * seria perder o passo.
 */
function CampoConta({ prefixo, config }: { prefixo: string; config: AgentConfig }) {
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const contaAtual = config.accounts.find((item) => item.id === config.accountId)
  // Só o Openia guarda chave; os outros logam pela própria CLI no terminal.
  const pedeChave = config.agentValue === 'openia'

  async function criar() {
    setSalvando(true)
    setErro(null)

    const resultado = await config.createAccount(nome, pedeChave ? chave : undefined)

    setSalvando(false)

    if (!resultado.ok) {
      setErro(resultado.message)
      return
    }

    setNome('')
    setChave('')
    setCriando(false)
  }

  return (
    <>
      <label htmlFor={`${prefixo}-account`} className={ROTULO}>
        Conta
      </label>
      <div className="mb-3 flex items-center gap-1.5">
        <select
          id={`${prefixo}-account`}
          value={config.accountId}
          onChange={(event) => {
            if (event.target.value === NOVA_CONTA) {
              setCriando(true)
              return
            }
            config.setAccountId(event.target.value)
          }}
          className={CAMPO}
        >
          <option value="">Login do sistema</option>
          {config.accounts.map((conta) => (
            <option key={conta.id} value={conta.id}>
              {conta.label}
            </option>
          ))}
          <option value={NOVA_CONTA}>+ Nova conta…</option>
        </select>

        {contaAtual && (
          <button
            type="button"
            title={`Remover "${contaAtual.label}" e apagar o login dela`}
            onClick={() => void config.removeAccount(contaAtual.id)}
            className="felixo-btn-icon shrink-0 rounded p-1.5 text-zinc-500 hover:bg-white/10 hover:text-theme-error"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {criando && (
        <div className="mb-3 rounded border border-white/10 bg-black/20 p-2">
          <p className="mb-2 text-[11px] leading-snug text-zinc-500">
            {pedeChave
              ? 'A conta guarda a chave do OpenRouter, cifrada pelo sistema.'
              : 'A conta começa sem login: a própria CLI conduz a entrada na primeira vez que você abrir um terminal nela.'}
          </p>

          <input
            value={nome}
            autoFocus
            onChange={(event) => setNome(event.target.value)}
            placeholder="Nome da conta (ex.: pessoal)"
            className={`${CAMPO} mb-2`}
          />

          {pedeChave && (
            <input
              value={chave}
              type="password"
              onChange={(event) => setChave(event.target.value)}
              placeholder="Chave do OpenRouter"
              className={`${CAMPO} mb-2`}
            />
          )}

          {erro && <p className="mb-2 text-[11px] text-theme-error">{erro}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!nome.trim() || salvando}
              onClick={() => void criar()}
              className="felixo-btn flex-1 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
            >
              {salvando ? 'Criando…' : 'Criar conta'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCriando(false)
                setErro(null)
              }}
              className="felixo-btn rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

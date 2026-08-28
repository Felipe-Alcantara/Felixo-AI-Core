import { useId, useRef } from 'react'
import { RotateCw } from 'lucide-react'
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

      {config.agent && (
        <>
          {config.agent.isLauncher ? (
            <p className="mb-3 rounded bg-zinc-900/70 px-2 py-2 text-xs leading-relaxed text-zinc-400 ring-1 ring-white/10">
              O Openia é um launcher: a interface, a chave do OpenRouter e o modelo
              são escolhidos no próprio terminal. O Felixo não duplica nem lê essa
              configuração.
            </p>
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

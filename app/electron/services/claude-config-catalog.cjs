'use strict'

/**
 * Opções da aba Config do `/status` do Claude Code que o app sabe aplicar ao abrir um terminal.
 * Lista conferida na referência de configurações do Claude Code (2.1.327). O app NUNCA grava o
 * `settings.json` nem o `~/.claude.json` da pessoa: o valor escolhido vale só no terminal do app.
 *
 * - `settings`: chave de configuração; vai no arquivo que o app passa em `--settings`.
 * - `global`: chave do `~/.claude.json`, que o `--settings` não alcança. Só entra se a CLI tem flag
 *   ou variável de ambiente para a sessão (`override`); sem isso a opção é só leitura.
 *
 * `override.env`: variável por valor (`null` = a CLI não tem como forçar esse valor).
 * `override.flags`: argumento da CLI por valor.
 */

const ON_OFF = [
  { value: true, label: 'Ligado' },
  { value: false, label: 'Desligado' },
]

function bool(key, label, defaultValue, extra = {}) {
  return { key, label, source: 'settings', type: 'boolean', options: ON_OFF, claudeDefault: defaultValue, ...extra }
}

function choice(key, label, defaultValue, options, extra = {}) {
  return {
    key,
    label,
    source: 'settings',
    type: 'enum',
    options: options.map(([value, text]) => ({ value, label: text })),
    claudeDefault: defaultValue,
    ...extra,
  }
}

const TIMEOUTS = [['60s', '60 segundos'], ['5m', '5 minutos'], ['10m', '10 minutos'], ['never', 'Nunca']]

const CLAUDE_CONFIG_OPTIONS = Object.freeze([
  choice('theme', 'Tema', 'dark', [
    ['auto', 'Automático (segue o terminal)'],
    ['dark', 'Escuro'],
    ['light', 'Claro'],
    ['dark-daltonized', 'Escuro para daltonismo'],
    ['light-daltonized', 'Claro para daltonismo'],
    ['dark-ansi', 'Escuro (cores ANSI)'],
    ['light-ansi', 'Claro (cores ANSI)'],
  ]),
  choice('editorMode', 'Modo do editor', 'normal', [['normal', 'Normal'], ['vim', 'Vim']]),
  bool('verbose', 'Saída detalhada', false),
  bool('autoCompactEnabled', 'Compactar a conversa automaticamente', true),
  bool('fileCheckpointingEnabled', 'Rebobinar código (checkpoints)', true),
  bool('autoScrollEnabled', 'Rolagem automática', true),
  bool('prefersReducedMotion', 'Reduzir movimento', false),
  bool('respectGitignore', 'Respeitar .gitignore no seletor de arquivos', true),
  bool('showTurnDuration', 'Mostrar a duração de cada resposta', true),
  bool('spinnerTipsEnabled', 'Mostrar dicas', true),
  bool('terminalProgressBarEnabled', 'Barra de progresso do terminal', true),
  // Cobra crédito de uso pago, fora do limite da assinatura: o app só liga com confirmação a cada terminal.
  bool('fastMode', 'Modo fast (só no Opus)', false, {
    confirmEachTerminal: true,
    warning: 'Cobra crédito de uso pago, fora do limite da sua assinatura. O app pede a sua confirmação a cada terminal que for ligá-lo; sem confirmar, o terminal abre sem o modo fast.',
  }),
  bool('enableWorkflows', 'Workflows dinâmicos', null),
  bool('workflowKeywordTriggerEnabled', 'Gatilho da palavra ultracode', true),
  bool('useAutoModeDuringPlan', 'Modo automático durante o plano', true),
  bool('switchModelsOnFlag', 'Trocar de modelo quando uma mensagem é sinalizada', null),
  bool('autoContinueAtUsageLimit', 'Continuar sozinho ao fim do limite de uso', true),
  choice('askUserQuestionTimeout', 'Tempo para a pergunta do Claude continuar sozinha', 'never', TIMEOUTS),
  choice('dialogExpiry', 'Validade dos diálogos', '5m', TIMEOUTS),
  bool('agentPushNotifEnabled', 'Push quando o Claude decide', false),
  bool('inputNeededNotifEnabled', 'Push quando precisa de uma ação', false),
  choice('preferredNotifChannel', 'Notificações locais', 'auto', [
    ['auto', 'Automático'],
    ['terminal_bell', 'Sino do terminal'],
    ['iterm2', 'iTerm2'],
    ['iterm2_with_bell', 'iTerm2 com sino'],
    ['kitty', 'Kitty'],
    ['ghostty', 'Ghostty'],
    ['notifications_disabled', 'Sem notificação'],
  ]),
  bool('remoteControlAtStartup', 'Remote Control em todas as sessões', null),
  choice('feedbackDrafts', 'Feedback redigido pelo Claude', 'notify', [
    ['notify', 'Avisar'],
    ['quiet', 'Em silêncio'],
    ['off', 'Desligado'],
  ]),

  // `~/.claude.json`: com caminho de sessão na CLI, o app aplica; sem, só mostra.
  bool('claudeInChromeDefaultEnabled', 'Claude in Chrome ligado por padrão', null, {
    source: 'global',
    // Decisão do Felipe (25/11/2026): terminais novos do app abrem com --chrome; a conta pode desligar.
    appDefault: true,
    override: { flags: { true: ['--chrome'], false: ['--no-chrome'] } },
  }),
  bool('autoConnectIde', 'Conectar ao IDE sozinho (terminal externo)', false, {
    source: 'global',
    override: { env: 'CLAUDE_CODE_AUTO_CONNECT_IDE', values: { true: '1', false: '0' } },
  }),
  // A CLI só tem como PULAR a instalação; ligar de novo é o que o `~/.claude.json` já decide.
  bool('autoInstallIdeExtension', 'Instalar a extensão do IDE pelo /ide', true, {
    source: 'global',
    override: { env: 'CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL', values: { true: null, false: '1' } },
  }),
  bool('copyFullResponse', 'Pular o seletor do /copy', false, { source: 'global' }),
  bool('copyOnSelect', 'Copiar ao selecionar', true, { source: 'global' }),
  bool('defaultToAgentsView', 'Abrir a visão de agentes por padrão', false, { source: 'global' }),
  choice('diffTool', 'Ferramenta de diff', 'auto', [['auto', 'Automática (IDE conectado)'], ['terminal', 'Terminal']], {
    source: 'global',
  }),
  bool('externalEditorContext', 'Mostrar a última resposta no editor externo', false, { source: 'global' }),
  bool('leftArrowOpensAgents', 'Seta para a esquerda abre os agentes', true, { source: 'global' }),
  bool('permissionExplainerEnabled', 'Explicar pedidos de permissão', true, { source: 'global' }),
  bool('prStatusFooterEnabled', 'Mostrar o status do PR no rodapé', true, { source: 'global' }),
])

const OPTION_BY_KEY = new Map(CLAUDE_CONFIG_OPTIONS.map((option) => [option.key, option]))

/** Frase fixa das opções que o app não consegue aplicar sem gravar o `.claude.json`. */
const READ_ONLY_NOTE = 'vale para todo o Claude desta máquina; mude no próprio Claude'

function findOption(key) {
  return typeof key === 'string' ? OPTION_BY_KEY.get(key) ?? null : null
}

/** O app aplica a opção? `settings` sempre; `global` só com flag ou variável da CLI. */
function isEditable(option) {
  return option.source === 'settings' || Boolean(option.override)
}

/** O valor existe e a CLI tem como expressá-lo na sessão? */
function isValueApplicable(option, value) {
  if (!isEditable(option)) return false
  if (!option.options.some((candidate) => candidate.value === value)) return false
  if (option.source === 'settings' || !option.override) return true
  if (option.override.flags) return Array.isArray(option.override.flags[String(value)])
  return typeof option.override.values?.[String(value)] === 'string'
}

/** Descrição serializável para a interface: sem funções, com a frase das opções só de leitura. */
function describeOptions() {
  return CLAUDE_CONFIG_OPTIONS.map((option) => ({
    key: option.key,
    label: option.label,
    source: option.source,
    type: option.type,
    options: option.options.filter((candidate) => isValueApplicable(option, candidate.value) || !isEditable(option)),
    claudeDefault: option.claudeDefault,
    editable: isEditable(option),
    ...(option.warning ? { warning: option.warning } : {}),
    ...(isEditable(option) ? {} : { note: READ_ONLY_NOTE }),
  }))
}

module.exports = {
  CLAUDE_CONFIG_OPTIONS,
  READ_ONLY_NOTE,
  describeOptions,
  findOption,
  isEditable,
  isValueApplicable,
}

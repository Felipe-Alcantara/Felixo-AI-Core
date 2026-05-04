# Status Atual do Felixo AI Core

Status: concluido.

## Resumo

O app já executa CLIs reais (`claude`, `codex`, `gemini`) a partir do backend Electron, envia respostas em streaming para o React e mostra uma visão humanizada do terminal em tempo real. A conversa agora diferencia `threadId` lógico da conversa e `sessionId` da resposta, permitindo agrupar vários prompts no mesmo terminal visual.

A persistência real de processo já está ativa para Claude, porque o CLI oferece um contrato compatível com `--input-format stream-json`. Codex e Gemini continuam em execução one-shot por mensagem, mas agora retomam a conversa nativa do provedor quando já existe `providerSessionId`; antes da primeira sessão capturada, a continuidade vem pelo contexto explícito.

A arquitetura foi alinhada para o modelo híbrido: Terminal Adapters controlam CLIs, Orchestrator Core decide a estratégia de execução e a MCP Layer começa como catálogo de ferramentas/contexto, não como API universal de modelos.

Detalhe tecnico dos protocolos persistentes investigados: [PROTOCOLOS-PERSISTENTES.md](../backend/PROTOCOLOS-PERSISTENTES.md).

## Últimos blocos registrados

### `66c0f21` — Terminal Adapters e Orchestrator Core

- `ipc-handlers.cjs` deixou de manter um mapa local de adapters.
- `providers/terminal-adapter-registry.cjs` passou a resolver adapter por `cliType`.
- `orchestrator/cli-execution-planner.cjs` passou a decidir entre:
  - `persistent-process`;
  - `native-resume`;
  - `one-shot`.
- A normalização de entrada persistente agora aceita adapters simples e adapters multi-etapa, preparando protocolos como Gemini ACP.

### `1bd0c7b` — Catálogo MCP inicial

- `mcp/felixo-tool-catalog.cjs` define as tools planejadas do Felixo.
- Tools de escrita já ficam marcadas com `requiresConfirmation`.
- A primeira versão da MCP Layer fica como contrato de ferramentas/contexto, não como servidor MCP completo.
- `npm test` passou a cobrir `mcp/`, `orchestrator/` e `providers/`.

### `22e2af5` — Documentação da arquitetura híbrida

- A arquitetura foi documentada como Terminal Adapters + Orchestrator Core + MCP Layer.
- `VISAO-GERAL.md`, `ELECTRON.md`, `ROADMAP.md`, `STATUS-ATUAL.md` e `README.md` foram alinhados com essa decisão.
- Ficou registrado que MCP não substitui CLIs nem API keys; MCP padroniza ferramentas, contexto, Git, memória e skills.

### Fake persistent agents + Gemini ACP adapter + AgentEvent

- `protocols/agent-events.cjs` define factories para eventos padrao (`textDelta`, `toolCall`, `session`, `status`, `done`, `error`) e JSDoc da interface `AgentSession`.
- `adapters/testing/fake-stream-json-agent.cjs` simula protocolo Claude stream-json sem CLI real.
- `adapters/testing/fake-acp-agent.cjs` simula protocolo Gemini ACP (JSON-RPC 2.0) sem CLI real.
- `adapters/gemini-acp-adapter.cjs` implementa handshake multi-fase (initialize → newSession → prompt) compativel com o fluxo persistente do IPC.
- `providers/terminal-adapter-registry.cjs` agora inclui `gemini-acp`.
- `npm test` passou a cobrir `protocols/` e `adapters/testing/`.
- Plano documentado em `docs/backend/PLANO-FAKE-PERSISTENT-ACP.md`.

### Codex app-server adapter + fake agent

- `adapters/codex-app-server-adapter.cjs` implementa handshake multi-fase (initialize → initialized → thread/start → turn/start) compativel com o fluxo persistente do IPC.
- `adapters/testing/fake-codex-app-server-agent.cjs` simula protocolo Codex app-server (JSON-RPC 2.0) sem CLI real.
- Auto-aprovacao de `commandExecution` e `fileChange` requests na primeira versao.
- `providers/terminal-adapter-registry.cjs` agora inclui `codex-app-server`.
- Renderer reconhece `cliType: "codex-app-server"` e preserva esse tipo em
  modelos salvos/importados.
- Schema do protocolo gerado localmente via `codex app-server generate-json-schema` (codex-cli 0.125.0).
- Plano documentado em `docs/backend/PLANO-CODEX-APP-SERVER.md`.

### Tasklist 30/04/2026 — UX de workspace e preparação Code/Git

- "Novo chat" solicita `cli:reset-thread`, limpa terminal local, anexos e estado efêmero para não reutilizar thread anterior.
- Projetos e seleção ativa persistem em SQLite, com fallback/migração do `localStorage`.
- Automações padrão e customizadas foram adicionadas com modal dedicado e storage local.
- Modelos clicáveis na sidebar abrem o modal de configuração com capacidades por CLI e campos `providerModel`/`reasoningEffort`.
- "Code" ganhou painel Git inicial com IPC read-only allowlisted.
- "Felixo" ganhou modal próprio separado de "Modelos".
- Terminal e QA Logger podem ser recolhidos; Terminal redimensiona horizontalmente e QA Logger verticalmente.
- Composer aceita anexos de contexto pelo botão `+`.
- Selects nativos foram corrigidos para tema escuro.
- A tela inicial usa a logo do portfólio em `/brand/felixo-logo.png`.
- Relatórios diários criados em `docs/relatorios/` com nomes no formato `aaaa-mm-dd.md`.

### Tasklist 03/05/2026 — Portabilidade, Build e Releases

- `core/app-paths.cjs` centraliza resolução de paths de dados do usuário (userData, config, logs, cache, database, exports, notes, reports) usando `app.getPath()` do Electron. Adapta-se a Linux, Windows e macOS.
- `core/shell-adapter.cjs` detecta shell padrão por SO, escapa argumentos de forma segura e define estratégia de terminação de processos.
- `core/cli-detector.cjs` detecta automaticamente CLIs externas (claude, codex, gemini, git, node, python, ollama) com verificação de versão, resolução de path e mensagens amigáveis de instalação.
- `main.cjs` integrado: inicializa diretórios de dados do usuário no startup e roda detecção de CLIs em background, logando resultado via QA Logger.
- CI expandida para rodar em Linux, Windows e macOS em paralelo, com verificação de docs obrigatórios e detecção de arquivos sensíveis.
- Documentação completa de portabilidade em `/docs/projeto/`: levantamento da arquitetura, dev vs produção, estratégia de paths, camada shell, detecção de CLIs, compatibilidade por SO, empacotamento, segurança, versionamento, branch plan, guias de usuário e desenvolvedor.
## O que já foi concluído

### Backend Electron

- IPC `cli:send` executa adapters por `cliType` (`claude`, `codex`, `gemini`).
- `providers/terminal-adapter-registry.cjs` centraliza o registro dos Terminal Adapters.
- `orchestrator/cli-execution-planner.cjs` concentra a decisão entre processo persistente, retomada nativa e one-shot.
- `mcp/felixo-tool-catalog.cjs` define o catálogo inicial das tools MCP planejadas.
- IPC `cli:stop` interrompe a execução em andamento por `threadId`.
- IPC `cli:reset-thread` encerra thread persistente ao iniciar novo chat.
- IPC Git read-only fornece status, diff stat, branch e commits recentes ao painel Code.
- `CliProcessManager` mantém processos por chave lógica, permite abrir `stdin`, escrever prompts e matar grupo de processo.
- O backend separa:
  - `threadId`: identidade da conversa/terminal/processo.
  - `sessionId`: identidade da mensagem assistente que recebe o streaming.
- Eventos de stream (`cli:stream`) carregam `threadId` junto com `sessionId`.
- Eventos de terminal (`cli:terminal-output`) são emitidos já formatados para UI: lifecycle, resposta, ferramenta, métricas, stderr e erro.
- O JSONL bruto continua disponível no `QA Logger`.
- Timeouts interrompem CLIs que não emitem resposta textual visível.
- `before-quit` encerra todos os processos CLI abertos.

### Sessão persistente

- Claude usa processo persistente real:
  - spawn inicial com `claude --print --input-format stream-json --output-format stream-json --verbose --include-partial-messages`.
  - `stdin` fica aberto.
  - cada nova mensagem da mesma conversa é escrita no mesmo processo em JSONL.
  - se houver `providerSessionId`, o próximo processo pode retomar com `--resume`.
- Processos persistentes ociosos são encerrados após 30 minutos.
- O backend evita apagar uma sessão nova se um processo antigo fechar atrasado com o mesmo `threadId`.
- Enquanto uma resposta está ativa, uma nova mensagem para a mesma thread é rejeitada para evitar interleaving de streams.

### Adapters

- `claude-adapter.cjs`
  - Suporta one-shot com `--session-id`.
  - Suporta retomada com `--resume`.
  - Suporta processo persistente via `getPersistentSpawnArgs()` e `createPersistentInput()`.
  - Parseia `system`, `stream_event`, `result` e erros.
- `codex-adapter.cjs`
  - Executa `codex exec --json --skip-git-repo-check`.
  - Retoma sessão com `codex exec resume --json --skip-git-repo-check <providerSessionId>`.
  - Captura metadados comuns de sessão/thread quando aparecem no JSONL.
  - Parseia resposta final em `item.completed` e conclusão em `turn.completed`.
  - Suprime ruídos conhecidos de `stderr` que não representam falha.
- `gemini-adapter.cjs`
  - Executa `gemini --prompt ... --output-format stream-json --skip-trust`.
  - Retoma sessão com `gemini --resume <session_id> --prompt ... --output-format stream-json --skip-trust`.
  - Captura `init.session_id`.
  - Parseia mensagens `role: model` ou `role: assistant`.
  - Trata `result` como conclusão.
  - Classifica avisos visuais como não fatais e erro 429/capacidade como fatal.

### Frontend

- `ChatWorkspace` mantém um `threadId` por conversa/modelo e gera um `sessionId` por mensagem.
- "Novo chat" limpa estado local e solicita reset explícito da thread no backend.
- O prompt enviado para CLIs one-shot inclui histórico recente e contexto dos projetos ativos.
- O prompt de continuação (`resumePrompt`) não inclui histórico inteiro quando o adapter consegue manter contexto nativo por processo persistente ou retomada nativa.
- Trocar modelo, iniciar novo chat ou carregar outra sessão reinicia a thread lógica.
- O painel Terminal agrupa eventos por `threadId`, não por mensagem individual.
- O painel Terminal mostra status (`running`, `completed`, `error`, `stopped`), contagem de eventos e tamanho acumulado.
- `useTerminalOutput` escuta `onTerminalOutput`, mantendo `onRawOutput` como compatibilidade.
- `CodePanel`, `AutomationsModal` e `FelixoSettingsModal` separam experiências de Git, automação e perfil.
- `QaLoggerPanel` pode ser ocultado e redimensionado.
- `Composer` injeta anexos de contexto no prompt da próxima mensagem.

### Projetos e contexto

- A seleção de projetos ativos entra no prompt.
- Projetos e seleção ativa persistem em SQLite, com fallback/migração do `localStorage`.
- O app calcula diff de projetos adicionados/removidos entre mensagens.
- Trocar de modelo não zera a base de diff de projetos ativos, para não gerar ruído.

### Testes e validação

- Testes unitários cobrem adapters, leitor JSONL, guard de JSONL, QA logger, formatador de terminal, atalhos de zoom, IPC helper e gerenciador de processos.
- Testes unitários cobrem registry de providers, planner do orquestrador e catálogo MCP.
- Verificações executadas com sucesso:
  - `npm test`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`

## O que ficou parcial

- Processo persistente real está implementado para Claude, mas não para todos os adapters.
- Codex e Gemini mantêm `threadId` estável no app e retomam a conversa nativa quando há `providerSessionId`, mas cada prompt ainda abre um novo processo CLI.
- O painel Terminal é observável e humanizado, mas ainda não é um terminal interativo manual.
- Histórico de chat persiste em SQLite e é reaberto pela sidebar/pesquisa.
- O `QA Logger` é voltado para debug local, não para auditoria persistente.
- O painel Code é read-only; ações Git com escrita ainda dependem de uma política de confirmação.

## O que falta

### Codex

- Validar em execução real longa se `codex exec resume <id> --json` segue emitindo `turn.completed` de forma confiável.
- Investigar se `codex exec-server`, `mcp-server` ou outro modo oferece protocolo persistente melhor que processo one-shot.
- Só trocar para processo vivo quando houver delimitação clara de resposta e conclusão.

### Gemini

- Validar em execução real longa se `gemini --resume <session_id> --output-format stream-json` segue emitindo `assistant/result` de forma confiável.
- Investigar `--prompt-interactive`, `--acp` ou outro protocolo persistente com saída estruturada.
- Só trocar para processo vivo quando houver delimitação clara de resposta e conclusão.

### Frontend e produto

- Evoluir histórico de sessões com busca textual/semântica e compactação.
- Migrar persistências locais importantes de `localStorage` para armazenamento Electron versionado, se a necessidade crescer.
- Adicionar UI para múltiplas threads simultâneas.
- Permitir escolher a thread de destino do próximo prompt.
- Encerrar uma thread individual sem resetar a conversa inteira.
- Mostrar claramente quando uma thread usa processo persistente real ou apenas contexto explícito.
- Melhorar mensagens de erro para diferenciar falha de CLI, falha de parsing e falta de output.

### Arquitetura

- Extrair a orquestração de processo persistente de `ipc-handlers.cjs` para serviço próprio se a complexidade continuar crescendo.
- Implementar servidor MCP read-only a partir do catálogo inicial.
- Implementar cliente MCP para servidores externos quando a UI já tiver política de permissões.
- Criar contrato formal por adapter:
  - spawn one-shot.
  - spawn persistente.
  - formato de stdin persistente.
  - evento de conclusão.
  - suporte ou não a retomada nativa.
- Adicionar testes de integração com processos fake persistentes para validar múltiplas mensagens na mesma thread.
- Definir política de expiração/limpeza para sessões de provedor e sessões locais.

## Próximo recorte recomendado

1. Criar testes de integração usando um CLI fake persistente que lê JSONL no `stdin` e emite JSONL no `stdout`.
2. Extrair a lógica persistente de `ipc-handlers.cjs` para um `persistent-cli-session-manager.cjs`.
3. Adicionar indicador visual no Terminal para `processo persistente`, `retomada nativa` e `contexto explícito`.
4. Revalidar Codex e Gemini manualmente com logs salvos no `QA Logger`.
5. Migrar modelos/preferências restantes para armazenamento local do Electron.

# Status Atual do Felixo AI Core

## Resumo

O app já executa CLIs reais (`claude`, `codex`, `gemini`) a partir do backend Electron, envia respostas em streaming para o React e mostra uma visão humanizada do terminal em tempo real. A conversa agora diferencia `threadId` lógico da conversa e `sessionId` da resposta, permitindo agrupar vários prompts no mesmo terminal visual.

A persistência real de processo já está ativa para Claude, porque o CLI oferece um contrato compatível com `--input-format stream-json`. Codex e Gemini continuam em execução one-shot por mensagem, mas agora retomam a conversa nativa do provedor quando já existe `providerSessionId`; antes da primeira sessão capturada, a continuidade vem pelo contexto explícito.

## O que já foi concluído

### Backend Electron

- IPC `cli:send` executa adapters por `cliType` (`claude`, `codex`, `gemini`).
- IPC `cli:stop` interrompe a execução em andamento por `threadId`.
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
- O prompt enviado para CLIs one-shot inclui histórico recente e contexto dos projetos ativos.
- O prompt de continuação (`resumePrompt`) não inclui histórico inteiro quando o adapter consegue manter contexto nativo por processo persistente ou retomada nativa.
- Trocar modelo, iniciar novo chat ou carregar outra sessão reinicia a thread lógica.
- O painel Terminal agrupa eventos por `threadId`, não por mensagem individual.
- O painel Terminal mostra status (`running`, `completed`, `error`, `stopped`), contagem de eventos e tamanho acumulado.
- `useTerminalOutput` escuta `onTerminalOutput`, mantendo `onRawOutput` como compatibilidade.

### Projetos e contexto

- A seleção de projetos ativos entra no prompt.
- O app calcula diff de projetos adicionados/removidos entre mensagens.
- Trocar de modelo não zera a base de diff de projetos ativos, para não gerar ruído.

### Testes e validação

- Testes unitários cobrem adapters, leitor JSONL, guard de JSONL, QA logger, formatador de terminal, atalhos de zoom, IPC helper e gerenciador de processos.
- Verificações executadas com sucesso:
  - `npm test`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`

## O que ficou parcial

- Processo persistente real está implementado para Claude, mas não para todos os adapters.
- Codex e Gemini mantêm `threadId` estável no app e retomam a conversa nativa quando há `providerSessionId`, mas cada prompt ainda abre um novo processo CLI.
- O painel Terminal é observável e humanizado, mas ainda não é um terminal interativo manual.
- Histórico de chat ainda é basicamente em memória, salvo ao iniciar novo chat/carregar sessão dentro da execução atual.
- O `QA Logger` é voltado para debug local, não para auditoria persistente.

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

- Persistir histórico de sessões em disco.
- Persistir modelos importados, projetos e estado de conversas de forma mais robusta.
- Adicionar UI para múltiplas threads simultâneas.
- Permitir escolher a thread de destino do próximo prompt.
- Encerrar uma thread individual sem resetar a conversa inteira.
- Mostrar claramente quando uma thread usa processo persistente real ou apenas contexto explícito.
- Melhorar mensagens de erro para diferenciar falha de CLI, falha de parsing e falta de output.

### Arquitetura

- Extrair a orquestração de processo persistente de `ipc-handlers.cjs` para serviço próprio se a complexidade continuar crescendo.
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
5. Persistir histórico de sessões e modelos em armazenamento local do Electron.

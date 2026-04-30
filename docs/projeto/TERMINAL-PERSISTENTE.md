# Terminal Persistente e Painel de Output

## Contexto

Hoje cada mensagem spawna um processo CLI novo que encerra ao responder. O objetivo desta frente é tornar a sessão persistente e dar visibilidade ao que acontece dentro do terminal em tempo real.

Resumo consolidado do status atual e das pendências: [STATUS-ATUAL.md](./STATUS-ATUAL.md).

---

## Etapa 1 — Painel de terminal em tempo real *(implementada)*

Barra lateral direita que exibe eventos legíveis de cada processo CLI enquanto roda: início, sessão, processamento, resposta, ferramentas, avisos e métricas. O JSONL bruto fica no `QA Logger`.

### O que entregar

- [x] Painel recolhível à direita do chat
- [x] Eventos de terminal acumulados por `threadId` (lifecycle, output, ferramentas, métricas e stderr relevante)
- [x] Atualização em tempo real via eventos IPC já existentes
- [x] Indicador visual: rodando (pulsando), concluído, erro
- [x] Scroll automático para o final, com lock quando o usuário rolar para cima
- [x] IPC: evento `cli:terminal-output` emitido a partir do JSONL parseado e de `stderr` relevante

### Como implementar

**Electron (ipc-handlers.cjs)**
- O `stdout` JSONL continua indo para o `QA Logger` como detalhe bruto, mas o painel de terminal recebe eventos humanizados via `cli:terminal-output`
- `terminal-event-formatter.cjs` converte eventos como `thread.started`, `turn.started`, `item.completed` e `turn.completed.usage` em mensagens legíveis com tempo e tokens
- Ruídos conhecidos de `stderr` do Codex (`Reading additional input from stdin...` e `failed to record rollout items: thread ... not found`) são filtrados antes do QA Logger e do painel de terminal, pois a execução já entrega `turn.completed` e fecha com código `0`
- Avisos conhecidos de `stderr` do Gemini que não quebram a execução são tratados como não fatais; o aviso visual de terminal sem 256 cores é suprimido da UI

**Frontend**
- `useTerminalOutput` hook: acumula eventos por thread via `window.felixo.cli.onTerminalOutput`
- `TerminalPanel` component: painel direito com lista de threads (uma por `threadId`) e área de output monoespaçada com scroll
- `ChatWorkspace`: gerencia estado de abertura do painel e repassa para `TerminalPanel`

**Preload**
- Expõe `window.felixo.cli.onTerminalOutput(callback)` para o renderer escutar eventos de terminal; `onRawOutput` permanece como alias compatível

---

## Etapa 2 — Sessão CLI persistente *(em implementação)*

Manter o processo da CLI vivo entre mensagens da mesma conversa, enviando novos prompts via stdin sem spawnar um novo processo.

### Status atual

Primeiros recortes implementados: o frontend separa `threadId` de conversa e `sessionId` de resposta, e o backend mantém processo vivo por `threadId` quando o adapter oferece protocolo JSONL confiável via stdin.

- `threadId`: fixo enquanto a conversa usa o mesmo modelo; alimenta o painel de terminal e a identidade da sessão CLI.
- `sessionId`: único por mensagem; continua correlacionando o streaming da resposta correta no chat.
- O painel de terminal passa a acumular várias mensagens da mesma conversa na mesma thread.
- Eventos `cli:stream` carregam `threadId` além de `sessionId`, para que troca de modelo, novo chat ou carregamento de sessão não deixe um terminal antigo preso como `Rodando` depois que o mapa local de mensagens é resetado.
- Claude usa processo persistente real com `--print --input-format stream-json --output-format stream-json`; o backend mantém `stdin` aberto e escreve novas mensagens no mesmo processo da conversa. Se o processo cair e houver `providerSessionId`, o próximo spawn persistente pode retomar com `--resume`.
- Gemini captura `init.session_id` no `stream-json`, mas a retomada nativa com `--resume` ficou desativada após travar emitindo só `init` + eco de `user`; a continuidade fica pelo contexto explícito do Felixo até nova validação.
- Codex expõe `thread.started`, mas `codex exec resume <thread_id>` gerou erro interno `thread not found` nos testes manuais; por isso a retomada nativa foi desativada até validação de persistência. A continuidade segue pelo contexto explícito do Felixo e pelo `threadId` estável no painel.
- Codex ainda pode escrever avisos internos no `stderr`; os avisos não acionáveis já identificados são suprimidos da UI para não parecerem falha quando a resposta completou normalmente.
- Processos persistentes ociosos são encerrados após 30 minutos para evitar acúmulo de CLIs abertas sem resposta ativa.
- Trocar de modelo reinicia a thread do provedor, mas não zera a linha de base de projetos ativos da conversa; assim o diff de projetos só mostra mudanças reais de seleção.

### Desafios por CLI

| CLI | Modo interativo | Estratégia |
|-----|----------------|------------|
| `claude` | `--print --input-format stream-json --output-format stream-json` mantém stdin aberto e segue emitindo JSONL | Processo persistente por `threadId`; novas mensagens são escritas no mesmo processo |
| `codex` | `codex exec resume` existe, mas o `thread_id` emitido por `exec --json` não ficou persistido de forma confiável no teste manual | Manter execução one-shot com `threadId` Felixo estável e contexto explícito; retomar investigação antes de reativar `exec resume` |
| `gemini` | `stream-json` emite `init.session_id`; `--resume <session_id>` pode travar antes de emitir `assistant/result` | Manter execução one-shot com contexto explícito; revalidar `--resume` antes de reativar |

### O que entregar

- [x] Investigar flags locais de sessão/retomada dos adapters (`claude`, `codex`, `gemini`)
- [x] Novo método `CliProcessManager.write(threadId, prompt)` para escrever no stdin do processo ativo
- [x] `ChatWorkspace` usa `threadId` fixo por conversa + `sessionId` por resposta
- [x] `ipc-handlers.cjs` separa thread de terminal/processo da correlação de streaming da mensagem
- [x] Adapters de Claude/Gemini expõem `getResumeArgs()` além de `getSpawnArgs()`
- [x] Processo/thread atual é resetado ao trocar modelo, iniciar novo chat ou carregar outro chat
- [x] Painel de terminal continua funcionando com output acumulado da thread da conversa
- [x] Codex: capturar metadados comuns de thread/sessão quando aparecem no JSONL
- [ ] Gemini: revalidar `--resume` em `stream-json`; retorno só com `init` + `message role:user` deixa a UI sem resposta
- [ ] Codex: validar em execução real qual evento JSONL sempre carrega um id interno persistível antes de reativar `codex exec resume`
- [x] Processo CLI realmente vivo via stdin entre mensagens quando o adapter suportar protocolo confiável: Claude
- [ ] Codex/Gemini: integrar protocolo persistente parseável antes de trocar o one-shot por processo vivo

### Decisão de arquitetura

O `CliProcessManager` indexa processos por `threadId`. A mudança arquitetural foi separar a thread da conversa do `sessionId` da mensagem. Duas opções:

- **Opção A** — `conversationSessionId` fixo por conversa + `messageSessionId` por mensagem para correlacionar streaming
- **Opção B** — processo único por conversa, stdin recebe prompts sequencialmente, stdout é parseado em blocos delimitados por evento `result`

Decisão atual: a implementação adotou a **Opção A** como base geral e ativou a **Opção B** por adapter quando houver contrato confiável. Claude já usa processo persistente real; Codex/Gemini continuam one-shot com `threadId` estável e contexto explícito até validação de um protocolo persistente parseável.

---

## Etapa 3 — Múltiplas threads simultâneas

Spawn de mais de uma CLI em paralelo na mesma conversa, cada uma com sua própria thread visível no painel direito.

### O que entregar

- [ ] UI para criar nova thread manualmente a partir do Composer ou do painel
- [ ] Painel direito lista todas as threads com status individual (ativa, rodando, concluída, erro)
- [ ] Composer permite escolher em qual thread enviar o próximo prompt
- [ ] Threads podem usar modelos diferentes
- [ ] Thread pode ser encerrada individualmente sem fechar a conversa

### Relação com Etapa 2

Threads simultâneas dependem da sessão persistente: cada thread é um processo vivo com seu próprio `conversationSessionId`. Se a Etapa 2 não for viável para alguma CLI, threads nessa CLI funcionarão como hoje (one-shot por mensagem), mas ainda serão visíveis no painel.

---

## Estado atual

| Etapa | Status |
|-------|--------|
| Painel de terminal em tempo real | Implementado |
| Sessão CLI persistente | Em implementação — processo persistente real no Claude; Codex/Gemini one-shot com contexto explícito |
| Múltiplas threads simultâneas | Planejado — depende da Etapa 2 |

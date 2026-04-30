# Terminal Persistente e Painel de Output

## Contexto

Hoje cada mensagem spawna um processo CLI novo que encerra ao responder. O objetivo desta frente é tornar a sessão persistente e dar visibilidade ao que acontece dentro do terminal em tempo real.

---

## Etapa 1 — Painel de terminal em tempo real *(implementada)*

Barra lateral direita que exibe o output bruto (stdout/stderr) de cada processo CLI enquanto roda. Não requer interação direta — é observação.

### O que entregar

- [x] Painel recolhível à direita do chat
- [x] Output bruto acumulado por `sessionId` (stdout + stderr)
- [x] Atualização em tempo real via eventos IPC já existentes
- [x] Indicador visual: rodando (pulsando), concluído, erro
- [x] Scroll automático para o final, com lock quando o usuário rolar para cima
- [x] IPC: novo evento `cli:raw-output` emitido a cada chunk de stdout/stderr

### Como implementar

**Electron (ipc-handlers.cjs)**
- A cada chunk de `stdout` e `stderr`, emitir `cli:raw-output` com `{ sessionId, source: 'stdout' | 'stderr', chunk }` para o renderer, além dos eventos já existentes
- Ruídos conhecidos de `stderr` do Codex (`Reading additional input from stdin...` e `failed to record rollout items: thread ... not found`) são filtrados antes do QA Logger e do painel de terminal, pois a execução já entrega `turn.completed` e fecha com código `0`
- Avisos conhecidos de `stderr` do Gemini que não quebram a execução são tratados como não fatais; o aviso visual de terminal sem 256 cores é suprimido da UI

**Frontend**
- `useTerminalOutput` hook: acumula chunks por `sessionId` via `window.felixo.cli.onRawOutput`
- `TerminalPanel` component: painel direito com lista de threads (uma por `sessionId`) e área de output monoespaçada com scroll
- `ChatWorkspace`: gerencia estado de abertura do painel e repassa para `TerminalPanel`

**Preload**
- Expõe `window.felixo.cli.onRawOutput(callback)` para o renderer escutar os chunks

---

## Etapa 2 — Sessão CLI persistente *(em implementação)*

Manter o processo da CLI vivo entre mensagens da mesma conversa, enviando novos prompts via stdin sem spawnar um novo processo.

### Status atual

Primeiro recorte implementado: o frontend agora separa `threadId` de conversa e `sessionId` de resposta.

- `threadId`: fixo enquanto a conversa usa o mesmo modelo; alimenta o painel de terminal e a identidade da sessão CLI.
- `sessionId`: único por mensagem; continua correlacionando o streaming da resposta correta no chat.
- O painel de terminal passa a acumular várias mensagens da mesma conversa na mesma thread.
- Claude usa `--session-id` no primeiro envio e `--resume` nas continuações.
- Gemini captura `init.session_id` no `stream-json` e usa `--resume` nas continuações.
- Codex expõe `thread.started`, mas `codex exec resume <thread_id>` gerou erro interno `thread not found` nos testes manuais; por isso a retomada nativa foi desativada até validação de persistência. A continuidade segue pelo contexto explícito do Felixo e pelo `threadId` estável no painel.
- Codex ainda pode escrever avisos internos no `stderr`; os avisos não acionáveis já identificados são suprimidos da UI para não parecerem falha quando a resposta completou normalmente.
- Trocar de modelo reinicia a thread do provedor, mas não zera a linha de base de projetos ativos da conversa; assim o diff de projetos só mostra mudanças reais de seleção.

### Desafios por CLI

| CLI | Modo interativo | Estratégia |
|-----|----------------|------------|
| `claude` | `--print --output-format stream-json` suporta `--session-id` e `--resume`; `--input-format stream-json` ainda fica para o modo processo vivo | Retomada nativa por sessão no recorte atual; stdin contínuo fica como próximo passo |
| `codex` | `codex exec resume` existe, mas o `thread_id` emitido por `exec --json` não ficou persistido de forma confiável no teste manual | Manter execução one-shot com `threadId` Felixo estável e contexto explícito; retomar investigação antes de reativar `exec resume` |
| `gemini` | `stream-json` emite `init.session_id`; `--resume <session_id>` retoma sessão | Retomada nativa por `session_id`; processo vivo depende de investigação do modo interativo/headless |

### O que entregar

- [x] Investigar flags locais de sessão/retomada dos adapters (`claude`, `codex`, `gemini`)
- [x] Novo método `CliProcessManager.write(sessionId, prompt)` para escrever no stdin do processo ativo
- [x] `ChatWorkspace` usa `threadId` fixo por conversa + `sessionId` por resposta
- [x] `ipc-handlers.cjs` separa thread de terminal/processo da correlação de streaming da mensagem
- [x] Adapters de Claude/Gemini expõem `getResumeArgs()` além de `getSpawnArgs()`
- [x] Processo/thread atual é resetado ao trocar modelo, iniciar novo chat ou carregar outro chat
- [x] Painel de terminal continua funcionando com output acumulado da thread da conversa
- [x] Codex: capturar metadados comuns de thread/sessão quando aparecem no JSONL
- [ ] Codex: validar em execução real qual evento JSONL sempre carrega um id interno persistível antes de reativar `codex exec resume`
- [ ] Processo CLI realmente vivo via stdin entre mensagens quando o adapter suportar protocolo confiável

### Decisão de arquitetura

O `CliProcessManager` já indexa processos por `sessionId`. A mudança é que o `sessionId` de conversa passa a ser fixo durante toda a conversa (hoje é gerado por mensagem). Duas opções:

- **Opção A** — `conversationSessionId` fixo por conversa + `messageSessionId` por mensagem para correlacionar streaming
- **Opção B** — processo único por conversa, stdin recebe prompts sequencialmente, stdout é parseado em blocos delimitados por evento `result`

Decisão atual: a implementação adotou a **Opção A** como base segura. O `threadId` da conversa mantém o terminal contínuo e permite retomada nativa quando o adapter oferece um contrato estável. A **Opção B** continua como próximo recorte para CLIs que suportarem `stdin` contínuo com saída JSONL confiável.

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
| Sessão CLI persistente | Em implementação — thread persistente + retomada Claude/Gemini; Codex one-shot com contexto explícito; processo vivo por stdin pendente |
| Múltiplas threads simultâneas | Planejado — depende da Etapa 2 |

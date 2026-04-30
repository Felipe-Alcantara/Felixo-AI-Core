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

**Frontend**
- `useTerminalOutput` hook: acumula chunks por `sessionId` via `window.felixo.cli.onRawOutput`
- `TerminalPanel` component: painel direito com lista de threads (uma por `sessionId`) e área de output monoespaçada com scroll
- `ChatWorkspace`: gerencia estado de abertura do painel e repassa para `TerminalPanel`

**Preload**
- Expõe `window.felixo.cli.onRawOutput(callback)` para o renderer escutar os chunks

---

## Etapa 2 — Sessão CLI persistente

Manter o processo da CLI vivo entre mensagens da mesma conversa, enviando novos prompts via stdin sem spawnar um novo processo.

### Desafios por CLI

| CLI | Modo interativo | Estratégia |
|-----|----------------|------------|
| `claude` | `claude` sem `--print` aceita stdin contínuo | Enviar prompt via stdin, aguardar evento `result` no stdout |
| `codex` | A investigar — pode ter flag de sessão | A definir após testes |
| `gemini` | A investigar | A definir após testes |

### O que entregar

- [ ] Investigar modo interativo de cada adapter (`claude`, `codex`, `gemini`)
- [ ] Novo método `CliProcessManager.write(sessionId, prompt)` para escrever no stdin do processo ativo
- [ ] Cada adapter expõe `getInteractiveArgs()` além de `getSpawnArgs()`
- [ ] `ipc-handlers.cjs` reutiliza processo existente se a conversa ainda estiver ativa, em vez de spawnar novo
- [ ] Processo encerrado ao trocar modelo ou iniciar nova conversa (`resetChat`)
- [ ] Painel de terminal continua funcionando — agora com output contínuo da sessão inteira

### Decisão de arquitetura

O `CliProcessManager` já indexa processos por `sessionId`. A mudança é que o `sessionId` de conversa passa a ser fixo durante toda a conversa (hoje é gerado por mensagem). Duas opções:

- **Opção A** — `conversationSessionId` fixo por conversa + `messageSessionId` por mensagem para correlacionar streaming
- **Opção B** — processo único por conversa, stdin recebe prompts sequencialmente, stdout é parseado em blocos delimitados por evento `result`

Opção B é mais simples se a CLI suportar — avaliar na investigação da Etapa 2.

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
| Sessão CLI persistente | Planejado — requer investigação por adapter |
| Múltiplas threads simultâneas | Planejado — depende da Etapa 2 |

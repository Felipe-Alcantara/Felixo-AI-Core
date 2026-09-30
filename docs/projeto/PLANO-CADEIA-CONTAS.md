Status: em implementação na branch `feat/cadeia-contas`. A política resultante está em [`POLITICA-CONTAS.md`](POLITICA-CONTAS.md).

# Cadeia de contas: plano final de implementação

- **Task:** "Felixo AI Core/Contas — definir política de cadeia, elegibilidade e ordem de fallback" (3ce91f95-497e-81c2). O plano cobre também as irmãs:
  - failover no PTY (3e691f95-497e-8194);
  - isolamento por conta (3ce91f95-497e-818a);
  - falhas injetadas (3ce91f95-497e-81ac);
  - retomada (3ce91f95-497e-812c).
- **Base conferida:** `origin/main` **116f0569** (`116f056942c929cdeec0018c9d73042c5bae1d72`). A branch `feat/cadeia-contas` nasce desse commit, e este plano é o primeiro commit dela. Todo `arquivo:linha` é relativo à raiz do repositório e foi aberto nesta síntese, nesse commit; os commits seguintes da branch deslocam as linhas.
- **Marcadores:**
  - **[INFERIDO]**: dedução não provada em execução.
  - **[A MEDIR]**: número que só sai da bancada.
- **Vocabulário das CLIs:** lido nos pacotes instalados, só com leitura de arquivo, sem executar CLI. Versões: Claude Code 2.1.283 (`@anthropic-ai/claude-code/bin/claude.exe`), Codex 0.156.1 (binário `@openai/codex-linux-x64/.../bin/codex`), Gemini CLI 0.57.0 (`@google/gemini-cli/bundle`) e Openia (`~/.local/lib/python3.12/site-packages/openia`).
- **Base do plano:** o plano vencedor (ângulo risco), com os enxertos dos juízes e as lacunas fechadas. Os pontos contestados foram conferidos no código (§0.2).

---

## 0. Antes de começar

### 0.1 Como executar este plano

1. Trabalhe numa branch própria, `feat/cadeia-contas`. A branch se justifica porque é feature grande e de alto risco: mexe no caminho quente do PTY e no comportamento do orquestrador (contrato Etapa 8).
2. Siga a sequência de commits do §14. Cada commit precisa passar em `npm test`, `npm run test:frontend`, `npm run lint` e `npm run build` (o `build` roda `tsc -b`, via `app/package.json:22,35`).
3. O comportamento visível só muda nos commits marcados com **(muda comportamento)**. A cadeia nasce desligada (§3.2).
4. Ao final: PR com CI nos 4 sistemas (`.github/workflows/ci.yml:404-413`). Acompanhe até o estado final. Depois do merge, apague a branch local, a remota e o worktree, guardando um bundle de backup.

### 0.2 Correções feitas nesta síntese (conferidas no código ou no pacote instalado)

| # | O que os planos ou juízes diziam | O que é verdade | Efeito no plano |
|---|---|---|---|
| 1 | "exportar `STALE_AFTER_MS`" | Já exportado (`app/electron/services/agent-usage-service.cjs:31` e `:1329`) | Nenhum commit precisa exportá-lo |
| 2 | "o runner não tem timer; a decisão pendente fica pendurada" | O runner não tem timer, mas existe a varredura `startExpiredRunsSweeper`, de 60 s com `unref` (`app/electron/services/orchestration/expired-runs-sweeper.cjs:16-60`), ligada em `app/electron/services/ipc-handlers.cjs:913-921` | O prazo das decisões do orquestrador usa essa varredura, sem timer novo (§10) |
| 3 | "ler `rateLimitTier` no `parseAgentAuth` para achar o 20x do Claude" | `claude auth status --json` só imprime `loggedIn`, `authMethod`, `apiProvider`, `analyticsDisabled`, `projectsDirectory`, `configDirectory`, `apiKeySource`, `forcedLoginMethod`, `email`, `orgId`, `orgName` e `subscriptionType`. O `rateLimitTier` (`default_claude_max_20x`) é interno. O `/status` imprime `Login method: Claude Max account` (lido em `app/electron/services/claude-usage-query.cjs:362`) | O multiplicador do Claude **não** vem da CLI. Vem da declaração da pessoa (§7.3) |
| 4 | "[a confirmar] onde o Claude grava `projects/` com `CLAUDE_CONFIG_DIR`" | No binário: `D(x.CLAUDE_CONFIG_DIR ?? D(home,".claude"),"projects")`. O `auth status --json` imprime inclusive `projectsDirectory` | A descoberta de sessão usa `CLAUDE_CONFIG_DIR/projects` (§9.6) |
| 5 | Codex tem "uma" mensagem de limite | Há também o limite **por modelo**: "You’ve hit your usage limit for ‹modelo›. Switch to another model now" | Esse limite vale só para o modelo, **sem** espera da conta e sem proposta de troca de conta (§5) |
| 6 | "reaproveitar `parseClaudeReset` para o reset" | O Codex imprime "Try again at %b %-d, %Y %-I:%M %p" (por exemplo, "Oct 2, 2026 8:04 PM"). A regex de `parseClaudeReset` (`claude-usage-query.cjs:688-694`) não aceita ano seguido de hora sem vírgula | O `reset-time.cjs` ganha esse formato, com teste (§6.5) |
| 7 | Lista de variáveis do Codex: `OPENAI_API_KEY` e `CODEX_API_KEY` | O binário também lê `CODEX_ACCESS_TOKEN` ("auth is provided by environment") | Entra no filtro (§9.5) |
| 8 | "amostra `current` com mais de 15 min fica stale" | `isOlderThan` devolve `false` quando o horário é inválido ou ausente (`agent-usage-service.cjs:1227-1233`). Uma amostra sem `measuredAt` passaria como atual | A cadeia usa regra própria e estrita de medição atual (§7.2) |
| 9 | Privacidade só na evidência nova | Hoje `recordModelAvailabilityEvent` já grava no log QA um `reason` com prévia de 240 caracteres do erro cru, sem redação (`ipc-handlers.cjs:969-982`; prévia em `orchestrator/model-availability.cjs:403-407`) | Commit de correção dedicado, com teste que falha antes (§14, commit 7) |
| 10 | "o observador só em sessões com `accountId`" | `validatePtyAccountSelection` resolve o `providerId` também sem conta (`app/electron/services/pty-account-validation.cjs:88-90`) | A vigia vale para todo terminal de agente, inclusive no Login do sistema, mas só com aviso (§5.5) |
| 11 | "Openia: 402 a confirmar" | O pacote não tem mensagem própria de falta de crédito. `openia/usage.py` consulta `/api/v1/credits` e `openia/cli.py:728` só tem texto de ajuda | Openia fica **sem** detecção no terminal. Falta de crédito só aparece pela medição de créditos (§6.4) |
| 12 | Sem registro | `claude auth status` sai com código 1 quando não há login (`process.exit(v?0:1)` no binário). O `runBufferedCommand` devolve `ok:false`, mas o JSON continua no stdout | A checagem nunca lê `ok:false` como "erro de checagem" antes de interpretar o stdout (§6.2) |
| 13 | "o PTY falso do smoke passa pelo main" | Ele só existe no renderer (`app/src/features/canvas/terminal/mock-terminal-session-store.ts:33-40`, ligado em `TerminalSessionProvider.tsx:11-17` e `app/electron/preload.cjs:76-87`) | O smoke usa um PTY roteirizado **no processo principal** (§13.6) |
| 14 | "índice UNIQUE em `position`" | Reordenar com UPDATEs sequenciais colide dentro da transação | Sem índice único. A lista é regravada inteira sob CAS (§3.2) |

### 0.3 Interpretações adotadas (sem reabrir decisão do dono)

- **D5 (conta escolhida à mão continua fixa).**
  - Todo bloco nasce `pinned`, inclusive os blocos antigos, sem o campo novo.
  - Só nasce `chain` o bloco aberto com "Automática (cadeia)" ou criado como continuação confirmada da cadeia.
  - Um bloco fixo que bate o limite recebe aviso e sua conta entra em espera. O bloco ganha um atalho para "Passar responsabilidade…" com o motivo já preenchido. Nunca recebe proposta automática.
  - A pessoa pode trocar o modo do bloco a qualquer momento (§12).
- **Login do sistema.** Não é membro nem destino da cadeia. A identidade dele muda por fora do app (troca oficial em `app/electron/services/official-cli-service.cjs:319-325`, ou login em qualquer terminal) e ele herda as chaves do ambiente (`app/electron/services/cli-process-manager.cjs:128-154`). Pode ser **origem**, mas só de aviso.
- **D6 contra a task irmã ("processo antigo pausa/termina antes").** Vale D6: o app nunca escreve no terminal antigo nem o encerra. A revalidação "origem parada" vira uma confirmação explícita a mais, não um bloqueio (§8.4).
- **D3 (multiplicador).** Nenhuma das CLIs instaladas imprime "NNx" nos campos de plano: Claude publica `subscriptionType: "max"`, Codex publica `plan_type` (`agent-usage-codex-local.cjs:51`). Na prática o multiplicador vem da declaração da pessoa. A leitura de "NNx" fica pronta para versões futuras, e **nunca** é aplicada a texto do terminal (o Claude imprime "Upgrade to Max 20x" para quem **não** tem esse plano).

---

## 1. Resumo e decisões do dono

### 1.1 Resumo

1. **Onde a detecção fica.** No processo principal, dentro do `onData` do PTY. O custo por pedaço é O(1): só marca uma flag. A leitura acontece depois, adiada, sobre a cauda do buffer de replay que já existe. Só os padrões do provedor da sessão são aplicados.
2. **Classificador único.** Uma taxonomia fechada no main separa limite, cobrança, login, rede, provedor, tempo, cancelado, desconhecido e ambíguo. O orquestrador e o renderer passam a consumir essa taxonomia. O classificador duplicado do renderer sai.
3. **Espera por conta, persistida.** Limite, login e cobrança põem a conta em espera no SQLite, com fonte do fim (medição, texto ou padrão). Rede, provedor, tempo e cancelado nunca põem.
4. **Cadeia desligada por padrão.** Quando ligada, é uma lista global ordenada e pode cruzar provedores. Tem quatro estratégias. A elegibilidade exige login conferido pela CLI há no máximo 15 min. A quota só pesa com medição atual.
5. **Toda troca é confirmada.** A proposta mostra origem, destino e motivo. O main gera um *ticket* de uso único depois da confirmação, e o bloco novo só nasce com esse ticket. Tudo fica num registro de trocas com motivo e horários.
6. **A sessão ativa nunca muda de conta.** O bloco novo recebe o contexto redigido. O terminal antigo fica intacto.
7. **O orquestrador do chat pede confirmação antes de trocar de provedor**, também no *last-resort* e no meio da tarefa. Sem resposta em 10 min, conta como recusa.
8. **Correções entregues juntas:**
   - a queda silenciosa para Login do sistema;
   - o reattach em outra conta;
   - a herança de chaves de API do ambiente;
   - a descoberta de sessão do Claude por conta;
   - o reenvio do texto de passagem pelo relançamento do Codex;
   - o log QA sem redação.

### 1.2 Decisões do dono (fechadas)

1. **Confirmação:** SEMPRE. Toda troca mostra conta de origem, conta de destino e motivo. Nenhuma troca acontece sozinha.
2. **Escopo:** QUALQUER provedor (Codex, Claude, Gemini, Openia/OpenRouter), inclusive trocar de provedor.
3. **Estratégias:** Ordem manual, Rodízio, Mais quota primeiro e Assinatura antes de uso. "Mais quota" usa capacidade absoluta = restante% × multiplicador do plano ("50% com 20x é maior que 100% com 1x").
4. **Padrão:** cadeia DESLIGADA ao instalar e ao atualizar. Ao ligar, começa em ordem manual.
5. **Bloco com conta escolhida à mão continua fixo nela.** A pessoa pode fixar a conta ou desligar a cadeia.
6. **Sessão ativa que bate o limite:** o app avisa, põe a conta em espera e, com confirmação, abre um bloco NOVO na próxima conta levando o contexto. O terminal antigo fica parado e intacto. Processo vivo nunca troca de conta.
7. **Orquestrador do chat:** passa a pedir confirmação antes de trocar de provedor.
8. **Entrega:** tudo agora.

**Derivadas do aceite:**
- a elegibilidade mínima é login confirmado pela própria CLI, naquela conta, há pouco tempo;
- a quota só pesa com medição atual, porque valor antigo nunca prova nada (contrato de 24/09);
- o Gemini fica fora até ter checagem de login.

### 1.3 Princípios fail-closed (os testes provam cada um)

- **P1 — Trava no serviço.** Só o main cria proposta e ticket. Só `confirm` transforma a proposta em ticket, e um ticket vale uma vez e só para a conta confirmada. Precedentes: `confirmed === true` (`official-cli-service.cjs:319-325`) e chave de idempotência gerada no main (`app/electron/services/codex-account-rate-limits.cjs:85-102`).
- **P2 — Processo vivo não troca de conta.** O env é montado só no spawn (`app/electron/services/pty-process-manager.cjs:153-156`). O reattach, que hoje não compara a conta (`:137-143`), passa a recusar conta diferente.
- **P3 — Elegibilidade conservadora.** Sem login recente conferido pela CLI, a conta fica fora. Sem medição atual, a quota não é comparada. Ausência nunca vira 0 nem 100.
- **P4 — Classe errada nunca troca.** Rede, provedor, tempo e cancelado não põem conta em espera nem geram proposta. Ambíguo pede escolha.
- **P5 — Nada é reenviado sem prova.** O bloco novo recebe o contexto uma única vez, e o último pedido não é reexecutado. Reload e relançamento do Codex não reenviam a passagem.
- **P6 — Estado de decisão só no SQLite, com compare-and-set.** Um reinício invalida o que estava pendente e nunca o executa.
- **P7 — Segredo não sai.** Evidência, motivo e transcript de continuação passam por `redactSecrets` (`app/electron/services/official-cli-account-status.cjs:58-69`). A identidade circula só como fingerprint (`identityKey`).
- **P8 — Caminho quente barato.** O `onData` só marca uma flag. A varredura é adiada, limitada em bytes e medida, com teto definido **antes** da medição (§15.1).
- **P9 — Sem laço.** Há uma proposta aberta por sessão, deduplicação por evidência, teto de saltos por linhagem e nenhum retry automático de spawn.

---

## 2. Arquitetura em camadas

### 2.1 Estado atual que o plano altera (verificado)

| Peça | Onde | Hoje |
|---|---|---|
| Registro de contas | `app/electron/services/cli-account-store.cjs:43-59` (ler e gravar), `:82-111` (validar), `:118` (criar), `:169` (remover), `:328` (`buildEnv`) | Grava `{id, providerId, label, createdAt}` em JSON. A escrita não é atômica, e JSON inválido vira `[]` (`:43-50`) |
| Isolamento | `app/electron/services/cli-account-profiles.cjs:33-40` | `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `HOME` (gemini) e `OPENROUTER_API_KEY` |
| Env herdado | `app/electron/services/cli-process-manager.cjs:128-154` | Clona o `process.env` inteiro |
| Spawn do PTY | `pty-process-manager.cjs:126-135` (validação), `:137-143` (reattach), `:153-156` (env), `:268-294` (entrada), `:298`, `:301-337` (`onData`), `:339-452` (`onExit`), `:506-524` (lista), `:527-560` (attach e replay), `:677-693` (cleanup), `:706-725` (descoberta) | A entrada não guarda a conta. O `onData` não detecta nada |
| Provedor do comando | `app/electron/services/pty-account-validation.cjs:16-39`, `:51-110` | Resolve o `providerId` com ou sem conta |
| Buffer de replay | `app/electron/services/pty-replay-buffer.cjs:17-61` | `append` O(1), `toString` junta e compacta. Não existe `tail(n)` |
| IPC do PTY | `app/electron/services/pty-ipc-handlers.cjs:1-10` (cabeçalho "never parse output"), `:35-80` (`pty:spawn`), `:120` (`killAll`) | — |
| Classificador | `app/electron/services/orchestrator/model-availability.cjs:175-210`, `:255-288`, `:295` (fuso fixo), `:353-401` (reset) | Só `no_login` (sem prazo) e `limit_reached`. Um `\b429\b` solto vira limite |
| Detector por conta | `app/electron/services/account-limit-detector.cjs:26-48` | Não tem chamador em produção |
| Classificador duplicado | `app/src/features/chat/services/stream-status.ts:48-79`, usado em `app/src/features/chat/components/ChatWorkspace.tsx:1035-1057` | Precedência invertida (limite antes de login) |
| Login por conta | `app/electron/services/agent-usage-sources.cjs:17, 47, 71 (Gemini auth:null), 85`; execução em `agent-usage-service.cjs:527-551`; parse em `app/electron/services/agent-usage-report.cjs:43-102` | Só alimenta o painel |
| Staleness | `agent-usage-service.cjs:31`, `:1211-1233` | 15 min, leniente com horário ausente |
| Orquestrador | `app/electron/services/orchestrator/spawn-model-selector.cjs:114-154` (provider-fallback), `:156-196` (last-resort); `app/electron/services/orchestration/orchestration-runner.cjs:73-178`, `:335-393`, `:395-540` | Troca de provedor sem consentimento |
| Queda silenciosa | `app/src/features/canvas/hooks/useAgentConfig.ts:397-401`, `:663-678`; `app/src/features/canvas/services/agent-account-selection.ts:23-33` | Falha de IPC ou conta sumida vira `''`, e isso é persistido |
| Passar responsabilidade | `app/src/features/canvas/components/CanvasView.tsx:2269-2328`; `app/src/features/canvas/components/HandoffDialog.tsx:28-116`; `app/src/features/canvas/services/terminal-handoff.ts:38-69` | Bloco novo com transcript. Não registra motivo nem horário |
| Relançamento do Codex | `app/src/features/canvas/terminal/terminal-session-store.ts:1760-1787` (`initialText` em `:1785`), com `CanvasView.tsx:1713-1719` | Sem `agentSession`, reenvia o texto de passagem |
| Descoberta de sessão | `app/electron/services/agent-session-discovery.cjs:12-21`, `:50-54`, `:71-86` | É chamada sem o env da conta. O Claude ignora `CLAUDE_CONFIG_DIR` |
| Retomada | `app/src/features/canvas/services/agent-session.ts:3-9`, `:30`, `:80` | A referência não tem conta |
| Troca oficial do Codex | `official-cli-service.cjs:234-263` | Inclui perfis isolados entre os afetados |
| Precedente de CAS | `app/electron/services/storage/onboarding-state-repository.cjs:1-21`; `onboarding-state-multiprocess.test.cjs` | — |
| Migrações | `app/electron/services/storage/migrations/` (última é `016_webview_profiles.sql`) | — |
| Bancada | `app/scripts/pty-output-path-benchmark.cjs:1-24`, `:172-205`, `:258-266`; CI em `ci.yml:694-698` | Mede só o laço síncrono |
| Ponte DevTools | `app/electron/main.cjs:166`, `:171-174` (`ipcProbe`), `:529-545` (`main-eval`), `:564-573` (`new PtyProcessManager`) | — |

### 2.2 Módulos novos

```
app/electron/services/accounts/                (pasta nova, no molde de services/orchestrator/)
  account-chain-constants.cjs    números num lugar só (TTL, janelas, tetos)
  failure-taxonomy.cjs           PURO   texto/sinal → {failureClass, scope, ambiguous, evidence, resetAt?}
  cli-failure-patterns.cjs       DADOS  padrões por provedor + exclusões, gerados das fixtures
  reset-time.cjs                 PURO   leitor único de horário de reset (fuso impresso, formatos Claude/Codex)
  account-chain-policy.cjs       PURO   elegibilidade, 4 estratégias, capacidade, fim da espera, cobrança
  account-output-watcher.cjs     QUENTE vigia por sessão (flag O(1); varredura adiada sobre tail(n))
  account-eligibility.cjs        EFEITO checagem de login por conta (TTL, dedupe, teto de concorrência)
  account-chain-service.cjs      EFEITO detecção → espera → proposta → ticket → registro
app/electron/services/storage/
  migrations/017_account_chain.sql
  account-chain-repository.cjs   CAS por revisão; índice parcial único
app/electron/services/account-chain-ipc-handlers.cjs   IPC fino
app/electron/services/devtools-fake-cli-pty.cjs        só na instância DevTools com flag própria (smoke)
app/electron/__fixtures__/cli-failure-vocabulary.json  vocabulário versionado das CLIs
app/scripts/extract-cli-failure-vocabulary.cjs         regenera as fixtures lendo os pacotes instalados
app/scripts/canvas-smoke-contas.cjs                    smoke da sessão C
app/src/features/shared/types/account-chain.ts          contrato tipado do IPC
app/src/features/canvas/services/account-chain-view.ts  formatadores puros (motivo, horário, capacidade)
app/src/features/canvas/services/account-switch-dialog.ts  modelo de visão puro do diálogo
app/src/features/canvas/hooks/useAccountChain.ts        assina o push e expõe o estado
app/src/features/canvas/hooks/useAccountContinuation.ts cria o bloco de continuação (sai do CanvasView)
app/src/features/canvas/components/AccountSwitchDialog.tsx
app/src/features/canvas/components/tools/AccountChainSection.tsx
app/src/features/canvas/components/tools/AccountSwitchHistory.tsx
app/src/features/chat/components/ProviderSwitchRequest.tsx
docs/projeto/POLITICA-CONTAS.md
```

Não entra dependência nova: `node:sqlite`, `node:crypto` e `node:test` já estão em uso. O `account-limit-detector.cjs` continua como fachada: mantém a API e delega à taxonomia.

### 2.3 Arquivos alterados e pontos de encaixe

| Arquivo | Onde encaixa | O que muda |
|---|---|---|
| `pty-process-manager.cjs` | construtor `:78` | Novas dependências `createOutputWatcher` (padrão `null`) e `onOutputFailure` |
| idem | entrada `:268-294` | Novos campos `accountId`, `providerId`, `accountMode`, `lineageId`, `watcher`, `lastOutputAt` |
| idem | depois de `:298` | Cria a vigia quando `accountValidation.providerId` tem padrões e `options.command` existe |
| idem | `onData` `:301-337` | `entry.watcher?.push()` **depois** de `entry.onData?.(data)` (`:333`), com try/catch próprio |
| idem | `onExit` `:443-451` | `entry.watcher?.flush()` síncrono e depois `dispose()` |
| idem | `cleanup` `:677-693` | `entry.watcher?.dispose()` |
| idem | reattach `:137-143` | Recusa quando `existing.accountId !== (options.accountId ?? null)` |
| idem | `listarSessoesVivas` `:506-524` | Expõe `accountId`, `providerId` e `accountMode` |
| idem | descoberta `:715-720` | Passa `env` com o perfil da conta |
| `pty-replay-buffer.cjs` | `:54-61` | Novo `tail(n)`, que não compacta nem muda o estado |
| `pty-ipc-handlers.cjs` | `:35-80` | Aceita `accountMode` (enum) e `chainTicket` (uuid). O cabeçalho `:1-10` ganha nota datada sobre a exceção medida |
| `main.cjs` | `:564-573` | Injeta a vigia e o serviço da cadeia. Com a flag DevTools, injeta `spawnPty` roteirizado (§13.6) |
| `main.cjs` | `:529-545` | Nenhuma sonda nova: o smoke usa a interface e `ipcProbe.snapshot()` |
| `cli-account-profiles.cjs` | `:33-40` | Mapa `CREDENCIAIS_HERDADAS` por provedor (§9.5) |
| `cli-account-store.cjs` | `:43-59`, `:169`, `:328` | Escrita atômica, leitura que distingue ausente de corrompido, remoção que limpa a cadeia, `buildEnv` com filtro |
| `model-availability.cjs` | `:175-210` | `detectAvailabilityIssue` vira adaptador da taxonomia (§5.6). `RESET_TIME_ZONE` fixo (`:295`) dá lugar a `reset-time.cjs` |
| `ipc-handlers.cjs` | `:969-982` | `reason` redigido antes do log QA |
| idem | `:1046-1052` | `sendCliEvent` anexa `failure` aos eventos `error` |
| idem | `:138-183` | O runner recebe `recordSwitchDecision` |
| idem | perto de `:780` | Canais `cli:provider-switch:list` e `cli:provider-switch:respond` |
| `orchestration-runner.cjs` | `:73-178`, `:335-393`, `:395-540`, `:637-659` | Decisões pendentes de troca de provedor (§10) |
| `spawn-model-selector.cjs` | novo, puro | `getProviderFamily(cliType)` e `requiresProviderSwitchConfirmation(from, to)` |
| `agent-session-discovery.cjs` | `:71-86` | Claude usa `env.CLAUDE_CONFIG_DIR ?? homeDir/.claude` |
| `official-cli-service.cjs` | `:234-263` | Exclui sessões com `accountId` |
| idem | `:395-470` | O resultado ganha `errorCode` e `timedOut` |
| `agent-usage-service.cjs` | `:527-551` | Extrai `checkAccountAuth` (comando de auth + probe local, sem a consulta ao vivo) |
| `agent-usage-report.cjs` | `:43-102` | Claude passa a guardar também `apiKeySource` como fato de cobrança, **sem** a chave (§7.4) |
| renderer | ver §12 e §14 | — |

### 2.4 Fluxo de uma detecção no terminal

```
ptyProcess.onData ─► entry.outputBuffer.append(data)                 (como hoje)
                  ├► entry.onData?.(data)  → renderer                (como hoje; vai primeiro)
                  └► entry.watcher?.push()                            (flag + lastChunkAt; 1 setTimeout/sessão, unref)
watcher.scan() (debounce 400 ms, espera máx. 2 s)
   └─ tail = outputBuffer.tail(4096) → normaliza (controle→espaço) → pré-filtro indexOf do provedor
        └─ failure-taxonomy(últimas 40 linhas, origem 'pty', provedor) → dedupe por hash da evidência
             └─ onOutputFailure({sessionId, accountId|null, providerId, accountMode, lineageId, failure})
accountChainService.onDetection
   ├─ limit/auth/billing com accountId → UPSERT da espera (SQLite)
   ├─ ledger: 'noticed' (fixo, sistema ou cadeia desligada) | 'proposed' | 'no_candidate'
   ├─ bloco 'chain' e cadeia ligada → política + elegibilidade (preguiçosa) → proposta (CAS)
   └─ push account-chain:detection / account-chain:proposal → faixa no bloco + item fixo nas notificações
pessoa → "Ver opções" → AccountSwitchDialog → accountChain.confirm (IPC)
   └─ main revalida → CAS proposed→confirmed → ticket
renderer (useAccountContinuation) → redige o transcript (IPC) → cria o bloco (reusa passResponsibility)
   └─ pty:spawn {accountId: destino, accountMode:'chain', chainTicket}
        └─ main: CAS confirmed→spawning→spawned, target_session_id gravado
```

### 2.5 IPC e preload (fino)

Os handlers ficam em `app/electron/services/account-chain-ipc-handlers.cjs`. Eles validam só o formato (string, enum, uuid, faixa), chamam o serviço e devolvem `{ok, …}`. Não há regra de negócio no IPC.

| Canal | Entrada | Saída |
|---|---|---|
| `account-chain:get-state` | — | `{settings, revision, members[], pendingProposals[], cooldowns[], envCredentialNames[]}`. Cada membro traz rótulo, provedor, `eligible`, motivo, login, espera, capacidade, cobrança e multiplicador com fonte. Nada de caminho, env ou segredo |
| `account-chain:update-settings` | `{enabled?, strategy?, maxHops?, expectedRevision}` | `{ok}` ou `{ok:false, code:'REVISION_CONFLICT', current}` |
| `account-chain:update-members` | `{members:[{accountId, enabled, billingDeclared, multiplierDeclared}] (em ordem), expectedRevision}` | CAS; a lista é regravada inteira |
| `account-chain:check-login` | `{accountIds[] (≤5)}` | resultado redigido por conta |
| `account-chain:preview-launch` | `{providerId}` | proposta `launch` ou `{ok:false, reasons[]}` |
| `account-chain:confirm` | `{proposalId, destinationAccountId, acknowledgeSourceActive?:boolean}` | `{ok, ticket, destination, alreadyConfirmed?}` ou `{ok:false, code:'SUPERSEDED'\|'EXPIRED'\|'SOURCE_ACTIVE'\|'NOT_ELIGIBLE'\|'NOT_PENDING'}` |
| `account-chain:decline` | `{proposalId, reason:'later'\|'not-a-limit'}` | `{ok}` |
| `account-chain:resolve-ambiguous` | `{detectionId, treatAs:'limit'\|'ignore'}` | `{ok}` |
| `account-chain:set-session-mode` | `{sessionId, mode:'pinned'\|'chain'}` | `{ok}`; fixar expira as propostas abertas |
| `account-chain:release-cooldown` | `{accountId, reason:'not-a-limit'\|'recharged'\|'manual'}` | `{ok}`; auth e billing exigem nova checagem |
| `account-chain:redact-transcript` | `{text}` (≤ 32 MB, mesmo teto de `context-files-ipc-handlers.cjs:21`) | `{ok, text, chars}` |
| `account-chain:record-manual` | `{sourceSessionId, toAccountId\|null, toProviderId, reasonClass}` | `{ok, eventId}`; registra "Passar responsabilidade" feita por causa de uma detecção |
| `account-chain:history` | `{limit ≤ 50, before?}` | lista do registro de trocas |
| push `account-chain:changed`, `:proposal`, `:detection` | payload redigido | — |
| `pty:spawn` (existente) | mais `accountMode`, `chainTicket` | valida o ticket (§4.1) |
| `cli:provider-switch:list` e `:respond` | §10 | — |

O preload ganha o namespace `accountChain`, ao lado de `cliAccounts` (`app/electron/preload.cjs:325`). Em `cli` (`:89`) entram `listProviderSwitches` e `respondProviderSwitch`. Os tipos vão para `app/src/vite-env.d.ts` (perto de `:921`) e `app/src/features/shared/types/account-chain.ts`.

---

## 3. Modelo de dados e migração

### 3.1 Por que SQLite e não `cli-accounts.json`

O JSON não tem escrita atômica nem lock (`cli-account-store.cjs:52-59`), e uma leitura corrompida vira lista vazia (`:43-50`). O SQLite já tem o que a cadeia precisa:
- `busy_timeout`;
- transação curta `BEGIN IMMEDIATE`;
- precedente de CAS entre processos (`onboarding-state-repository.cjs:1-21`).

O `cli-accounts.json` **não muda de formato**. Os ids de conta são os mesmos do perfil, reaproveitados como `agent_usage_accounts` já faz.

### 3.2 Migração `app/electron/services/storage/migrations/017_account_chain.sql` (só acrescenta)

```sql
-- Ausência da linha = cadeia DESLIGADA (padrão ao instalar e ao atualizar).
CREATE TABLE account_chain_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  strategy TEXT NOT NULL DEFAULT 'manual'
    CHECK (strategy IN ('manual', 'round_robin', 'most_capacity', 'subscription_first')),
  max_hops_per_lineage INTEGER NOT NULL DEFAULT 3 CHECK (max_hops_per_lineage BETWEEN 1 AND 10),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- Lista global ordenada (decisão 2: pode cruzar provedores). Sem índice único em position:
-- a lista é regravada inteira numa transação guardada pela revisão de settings.
CREATE TABLE account_chain_members (
  account_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('codex', 'claude', 'gemini', 'openia')),
  position INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  billing_declared TEXT CHECK (billing_declared IN ('assinatura', 'uso')),
  multiplier_declared REAL CHECK (multiplier_declared IS NULL OR (multiplier_declared >= 1 AND multiplier_declared <= 100)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_account_chain_members_position ON account_chain_members(position);

-- Espera atual por conta. Liberação fica registrada na própria linha.
CREATE TABLE account_cooldowns (
  account_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  failure_class TEXT NOT NULL CHECK (failure_class IN ('limit', 'auth', 'billing')),
  detected_at TEXT NOT NULL,
  until_at TEXT,                          -- NULL = até checagem/ação (auth, billing)
  until_source TEXT NOT NULL CHECK (until_source IN ('medicao', 'texto', 'texto_fuso_local', 'padrao', 'checagem')),
  evidence TEXT CHECK (evidence IS NULL OR length(evidence) <= 200),   -- já redigida
  evidence_hash TEXT,
  session_id TEXT,
  released_at TEXT,
  released_by TEXT CHECK (released_by IN ('vencimento', 'checagem', 'nao_era_limite', 'recarregou', 'manual')),
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE account_login_checks (
  account_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('logged_in', 'logged_out', 'unknown', 'cli_ausente', 'tempo_esgotado', 'erro', 'sem_checagem')),
  checked_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('checagem', 'amostra_do_painel')),
  duration_ms INTEGER,
  method TEXT, plan TEXT,                 -- texto que a CLI imprimiu, redigido
  billing_detected TEXT CHECK (billing_detected IN ('assinatura', 'uso')),
  api_key_source_present INTEGER NOT NULL DEFAULT 0 CHECK (api_key_source_present IN (0, 1)),
  multiplier_detected REAL,
  identity_key TEXT,                      -- fingerprint, nunca e-mail ou token
  identity_status TEXT CHECK (identity_status IN ('matched', 'unbound', 'different', 'duplicate', 'missing'))
);

-- Registro de trocas: nunca guarda transcript, env, caminho de perfil ou segredo.
CREATE TABLE account_switch_events (
  id TEXT PRIMARY KEY,                    -- uuid do main = chave de idempotência = ticket
  kind TEXT NOT NULL CHECK (kind IN ('continuation', 'launch', 'manual', 'notice', 'provider_switch')),
  state TEXT NOT NULL CHECK (state IN ('noticed', 'proposed', 'confirmed', 'spawning', 'spawned',
    'declined', 'dismissed', 'expired', 'superseded', 'spawn_failed', 'no_candidate', 'accepted', 'refused')),
  source_session_id TEXT, source_node_id TEXT,
  lineage_id TEXT, hop INTEGER NOT NULL DEFAULT 0,
  incident_key TEXT,                      -- account_id + detected_at da espera: agrupa sessões da mesma conta
  from_account_id TEXT, from_provider_id TEXT NOT NULL, from_label TEXT,
  to_account_id TEXT, to_provider_id TEXT, to_label TEXT,  -- rótulos como fotografia do momento
  failure_class TEXT,
  reason TEXT NOT NULL CHECK (length(reason) <= 400),        -- redigido
  evidence_hash TEXT,
  strategy TEXT,
  chosen_by TEXT CHECK (chosen_by IN ('chain', 'person')),
  candidates_json TEXT NOT NULL DEFAULT '[]',                -- ids + motivo de exclusão; sem segredo
  source_active_ack INTEGER NOT NULL DEFAULT 0,
  source_auto_resume_at TEXT,             -- Claude "continuing automatically at …"
  transcript_chars INTEGER,
  post_switch_failure TEXT,               -- classe de falha vista no bloco novo logo após nascer
  detected_at TEXT, proposed_at TEXT NOT NULL, decided_at TEXT, spawned_at TEXT,
  expires_at TEXT NOT NULL,
  target_session_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_switch_state_expires ON account_switch_events(state, expires_at);
CREATE INDEX idx_switch_lineage ON account_switch_events(lineage_id, proposed_at);
CREATE INDEX idx_switch_proposed ON account_switch_events(proposed_at DESC);
-- I1 no próprio banco: no máximo UMA proposta aberta por sessão de origem.
CREATE UNIQUE INDEX idx_switch_one_open_per_session
  ON account_switch_events(source_session_id)
  WHERE state IN ('proposed', 'confirmed', 'spawning') AND source_session_id IS NOT NULL;
```

**Por que há estados de mais de um tipo em `account_switch_events`:**
- `provider_switch` usa `accepted` e `refused`. É o registro das decisões do orquestrador (§10).
- `notice` usa `noticed`. É o registro de detecção em bloco fixo, no Login do sistema ou com a cadeia desligada.

Assim, "a troca tem motivo e timestamp" vale para todas as origens.

**Retenção:** no início do app, ficam as 1000 linhas mais recentes. A poda nunca apaga linha em estado aberto. Isso fica documentado na política.

### 3.3 Repositório `account-chain-repository.cjs`

- **Transições.** Toda transição é `UPDATE … SET state=?, revision=revision+1, … WHERE id=? AND state=? AND revision=?`. Ela só conta como aplicada com `changes === 1`, no padrão de `onboarding-state-repository.cjs`.
- **Transações mínimas.** Um SELECT mais um UPDATE ou INSERT, sem I/O e sem lógica dentro. Sob contenção, o `BEGIN IMMEDIATE` espera até o `busy_timeout` na thread do main.
- **Membros.** `replaceMembers(list, expectedRevision)`, em transação única: confere a revisão de settings, faz `DELETE` e `INSERT`s na ordem (`position` = índice) e incrementa a revisão.
- **Leitura corrompida.** Um `candidates_json` inválido vira item `corrupted: true` e não derruba a lista.
- **Espera.** `upsertCooldown`: se a nova linha tem `until_at` mais tarde, ela vence. Nunca encurta uma espera ativa.
- **Recuperação no início** (`recoverOnStartup(now)`):
  - `proposed` e `confirmed` viram `expired`;
  - `spawning` vira `spawn_failed`, porque o PTY morre com o app (`pty-ipc-handlers.cjs:120`);
  - esperas vencidas recebem `released_by='vencimento'`;
  - linhas de conta que não existe mais saem de `members`, `cooldowns` e `login_checks`. O ledger fica.

### 3.4 Dados do renderer

- **`TerminalNodeData`** (`app/src/features/canvas/types.ts:98-151`):
  - `accountMode?: 'pinned' | 'chain'`, persistido. **Ausente vale `pinned`.**
  - `chainTicket?: string`, **transitório**. Entra em `TRANSIENT_DATA_KEYS` (`app/src/features/canvas/hooks/useCanvasPersistence.ts:194-198`).
  - `chainOrigin?: { switchEventId, fromNodeId, reasonClass, decidedAt }`, persistido e sem segredo.
  - `chainSuccessorNodeId?: string`, no bloco antigo, para mostrar "continuado em…".
- **`AgentSessionReference`** (`app/src/features/canvas/services/agent-session.ts:3-9`): ganha `accountId?: string`.
- **`NewTerminalOptions`** (`app/src/features/canvas/services/new-terminal-options.ts`): ganha `accountMode`, `chainTicket` e `chainOrigin`.
- **Preferência de lançamento** (`agent-launch-preferences.ts:34`): aceita o valor especial `'@cadeia'` em `accountId`, lido só quando a cadeia está ligada. Não há migração para preferência por provedor (fora do escopo, §16).

### 3.5 Migração e compatibilidade (nenhuma conta é apagada)

- A 017 só cria tabelas. Uma versão antiga do app ignora essas tabelas, então o downgrade é seguro.
- **Ligar pela primeira vez** cria a linha de settings com estratégia `manual`. Os membros nascem com todas as contas de provedor com checagem (codex, claude, openia), na ordem do `cli-accounts.json`, **todas desabilitadas**. As contas Gemini entram na lista, desabilitadas e travadas.
  - O painel mostra "Ligada · 0 contas habilitadas: habilite as que podem receber trocas".
  - Uma conta criada depois entra no fim da lista, desabilitada.
  - Nenhuma conta entra em uso sem ação da pessoa. Na atualização do app, nada muda.
- **`cli-accounts.json`:**
  - a escrita passa a ser atômica (arquivo temporário + `renameSync`);
  - a leitura distingue ENOENT (lista vazia) de corrompido (erro tipado);
  - com o arquivo corrompido, `validateAccount` falha com mensagem e `create`/`remove` se recusam a sobrescrever.
- **Remover conta** (`cli-accounts:remove`, `app/electron/services/cli-account-ipc-handlers.cjs:44`):
  - com terminal vivo na conta (via `listarSessoesVivas` com `accountId`), devolve `{ok:false, requiresConfirmation:true, sessions:[rótulos]}`;
  - só remove com `confirmed === true`. A trava fica no serviço;
  - ao remover, apaga membro, espera e checagem. O ledger continua com o rótulo guardado.

---

## 4. Máquina de estados

### 4.1 Proposta e ticket (`account_switch_events`, kinds `continuation`, `launch` e `manual`)

```
detecção (limit/auth/billing, ou ambíguo tratado como limite) em bloco 'chain' com cadeia ligada
  │
  ├─ hop ≥ max_hops_per_lineage ou nenhum candidato apto ─────────► no_candidate (fim; aviso com motivos)
  ▼
proposed ──(confirm; CAS; revalidações OK)──► confirmed ──(pty:spawn com ticket; CAS)──► spawning ──ok──► spawned (fim)
  │                                              │                                         └─falha─► spawn_failed (fim; sem retry)
  ├─(Agora não)───────────────► declined   (fim; a mesma evidência fica silenciada)
  ├─(Não era limite)──────────► dismissed  (fim; libera a espera da origem)
  ├─(destino mudou ao confirmar)► superseded (fim; nasce nova proposta, sem trocar sozinho)
  └─(30 min | sessão de origem saiu | cadeia desligada | bloco fixado | espera da origem liberada) ► expired
confirmed ──(ticket não usado em 2 min | reinício)──► expired
spawning  ──(reinício do app)──► spawn_failed
bloco 'pinned', Login do sistema ou cadeia desligada: detecção ──► noticed (registro + aviso)
```

**Revalidações no `confirm`** (todas no main e todas obrigatórias):
1. O estado é `proposed` e `expires_at > now`. Se já está `confirmed` para o mesmo destino, devolve o mesmo ticket com `alreadyConfirmed: true` (idempotente).
2. `destinationAccountId` está entre os candidatos aptos da proposta. Se o destino recomendado mudou e a pessoa não escolheu outro apto, a proposta vira `superseded` e nasce outra.
3. O destino continua apto (§6.1). Se a checagem de login passou do TTL, o main checa de novo e a UI mostra o progresso.
4. O destino não está em espera nem tem medição atual em 0%.
5. A cadeia está ligada e o bloco de origem continua `chain`. Para `launch`, basta a cadeia estar ligada.
6. `hop < max_hops_per_lineage`, e o destino não é a origem nem uma conta já visitada na linhagem.
7. **Origem parada:** saída da origem há ≥ 5 s (`lastOutputAt`). Se não, devolve `SOURCE_ACTIVE`, e a UI oferece uma segunda confirmação explícita ("O terminal antigo ainda está produzindo saída. Abrir mesmo assim?"). Com `acknowledgeSourceActive: true`, a transição passa e grava `source_active_ack = 1`. Nunca há bloqueio sem saída (é o caso do redesenho contínuo da TUI).

**Ticket no `pty:spawn`:**
- sem `chainTicket`, é um spawn comum (conta explícita, como hoje, inclusive em restart e reload);
- com `chainTicket`, a regra é:
  - ticket inexistente, `expired` ou de outro kind é **recusado**;
  - `accountId` diferente de `to_account_id` é **recusado**;
  - estado `confirmed` faz CAS para `spawning`, grava `target_session_id` e, quando o PTY nasce, faz `spawned` com `spawned_at`;
  - ticket já `spawned` **para a mesma sessão** vira spawn comum, idempotente (cobre reload e restart);
  - ticket já `spawned` para **outra** sessão é recusado.

**Verificação depois da troca:** nos primeiros 3 min do bloco novo, uma detecção `auth` ou `billing` nele grava `post_switch_failure` no evento que o criou e põe o destino em espera. O aviso diz "A conta de destino falhou logo após a troca".

### 4.2 Espera por conta (`account_cooldowns`)

| Classe | Entra | Sai |
|---|---|---|
| `limit` | detecção com `accountId` | `until_at` vencido (a conta vai para "precisa conferir": só volta a ser apta com nova checagem de login), ou "Não era limite", ou medição atual com todas as janelas % > 0 depois do `until_at` |
| `auth` | idem, `until_at = NULL` | checagem `logged_in` posterior a `detected_at` |
| `billing` | idem, `until_at = NULL` | "Já recarreguei" + checagem OK. No Openia, também uma amostra atual de créditos > 0 |

Várias sessões da mesma conta na mesma detecção fazem um único UPSERT, e vale o `until_at` mais tarde. Reiniciar o app **não** tira a conta da espera. Uma espera vencida nunca volta a "apta" sozinha: exige checagem de login recente (§6.1).

### 4.3 Por sessão (vigia)

A vigia passa por `observando → detectou → (proposta aberta | aviso) → observando`. Para não repetir:
- cada `evidence_hash` visto na sessão é guardado (até 32 por sessão, LRU) e a mesma evidência nunca gera segunda detecção;
- uma sessão que já foi origem de `spawned` fica "sucedida": não recebe nova proposta, mas continua avisando.

### 4.4 Invariantes (cada uma com teste)

- **I1** Há no máximo uma proposta aberta por sessão (índice parcial único + teste multiprocesso).
- **I2** Um ticket gera no máximo um processo.
- **I3** O `accountId` do processo nascido com ticket é igual ao `to_account_id`.
- **I4** Nenhuma proposta `proposed`, `confirmed` ou `spawning` sobrevive a um reinício, e nenhuma é executada depois dele.
- **I5** Há no máximo `max_hops_per_lineage` saltos por linhagem. A origem e as contas visitadas em espera nunca são destino.
- **I6** Recusar silencia a mesma evidência. Só evidência nova gera proposta nova.
- **I7** Rede, provedor, tempo e cancelado nunca gravam espera nem proposta.
- **I8** Nenhum spawn nasce da cadeia sem `confirm` (a contagem de `pty:spawn` na sonda prova isso no smoke).
- **I9** Nenhum segredo sentinela aparece em banco, push, log QA ou retorno de IPC.

---

## 5. Taxonomia de falhas e precedência

### 5.1 Classes

`limit | billing | auth | network | provider | timeout | cancelled | unknown`, mais o marcador `ambiguous` e o `scope` (`account` ou `model`). O resultado é `{failureClass, scope, ambiguous, evidence (≤200, redigida), evidenceHash, resetText?, autoResumeText?}`.

**Precedência:** `cancelled > auth > billing > limit > provider > network > timeout > unknown`. Auth vem antes de limite, como o main já faz (`model-availability.cjs:184-194`).

### 5.2 Fontes

1. **Sinal estruturado.** Cancelamento vem do `stopped: true` que `cli:stop` já separa (`ipc-handlers.cjs:780-820`). O timeout do app é o texto de `createNoVisibleOutputMessage` (`app/electron/services/cli-event-utils.cjs:237-241`).
2. **Padrões por provedor** (`cli-failure-patterns.cjs`), gerados das fixtures. São **os únicos usados no terminal** (origem `pty`).
3. **Padrões genéricos**, só na origem `fluxo`, isto é, mensagens de erro de execução one-shot do orquestrador e do chat. Nunca no terminal, onde o agente pode imprimir "401 Unauthorized" ou "rate limit" como parte do trabalho.

### 5.3 Vocabulário conferido nos pacotes instalados (semente das fixtures do commit 2)

| Provedor | Classe | Frases e códigos (literais) |
|---|---|---|
| Claude 2.1.283 | limit (account) | "Usage limit reached · continuing automatically at ‹hora› · esc to cancel"; "Usage limit reached · continuing automatically when it resets · esc to cancel"; "Usage limit reached · continuing shortly · esc to cancel"; "Usage limit reached again…"; `rate_limit_error` (só na origem `fluxo`) |
| Claude | limit, reset | "Your usage limit has reset · press enter to continue" → **não** é limite; é o sinal de que o terminal antigo pode retomar (§8.4) |
| Claude | billing | "You're out of extra usage"; "Credit balance is too low"; "Your seat type doesn't include usage credits"; "Your group's usage limit is set to $0"; `billing_error` (fluxo) |
| Claude | auth | "Not logged in · Please run /login"; "Authentication required · Sign in again to continue"; "Invalid API key · Fix external API key"; `authentication_error` (fluxo) |
| Claude | provider | `overloaded_error` / 529 (fluxo) |
| Claude | **exclusões (nunca limite de conta)** | "Usage limit reached · wrapping up" (janela de tolerância: o agente ainda trabalha); "Usage limit reached · brief included wrap-up, then usage credits"; "Fast limit reached"; "Context limit reached"; "Budget limit reached"; "Subagent nesting limit"; "Concurrent subagent limit"; "Approaching your 5-hour usage limit"; "Upgrade to Max 20x…" |
| Codex 0.156.1 | limit (account) | "You’ve hit your usage limit." com as continuações "Upgrade to Plus…", "Visit https://chatgpt.com/codex/settings/usage to purchase more credits", "To get more access now, send a request to your admin", "… or try again at ‹data/hora›."; "Usage limit reached. You've reached your usage limit. Increase your limits to continue using codex."; códigos `usage_limit_reached`, `usage_limit_exceeded`, `workspace_owner_usage_limit_reached`, `workspace_member_usage_limit_reached`. O apóstrofo pode ser U+2019 ou `'` |
| Codex | limit (**model**) | "You’ve hit your usage limit for ‹modelo›. Switch to another model now" |
| Codex | billing | "You're out of credits. Your workspace is out of credits."; `workspace_member_credits_depleted` |
| Codex | auth | "Not logged in"; `unauthorized`, `RefreshTokenFailed` |
| Codex | provider | `server_overloaded`, `internal_server_error` |
| Codex | network | `http_connection_failed` / `HttpConnectionFailed`, `response_stream_connection_failed`, "stream disconnected before completion", "Reconnecting..." |
| Codex | **exclusões** | "Goal budget reached"; "Conversation interrupted"; `context_window_exceeded`; `session_budget_exceeded` |
| Gemini 0.57.0 | provider | `MODEL_CAPACITY_EXHAUSTED`, "exhausted your capacity" |
| Gemini | limit | `RESOURCE_EXHAUSTED` junto de "Quota exceeded" |
| Openia | — | nenhuma mensagem própria; sem padrões no terminal (fail-closed) |

**Regras dos padrões no terminal:**
- A frase casa inteira, com fronteira de palavra, depois da normalização (controle → espaço, espaços colapsados, minúsculas; apóstrofos `’` e `'` equivalentes).
- A exclusão é conferida **antes** da inclusão, na mesma linha.
- O `429` isolado nunca basta, nem no fluxo: só conta junto de `status|error|http|code` ou de `rate limit|too many requests|usage limit`. "line 429" não conta.
- `RESOURCE_EXHAUSTED` e `MODEL_CAPACITY_EXHAUSTED` são normalizados (sublinhado vira espaço) antes de casar.

### 5.4 Correções embutidas

- **billing separado de limit.** "exceeded your current quota", "insufficient_quota", "credit balance", "402" e "out of extra usage" viram `billing` (hoje "exceeded your current quota" é limite, em `model-availability.cjs:255-266`).
- **Rede estreita.** ECONNRESET, ENOTFOUND, EAI_AGAIN, ECONNREFUSED, ETIMEDOUT, "fetch failed", "socket hang up" e os códigos do Codex acima. **Não** reaproveita o `NETWORK_FAILURE_PATTERN` (`app/electron/services/cli-diagnostics.cjs:38-39`), que casa "proxy|network|rede" e é largo demais para a saída de um agente.
- **403** vira `auth` com `ambiguous: true` e pede escolha.

### 5.5 O que cada classe dispara

| Classe | Espera | Bloco `chain` + cadeia ligada | Bloco `pinned` / cadeia desligada | Login do sistema | Orquestrador |
|---|---|---|---|---|---|
| limit (account) | até o reset (§6.4) | faixa + proposta | faixa + espera + "Passar responsabilidade…" | só faixa (sem espera) | §5.6 |
| limit (model, Codex) | **nenhuma** | faixa "limite do modelo X nesta conta; trocar de modelo resolve" | idem | idem | §5.6 |
| auth | até checagem OK | faixa "perdeu o login" + "Refazer login neste terminal" (foca) + proposta | faixa + espera | só faixa | §5.6 |
| billing | até ação + checagem | faixa + proposta, com destaque de custo | faixa + espera | só faixa | §5.6 |
| ambiguous | nenhuma automática | faixa "Tratar como limite?" com [Sim, pôr em espera e propor] e [Ignorar] | [Sim, pôr em espera] e [Ignorar] | só faixa | §5.6 |
| provider / network / timeout | **nenhuma** | faixa curta "falha do provedor/rede; trocar de conta não resolve" (uma por evidência) | idem | idem | §5.6 |
| cancelled / unknown | nenhuma | nada (log QA agregado, sem texto cru) | nada | nada | `null` |

### 5.6 Adaptador do orquestrador (`detectAvailabilityIssue` mantém a assinatura)

| Texto | Hoje | Depois |
|---|---|---|
| limite de uso (usage limit, rate limit, too many requests, quota exceeded, 429 com contexto) | `limit_reached` | igual, com a mesma regra de escopo (`:280-288`) |
| 429 solto ("line 429") | `limit_reached` | `null` **(muda comportamento, documentado)** |
| billing | "exceeded your current quota" dá `limit_reached`; o resto dá `null` | `limit_reached`, `scope: 'cli'`, com motivo "Sem crédito: …" (não cria status novo) |
| auth (401, unauthorized, not logged in…) | `no_login` sem prazo | `no_login` com `expiresAt = now + 30 min`, e `pruneExpired` já respeita. Assim a CLI não fica fora até reiniciar |
| 403 | `null` | `null` (sem troca) |
| capacidade do servidor (429 + RESOURCE_EXHAUSTED / MODEL_CAPACITY_EXHAUSTED) | `limit_reached` (via 429) | `limit_reached`, `scope: 'model'`, com motivo "capacidade do servidor". **Preserva** o fallback de modelo |
| 529 / overloaded / 5xx / rede / timeout | `null` | `null` |

O renderer para de classificar. `sendCliEvent` (`ipc-handlers.cjs:1046-1052`) anexa `failure: {failureClass, availabilityStatus}` aos eventos `error`. `ChatWorkspace.tsx:1035-1057` passa a usar `event.failure.availabilityStatus`. Sai `inferAvailabilityStatus` (`stream-status.ts:48-79`). O `inferAvailabilityCliType` (`:81`) continua, porque resolve o provedor e não a classe.

---

## 6. Elegibilidade e espera

### 6.1 Quando um membro está apto (regra pura `evaluateEligibility`, primeira razão bloqueante)

1. `cadeia-desligada` ou `membro-desabilitado`.
2. `conta-removida`: `validateAccount` falha (`cli-account-store.cjs:82-111`).
3. `sem-checagem-de-login`: a fonte do provedor não tem `auth` (`agent-usage-sources.cjs:71`). Hoje é o caso do Gemini. A regra não cita o nome do provedor.
4. `sem-chave`: Openia sem chave (`cli-account-store.cjs:103-108`).
5. `em-espera`: espera ativa, ou vencida sem checagem posterior.
6. `esgotada-pela-medicao`: medição **atual** (§7.2) com alguma janela % em `remaining ≤ 0`, até o `resetAt` dela.
7. `login-nao-conferido`: não há checagem com `logged_in` e `checked_at` ≤ 15 min (`ELIGIBILITY_TTL_MS` = `STALE_AFTER_MS`, `agent-usage-service.cjs:31`).
8. `deslogada`, `cli-ausente` ou `tempo-esgotado`, conforme a última checagem.
9. `identidade-diferente` ou `identidade-duplicada`: `identity_status` `different` (a CLI informa outra conta) ou `duplicate` (a mesma identidade da origem ou de um membro mais bem colocado).
10. `origem` ou `ja-visitada-na-linhagem`.

Se nenhuma razão bloqueia, a conta está **apta**. Toda razão tem texto em pt-BR para a UI.

### 6.2 Checagem de login (`account-eligibility.cjs`)

- **O que roda.** Só o comando de auth da fonte (`source.auth`: `codex login status`, `claude auth status --json`, `openia key status --json`), com `createCommandEnv(profileEnv)` (`agent-usage-service.cjs:812-814`) **e o mesmo filtro de credenciais herdadas do spawn** (§9.5). Assim o que é checado é o que será lançado. Roda também o `probe` local de identidade que o painel já usa (leitura de arquivo, sem processo). **Não** roda a consulta ao vivo, que é cara (o `/status` do Claude abre um PTY).
- **Reuso da amostra do painel.** Se a última amostra da conta (`agent-usage-repository.cjs:191`) tem `metadata.authStatus === 'logged_in'` e `collectedAt` válido e ≤ 15 min, ela vale como checagem (`source: 'amostra_do_painel'`) e nenhuma CLI roda.
- **Interpretação.** A saída passa por `redactOutput` (`agent-usage-service.cjs:1267`) e depois por `parseAgentAuth` (`agent-usage-report.cjs:43-102`). O stdout é lido **mesmo** com `ok: false`, porque `claude auth status` sai com código 1 sem login. O status vem do parser. `errorCode === 'ENOENT'` vira `cli_ausente`, `timedOut` vira `tempo_esgotado` e o resto vira `erro`.
- **`runBufferedCommand`** (`official-cli-service.cjs:395-470`) ganha `errorCode` (do evento `error`) e `timedOut: true` (no ramo do timer). A mudança é compatível: os chamadores atuais ignoram os campos novos.
- **Custo na máquina fraca.**
  - É preguiçosa: roda na ordem da estratégia e para no primeiro apto.
  - São **no máximo 3 checagens por proposta**, com **no máximo 2 CLIs ao mesmo tempo**.
  - Há dedupe por conta, com um mapa de promessas em voo.
  - O timeout é de 30 s (`COMMAND_TIMEOUT_MS`, `agent-usage-service.cjs:30`).
  - **Nunca** roda em timer de fundo. Há também o botão "Conferir login agora".
- **Identidade.** O `identityKey` resultante é comparado com o `identityKey` da conta em `agent_usage_accounts`. Igual vale `matched`, ausente na conta vale `unbound`, diferente vale `different`. Igual ao de outro membro vale `duplicate`.
- **Limite declarado [INFERIDO].** `codex login status` e `claude auth status` provam que a credencial local existe, não que o servidor a aceita. O diálogo diz "login conferido pela CLI há N min (checagem local)". Uma falha de auth no bloco novo volta ao registro como `post_switch_failure` (§4.1).

### 6.3 Gemini

O Gemini aparece na lista **desabilitado e travado**, com o texto "Fora da cadeia até o app conferir o login do Gemini". A regra 3 exclui qualquer provedor sem `source.auth`. Quando existir checagem, o Gemini entra sem mudar o código da política.

### 6.4 Fim da espera: fonte, em ordem

1. **Medição:** amostra atual (§7.2) da conta, com uma janela % em `remaining = 0`. Vale o `resetAt` dessa janela (Codex `rateLimits.*.resetsAt`, `codex-account-rate-limits.cjs:306-348`; Claude `/status`).
2. **Texto:** `reset-time.cjs` (§6.5) sobre a evidência. A fonte é `texto` quando há fuso impresso, e `texto_fuso_local` quando não há.
3. **Padrão:** as constantes atuais, 5 h para o Claude e 15 min para os demais (`model-availability.cjs:1-2`), com a fonte `padrao`, mostrada como "estimado".

Se medição e texto divergirem, vale **o mais tarde**, para que a conta não volte cedo demais. A UI mostra os dois. Uma leitura acima de 8 dias é inválida e cai para a fonte seguinte.

**Openia:** sem detecção no terminal (§5.3). Uma amostra atual de créditos com `remaining ≤ 0` (`parseOpeniaCredits`, `agent-usage-report.cjs`) grava espera `billing` com fonte `medicao` na próxima leitura da elegibilidade.

### 6.5 `reset-time.cjs`, o leitor único

`parseResetFromText(text, {nowMs, localTimeZone})` devolve `{resetAt, source: 'texto'|'texto_fuso_local', label}` ou `null`. Formatos, cada um com teste num CI em UTC:
- `resets 4:40pm (America/Sao_Paulo)` e `resets Oct 2, 9am (Europe/Lisbon)`. Reusa `parseClaudeReset(value, nowMs, timeZone)` (`claude-usage-query.cjs:688-744`) com o fuso entre parênteses, se `Intl` o aceitar.
- Codex: `try again at Oct 2, 2026 8:04 PM` (formato novo; ano seguido de hora) e `try again at 8:04 PM`, no fuso local.
- `continuing automatically at ‹hora› (TZ)?`: guarda também `autoResumeText`.
- `try again in N (min|minutes|hours|days)`.
- `…|‹epoch em segundos›`.

`model-availability.cjs` (`parseResetInfo`, `:353-401`) passa a delegar a esse módulo. O `RESET_TIME_ZONE` fixo (`:295`) só vale quando o texto é do Claude **sem** fuso impresso, e isso fica documentado.

### 6.6 Liberação manual

- **"Não era limite":** libera a espera (`released_by='nao_era_limite'`), marca a proposta como `dismissed` e silencia a evidência.
- **"Já recarreguei"** (billing): marca a conta como "precisa conferir". A espera só sai depois da checagem OK.

---

## 7. Estratégias e capacidade

### 7.1 Estratégias (`account-chain-policy.cjs`, `rankCandidates`)

Todas recebem a lista de **aptos** (§6.1) na ordem manual (`position`). O desempate é sempre `position` e depois `account_id`, então o resultado é determinístico.

| Estratégia | Regra | Explicação mostrada |
|---|---|---|
| **Ordem manual** (padrão ao ligar) | primeiro apto por `position` | "1ª apta na ordem manual" |
| **Rodízio** | primeiro apto **estritamente depois** do último destino `spawned` do registro, em ordem circular. O cursor é derivado do registro, sem campo próprio. Proposta recusada ou spawn que falhou não gastam a vez | "próxima do rodízio" |
| **Mais quota primeiro** | capacidade decrescente (§7.2). Os sem medição atual vão depois de todos os medidos, em ordem manual | "maior capacidade: 10,0 = 50% × 20x" ou "sem medição atual, não comparada" |
| **Assinatura antes de uso** | partição estável `assinatura → desconhecida → uso`, com ordem manual dentro de cada grupo | "assinatura primeiro" |

Um bloco "Automática (cadeia)" novo só considera membros **do mesmo provedor** do agente pedido. A continuação considera a lista inteira, o que atende a decisão 2.

### 7.2 Medição atual (regra estrita da cadeia, `isMeasurementCurrent`)

Uma medição é atual quando valem todas as condições:
- `sample.status === 'current'`;
- `metadata.measuredAt ?? collectedAt` é um horário **válido**;
- `now - esse horário ≤ 15 min`.

Horário ausente ou inválido **não** é atual. Essa é a diferença para `isOlderThan` (`agent-usage-service.cjs:1227-1233`). `lastKnown`, `stale`, `error` e `unavailable` nunca entram.

### 7.3 Capacidade e multiplicador

```
janelas%   = métricas da amostra atual com unit '%' e remaining finito
restante%  = min(remaining) entre as janelas%     (a mais apertada manda: 5 h com 90% e semanal com 5% dá 5%)
mult       = resolvePlanMultiplier(...)            (abaixo)
capacidade = restante% × mult                      (null sem medição atual ou sem janela %)
```

**Exemplo do dono, que vira teste literal:**
- A = 50% × 20 = **1000** vem antes de B = 100% × 1 = **100**;
- C = 30% com multiplicador "não declarado" = 30, que fica atrás de B;
- D sem medição atual fica depois de todos os medidos.

**Openia:** os créditos são em US$ (`parseOpeniaCredits`, `agent-usage-report.cjs`), então a capacidade é "não comparável" e a conta vai para o grupo sem medição.

**`resolvePlanMultiplier({planText, declared})`**, nesta ordem:
1. **CLI:** só os **campos de plano** que a CLI publicou (`auth.plan`, `plan_type`, `statusDetails.loginMethod`), com a regex `(?:^|[^a-z0-9])(\d{1,3}(?:[.,]\d)?)\s*x(?:$|[^a-z0-9])`. Com as versões instaladas isso **não acontece** (§0.2 #3). A regra existe para versões futuras. **Nunca** é aplicada ao texto do terminal.
2. **Declarado** pela pessoa no painel, de 1 a 100.
3. Sem nenhum dos dois, vale **1**, com o selo "não declarado".

Se CLI e declaração divergirem, vale a CLI e a UI mostra "você declarou N, a CLI informa M". Para o Claude com `subscriptionType: "max"`, a UI orienta: "Plano Claude Max: a CLI não informa se é 5x ou 20x. Declare aqui."

**Ressalva registrada na política:** o multiplicador é relativo ao plano-base de cada provedor, então comparar entre provedores é heurística. O diálogo mostra os números e a fonte, e a pessoa decide.

**"Mais quota" na prática.** Não existe atualização por conta: o refresh atual é global (`agent-usage-ipc-handlers.cjs:32`), e a medição por conta é da task 3e691f95-497e-812e. Por isso a estratégia usa só as medições atuais que existirem. O diálogo tem **"Medir agora"**, que chama o `agentUsage.refresh` já existente e recalcula a proposta. Não há medição automática em segundo plano.

### 7.4 Classe de cobrança (`classifyBilling`, sempre com fonte)

| Provedor | Detectado | Fonte |
|---|---|---|
| openia | sempre `uso` (créditos do OpenRouter) | regra |
| codex | `method` casa `/chatgpt/i` → `assinatura`; `/api key/i` → `uso`; o resto (por exemplo "workload identity") → desconhecida | `LOGIN_METHOD_PATTERN`, `official-cli-account-status.cjs:40` |
| claude | `authMethod` `claude.ai` → `assinatura`; `api_key`, `api_key_helper` ou `third_party` → `uso`; `oauth_token` ou ausente → desconhecida. `apiKeySource` presente vira aviso "há chave de API no ambiente do perfil" | valores conferidos no binário 2.1.283 |
| gemini | desconhecida | — |

Vale a cobrança declarada; na falta dela, a detectada. Se as duas divergirem, a conta é tratada como **desconhecida** ao ordenar, e o diálogo mostra as duas. Desconhecida **nunca** é presumida como assinatura.

---

## 8. Confirmação e consentimento

### 8.1 Como a proposta aparece (sem roubar foco)

- **Nunca abre um modal sozinha.** Um Enter digitado em outro terminal poderia confirmar sem querer.
- **Faixa no bloco**, fora do `<button>` da prévia (a prévia inteira é um botão, `app/src/features/canvas/components/TerminalNode.tsx:233-238`). O texto é "Limite da conta Pessoal às 14:32 · em espera até 16:40", com [Ver opções] e [Não era limite]. Usa `role="status"`.
- **Item fixo no topo do `NotificationsPanel`**, no padrão de `updateItem` (`NotificationsPanel.tsx:26-37`, `:192-193`), agrupado por `incident_key`: "Conta Pessoal (Codex) bateu o limite em 3 blocos · Ver opções". É o lugar persistente das propostas pendentes.
- **Ao montar**, o renderer chama `get-state` e recupera as propostas pendentes. Uma proposta vista com a janela fechada não se perde.

### 8.2 Conteúdo do `AccountSwitchDialog`

É uma variação do `HandoffDialog`: reaproveita `AgentConfigFields` com o campo Conta travado no destino, e a mesma armadilha de foco (`HandoffDialog.tsx:50-75`, `app/src/features/canvas/services/keyboard-focus.ts`). A lógica fica no modelo de visão puro `account-switch-dialog.ts`, testado no vitest.

- **Título:** "Trocar de conta?". O resumo lido pelo leitor de tela (`aria-describedby`) é "Limite detectado às 14:32 na conta Pessoal (Codex, assinatura). Recomendada: Trabalho (Codex, assinatura)."
- **De:**
  - conta, provedor, cobrança (declarada ou detectada) e multiplicador com fonte;
  - "Detectado às 14:32:05 (há 2 min)";
  - a linha que a CLI imprimiu, redigida e com no máximo 200 caracteres, em fonte mono;
  - o fim da espera com a fonte ("horário impresso pela CLI", "medido às 14:20" ou "estimado: padrão de 15 min").
- **Para:** um `radiogroup` com os candidatos aptos na ordem da estratégia. O primeiro vem marcado "Recomendada". Cada opção mostra:
  - cobrança e plano;
  - capacidade ("1000 = 50% × 20x · medido às 14:02" ou "sem medição atual (última às 13:02)"), com [Medir agora];
  - login ("conferido pela CLI há 3 min (checagem local)" ou "Conferindo login…" com `aria-busy`);
  - identidade ("vinculada" ou "não vinculada");
  - a explicação da posição (§7.1).
- **"Fora agora"** (recolhível): contas não aptas, desabilitadas, com o motivo de cada uma.
- **Custo, com todas as letras:** "Abrir o bloco novo envia o contexto (N KB, M linhas) como ponto de partida. O agente vai ler esse contexto e consumir [a assinatura da conta de destino / créditos por uso do OpenRouter em ‹conta›]." O tamanho é um fato (caracteres do transcript), não uma estimativa de tokens. No Openia aparece também o preço do modelo, como `AgentConfigFields.tsx:216-217` já faz.
- **Troca de provedor:** "Outro provedor: a retomada nativa não vale entre provedores. O histórico deste terminal (N KB, com segredos mascarados) será enviado a ‹provedor de destino›."
- **Várias sessões na mesma conta:** "Outros 2 blocos nesta conta também pararam. Cada continuação que você confirmar envia o contexto dela à conta de destino."
- **Terminal antigo:**
  - "Não será encerrado nem receberá nada";
  - "Parado há N s", ou o aviso §8.4 quando ainda produz saída;
  - com `autoResumeText`: "O Claude deste terminal está programado para continuar sozinho às 16:40 **na conta antiga**. Isso poria dois agentes no mesmo trabalho. Se for continuar aqui, pressione Esc no terminal antigo ou feche-o." Vem com o botão [Ir para o terminal antigo], que só foca.
- **Opção:** a caixa "Pedir para o agente continuar assim que abrir" vem marcada. Desmarcada, o contexto vai sem submissão (comportamento de `initialText`).
- **Botões:** [Abrir bloco novo em ‹destino›] (o rótulo leva o destino), [Agora não], [Não era limite] e [Fixar este bloco na conta atual].
- **Foco:** o foco inicial fica no **rádio recomendado**, nunca no botão primário. Enter sobre o rádio não confirma. Esc equivale a "Agora não". Ao fechar, o foco volta ao gatilho.
- **Erro na confirmação:** `role="alert"`. Com `SUPERSEDED` ou `NOT_ELIGIBLE`, a lista é recalculada e a mensagem diz o motivo.
- **Estado vazio:** "Nenhuma conta apta agora", com os motivos e as ações [Conferir login de novo], [Configurar cadeia] e [Fechar].

### 8.3 Trava no serviço, idempotência e registro

- O main gera `id` (uuid) = chave de idempotência = ticket. O renderer só devolve `proposalId`, a escolha e a decisão.
- O `confirm` duplo devolve o mesmo ticket. `decline` depois de `confirm` devolve `NOT_PENDING`.
- **Registro (`account_switch_events`) de cada proposta e troca:**
  - origem (conta, provedor, rótulo) e destino;
  - classe e motivo redigido, com `evidence_hash`;
  - estratégia, `chosen_by` e candidatos com o motivo de exclusão;
  - `detected_at`, `proposed_at`, `decided_at` e `spawned_at` (ISO UTC; a UI mostra no horário local);
  - `source_active_ack`, `source_auto_resume_at`, `transcript_chars` e `post_switch_failure`.
- **Log QA** `account-chain`: a mesma transição, **sem** texto cru.

### 8.4 Origem ainda ativa e retomada automática do Claude

- Se a origem produziu saída há menos de 5 s, `confirm` devolve `SOURCE_ACTIVE`. O diálogo mostra "O terminal antigo ainda está produzindo saída" com a caixa "Entendo; abrir mesmo assim". Com ela marcada, `acknowledgeSourceActive: true` passa, e isso fica gravado.
- O app **nunca** escreve no terminal antigo. Cancelar a continuação automática com Esc fica para uma task própria, depois de medir numa sessão real (§16).
- Se depois da troca o terminal antigo imprimir "Your usage limit has reset · press enter to continue" ou voltar a trabalhar, a faixa dele diz "Este terminal voltou a trabalhar na conta antiga; há outro bloco continuando o mesmo trabalho".

### 8.5 "Automática (cadeia)" ao abrir um bloco

- A opção aparece no `CampoConta` (`app/src/features/canvas/components/AgentConfigFields.tsx:424`) só quando a cadeia está ligada e o provedor tem checagem.
- Ao escolher, o renderer chama `account-chain:preview-launch {providerId}`. O main cria uma proposta `kind:'launch'` e a tela mostra "A cadeia vai usar: Conta B, primeira apta na ordem manual". O clique em **Abrir** é a confirmação: `confirm`, depois ticket, depois spawn.
- Se nenhuma conta estiver apta, a abertura é **recusada**, com a lista de motivos. Nunca há queda para o Login do sistema.

### 8.6 Passagem manual por causa de uma detecção (bloco fixo, Login do sistema ou cadeia desligada)

A faixa oferece "Passar responsabilidade…", que abre o `HandoffDialog` existente com o motivo pré-preenchido. A pessoa escolhe agente e conta, como hoje. Ao confirmar, `account-chain:record-manual` grava o evento `kind:'manual'`, `chosen_by:'person'`, com motivo e horário. Não há ticket, porque a escolha foi da pessoa pelo fluxo que já existe.

---

## 9. Bloco novo com contexto e o terminal antigo

### 9.1 Montagem

- `useAccountContinuation` extrai do `CanvasView.passResponsibility` (`:2269-2328`) uma função compartilhada `criarBlocoDeContinuacao(sourceId, transcript, options, extra)`, que já leva cwd e os links de arquivo do canvas (`:2300-2320`). O `CanvasView.tsx` tem 2935 linhas; a lógica nova não entra nele.
- O transcript vem de `store.getTranscript(id).text`, como no `TerminalDrawer`. Ele passa por `account-chain:redact-transcript` (main, `redactSecrets`) **antes** de montar o prompt. É uma chamada IPC por continuação, com custo registrado no teste.
- `buildTerminalHandoffPrompt` (`terminal-handoff.ts:38-69`) ganha `reason?` opcional. Sem ele, o texto de hoje não muda; o comentário de `:53-56`, sobre não inventar motivo, continua valendo. Com motivo confirmado, a linha é: "O terminal anterior parou porque a conta usada atingiu o limite de uso (detectado pelo app às HH:MM). A continuação foi confirmada pela pessoa. O último pedido pode ter ficado pela metade: confirme o estado real do repositório antes de refazer qualquer ação." A linha não identifica a conta.
- As salvaguardas existentes continuam: o transcript não é autoridade, e o agente confere o estado real. **O último pedido não é redigitado.**
- **Nó novo:** `accountId = destino`, `providerId`, `accountMode = 'chain'`, `chainTicket` (transitório), `chainOrigin`, e rótulo "‹rótulo› · continuação (‹conta›)".
- **Nó antigo:** ganha `chainSuccessorNodeId`. O processo dele não é tocado.
- **Idempotência no renderer:** antes de criar, procura um nó com `chainOrigin.switchEventId` igual ao da proposta. Se existir, não cria outro. A trava definitiva é o ticket no main (§4.1).
- No modo continuação, `config.savePreferences()` **não** roda (`HandoffDialog.tsx:107`). A troca não muda a configuração do botão Agente.
- **Adaptação entre provedores:** o `useAgentConfig` do diálogo é inicializado com o agente e a conta do destino, e modelo e esforço voltam ao padrão desse agente. O transcript vai por arquivo de contexto (`app/electron/services/context-files-ipc-handlers.cjs:206`), então o tamanho não estoura a janela do destino de uma vez: o agente lê o arquivo sob demanda.

### 9.2 Terminal antigo (decisão 6)

1. O processo vivo nunca troca de conta (P2).
2. O app não escreve no terminal antigo, não o pausa e não o encerra. Só a pessoa o fecha, pelo botão já existente.
3. A faixa dele mostra "Parado por limite · continuado em ‹bloco› às HH:MM →", que foca o bloco novo.
4. Mudar a cadeia ou o modo não afeta processos vivos.
5. Remover a conta com terminal vivo exige confirmação e lista os blocos afetados (§3.5).

### 9.3 Relançamento do Codex não reenvia a passagem (P5) **(muda comportamento)**

Hoje, sem `agentSession`, o relançamento depois do auto-update reenvia `launchOptions.initialText` (`terminal-session-store.ts:1785`). Para um bloco de passagem, esse texto vem de `handoffText` (`CanvasView.tsx:1713-1719`), então a tarefa seria executada de novo e o débito dobraria.

A correção:
- as `launchOptions` ganham `initialTextIsHandoff: true` quando o texto é de passagem;
- o relançamento nunca reenvia esse texto;
- o bloco mostra "O Codex reiniciou após se atualizar. O contexto de passagem não foi reenviado; use /resume ou reenvie manualmente";
- `chainTicket` sai das `launchOptions` depois do primeiro spawn aceito.

A correção vale para toda passagem, porque é um bug.

### 9.4 Reattach e reload

- O reattach já não reenvia texto (`terminal-session-store.ts:890-893`).
- No main, o reattach com `accountId` diferente lança um erro tipado, "A sessão viva deste bloco está em outra conta". O card oferece reiniciar na conta do bloco. Ambiente antigo nunca é reaproveitado.

### 9.5 Isolamento: credenciais herdadas **(muda comportamento)**

Mapa declarativo `CREDENCIAIS_HERDADAS` em `cli-account-profiles.cjs`. Os nomes foram conferidos nos pacotes instalados:

| Provedor | Variáveis removidas em spawn **com perfil** |
|---|---|
| claude | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` |
| codex | `OPENAI_API_KEY`, `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN` |
| gemini | `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_GENAI_USE_VERTEXAI` |
| openia | nenhuma (o perfil já sobrescreve `OPENROUTER_API_KEY`) |

- O filtro vale para **todo** spawn com conta própria (`buildEnv`, `cli-account-store.cjs:328`) e para a checagem de elegibilidade. Não vale só para os blocos da cadeia. Isso cobre a task irmã de isolamento. O precedente de `delete env.X` está em `app/electron/services/managed-cli-installer.cjs:122-125`.
- O Login do sistema não muda.
- O painel mostra só os **nomes** das variáveis presentes no ambiente do app (`envCredentialNames`), nunca os valores.
- O GUIA avisa a mudança.

### 9.6 Retomada (task irmã)

- A descoberta (`pty-process-manager.cjs:715-720`) passa a receber `env` com o perfil da conta:
  - Codex: `CODEX_HOME` já é lido de `env` (`agent-session-discovery.cjs:50-54`);
  - Claude: passa a ler `${env.CLAUDE_CONFIG_DIR ?? homeDir/.claude}/projects` (hoje fixo em `:71-86`; o caminho foi conferido no binário);
  - Gemini: o `HOME` do perfil.
- `AgentSessionReference.accountId` passa a ser gravado. `canResumeAgentSession` (`agent-session.ts:30`) exige a mesma conta. Uma referência antiga sem conta só vale em bloco sem conta. Se conta ou cwd não baterem, nenhum id é usado, e vale o aviso de `/resume` manual que já existe (`agent-session.ts:80`).
- `listOfficialCliAccountSessions` (`official-cli-service.cjs:234-263`) exclui as sessões com `accountId`, porque o logout do sistema não as afeta.

> Atualização de 29/09/2026: o "aviso de `/resume` manual" citado acima foi substituído pelo plano com motivo de `explainAgentResume`. Conta ou pasta divergentes agora seguram o spawn e pedem uma escolha (lista da CLI ou conversa nova), sem apagar o registro. Ver [Retomada de conversa: plano com motivo](ARQUITETURA.md#retomada-de-conversa-plano-com-motivo). As linhas citadas nesta seção continuam sendo as do commit-base do plano.

---

## 10. Orquestrador do chat pedindo confirmação (decisão 7)

### 10.1 Quando pergunta

- A função pura `getProviderFamily(cliType)` fica em `spawn-model-selector.cjs`:
  - `claude` → anthropic;
  - `codex` e `codex-app-server` → openai;
  - `gemini` e `gemini-acp` → google.

  O conjunto é o mesmo de `VALID_CLI_TYPES` (`app/electron/services/orchestration/orchestration-store.cjs:24-30`).
- A confirmação é pedida **só quando a família muda**. Isso vale para `provider-fallback` (`spawn-model-selector.cjs:114-154`), para `last-resort` para outra família (`:156-196`) e para o re-spawn no meio da tarefa para outra família.
- Continuam sem pergunta:
  - codex → codex-app-server, que é só troca de transporte;
  - `last-resort` na mesma família;
  - fallback de modelo na mesma família.

### 10.2 Como funciona (não bloqueante; o runner continua "lógica pura sobre eventos")

**Spawn inicial** (`handleSpawnAgent`, `orchestration-runner.cjs:73-178`):
1. Depois de resolver `resolvedCliType` (`:92-104`), o job é criado como já é hoje (`createAgentJob` cria `pending`, `orchestration-store.cjs:139-172`).
2. Se `requiresProviderSwitchConfirmation(event.cliType, resolvedCliType)`, o runner **não** chama `spawnAgent`. Ele:
   - registra `pendingProviderSwitches.set(decisionId, {kind:'initial', runId, agentId, event, resolvedEvent, threadId, rule, reason, expiresAtMs: now + 10 min})`. O `decisionId` é um uuid gerado no main;
   - emite `sendChatEvent({type:'provider_switch_request', decisionId, runId, agentId, fromCliType, toCliType, toModelName, rule, reason, expiresAt})` e o evento de terminal `orchestration_provider_switch_request`;
   - devolve `{handled:true, ok:true, run, awaitingConfirmation:true}`.
3. O job fica `pending`. Como `areCurrentTurnJobsTerminal` é falso, o run espera.

**Meio da tarefa** (`tryMidTaskFallback`, `:395-540`):
1. Depois de calcular `newCliType` (`:485`), se a família mudou, registra a decisão (`kind:'mid-task'`) e devolve `{awaitingConfirmation:true, run}`.
2. `bumpFallbackLoad` e o contador de tentativas (`:487-489`) **só rodam no aceite**.
3. `onAgentJobCompleted` (`:361-364`) trata `awaitingConfirmation` como `respawned`: o job segue `running` e não falha.

**Resposta** (`resolveProviderSwitch({decisionId, accept})`):
- decisão inexistente ou resolvida → `{ok:false, code:'DECISION_NOT_PENDING'}` (idempotente);
- run encerrado → `{ok:false, code:'RUN_FINISHED'}`;
- **aceite:**
  - revalida com `validateSpawnAgent`. Se o destino mudou de família, a decisão vira `superseded` e é feita uma pergunta nova;
  - senão, roda `startSpawnedJob` (extraído de `:136-172`) ou `executeMidTaskFallback` (extraído de `:487-539`);
- **recusa:**
  - inicial: `failAgentJob` com "Troca de provedor recusada pela pessoa";
  - meio da tarefa: segue com o erro original;
  - nos dois casos, `finishAgentJob` (extraído de `:367-389`) emite o resultado e reinvoca o orquestrador quando o turno terminou.

### 10.3 O que acontece sem resposta

- `failExpiredRuns` (`:637-659`) passa a chamar também `expirePendingProviderSwitches(now)`. Ele já roda a cada 60 s pela varredura existente (`ipc-handlers.cjs:913-921`), então não há timer novo.
- Uma decisão vencida (10 min, ou o prazo do run se vier antes) é tratada como **recusa**, com o motivo "sem resposta em 10 min". O job falha com mensagem clara e **nenhum** provedor é trocado.
- `cli:stop` (`ipc-handlers.cjs:780`) e o fim do run (`failRun`, `forgetRunContext`) limpam as decisões do run.
- O store de orquestração é em memória, então um reinício apaga a decisão sem executar nada.
- Isso muda de propósito o princípio "a tarefa deve concluir de alguma forma" (`spawn-model-selector.cjs:156-158`), por decisão do dono.

### 10.4 IPC, UI e registro

- **IPC:**
  - `cli:provider-switch:list` devolve as decisões pendentes, para o renderer recuperar ao montar;
  - `cli:provider-switch:respond {decisionId, accept}` fica em `ipc-handlers.cjs`, perto de `cli:stop`;
  - o preload ganha `cli.listProviderSwitches` e `cli.respondProviderSwitch`.
- **UI:**
  - `StreamEvent` (`app/src/features/chat/types.ts:134`) ganha `provider_switch_request` e `provider_switch_resolved`;
  - o card `ProviderSwitchRequest.tsx` na conversa mostra de → para (provedor e modelo), motivo, regra, prazo e o custo ("muda de provedor e de conta de cobrança; roda no login do sistema do destino"), com [Trocar para ‹provedor›] e [Não trocar];
  - a linha de status mostra "Aguardando sua confirmação para trocar Claude → Codex…";
  - `app/electron/services/terminal-event-formatter.cjs` formata o evento novo no log de terminal.
- **Registro:** o runner recebe a dependência `recordSwitchDecision`, que grava `kind:'provider_switch'` em `account_switch_events` com `accepted` ou `refused`, motivo e horários. A troca do orquestrador também fica com motivo e timestamp.
- **Testes existentes:** os testes do runner que exercitam fallback entre famílias passam a resolver a decisão explicitamente. Nenhum teste injeta "aceitar sempre" como padrão.

### 10.5 O que não muda

- O orquestrador continua no Login do sistema e não escolhe conta da cadeia.
- `maxCostEstimate` e `requireConfirmationForSensitiveActions` continuam sendo só texto no prompt (`orchestrator-settings-storage.ts`), fora do escopo.

---

## 11. Correção da queda silenciosa para Login do sistema **(muda comportamento)**

- `selectAccountFromList` (`agent-account-selection.ts:23-33`) passa a devolver `{accountId, status: 'ok' | 'saved-missing' | 'list-failed'}`.
- Em `useAgentConfig.ts:397-401`:
  - `resultado?.ok === false` ou exceção **mantém** a seleção atual e mostra "Não foi possível carregar as contas; o bloco **não** vai abrir no login do sistema por engano", com [Tentar de novo]. Criar e Abrir ficam desabilitados;
  - com a conta salva ausente da lista, aparece "A conta salva ‹rótulo guardado› não existe mais. Escolha outra." e o lançamento fica bloqueado até a escolha.
- O efeito de persistência (`useAgentConfig.ts:663-678`) só grava uma escolha **explícita**. Uma mudança que veio de fallback não grava `''`.
- "Login do sistema" continua como opção explícita no campo (`AgentConfigFields.tsx:505`).

---

## 12. UI (o renderer só consome) e acessibilidade

1. **Painel "Limites e uso"** (`app/src/features/canvas/components/tools/AgentUsagePanel.tsx`, 765 linhas): ganha uma barra de abas `role="tablist"` (setas navegam) com **Uso agora** (o conteúdo de hoje), **Cadeia** (`AccountChainSection.tsx`) e **Trocas** (`AccountSwitchHistory.tsx`). Não entra ferramenta nova no menu.
   - **Cadeia:**
     - `FelixoToggle` "Cadeia de contas" (`app/src/features/shared/components/FelixoToggle.tsx`, `role="switch"`), com o texto "Desligada: nenhum bloco troca de conta. Ligada: a cadeia só propõe; toda troca pede a sua confirmação.";
     - `FelixoSelect` de estratégia (`FelixoSelect.tsx`), com uma linha de explicação por opção. "Mais quota" mostra a fórmula;
     - lista ordenada, com uma linha por conta:
       - posição, provedor e rótulo;
       - "Habilitada na cadeia";
       - cobrança: Assinatura, Uso ou Não declarada, mais a detectada;
       - multiplicador: campo de 1 a 100, com "não declarado (vale 1)", ou "informado pela CLI" em modo somente leitura;
       - login: status, "há N min" e [Conferir agora];
       - espera: "até 16:40 · fonte: texto" e [Não era limite] / [Já recarreguei];
       - capacidade;
       - motivo de inaptidão;
     - reordenação por botões **↑** e **↓** com nome acessível ("Mover Pessoal para cima") e Alt+↑/↓ na linha focada. Uma região `aria-live="polite"` anuncia "Pessoal agora é a 2ª". Nada depende de arrastar;
     - Gemini desabilitado, com o motivo;
     - aviso de variáveis de credencial no ambiente (só os nomes);
     - conflito de CAS: "Outra janela mudou a cadeia; mostrei a versão atual."
   - **Trocas:** as últimas 50, com data e hora absolutas e relativas (`app/src/features/canvas/components/notification-time.ts`), origem → destino, motivo, estado e [Ir para o bloco].
2. **Campo Conta:** a opção "Automática (cadeia)" (§8.5) e os avisos de §11.
3. **Bloco (`TerminalNode.tsx`):**
   - chip "Pessoal · fixa", "Pessoal · cadeia" ou "Login do sistema", com `title` completo. Hoje nenhuma UI mostra a conta do bloco;
   - faixas de detecção e proposta, e "continuado em", fora do `<button>` da prévia (`:233-238`).
4. **`TerminalDetailsPanel.tsx`** (montado em `CanvasView.tsx:2764`): **Conta**, **Modo** com [Fixar nesta conta] / [Voltar para a cadeia] (chamam `set-session-mode` e persistem `accountMode`) e **Trocas deste bloco**.
5. **`NotificationsPanel`:** item fixo das propostas pendentes, agrupado por conta (§8.1).
6. **Chat:** card `ProviderSwitchRequest` (§10.4).
7. **Formatação pura** em `account-chain-view.ts`: motivo em linguagem simples, horário local, capacidade e "sem medição atual".
8. **Acessibilidade (base obrigatória do System Design):**
   - tudo por teclado;
   - foco visível (as classes `focus-visible` do `HandoffDialog`);
   - `role="dialog"`, `aria-modal`, `aria-labelledby` e `aria-describedby`;
   - `radiogroup` com foco inicial no recomendado;
   - `role="status"` nas faixas e `role="alert"` nos erros;
   - horários por extenso e em `<time dateTime>`;
   - cores dos tokens do tema, com contraste AA nos temas escuro e de alto contraste;
   - spinner respeitando `prefers-reduced-motion` (`app/src/features/shared/accessibility/reduced-motion-preference.ts`).
   - **Glossário fixo:** apta, em espera, fora, fixa, cadeia, Automática, cobrança por uso, assinatura, continuação. "Limite" **nunca** nomeia erro de rede ou de servidor.

---

## 13. Testes

Regra do contrato: em toda correção de bug, o teste **falha antes** da correção e passa depois. Os casos marcados **[falha antes]** são rodados contra o código de 116f0569 no commit correspondente, e a saída fica registrada na página da task.

### 13.1 Unitários (node:test; `app/scripts/run-node-unit-tests.cjs` descobre `*.test.cjs` em `electron/` e `scripts/`)

- **`accounts/failure-taxonomy.test.cjs`**, guiado pelas fixtures do commit 2:
  - todas as frases do §5.3 por provedor e versão;
  - exclusões ("wrapping up", Fast, Context e Budget limit, Subagent, "Goal budget reached", "Upgrade to Max 20x");
  - U+2019 contra `'`;
  - precedência;
  - "line 429" → nada **[falha antes: hoje vira limit_reached]**;
  - "401 Unauthorized" impresso por agente na origem `pty` → nada;
  - `MODEL_CAPACITY_EXHAUSTED` → provider;
  - "Credit balance is too low" → billing;
  - ECONNRESET → network, nunca limit;
  - 403 → auth ambíguo;
  - limite do Codex por modelo → `scope: 'model'`;
  - evidência com `Bearer sk-…`, `eyJ…` e `sk-or-…` sai redigida.
- **`accounts/reset-time.test.cjs`** (com `TZ=UTC` no processo de teste):
  - "resets 3am (Europe/Lisbon)" → 02:00Z;
  - `Oct 2, 2026 8:04 PM` do Codex **[falha antes: `parseClaudeReset` devolve null]**;
  - "try again in 3 hours";
  - epoch;
  - virada de dia e horário de verão;
  - leitura acima de 8 dias rejeitada;
  - fuso inválido → `texto_fuso_local`.
- **`accounts/account-chain-policy.test.cjs`:**
  - cada razão de §6.1, na ordem;
  - as 4 estratégias com desempate;
  - **o caso do dono** (1000 > 100 > 30 > sem medição);
  - janela mais apertada;
  - medição sem `measuredAt` não é atual **[falha antes com `isOlderThan`]**;
  - Openia não comparável;
  - multiplicador (CLI > declarado > 1 "não declarado"; regex só em campo de plano);
  - cobrança divergente → desconhecida;
  - desconhecida nunca vira assinatura;
  - Gemini fora;
  - identidade `different`/`duplicate` fora;
  - rodízio derivado do registro (recusa e falha não gastam a vez);
  - fim da espera (a medição e o texto mais tarde vencem; padrão 5 h / 15 min).
- **`accounts/account-output-watcher.test.cjs`** (relógio e agendador falsos):
  - *antes do limite:* 2000 quadros de spinner e o agente escrevendo código com "rate limit" → 0 emissões;
  - *durante:* o banner partido em 3 pedaços, com CSI de cursor entre as palavras → 1 emissão;
  - *depois:* o banner redesenhado 50 vezes → 1 emissão;
  - debounce e espera máxima;
  - `flush` no `onExit` pega a última mensagem;
  - `dispose` limpa o timer;
  - `onOutputFailure` que lança não quebra a vigia;
  - sessão de shell não ganha vigia;
  - variantes de renderização: quebra de linha em 40 e 80 colunas, cursor absoluto, CR de redesenho, repintura de tela inteira estilo ConPTY (`ESC[H ESC[2J` mais repaint). O limite declarado é que, em bloco mais estreito que a frase, a TUI trunca e a detecção falha (fail-closed).
- **`pty-replay-buffer.test.cjs`:** `tail(n)` igual a `toString().slice(-n)` em 200 fluxos aleatórios, e `tail` não muda o `length` nem o próximo `toString()`.
- **`pty-process-manager.test.cjs`** (PTY injetável, `:78-80`):
  - a entrada guarda conta, provedor e modo;
  - `listarSessoesVivas` expõe a conta;
  - reattach com outra conta é recusado **[falha antes]**;
  - os bytes entregues ao renderer são idênticos com e sem vigia;
  - o replay do `attach` (`:544-549`) não realimenta a vigia;
  - o env de perfil sai sem as credenciais herdadas **[falha antes]**, e o Login do sistema fica igual;
  - a descoberta recebe o env do perfil;
  - ticket: inexistente, de outra conta e de outra sessão recusados; mesma sessão idempotente; `confirmed → spawning → spawned`.
- **`agent-session-discovery.test.cjs`:** o Claude lê `CLAUDE_CONFIG_DIR/projects` **[falha antes]**.
- **`accounts/account-eligibility.test.cjs`** (executor falso):
  - `logged_in`, `logged_out` com exit 1 e JSON válido, ENOENT → `cli_ausente`, timeout → `tempo_esgotado`;
  - dedupe em voo e teto de 2 simultâneas;
  - reuso da amostra do painel ≤ 15 min, e amostra com `collectedAt` inválido não reusada;
  - env filtrado igual ao do spawn;
  - saída com segredo não vaza.
- **`official-cli-service.test.cjs`:** `runBufferedCommand` com `errorCode` e `timedOut`; a lista de afetados exclui perfis isolados **[falha antes]**.
- **`storage/account-chain-repository.test.cjs`:**
  - CAS aplicado e em conflito;
  - `replaceMembers` reordena sem colisão;
  - índice parcial único;
  - `upsertCooldown` nunca encurta;
  - `recoverOnStartup`;
  - retenção nunca apaga linha aberta;
  - `candidates_json` corrompido vira `corrupted`.
- **`storage/account-chain-multiprocess.test.cjs`:** `fork` com barreira, no molde de `onboarding-state-multiprocess.test.cjs` e do worker `app/electron/__fixtures__/onboarding-cas-worker.cjs`. Dois processos confirmam a mesma proposta e exatamente um CAS é aplicado. Dois processos abrem proposta para a mesma sessão e só uma linha nasce.
- **Migração 017** sobre banco na versão 16 com dados, coberta por `storage/backward-compatibility.test.cjs`.
- **`accounts/account-chain-service.test.cjs`:**
  - detecção → espera → proposta;
  - fixo, sistema e desligada só registram `noticed`;
  - confirm duplo gera um ticket;
  - expirado é recusado;
  - `SUPERSEDED`;
  - `SOURCE_ACTIVE` e o ack;
  - "Não era limite";
  - `no_candidate`;
  - teto de saltos;
  - recuperação no início;
  - `post_switch_failure`;
  - sessões da mesma conta no mesmo `incident_key`.
- **`cli-account-store.test.cjs`:**
  - escrita atômica: uma falha no meio preserva o arquivo anterior;
  - arquivo corrompido não é sobrescrito **[falha antes]**;
  - remoção com terminal vivo exige confirmação;
  - remoção limpa a cadeia.
- **`model-availability.test.cjs` / `account-limit-detector.test.cjs`:**
  - a tabela do §5.6 inteira;
  - os testes atuais seguem valendo, exceto os casos de 429 solto e `no_login` sem prazo, que mudam com o motivo escrito no commit.
- **`orchestration-runner.test.cjs`:**
  - provider-fallback emite o pedido e **não chama `spawnAgent`**;
  - aceite gera um spawn;
  - aceite duplo → `DECISION_NOT_PENDING`;
  - recusa faz o job falhar e reinvoca;
  - meio da tarefa idem, com a tentativa contada só no aceite;
  - codex → codex-app-server não pergunta;
  - last-resort na mesma família inalterado;
  - `failExpiredRuns` expira a decisão como recusa;
  - `cli:stop` limpa;
  - `superseded` quando a revalidação muda a família.
- **`spawn-model-selector.test.cjs`:** `getProviderFamily` e `requiresProviderSwitchConfirmation`.
- **`ipc-handlers.test.cjs`:**
  - `sendCliEvent` anexa `failure`;
  - `reason` redigido antes do log QA **[falha antes]**;
  - `cli:provider-switch:respond`.
- **`account-chain-ipc-handlers.test.cjs`:** validação de formato (uuid, enum, faixa, tamanho); nenhuma resposta contém `cli-profiles`, env ou chave.

### 13.2 Matriz de falhas injetadas (`accounts/account-chain-faults.test.cjs`)

A matriz roda com `PtyProcessManager` real, `spawnPty` e relógio falsos, serviço real e SQLite temporário. Os chunks são injetados.

| Injeção | Esperado |
|---|---|
| limite ancorado (fixture Codex e Claude) | espera + 1 proposta; **0 spawn** antes do confirm |
| limite partido em 2 chunks | mesma detecção |
| saída parcial ("You’ve hit your") e o processo sai | sem detecção; nunca troca |
| 401 da CLI | `auth`: espera até checagem; proposta com motivo auth |
| "401 Unauthorized" impresso pelo agente | nada |
| 403 | ambíguo: pede escolha; sem espera automática |
| "line 429" / 429 solto | nada |
| timeout do app | `timeout`: nada |
| ECONNRESET / "stream disconnected" / "Reconnecting..." | `network`: nada |
| 529 / `server_overloaded` / `MODEL_CAPACITY_EXHAUSTED` | `provider`: nada |
| limite do Codex por modelo | aviso de modelo; sem espera e sem proposta |
| "Usage limit reached · wrapping up" | nada |
| processo morre antes do confirm | proposta `expired`; confirm recusado; 0 spawn |
| processo morre depois do ticket, antes do spawn | ticket expira em 2 min; 0 spawn |
| confirm duplo / IPC repetido / 2 processos | 1 ticket, 1 spawn |
| spawn do destino falha | `spawn_failed`; **sem retry** |
| destino perde o login entre proposta e confirm | recheck recusa → `superseded` ou `no_candidate` |
| todas as contas em espera | `no_candidate`; nenhuma volta antes do reset |
| a mesma evidência 50× | 1 proposta |
| laço A→B→A | para no máximo de saltos; A em espera nunca é destino |
| reinício com proposta aberta | `expired`; 0 spawn |
| destino falha com auth nos primeiros 3 min | `post_switch_failure` + destino em espera |
| segredo sentinela na saída (`sk-…`, `sk-or-…`, `eyJ…`, `Bearer …`) | **ausente** de todas as tabelas, pushes, retornos de IPC e log QA (varredura em tudo que foi gravado ou emitido) |

### 13.3 Concorrência e reinício

Os casos de concorrência e reinício estão cobertos por:
- o teste multiprocesso (§13.1);
- as linhas "2 processos" e "reinício" da matriz;
- `recoverOnStartup`;
- o índice parcial único.

### 13.4 Vitest (`app/src`)

- `agent-account-selection.test.ts`: `list-failed` mantém e bloqueia; `saved-missing` avisa e não grava **[falha antes]**.
- `terminal-session-store` (relançamento do Codex): texto de passagem não reenviado **[falha antes]**.
- `account-switch-dialog.test.ts` (modelo de visão):
  - resumo;
  - avisos de custo, de outro provedor, de sessões múltiplas e de retomada automática;
  - rótulo do botão com o destino;
  - foco inicial no recomendado;
  - estado vazio;
  - `SOURCE_ACTIVE`.
- `account-chain-view.test.ts`.
- `terminal-handoff.test.ts`: com e sem `reason`.
- `agent-session.test.ts`: retomada só na mesma conta.
- `useCanvasPersistence`: `chainTicket` não é persistido; `accountMode` e `chainOrigin` são.
- `stream-status` / `ChatWorkspace` passam a ler `event.failure`.
- `ProviderSwitchRequest`: clique duplo gera uma chamada.

### 13.5 Bancada (caminho quente)

`app/scripts/pty-output-path-benchmark.cjs` ganha a variante `atual+vigia`:
- sessões com `command: 'codex'`, para a vigia ser anexada;
- vigia com agendador **injetado e manual**;
- a cada 40 pedaços por sessão (cerca de 400 ms a 100 pedaços/s), a bancada força `scan()` e mede o tempo da varredura **separadamente**;
- dois fluxos: o spinner atual (`SPINNER_CHUNK`, `:43`), que nunca passa no pré-filtro, e o **pior caso**, com pedaços contendo "rate limit" e "429" sempre, que passam no pré-filtro.

O `validateReport` (`:258-266`) ganha os limites do §15.1. Roda no CI nos 4 SOs (`ci.yml:694-698`).

### 13.6 Smoke real via CDP: sessão C (`app/scripts/canvas-smoke-contas.cjs`, chamada de `canvas-smoke.cjs` depois da sessão B, em `:1106-1111`)

- **Por que um PTY novo.** O PTY falso atual não passa pelo `onData` do main (§0.2 #13).
- **PTY roteirizado no main** (`app/electron/services/devtools-fake-cli-pty.cjs`):
  - só carrega com `FELIXO_DEVTOOLS_PORT` válido **e** `FELIXO_DEVTOOLS_FAKE_CLI_PTY=1`, a mesma guarda de `FELIXO_DEVTOOLS_HARDWARE_NOTICES` (`main.cjs:436-446`). O `main.cjs` o injeta como `spawnPty` em `new PtyProcessManager` (`:566`). O app normal nunca carrega esse código;
  - imprime banner e prompt e ecoa o que recebe;
  - ao receber `__felixo_smoke_limite__`, emite a fixture do Codex ("You’ve hit your usage limit. … or try again at 8:04 PM.") em 3 pedaços, com CSI de cursor;
  - `__felixo_smoke_rede__` emite "stream disconnected before completion: ECONNRESET";
  - `__felixo_smoke_401__` emite a fixture de auth.
- **Checagem de login falsa.** Com a mesma flag, `account-eligibility` recebe um executor falso que devolve a fixture "Logged in using ChatGPT". Nenhuma CLI real roda.
- **Sessão:** `withDevtoolsSession(action, {env: {FELIXO_DEVTOOLS_MOCK_PTY: '0', FELIXO_DEVTOOLS_FAKE_CLI_PTY: '1'}})` (`canvas-smoke.cjs:223-257`), em perfil isolado. O renderer usa o store real, e o store fala com o main pelo `pty:spawn`.
- **Roteiro:**
  1. Criar duas contas Codex falsas via `window.felixo.cliAccounts.create`.
  2. Abrir Limites e uso → aba Cadeia pelo teclado. O estado inicial é desligado. Ligar com Tab e Espaço confere que começa em "Ordem manual". Habilitar as duas e reordenar com ↓: o `aria-live` anuncia. A ordem sobrevive a reload.
  3. Abrir um bloco com "Automática (cadeia)". A tela mostra a Conta A **antes** de abrir. Abrir.
  4. Com a cadeia desligada num segundo teste (ou num bloco fixo), digitar o gatilho (`page.keyboard.type`, `app/electron/cli/felixo-devtools.cjs:345`) dá faixa `role="status"` "fixa", sem proposta e sem diálogo aberto sozinho.
  5. No bloco `chain`, digitar o gatilho faz aparecer a faixa e o item nas notificações. Ler o `ipcProbe.snapshot()` via `mainEval` (`canvas-smoke-onboarding.cjs:496-497`) e guardar o contador de `pty:spawn`.
  6. [Ver opções] pelo teclado: o foco inicial fica no rádio recomendado (Conta B). Esc fecha e devolve o foco ao gatilho. "Agora não" deixa o contador de `pty:spawn` **igual**.
  7. Um gatilho novo seguido de [Abrir bloco novo] produz **exatamente +1** `pty:spawn`. O bloco novo aparece na Conta B com o selo "cadeia". O bloco antigo continua presente, com o processo vivo e a faixa "continuado em".
  8. A aba Trocas mostra `spawned`, com motivo e horário.
  9. Clique duplo no confirmar continua dando +1.
  10. Reload: o contador de `pty:write` do contexto não sobe (nenhum reenvio).
  11. `__felixo_smoke_rede__` não gera item.
  12. Auditoria de nomes acessíveis, como já existe em `canvas-smoke.cjs`: `role=dialog`, `aria-modal`, `radiogroup`, e viewport de 375×667 sem sobreposição.
  13. Chat: um evento `provider_switch_request` injetado via `mainEval` (`mainWindow.webContents.send('cli:stream', …)`) faz aparecer o card. [Não trocar] chama o IPC e recebe `DECISION_NOT_PENDING`, que é exibido. Isso cobre a fiação; a lógica fica no node:test.
- **Orçamento de tempo:** +60 s no passo de smoke. O teto do passo é de 10 min (`ci.yml:502-503`). O tempo é medido no PR; se o Windows passar do teto, a sessão C vira um passo separado, com justificativa.

### 13.7 Verificação manual real (Linux, máquina do dono)

- Duas contas Codex reais, já provadas simultâneas (Notion 3d091f95-497e-8168):
  - checagem de login real;
  - selo;
  - "Automática (cadeia)";
  - bloqueio de conta sem login;
  - `/proc/‹pid›/environ` do PTY de perfil **sem** `OPENAI_API_KEY`.
- `claude auth status --json` real numa conta com perfil, para confirmar `authMethod`, `subscriptionType`, `projectsDirectory` e a descoberta da sessão pelo `CLAUDE_CONFIG_DIR`.
- **Limitação declarada:** não dá para forçar um limite real sob demanda. A troca por limite fica provada pelo smoke com PTY roteirizado alimentado pelas fixtures reais. Quando um limite real acontecer, o log QA `account-chain` guarda classe, horário e linha normalizada redigida.

---

## 14. Sequência de commits (pequenos, Conventional, pt-BR, cada um verde)

Cada commit roda o gate. O smoke roda a partir do commit 27. Documentação interna, README e mudança de API ficam em commits separados (GIT-POLITICA do System Design).

| # | Commit | Arquivos principais | Prova |
|---|---|---|---|
| 1 | `docs(contas): política da cadeia de contas com as decisões do dono` | `docs/projeto/POLITICA-CONTAS.md` (no molde de `POLITICA-PERFORMANCE.md`) | revisão; links |
| 2 | `test(contas): vocabulário de falha das CLIs instaladas como fixtures versionadas` | `app/scripts/extract-cli-failure-vocabulary.cjs` (+`.test.cjs` sobre um buffer sintético), `app/electron/__fixtures__/cli-failure-vocabulary.json` (versão, fonte e frases do §5.3) | `npm test`; varredura sem segredo |
| 3 | `feat(contas): taxonomia única de falhas das CLIs no processo principal` | `accounts/failure-taxonomy.cjs`, `accounts/cli-failure-patterns.cjs`, `accounts/account-chain-constants.cjs` (+tests) | `npm test` |
| 4 | `feat(contas): leitor de horário de reset que respeita o fuso impresso e o formato do Codex` | `accounts/reset-time.cjs` (+test) | `npm test` com TZ=UTC |
| 5 | `refactor(orquestrador): disponibilidade delega à taxonomia; 429 solto deixa de ser limite e no_login ganha prazo` **(muda comportamento)** | `orchestrator/model-availability.cjs`, `account-limit-detector.cjs` (+tests) | tabela do §5.6 |
| 6 | `fix(chat): o evento de erro traz a classe decidida no processo principal` | `ipc-handlers.cjs` (`sendCliEvent`), `chat/services/stream-status.ts`, `ChatWorkspace.tsx`, `chat/types.ts` (+tests) | node + vitest + build |
| 7 | `fix(orquestrador): motivo de disponibilidade redigido antes do log QA` | `ipc-handlers.cjs:969-982` (+test) | [falha antes] |
| 8 | `feat(storage): migração 017 e repositório compare-and-set da cadeia de contas` | `migrations/017_account_chain.sql`, `storage/account-chain-repository.cjs` (+tests, multiprocesso, worker em `__fixtures__`) | `npm test` |
| 9 | `fix(contas): registro de contas grava de forma atômica e não sobrescreve arquivo corrompido` | `cli-account-store.cjs` (+test) | [falha antes] |
| 10 | `fix(contas): terminal com conta própria não herda credencial de API do ambiente` **(muda comportamento)** | `cli-account-profiles.cjs`, `cli-account-store.cjs` (`buildEnv`) (+tests) | [falha antes] |
| 11 | `feat(pty): sessão guarda conta, provedor e modo; reanexar em outra conta é recusado` | `pty-process-manager.cjs`, `pty-ipc-handlers.cjs`, `official-cli-service.cjs` (lista de afetados) (+tests) | `npm test` + `npm run test:native` |
| 12 | `fix(retomada): descoberta de sessão com o ambiente da conta e retomada só na mesma conta` **(muda comportamento)** | `agent-session-discovery.cjs`, `pty-process-manager.cjs`, `canvas/services/agent-session.ts` (+tests) | [falha antes] |
| 13 | `fix(canvas): relançamento automático do Codex não reenvia texto de passagem` **(muda comportamento)** | `terminal-session-store.ts`, `CanvasView.tsx` (flag nas launchOptions) (+vitest) | [falha antes] |
| 14 | `fix(canvas): falha ao listar contas ou conta salva ausente não vira Login do sistema em silêncio` **(muda comportamento)** | `useAgentConfig.ts`, `agent-account-selection.ts`, `AgentConfigFields.tsx` (+vitest) | [falha antes] |
| 15 | `feat(contas): checagem de login por conta como porta de elegibilidade` | `accounts/account-eligibility.cjs`, `agent-usage-service.cjs` (extrai `checkAccountAuth`), `official-cli-service.cjs` (`errorCode`, `timedOut`), `agent-usage-report.cjs` (`apiKeySource`) (+tests) | `npm test` |
| 16 | `feat(contas): regra pura da cadeia com quatro estratégias e capacidade absoluta` | `accounts/account-chain-policy.cjs` (+test) | caso do dono |
| 17 | `perf(pty): cauda sob demanda no buffer de replay` | `pty-replay-buffer.cjs` (+test) | `npm test` |
| 18 | `perf(pty): vigia de falha por conta no onData com custo medido` | `accounts/account-output-watcher.cjs`, gancho em `pty-process-manager.cjs`, `pty-ipc-handlers.cjs` (nota datada no cabeçalho), `scripts/pty-output-path-benchmark.cjs` (+tests) | bancada local com números + `--check` |
| 19 | `feat(contas): serviço da cadeia com espera, propostas, ticket confirmado e recuperação no início` | `accounts/account-chain-service.cjs`, `main.cjs` (injeção) (+tests) | `npm test` |
| 20 | `feat(ipc): canais da cadeia de contas e ponte no preload` | `account-chain-ipc-handlers.cjs`, `preload.cjs`, `src/vite-env.d.ts`, `shared/types/account-chain.ts` (+test) | `npm test` + build |
| 21 | `feat(pty): bloco criado pela cadeia só nasce com ticket confirmado` | `pty-process-manager.cjs`, `pty-ipc-handlers.cjs` (+tests) | `npm test` |
| 22 | `feat(contas): remover conta com terminal vivo pede confirmação e limpa a cadeia` | `cli-account-ipc-handlers.cjs`, `cli-account-store.cjs`, chamador no renderer (+tests) | node + vitest |
| 23 | `feat(uso): abas Cadeia e Trocas no painel Limites e uso` | `AgentUsagePanel.tsx`, `tools/AccountChainSection.tsx`, `tools/AccountSwitchHistory.tsx`, `hooks/useAccountChain.ts`, `services/account-chain-view.ts` (+vitest) | vitest + lint + build |
| 24 | `feat(canvas): conta automática pela cadeia, selo de conta e modo no bloco` | `AgentConfigFields.tsx`, `useAgentConfig.ts`, `agent-launch-preferences.ts`, `TerminalNode.tsx`, `TerminalDetailsPanel.tsx`, `types.ts`, `new-terminal-options.ts`, `CanvasView.tsx` (+vitest) | vitest + build |
| 25 | `feat(canvas): troca confirmada abre bloco novo com contexto redigido e deixa o antigo parado` | `AccountSwitchDialog.tsx`, `services/account-switch-dialog.ts`, `hooks/useAccountContinuation.ts`, `CanvasView.tsx`, `terminal-handoff.ts`, `useCanvasPersistence.ts`, `NotificationsPanel.tsx`, `HandoffDialog.tsx` (motivo pré-preenchido e `record-manual`) (+vitest) | vitest |
| 26 | `feat(orquestrador): troca de provedor pede confirmação no chat, no spawn e no meio da tarefa` **(muda comportamento)** | `spawn-model-selector.cjs`, `orchestration-runner.cjs`, `ipc-handlers.cjs`, `terminal-event-formatter.cjs`, `preload.cjs`, `chat/types.ts`, `ChatWorkspace.tsx`, `ProviderSwitchRequest.tsx` (+tests) | node + vitest |
| 27 | `test(smoke): cadeia de contas de ponta a ponta com CLI roteirizada no processo principal` | `devtools-fake-cli-pty.cjs` (+test), `main.cjs` (guarda), `scripts/canvas-smoke-contas.cjs`, `scripts/canvas-smoke.cjs` (sessão C) | `npm run test:canvas-smoke` local + CI nos 4 SOs |
| 28 | `test(contas): matriz de falhas injetadas sem troca sozinha, sem repetição infinita e sem segredo` | `accounts/account-chain-faults.test.cjs` | `npm test` |
| 29 | `docs(contas): arquitetura, guia de uso e registro datado da cadeia de contas` | `docs/projeto/ARQUITETURA.md` ("Providers e contas", `:822`), `docs/guias/GUIA-USUARIO.md` (§3 em `:114` e §6 em `:589`), `IA.md` (entrada datada só acrescentada, com a bancada de Modo Performance ligado e desligado, a validação real e o registro do e3c4204 e da rodada Linux com duas contas), `docs/projeto/IA.md` (Resumo de Decisão CONTEXTO/ALTERNATIVAS/DECISÃO/VALIDAÇÃO) | links válidos |
| 30 | `docs(readme): cadeia de contas no README` | `README.md` | revisão |

**Gate antes do push**, em `app/`:
- `npm test`;
- `npm run test:native`;
- `npm run test:frontend`;
- `npm run lint`;
- `npm run build`;
- `npm run benchmark:pty-output:check`;
- `npm run test:canvas-smoke`.

Depois do push, acompanhar o CI até o estado final nos 4 SOs e anotar o SHA de cada commit e a URL do PR.

---

## 15. Riscos e medições

### 15.1 Custo no `onData` (máquina de referência: 2c/4t, HD 520)

- **Desenho:**
  - por pedaço, só `dirty = true`, `lastChunkAt = now()` e um `setTimeout` com `unref` quando ainda não há um. Sem regex, sem cópia e sem alocação;
  - a varredura usa no máximo 4 KiB, no máximo uma vez a cada 400 ms por sessão, com espera máxima de 2 s;
  - pré-filtro `indexOf` antes da taxonomia;
  - a vigia só existe em sessões de agente com padrões (claude, codex, gemini). Shell e Openia não pagam nada além de um `if`.
- **Tetos definidos ANTES de medir** (o `--check` reprova acima deles):
  1. custo extra por pedaço de `atual+vigia` sobre `atual`: p50 ≤ **10%**, no mesmo processo e na mesma rodada;
  2. varredura no pior caso (4 KiB passando no pré-filtro): p95 ≤ **1 ms**;
  3. CPU no pior caso com 20 sessões = 20 × p95(varredura) / 400 ms ≤ **5%** de um núcleo. É calculado e reportado; reprova se passar.
- **Calibração.** Depois da primeira medição na máquina do dono (`npm run benchmark:pty-output -- --sessions=20 --chunks=2000 --iterations=5 --json`), os tetos só podem **baixar**. Subir exige entrada datada no IA.md com o motivo. **[A MEDIR]**
- **Modo Performance.** O modo é do renderer (`app/src/features/shared/performance/performance-mode-storage.ts`), e a vigia fica no main com orçamento fixo. Por isso o modo **não** desliga a vigia, que é segurança de custo e não enfeite. A medição do app com 10 blocos transmitindo e o modo ligado e desligado registra a CPU do processo principal, pela regra "Hardware do Felipe".
- **Checagem de login.** Cada checagem é um processo de CLI [A MEDIR: 4–12 s estimados na máquina fraca]. Tetos: 3 por proposta, 2 simultâneas, nunca periódica, com reuso da amostra do painel.

### 15.2 Outros riscos

1. **Falso positivo no terminal.** O agente pode imprimir texto parecido com limite. Mitigação:
   - só frases inteiras, por provedor, vindas das fixtures, com exclusões;
   - confirmação obrigatória, sem modal;
   - "Não era limite";
   - dedupe.
2. **As fixtures são strings de pacote, não fluxo real de bytes da TUI.** Quebra de linha, truncamento em bloco estreito e repintura do ConPTY podem esconder o banner. O efeito é não detectar, que é fail-closed. Os testes cobrem variantes sintéticas, e a captura real vira task (§16).
3. **O vocabulário muda com a versão da CLI.** O CI não tem as CLIs. O script de extração roda de novo a cada atualização, e as fixtures registram a versão. Um provedor sem padrões fica sem detecção declarada no painel.
4. **Retomada automática do Claude na conta antiga.** Pode pôr dois agentes no mesmo trabalho. O app avisa e registra (`source_auto_resume_at`), mas não escreve no terminal. Cancelar com Esc vira task, depois de medir.
5. **Checagem de login só local [INFERIDO].** Mitigação: o texto diz "checagem local" e há `post_switch_failure`.
6. **Remover as credenciais herdadas** muda o comportamento de quem usa perfil e chave de API de propósito. O aviso fica no GUIA e o painel mostra os nomes das variáveis.
7. **Orquestrador parado esperando decisão.** Mitigação: 10 min e depois recusa pela varredura existente, respostas idempotentes e `RUN_FINISHED`.
8. **Mudança de classificação no orquestrador.** O 429 solto e o `no_login` com prazo mudam. A tabela do §5.6 vira teste de regressão, e a mudança fica registrada.
9. **Comparação de capacidade entre provedores é heurística.** O diálogo mostra os números e a fonte.
10. **Colisão de refresh de token** entre a checagem e uma sessão viva no mesmo perfil (não medida). Mitigação: dedupe por conta e checagem nunca periódica. Vira task de medição.
11. **Concorrência entre dois Felixo no mesmo perfil.** Mitigação: CAS, índice parcial único e teste multiprocesso.
12. **Tempo do smoke no Windows** (teto de 10 min). Mitigação: roteiro mínimo e medição no PR.
13. **Escopo grande num PR** (30 commits). Mitigação: a cadeia desligada mantém o comportamento até a pessoa ligar. As mudanças visíveis são correções ou decisões do dono, marcadas nos commits.

---

## 16. Fora do escopo e tasks a abrir (Etapa 11)

**Descartado pelo dono (não reabrir):** troca automática sem confirmação, teto de gasto pré-autorizado, migração de sessão viva e relançar o mesmo bloco em outra conta.

**Tasks novas:**
1. **Gemini: checagem de login por conta.** Destrava o Gemini na cadeia sem mudar a política.
2. **Claude: cancelar a continuação automática do terminal antigo com consentimento** (Esc uma vez, só com clique explícito), depois de medir numa sessão real.
3. **Capturar o fluxo real de bytes do banner de limite** em Linux, macOS e Windows (ConPTY), para testar a detecção sobre a renderização real da TUI.
4. **Openia: detecção de falta de crédito na saída da CLI**, quando existir mensagem própria ou fixture da interface executada.
5. **Medir a colisão de refresh de token** com duas sessões, ou checagem + sessão, na mesma pasta de perfil.
6. **Redigir segredos também na "Passar responsabilidade" manual** (hoje só a continuação da cadeia redige).
7. **Aplicar em código `maxCostEstimate` e `requireConfirmationForSensitiveActions`** do orquestrador.
8. **Orquestrador usando contas próprias da cadeia.**
9. **Confirmação de custo na geração de imagem e no ditado**, que cobram por uso fora da cadeia.
10. **Troca proativa por limiar de uso** (por exemplo, usado ≥ 95%) antes da falha. Hoje a cadeia só reage.
11. **Códigos estruturados das CLIs** (`payload.error` do Claude stream-json, erros do app-server do Codex, `stopReason` do ACP) como fonte primária da taxonomia na origem `fluxo`.
12. **Preferência de conta por provedor no configurador** (`accountByProvider`).
13. **Novidade da cadeia no catálogo de onboarding.**

**Tasks existentes relacionadas (relacionar, não duplicar):**
- **Medição de uso por conta sob demanda** (3e691f95-497e-812e): destrava "Mais quota" com medição automática, limitada, dos candidatos no momento da proposta.
- **Validação com contas reais no macOS e no Windows** (3da91f95-497e-815e).
- **Pendência do `allowScripts` do Electron** (registrada à parte durante a investigação), sem relação com a cadeia.

**Irmãs cobertas por este plano:** ao concluir, marcar como concluídas com a evidência dos commits:
- 3e691f95-497e-8194 (failover no PTY);
- 3ce91f95-497e-818a (isolamento);
- 3ce91f95-497e-81ac (falhas injetadas);
- 3ce91f95-497e-812c (retomada).

A diferença registrada na 8194: por decisão do dono, o processo antigo fica parado e intacto, em vez de pausar ou terminar.

---

## Apêndice A. Critério de pronto (aceite e prova)

| Aceite | Prova |
|---|---|
| Conta sem credencial ou checagem não entra | `account-chain-policy.test.cjs` (razões 1–10), `account-eligibility.test.cjs`, Gemini travado, smoke passo 3 |
| A troca tem motivo e timestamp | `account_switch_events` (`detected_at`, `proposed_at`, `decided_at`, `spawned_at`, `failure_class`, `reason`); aba Trocas; smoke passo 8; `kind:'provider_switch'` para o orquestrador |
| Limite não é confundido com rede | taxonomia + matriz (ECONNRESET, "stream disconnected", 529 e capacidade não geram espera nem proposta); smoke passo 11 |
| A pessoa fixa a conta ou desliga a cadeia | `accountMode` (padrão fixo), [Fixar nesta conta] / [Voltar para a cadeia], toggle global; smoke passos 2 e 4 |
| A sessão ativa tem comportamento definido | reattach por conta, processo antigo intacto, bloco novo com contexto redigido, aviso de retomada automática; smoke passo 7 |
| Sem failover entre contas pessoais sem confirmação de custo | trava no serviço (ticket), diálogo com cobrança e tamanho do contexto, queda silenciosa corrigida, orquestrador confirmando; I8 e smoke passos 6, 7, 9 e 13 |

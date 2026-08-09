# Auditoria de Código e Segurança — Felixo AI Core

> **Data**: 08/08/2026 · **Escopo**: repositório inteiro (código de produção)
> **Método**: leitura direta do código. Toda afirmação aqui está ancorada em `arquivo:linha`.
> **Commit base**: `2b92f75`

---

## 1. Sumário executivo

O projeto está em estado **melhor do que a premissa da auditoria supunha**. A expectativa era encontrar
um sistema construído em blocos desconexos, com duplicação ampla e falhas de segurança; o que existe é
um backend Electron com fronteiras razoavelmente respeitadas, SQL 100% parametrizado, execução de
processos sem shell na maior parte dos casos, e nenhuma dependência com CVE conhecido (`npm audit`: 0).
Não foi encontrado segredo em código, nem SQL injection, nem `catch` vazio, nem promise flutuante.

Os três problemas estruturais reais são: (1) **funções e componentes "faz-tudo"** — `sendCliRequest`
tem ~570 linhas aninhadas dentro de uma função de ~790 (`ipc-handlers.cjs:82-871`), e `CanvasView.tsx`
concentra 54 hooks em 1611 linhas; (2) **duplicação de utilitário trivial** — `toErrorResult` está
copiado byte a byte em 9 arquivos; (3) **colisão de nome com semânticas divergentes** —
`normalizePositiveInteger` existe 2x no mesmo processo com contratos de erro opostos.

O maior risco de segurança é **SEC-01**: o `.env` não está no `.gitignore` embora o `.env.example`
instrua explicitamente a criá-lo. Nada vazou até hoje (histórico verificado, limpo), e as variáveis
documentadas hoje não são segredos — por isso é Média, não Crítica. Mas é uma armadilha armada: o dia
em que alguém colocar um `GH_TOKEN` ali, o commit passa sem resistência.

---

## 2. Mapa de arquitetura

### Módulos de topo

| Módulo | Responsabilidade | Entrada |
|---|---|---|
| `start_app.py` + `felixo_launcher/` | Menu interativo cross-platform: instala deps, resolve Node, sobe o app | `python start_app.py` |
| `app/electron/` | Processo principal: IPC, spawn de CLIs/PTY, SQLite, janelas | `electron/main.cjs` |
| `app/electron/services/` | 53 arquivos: um serviço por responsabilidade (IPC handlers, adapters, orquestração) | — |
| `app/electron/services/storage/` | Repositórios SQLite + migrações versionadas | `sqlite-database.cjs` |
| `app/src/features/chat/` | UI de chat, orquestração de modelos, storages de migração | `ChatWorkspace.tsx` |
| `app/src/features/canvas/` | Canvas React Flow: blocos de terminal/nota/arquivo/grupo/página web | `CanvasView.tsx` |
| `app/electron/preload.cjs` | Única ponte renderer↔main (`contextBridge`, 189 linhas) | — |

### Fluxo e fronteiras

```mermaid
flowchart TD
    L["start_app.py<br/>(launcher Python)"] --> M

    subgraph MAIN["Processo principal (Node/Electron)"]
        M["main.cjs<br/>entrypoint"] --> W["main-window.cjs<br/>webPreferences seguras"]
        M --> IPC["79 handlers ipcMain.handle<br/>em services/*-ipc-handlers.cjs"]
        IPC --> SVC["Serviços de domínio<br/>git-service · pty-process-manager<br/>orchestration-runner · adapters"]
        SVC --> DB[("SQLite<br/>storage/*-repository.cjs<br/>migrações versionadas")]
        SVC --> EXT["Processos externos<br/>execFile git · node-pty CLIs"]
    end

    subgraph REND["Renderer (React + Vite, sandbox)"]
        CW["ChatWorkspace.tsx"]
        CV["CanvasView.tsx"]
        WV["WebpageNode.tsx<br/>&lt;webview&gt;"]
    end

    W -.->|carrega| REND
    REND -->|"window.felixo.*"| PRE["preload.cjs<br/>contextBridge"]
    PRE -->|ipcRenderer.invoke| IPC
    IPC -.->|"webContents.send"| REND
    WV -->|did-attach-webview| WVL["webview-lifecycle.cjs"]

    style DB fill:#1e3a5f,color:#fff
    style PRE fill:#4a3800,color:#fff
    style EXT fill:#5f1e1e,color:#fff
```

**A fronteira principal está bem desenhada**: o renderer não tem acesso a Node
(`window-options.cjs:16-18` — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`),
e tudo passa pelo `preload.cjs`. A camada de storage é isolada em repositórios; nenhum SQL vaza
para a UI.

**Onde a fronteira está furada**: `ipc-handlers.cjs` mistura registro de IPC, regra de orquestração,
normalização de entrada e formatação de evento no mesmo arquivo (ver ARQ-01).

---

## 3. Achados

| ID | Severidade | Confiança | Área | Resumo | Status |
|---|---|---|---|---|---|
| SEC-01 | Média | Confirmado | Config | `.env` não ignorado, com `.env.example` mandando criá-lo | ✅ Corrigido |
| SEC-02 | Baixa | Confirmado | Electron | Popup do webview não restringe suas próprias novas janelas | ✅ Corrigido |
| PRIV-01 | Média | Confirmado | Dados | Títulos de conversa pessoais versionados em repo open source | ✅ Corrigido — expurgado do histórico (seção 3.1) |
| ARQ-01 | Alta | Confirmado | Backend | `sendCliRequest`: ~570 linhas dentro de função de ~790 | ⏸️ Aberto (Fase 2) |
| ARQ-02 | Média | Confirmado | Frontend | `CanvasView.tsx`: 1611 linhas, 54 hooks, 37 imports | ⏸️ Aberto (Fase 2) |
| DUP-01 | Média | Confirmado | Backend | `toErrorResult` idêntico em 9 arquivos | ✅ Corrigido |
| DUP-02 | Baixa | Confirmado | Backend | `normalizePositiveInteger` 2x com semânticas opostas | ✅ Corrigido |
| DEAD-01 | Baixa | Confirmado | Frontend | 3 exports sem nenhum uso | ✅ Corrigido |

> **Correções aplicadas nesta sessão** — Fases 0 e 1 completas:
> - `ce878a1` — SEC-01 + PRIV-01 (`.gitignore` e remoção de `recentItems`)
> - `e8518d9` — SEC-02 (política recursiva de novas janelas + 3 testes)
> - `8c2e7d3` — DUP-01, DUP-02, DEAD-01 (consolidação, sem mudança de comportamento)
>
> A Fase 2 (ARQ-01, ARQ-02) permanece **aberta por decisão explícita** — são as duas mudanças
> capazes de quebrar comportamento silenciosamente e nenhuma tem hoje rede de testes que pegue a
> regressão. Validação após as correções: `tsc -b` limpo, **428/428 testes passando**.

---

### SEC-01 — `.env` fora do `.gitignore`

- **Severidade**: Média · **Confiança**: Confirmado
- **Local**: `.gitignore:1-6` · `.env.example:3` · `app/.gitignore:13`
- **Problema**: o `.env.example:3` instrui "Copie este arquivo para `.env`", mas nenhum `.gitignore`
  cobre `.env`.
- **Verificação executada**:
  ```
  .env             -> NAO IGNORADO
  app/.env         -> NAO IGNORADO
  .env.local       -> NAO IGNORADO
  app/.env.local   -> IGNORADO   (acidental, via `*.local` em app/.gitignore:13)
  ```
  Histórico verificado com `git log --all --diff-filter=A`: `.env` **nunca** foi commitado.
- **Cenário de falha**: o usuário segue a instrução do `.env.example`, cria `.env`, e mais tarde
  adiciona um `GH_TOKEN` (usado por `npm run publish:github`, ver `docs/_legado/projeto/DISTRIBUICAO-E-ATUALIZACOES.md:69`).
  Um `git add -A` — usado rotineiramente neste repo — comita o token para um repositório público.
- **Por que não é Crítica**: as variáveis hoje documentadas em `.env.example` são caminhos e flags
  (`FELIXO_CLI_PATHS`, `FELIXO_SHELL`, `FELIXO_NODE_BIN`…), não segredos; e o CI usa
  `secrets.GITHUB_TOKEN` com `permissions: contents: write` (`.github/workflows/release.yml:8-9,32`),
  sem depender de `.env`.
- **Correção proposta** (menor diff): acrescentar ao `.gitignore` da raiz:
  ```
  .env
  .env.*
  !.env.example
  ```

---

### SEC-02 — Popup do webview não restringe novas janelas em cascata

- **Severidade**: Baixa · **Confiança**: Confirmado
- **Local**: `app/electron/services/webview-lifecycle.cjs:35-45`
- **Problema**: quando um `window.open()` dentro do bloco de Página Web é permitido, a janela filha
  recebe `webPreferences` seguras, mas **não** recebe um `setWindowOpenHandler` próprio.
- **Cenário de falha**: usuário abre um site hostil no bloco → o site abre um popup (permitido, é o
  fluxo de login) → esse popup chama `window.open()` repetidamente e cada chamada cria uma
  `BrowserWindow` sem qualquer política, até esgotar a janela do usuário. Comparação: a janela
  principal está protegida (`main-window.cjs:10` → `denyExternalWindowOpen`), o popup não.
- **Nota de honestidade**: esta é uma lacuna do código que **eu mesmo escrevi** nesta sessão
  (commits `e68d09f`/`2b92f75`). Não é herdada.
- **Correção proposta**: no `did-attach-webview`, após permitir, aplicar o mesmo handler ao
  `webContents` da janela criada — via o evento `did-create-window` do guest — ou usar
  `createWindow` para instanciar a `BrowserWindow` já com handler registrado.

---

### PRIV-01 — Dados pessoais em mock versionado

- **Severidade**: Média · **Confiança**: Confirmado
- **Local**: `app/src/features/chat/data/models.ts:58-71` (no commit auditado)
- **Problema**: `recentItems` era um array de 12 títulos de conversas reais, versionado num
  repositório público. Vários tratavam de assuntos pessoais — situação financeira, vida acadêmica e
  consumo pessoal. Os valores não são reproduzidos aqui: um relatório de segurança não deve
  recopiar o dado que aponta como exposto, ainda mais estando ele mesmo versionado.
- **Cenário de falha**: já materializado — o dado ficou público por ~3,5 meses (desde `aee9b50`,
  28/04/2026), em `main` e `production`, e chegou a existir em 10 arquivos de
  `app/src/features/chat/` ao longo do histórico, não só em `models.ts`.
- **Agravante**: o export era **código morto** (ver DEAD-01) — `ChatWorkspace.tsx:3-7` importa
  apenas `initialModels`, `ideaStarters` e `quickPrompts`. O dado não servia a nada.
- **Correção aplicada**: removido do `HEAD` (`ce878a1`) e, por decisão do dono do projeto,
  **expurgado do histórico** com `git filter-repo --replace-text`, substituindo cada título por um
  rótulo genérico em todos os commits e arquivos onde apareceu. Ver seção 7 para o procedimento e
  as limitações do expurgo.

---

### ARQ-01 — `sendCliRequest`: função de ~570 linhas dentro de outra de ~790

- **Severidade**: Alta · **Confiança**: Confirmado
- **Local**: `app/electron/services/ipc-handlers.cjs:82-871` (`registerCliIpcHandlers`),
  com `sendCliRequest` em `:158-727` (linhas 77→646 relativas)
- **Problema**: um único closure concentra registro de IPC, ciclo de vida de sessão, política de
  orquestração, normalização de entrada e emissão de eventos. O arquivo tem 1177 linhas.
- **Cenário de falha**: não é um bug hoje — é custo de mudança. Qualquer alteração no fluxo de envio
  exige entender ~570 linhas de estado compartilhado por closure, sem ponto de teste isolado: a
  função não é exportada, então só é testável através do IPC inteiro.
- **Evidência de contraste**: o mesmo repositório tem o padrão certo em `git-service.cjs`, onde a
  lógica pura (`assertAllowedGitArgs`, `normalizeCommitMessage`) é exportada e testada isoladamente.
- **Correção proposta**: extrair de `sendCliRequest` os blocos puros (normalização de modelos,
  decisão de limites de orquestração) para um módulo `cli-request-policy.cjs` exportado e testável,
  mantendo no handler apenas a orquestração de efeitos. Refatoração incremental, não reescrita.

---

### ARQ-02 — `CanvasView.tsx` como componente "faz-tudo"

- **Severidade**: Média · **Confiança**: Confirmado
- **Local**: `app/src/features/canvas/components/CanvasView.tsx` (1611 linhas, 54 hooks, 37 imports)
- **Problema**: concentra estado do canvas, persistência, orquestração de terminais, edges, grupos,
  notificações e a injeção de handlers por tipo de node (`:811-900`).
- **Cenário de falha**: custo de mudança e risco de regressão por re-render. Relevante especialmente
  no hardware alvo (notebook modesto) — cada mudança de `nodes` recalcula o `useMemo` de 90 linhas
  em `:811-900`, que já precisou de um cache manual (`reuseData`) para não recriar `data` de todo
  node a cada render.
- **Correção proposta**: extrair a injeção de handlers por tipo (`:811-900`) para um hook próprio
  (`useRenderedNodes`), que é a fatia mais autocontida e a que mais cresce quando um novo tipo de
  bloco é adicionado.

---

### DUP-01 — `toErrorResult` copiado em 9 arquivos

- **Severidade**: Média · **Confiança**: Confirmado
- **Local** (todos idênticos, hash `02b8e840fec13e87092c54577b133bea`):
  `notes-ipc-handlers.cjs:43` · `models-ipc-handlers.cjs:36` · `system-design-ipc-handlers.cjs:177` ·
  `pty-ipc-handlers.cjs:104` · `canvas-ipc-handlers.cjs:268` · `projects-ipc-handlers.cjs:293` ·
  `automations-ipc-handlers.cjs:36` · `canvas-files-ipc-handlers.cjs:212` ·
  `chat-history-ipc-handlers.cjs:56`
- **Problema**: o helper que padroniza a resposta de erro de **todo** IPC está duplicado 9 vezes.
- **Cenário de falha**: o contrato de erro do app é definido em 9 lugares. Mudar o formato (ex.:
  incluir um `code`) exige 9 edições coordenadas; esquecer uma cria divergência silenciosa de
  contrato entre canais IPC — exatamente o tipo de inconsistência que o
  `DESIGN_SYSTEM_BACKEND.md` §2.3 ("contratos previsíveis") existe para evitar.
- **Correção proposta**: extrair para `electron/services/ipc-result.cjs` e importar nos 9.
  Baixo risco: função pura, sem estado, com assinatura idêntica em todos os pontos.

---

### DUP-02 — `normalizePositiveInteger` com duas semânticas no mesmo processo

- **Severidade**: Baixa · **Confiança**: Confirmado
- **Local**: `electron/services/orchestration/orchestration-store.cjs:387` e
  `electron/services/ipc-handlers.cjs:1126` (+ uma terceira em
  `src/features/chat/services/orchestrator-settings-storage.ts:493`, aceitável por ser outra camada)
- **Problema**: mesmo nome, contratos **opostos** em caso de valor inválido:
  - `orchestration-store.cjs:392` → **lança** `OrchestrationStoreError`
  - `ipc-handlers.cjs:1127` → **retorna** `undefined`
- **Cenário de falha**: quem lê `normalizePositiveInteger(x)` em `ipc-handlers.cjs` e assume o
  comportamento da outra (ou vice-versa) escreve tratamento de erro errado — um `try/catch` que nunca
  dispara, ou um `if (!value)` que nunca protege.
- **Correção proposta**: renomear conforme o contrato — `requirePositiveInteger` (lança) e
  `toPositiveIntegerOrUndefined` (retorna). Não unificar: as duas semânticas são legítimas nos seus
  contextos; o problema é o nome compartilhado.

---

### DEAD-01 — Exports sem nenhum uso

- **Severidade**: Baixa · **Confiança**: Confirmado (busca em `src/`, `electron/`, `tests/`)
- **Local**:
  - `src/features/chat/data/models.ts:58` — `recentItems` (ver PRIV-01)
  - `src/features/chat/hooks/useOrchestrationDashboard.ts:233` — `ORCHESTRATION_DASHBOARD_EMPTY`
  - `src/features/chat/services/model-storage.ts:164` — `normalizeCliType`
- **Verificação**: cada um tem exatamente **1 ocorrência** no repositório inteiro (a própria
  definição). Confirmado com `grep -rn` sobre `src/`, `electron/` e `tests/`.
- **Cenário de falha**: não quebra nada. Custo é de leitura — código morto sugere que existe um
  consumidor, e quem for mexer perde tempo procurando.
- **Correção proposta**: remover os três.

> **Falsos positivos descartados** (mantidos aqui para não serem reinvestigados): `DEFAULT_NOTE_COLOR`,
> `NOTE_THEMES`, `buildAgentIdentityPrompt`, `MAX_HANDOFF_TRANSCRIPT_CHARS` aparecem como "sem uso
> externo" mas **são usados dentro do próprio arquivo** — o `export` é dispensável, não morto.

---

## 3.1 Expurgo do histórico (PRIV-01) — procedimento e limitações

Executado a pedido do dono do projeto, depois de apresentado o custo/benefício.

**Procedimento**:
1. Backup espelho completo do repositório antes de qualquer escrita.
2. Correção do próprio relatório, que citava três dos títulos como evidência e os
   reintroduziria no `HEAD` (commit `e65df2b`, pré-expurgo).
3. `git filter-repo --replace-text`, substituindo cada um dos 12 títulos por um rótulo genérico
   (`Exemplo de conversa N`). Escolhido em vez de remover o arquivo: `models.ts` contém código
   legítimo que deve permanecer no histórico, e o dado havia passado por **10 arquivos** de
   `app/src/features/chat/` ao longo do tempo — remover só `models.ts` não teria bastado.
4. `--force-with-lease` em `main` e `production`, mais a tag `v0.1.1` (reescrita junto).

**Verificação**: busca por cada título em `git log --all -S` retorna zero ocorrências, tanto no
repositório local quanto em **clone fresco do GitHub**. A contagem de commits bate com o backup
(478 + 1 novo = 479), `git fsck` sem erros, `tsc -b` limpo e 428/428 testes passando. O diff entre
o histórico antigo e o novo é exatamente as 12 linhas — nenhum outro conteúdo mudou.

**O que o expurgo NÃO resolveu** (limitação inerente, não falha de execução):
- O fork `flaviavs-commits/Felixo-AI-Core` mantém o histórico antigo com o dado original. Se a
  conta for do próprio dono, dá para limpar da mesma forma; se não for, o dado permanece fora
  do seu controle.
- Objetos órfãos podem persistir no cache do GitHub por tempo indeterminado. É possível pedir
  coleta de lixo ao suporte do GitHub caso o dado seja sensível o bastante para justificar.
- Clones locais feitos antes desta data seguem com o histórico antigo.

---

## 4. Plano de remediação

### Fase 0 — Parar o sangramento ✅ concluída

| Item | Esforço | Risco de regressão | Como foi validado |
|---|---|---|---|
| SEC-01 — `.env` no `.gitignore` | P | Nenhum | `git check-ignore` confirma `.env`, `app/.env`, `.env.*` ignorados e `.env.example` preservado |
| PRIV-01 — remover `recentItems` do `HEAD` | P | Nenhum (era morto) | `tsc -b` limpo; `ChatWorkspace.tsx:3-7` importa só os 3 exports restantes |
| PRIV-01 — expurgar do histórico | M | Nenhum no código; quebra clones/fork | Ver seção 3.1: verificado em clone fresco do remoto |

### Fase 1 — Consolidação barata ✅ concluída

| Item | Esforço | Risco de regressão | Como foi validado |
|---|---|---|---|
| DEAD-01 — remover 3 exports mortos | P | Nenhum | `tsc -b` limpo (acusaria qualquer uso que o grep perdesse) |
| DUP-01 — extrair `toErrorResult` | P | Baixo | Novo `electron/services/ipc-result.cjs`; 9 arquivos passam a importar. Teste existente em `pty-ipc-handlers.test.cjs:82` agora exercita a implementação única |
| SEC-02 — política recursiva de janelas | P | Baixo | 3 testes novos em `webview-lifecycle.test.cjs` cobrindo deny in-place, allow sem navegar o opener, e herança pelo popup |
| DUP-02 — renomear por contrato | P | Baixo | `requirePositiveInteger` (lança) vs `toPositiveIntegerOrUndefined` (retorna); ambas privadas, sem consumidor externo |

### Fase 2 — Refatoração estrutural

| Item | Esforço | Risco de regressão | O que testar antes |
|---|---|---|---|
| ARQ-01 — extrair política de `sendCliRequest` | G | **Alto** | Precisa de teste de caracterização do fluxo `cli:send` **antes** de mover qualquer linha |
| ARQ-02 — extrair `useRenderedNodes` | M | Médio | Teste manual dos 5 tipos de bloco + persistência entre restarts |

> Fase 2 não deve ser feita sem acompanhamento. São as únicas mudanças da lista capazes de quebrar
> comportamento silenciosamente, e nenhuma das duas tem hoje rede de testes que pegue a regressão.

---

## 5. Perguntas em aberto

Todas as três perguntas originais foram respondidas pelo dono do projeto. Registradas aqui com o
desfecho, e o que sobrou de cada uma:

1. ~~**PRIV-01 / histórico**~~ → **Resolvido**: expurgo autorizado e executado (seção 3.1). Sobrou
   uma ação fora do escopo desta auditoria: **limpar o fork `flaviavs-commits/Felixo-AI-Core`**,
   que mantém o histórico antigo. Se a conta for do próprio dono, o mesmo procedimento se aplica.
2. ~~**ARQ-01**~~ → **Resolvido**: refatoração autorizada, com exigência explícita de TDD.
3. ~~**`.env` na raiz vs `app/`**~~ → **A premissa da pergunta estava errada.** Investigando para
   responder, descobri que **nenhum processo carrega `.env`**: não há `dotenv` no Node nem
   `load_dotenv` no Python. O `.env.example` documentava um mecanismo inexistente — copiá-lo para
   `.env` não teria efeito nenhum. A configuração real é o menu do `start_app.py`, que grava
   `.felixo-start-config.json` (já gitignorado) e o aplica ao ambiente em
   `felixo_launcher/runner.py:92` via `apply_config_to_env`. O exemplo foi corrigido para apontar
   o caminho que funciona; o `.gitignore` mantém `.env` coberto como rede de segurança.

---

## 5.1 Segunda passada — `orchestration-runner` e `persistent-cli-session`

Os dois maiores arquivos de lógica que a primeira passada não leu linha a linha foram auditados
depois. Achados abaixo, com a severidade **revista por verificação direta** — dois deles vieram da
auditoria superestimados e foram rebaixados após teste.

| ID | Severidade | Confiança | Local | Resumo | Status |
|---|---|---|---|---|---|
| BUG-03 | Baixa | Confirmado | `orchestration-runner.cjs:403` | `cliType` chegava `undefined` na detecção de disponibilidade | ✅ Corrigido (`2de8b0f`) |
| RACE-01 | Alta | Provável | `orchestration-runner.cjs:504-516` | Respawn de fallback reusa o `threadId` sem marcar o job | ✅ Corrigido (`6156e89`) |
| BUG-01 | Média | Confirmado | `orchestration-runner.cjs:614` | `failExpiredRuns()` nunca é chamado em produção | ✅ Corrigido (`049e460`) |
| LEAK-01 | Média | Confirmado | `orchestration-store.cjs:91` | Runs concluídos nunca saem do store | ✅ Corrigido (`6156e89`) |
| LEAK-02 | Média | Confirmado | `persistent-cli-session.cjs:412-429` | `deferredPromptFallbackTimer` sobrevive ao fim da sessão | ✅ Corrigido (`049e460`) |
| RACE-03 | — | **Descartado** | `persistent-cli-session.cjs:323-326` | `stdoutGuard` não é drenado no `close` | ❌ Não é bug — ver abaixo |
| RACE-02 | Média | Provável | `persistent-cli-session.cjs:78,119` | Guard `activeRun` checado antes do spawn, atribuído depois | ⏸️ Aberto |
| BUG-02 | Média | Confirmado | `orchestration-runner.cjs:578` | `maxTurns` esgotado falha o run em vez de sintetizar | ⏸️ Aberto |

**RACE-03 foi descartado por verificação.** O guard só bufferiza até a primeira
inspeção: no primeiro caractere não-branco ele despeja o buffer e todo chunk seguinte passa
direto. O único caso de retenção é uma saída composta *apenas* de espaço em branco — que o
line-reader descartaria de qualquer forma. Não há perda de dado real, e o `flush()` do
line-reader (esse sim existente) é chamado tanto em `end` quanto em `close`.

**Por que RACE-02 e BUG-02 seguem abertos.** RACE-02 depende de duas chamadas concorrentes
com o mesmo `threadId` se intercalarem entre a checagem e a atribuição de `activeRun`; o
gatilho mais plausível era a dupla reinvocação da RACE-01, agora corrigida, então o cenário
pode ter deixado de ser alcançável — verificar isso exige reproduzir a corrida, não ler o
código. BUG-02 não é defeito técnico e sim decisão de produto: hoje, esgotar `maxTurns`
falha o run e descarta o trabalho dos agentes; sintetizar uma resposta final com o que já
existe é comportamento diferente, e quem decide isso é o dono do projeto.

**Sobre o BUG-03 e a disciplina anti-ruído.** A auditoria o classificou como Média, alegando que o
`undefined` impedia o fallback de reconhecer erros específicos por provedor. Verifiquei rodando
`detectAvailabilityIssue` com e sem `cliType` sobre as mensagens de limite reais: **nenhuma** muda
o fato de o fallback disparar — o provedor altera apenas `scope` e `cooldown`, que o chamador
descarta (`if (!issue)`). O registro persistido também não dependia disso, porque `recordError`
refaz a própria detecção com o `cliType` certo. É defeito real de código, mas de impacto nulo
hoje: rebaixado para **Baixa** e corrigido pelo valor preventivo.

Também escrevi um teste que **passava com e sem a correção** e o descartei em vez de mantê-lo —
ele media `recordError`, que nunca teve o bug. Um teste que não falha na presença do defeito não
protege nada.

**Por que RACE-01/02/03, BUG-01/02 e LEAK-01/02 ficaram abertos.** São mudanças em concorrência e
ciclo de vida de processos de longa duração: janelas de reentrância, ordem de eventos entre `close`
e flush de stdout, e política de expiração de runs. Diferente das extrações desta sessão, não têm
como ser validadas por teste de caracterização sozinho — exigem reproduzir a corrida. Aplicá-las
sem acompanhamento trocaria um defeito latente por um defeito imediato.

Recomendação de ordem, por risco eliminado ÷ esforço: **BUG-01** (um `setInterval` com `unref`
resolve um run que trava para sempre), **LEAK-02** (falta `clearDeferredPromptFallback` em dois
pontos), **LEAK-01** (evict FIFO no store), depois **BUG-02**, e por fim as três races, que pedem
teste dedicado antes.

---

## 5.2 Terceira passada — restante de `electron/services` e o launcher Python

Cobre os arquivos de tamanho médio de `electron/services/` e as ~2167 linhas do
`felixo_launcher/`, que as passadas anteriores só tinham varrido por segurança.

### `electron/services/`

| ID | Severidade | Local | Resumo | Status |
|---|---|---|---|---|
| AVAIL-01 | **Alta** | `model-availability.cjs:130-152` | `done` de um modelo apagava o limite de toda a CLI | ✅ Corrigido (`27b7799`) |
| AVAIL-02 | Baixa | `model-availability.cjs:286-288` | Regex de reset não casava "reset **at** 3pm" | ✅ Corrigido (`27b7799`) |
| SEC-03 | Baixa | `system-design-service.cjs:39` | `git clone` sem `--` antes de uma URL configurável | ✅ Corrigido (`27b7799`) |
| LEAK-03 | Baixa | `pty-process-manager.cjs:313` | `killTimer` seguia armado após o processo morrer | ✅ Corrigido (`27b7799`) |

**AVAIL-01 é o achado mais grave desta rodada e foi reproduzido antes de corrigir:** com o
limite de uso da Claude ativo em um modelo, o `done` de qualquer outro modelo do mesmo provedor
zerava o registro cli-wide. O seletor voltava a considerar o modelo esgotado operacional,
respawnava nele, tomava o mesmo erro — queimando turnos de orquestração em vez de migrar de
provedor.

### `felixo_launcher/`

| ID | Severidade | Local | Resumo | Status |
|---|---|---|---|---|
| LAUNCH-01 | Alta | `runner.py:74-92` | `FELIXO_NODE_BIN` salvo no menu era ignorado | ✅ Corrigido (`1dd9fb0`) |
| LAUNCH-02 | Alta | `git.py:141-151`, `menu.py:298` | Saída do git decodificada pelo locale (quebra no Windows) | ✅ Corrigido (`1dd9fb0`) |
| LAUNCH-03 | Média-Alta | `process.py:185-191` | Limpeza matava editor aberto em `node_modules` | ✅ Corrigido (`1dd9fb0`) |
| LAUNCH-04 | Média-Alta | `commands.py:132-142` | Ctrl+C no Windows deixava Electron/vite órfãos | ✅ Corrigido (`1dd9fb0`) |

**LAUNCH-03 violava uma promessa escrita no próprio código.** O docstring de
`cleanup_app_processes` diz que só processos cujo comando *nomeia um binário que iniciamos* são
elegíveis, mas o filtro aceitava qualquer menção — e `.../node_modules/vite/...` já contém
`/vite`. Um `vim` aberto num arquivo dessa pasta recebia SIGTERM e, 1s depois, SIGKILL, com
perda de trabalho não salvo. O filtro passou a exigir o executável no `argv[0]` (ou no script,
quando o `argv[0]` é um runtime nosso).

**LAUNCH-02 quebrava antes de o app abrir.** `text=True` sem `encoding=` usa o locale — cp1252
num Windows pt-BR. Uma branch acentuada levanta `UnicodeDecodeError`, que é subclasse de
`ValueError` e por isso escapava dos `except (OSError, CalledProcessError)`. Como o auto-update
roda em toda inicialização, o resultado seria um traceback na primeira execução.

**Cobertura da terceira passada:** o auditor do launcher rodou a suíte inteira sob Python 3.9 em
container para confirmar compatibilidade (o CI testa 3.9 e 3.13). Nenhum `shell=True`, `eval`,
download remoto ou escrita de segredo foi encontrado.

---

## 5.3 Validação no app real

As passadas anteriores foram por leitura. Rodar o app empacotado encontrou **dois bugs que
nenhuma suíte pegaria**, ambos invisíveis em desenvolvimento:

| ID | Severidade | Local | Resumo | Status |
|---|---|---|---|---|
| BUILD-01 | **Alta** | `vite.config.ts` | Build de produção abria em branco | ✅ Corrigido (`a63b574`) |
| OAUTH-01 | **Alta** | `WebpageNode.tsx` | `allowpopups` nunca chegava ao DOM | ✅ Corrigido (`5f0dada`) |

**BUILD-01** — o Vite não definia `base`, emitindo assets como `/assets/…`. O app empacotado
carrega o renderer com `loadFile()`, isto é, `file://`, onde um caminho absoluto resolve para a
raiz do disco: o bundle nunca carregava. Existia desde o commit inicial e **só afeta produção** —
em dev o Vite serve por `http://` e o caminho funciona. Coberto por teste que lê o `dist/index.html`
e falha se um asset local voltar a usar caminho absoluto.

**OAUTH-01 explica por que duas correções anteriores do login não funcionaram.** O atributo
`allowpopups`, escrito em JSX, nunca era serializado — `@types/react` o declara como boolean, e o
React não emite atributo booleano em elemento desconhecido. O DOM real mostrava
`allowpopups: false`. Setá-lo por `ref` também não resolve: o Chromium decide se o guest aceita
popups no instante em que o anexa, e nem setar depois nem re-setar `src` revertem — ambos
verificados no app. A saída foi criar o `<webview>` imperativamente, com os atributos definidos
antes do `appendChild`. Verificado no app: `window.open` passou a devolver uma janela em vez de
`null`, e o `did-create-window` do main process dispara.

**Método**: driver Playwright (`_electron`) sobre Xvfb, com `--user-data-dir` isolado para não
tocar no banco do usuário. Um detalhe custou tempo e vale registrar: `ELECTRON_RUN_AS_NODE=1`
vem herdado quando o driver roda de dentro de outro app Electron, e faz o binário rodar como Node
puro — janela vazia e flags do Chromium recusadas, sintoma facilmente confundido com bug do app.

**Validado visualmente**: botão "Página Web" na toolbar, popover com URL + nome, bloco criado
carregando a página de verdade, URL normalizada (`example.com` → `https://example.com/`) e o bloco
listado no dock "Elementos" com o ícone correto.

---

## 6. O que NÃO foi coberto

Em nome da honestidade sobre o alcance desta auditoria:

- **Rodando o app**: a validação no Electron real aconteceu e encontrou dois bugs que nenhuma
  suíte pegaria — o build de produção abrindo em branco (assets absolutos sob `file://`) e o
  `allowpopups` do bloco de Página Web nunca chegando ao DOM, que era a causa real do login OAuth
  bloqueado. Ver seção 5.3.
- **Verificações executadas**: `npm test` (466 passando), `npm run test:frontend` (200 passando),
  `pytest tests/` (89 + 70 subtests), `tsc -b` (limpo), `npm audit` (0 vulns) e `git check-ignore`.
- **A suíte de frontend passou despercebida na primeira passada.** O projeto tem `vitest` e um
  script `test:frontend` com 24 arquivos de teste que eu não estava executando — só rodava
  `npm test`, que cobre apenas os `.cjs` do processo principal. Todas as mudanças de frontend da
  primeira rodada foram validadas só por `tsc -b`. Rodada depois, a suíte passou inteira, mas o
  risco existiu; quem for mexer aqui precisa rodar **as duas**.
- ~~**Cobertura rasa**: `felixo_launcher/`~~ → **auditado na terceira passada** (seção 5.2),
  incluindo execução da suíte sob Python 3.9. `docs/_legado/` segue ignorado por ser documentação
  arquivada.
- ~~**Não auditado**: `orchestration-runner.cjs` e `persistent-cli-session.cjs`~~ → **coberto na
  segunda passada** (seção 5.1). ~~Restam os demais arquivos de `electron/services/`~~ →
  **cobertos na terceira passada** (seção 5.2).
- **Segue sem leitura linha a linha**: o frontend (`app/src/`, ~24k linhas). As três passadas
  focaram no processo principal e no launcher, que são as superfícies com acesso ao SO.
- **Sem análise dinâmica**: não houve fuzzing de IPC, teste de penetração, nem verificação de
  comportamento em runtime.

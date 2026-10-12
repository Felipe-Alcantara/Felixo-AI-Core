# Agente na nuvem — Plano de implementação

> **Para quem executa:** siga as tarefas na ordem; cada passo usa a caixa `- [ ]`.
> Execução nativa (uma pessoa ou agente faz tudo e a branch inteira é revisada ao final).

**Objetivo:** criar o bloco "Agente na nuvem": dispara `claude --cloud` na conta
escolhida, guarda o ID e o link da sessão e oferece follow-up, abrir e trazer
para o terminal local.

**Arquitetura:** nó novo `cloud-session` (cartão de dados, sem terminal) + serviço
no processo principal que roda o `claude` nativo num PTY descartável. Um parser
puro lê a saída. Só um clique confirmado cria sessão.

**Stack:** Electron (CommonJS `.cjs` no main), React + TypeScript no renderer,
SQLite, `node --test` (main) e `vitest` (renderer, só `.ts`).

**Spec:** [`ESPEC-AGENTE-NUVEM.md`](ESPEC-AGENTE-NUVEM.md) (leia junto).

## Restrições globais

- Branch `feat/agente-nuvem` (feature grande + migração de banco). **Nada é
  mesclado em `main` sem confirmação do dono**: `main` publica release sozinha.
- Commits `tipo: descrição` em português, pequenos e coesos, sem caminhos locais,
  e-mail ou IDs de sessão reais. Documentação viva no mesmo passo.
- Comentários e textos de UI em pt-BR acentuado; identificadores em inglês.
- A tarefa e o follow-up chegam ao processo **só como `argv`** (spec I4).
- Direção de dependência: `canvas` → `shared`; bordas (IPC) sem regra de negócio.
- Gate de cada tarefa de código: o teste focado, e no fim `npm test`,
  `npm run test:frontend`, `npm run lint`, `npm run build` (dentro de `app/`).

## Foco da revisão (entradas que o spec não cobre e que podem morder)

1. Saída do PTY quebrada em pedaços ou com quebra de linha em 120 colunas (título
   longo, URL partida entre dois `data`) → o parser ainda acha ID e link.
2. Pasta com acento e espaço (`Programação`, `Meus repositórios`) → executa e
   valida normalmente.
3. Tarefa com quebra de linha, aspas, `%PATH%`, `&`, emoji ou 4001 caracteres →
   chega intacta como `argv` ou é recusada com `invalid-input`, nunca executada
   por um shell.
4. Dois cliques rápidos em Disparar e reabrir o app no meio do disparo → no
   máximo uma sessão; o nó volta como `interrupted`.
5. Conta sem login ou com `ANTHROPIC_API_KEY` no ambiente → erro classificado e
   a chave não vaza para o processo.

---

## Mapa de arquivos

Main (`app/electron/services/`):
- `cloud-session/cloud-session-output.cjs` — parser e classificador puros.
- `cloud-session/cloud-session-input.cjs` — validação de tarefa, follow-up e pasta.
- `cloud-session/cloud-session-executable.cjs` — resolve o `claude` nativo.
- `cloud-session/cloud-session-service.cjs` — `launch`, `followUp`, trava por nó.
- `cloud-session-ipc-handlers.cjs` — `registerCloudSessionIpcHandlers`.
- `storage/migrations/019_canvas_cloud_session_nodes.sql`, `storage/canvas-repository.cjs`.
- `canvas-transfer.cjs` (exportação), `preload.cjs`, `main.cjs`.

Renderer (`app/src/`):
- `features/canvas/types.ts`, `vite-env.d.ts`.
- `features/canvas/services/cloud-session-state.ts` — estado puro do cartão.
- `features/canvas/components/CloudSessionNode.tsx` — o cartão.
- Registro do tipo (padrão do `notionTasks`): `CanvasView.tsx`, `node-geometry.ts`,
  `tools/CanvasToolsMenu.tsx`, `tools/canvas-tool-labels.ts`,
  `tools/TerminalsPanel.tsx`, `canvas-tool-imports.ts`, `canvas-tool-preloaders.ts`,
  `inventory/canvas-inventory.ts`, `inventory/data/nodes.ts`.

Ajuste em relação ao spec: a criação do bloco entra no **menu de ferramentas** (como
o `notionTasks`, que é o padrão de bloco novo), não no menu Agente.

---

### Tarefa 1: Parser e classificador da saída (puro)

**Arquivos:** criar `cloud-session/cloud-session-output.cjs` e
`cloud-session/cloud-session-output.test.cjs` (fixtures em
`cloud-session/__fixtures__/`, com IDs sintéticos `session_01EXEMPLO0000000000000000`).

**Interfaces — produz:**
- `stripAnsi(text: string): string` (cursor `ESC[nC` vira espaço; OSC e CSI somem).
- `parseCloudSessionOutput(raw: string): ParseResult` com
  `ParseResult = { kind: 'created'; session: { id: string; url: string; title: string } } | { kind: 'trust-required' } | { kind: 'incomplete' } | { kind: 'error'; code: CloudSessionErrorCode; message: string }`.
- `isFollowUpSent(raw: string): boolean` (contém `Sent to cloud session.`).
- `isCloudSessionUrl(url: string): boolean` (só `https://claude.ai/code/session_<alnum>` + query opcional).
- `CLOUD_SESSION_ERROR_CODES` (lista congelada dos códigos do spec §6.3).

- [ ] **Passo 1: testes que falham** — `parseCloudSessionOutput` devolve `created` para
  as 3 linhas do spike; reconhece `trust-required` pela frase "Is this a project you
  created or one you trust" sem linha `Created cloud session`; devolve `incomplete`
  para saída vazia ou só com o início; aceita título com acento; **junta URL partida
  por quebra `\r\n` inserida pelo PTY** (Foco 1); rejeita `url` cujo ID difere do
  da linha `Resume with`; `isCloudSessionUrl('https://claude.ai.evil.com/code/session_x')` é `false`;
  `CLOUD_SESSION_ERROR_CODES` está congelada.
- [ ] **Passo 2:** `node --test electron/services/cloud-session/cloud-session-output.test.cjs` → FALHA (módulo ausente).
- [ ] **Passo 3: implementar** as funções acima. Login e limite reaproveitam
  `accounts/cli-failure-patterns.cjs` (ler a API real do arquivo antes de importar).
  Sem correspondência: `unknown` com as últimas 20 linhas passando pela redação
  existente do projeto (localizar o redator usado pelo `qa-logger`).
- [ ] **Passo 4:** mesmo comando → PASSA. Quebre uma regra de propósito (ex.: aceite
  qualquer host) e confirme que o teste correspondente falha.
- [ ] **Passo 5: commit** `feat(nuvem): parser da saída do claude --cloud` .

### Tarefa 2: Validação de entrada e resolução do executável

**Arquivos:** criar `cloud-session/cloud-session-input.cjs`,
`cloud-session/cloud-session-executable.cjs` e os `.test.cjs` de cada um.

**Interfaces — produz:**
- `validateLaunchInput(input: { task: unknown; cwd: unknown }, fsApi?: { statSync }): { ok: true; task: string; cwd: string } | { ok: false; code: 'invalid-input'; message: string }` — tarefa 1 a 4000 caracteres após `trim`, sem NUL; `cwd` existente e diretório.
- `validateFollowUpInput(input: { sessionId: unknown; text: unknown; cwd: unknown }, fsApi?)` — `sessionId` casa `^session_[A-Za-z0-9]+$`, texto 1 a 2000.
- `resolveNativeClaude(opts: { platformName: string; env: Record<string,string>; fsApi?: { existsSync, readFileSync }; whichApi?: (name: string, env) => string | null }): { command: string; viaShell: false } | { command: string; viaShell: true }`.
- `hasShellUnsafeChars(text: string): boolean` — `%`, `"`, `^`, `&`, `|`, `<`, `>` e quebras de linha.

- [ ] **Passo 1: testes que falham** — tarefa vazia, só espaços, 4001 caracteres e com NUL
  são recusadas; 4000 passam; pasta inexistente e arquivo no lugar de pasta são
  recusados; **pasta `P:\Programação\Meus repositórios\x` com acento e espaço passa**
  (Foco 2); `sessionId` com `;` ou `..` é recusado; no Windows, shim `claude.cmd`
  resolve para `…\node_modules\@anthropic-ai\claude-code\bin\claude.exe` quando
  o exe existe (`viaShell: false`); sem o exe, `viaShell: true`; Linux e macOS
  devolvem o comando `claude` direto; `hasShellUnsafeChars` verdadeiro para cada
  caractere da lista (Foco 3).
- [ ] **Passo 2:** `node --test` nos dois arquivos → FALHAM.
- [ ] **Passo 3: implementar.** `resolveNativeClaude` lê o shim `.cmd` com
  `readFileSync` e extrai o caminho do `.exe` da linha que o chama; sem isso,
  devolve o shim com `viaShell: true`.
- [ ] **Passo 4:** PASSAM.
- [ ] **Passo 5: commit** `feat(nuvem): validação de entrada e resolução do claude nativo`.

### Tarefa 3: Serviço de disparo e follow-up

**Arquivos:** criar `cloud-session/cloud-session-service.cjs` e `.test.cjs`
(PTY falso no estilo de `claude-usage-query.test.cjs`).

**Interfaces — consome:** Tarefas 1 e 2; `buildAccountProcessEnv` e `createCliEnv`
(como em `claude-usage-query.cjs:67`); resolvedor de ambiente por conta do
`pty-ipc-handlers.cjs` (localizar e injetar, nunca `accountMode: 'chain'`).
**Produz:** `createCloudSessionService(deps: { spawnPty; execFile; resolveAccountEnv(accountId): Record<string,string>; resolveClaude; now; setTimeoutFn; clearTimeoutFn }): { launch(input: { nodeId: string; task: string; cwd: string; accountId?: string }): Promise<LaunchResult>; followUp(input: { nodeId: string; sessionId: string; text: string; cwd: string; accountId?: string }): Promise<{ ok: true } | { ok: false; code: CloudSessionErrorCode; message: string }> }`, com `LaunchResult = { ok: true; session: { id: string; url: string; title: string } } | { ok: false; code: CloudSessionErrorCode; message: string }` (o `createdAt` é carimbado pelo renderer, em `applyLaunchResult`).

- [ ] **Passo 1: testes que falham** — `launch` chama o PTY com `['--cloud', task]` como
  `argv` e `cwd` correto; **dois `launch` simultâneos do mesmo nó executam uma vez e o
  outro devolve `busy`** (I2, Foco 4); sucesso quando a saída fragmentada em vários
  `data` fecha as 3 linhas; `trust-required` quando aparece a tela de confiança e
  o processo sai; `timeout` mata o PTY após 60 s (relógio injetado) e libera a trava;
  saída com código ≠ 0 sem sessão vira erro classificado; o ambiente passado ao
  PTY **não contém `ANTHROPIC_API_KEY`** mesmo quando existe no ambiente base (I5,
  Foco 5); com `viaShell: true` e `hasShellUnsafeChars(task)` devolve
  `invalid-input` sem criar PTY; `followUp` usa `execFile` com `['-p', text, '--cloud', id]`
  e só dá `ok` com `Sent to cloud session.`; a trava também vale para `followUp`.
- [ ] **Passo 2:** `node --test electron/services/cloud-session/cloud-session-service.test.cjs` → FALHA.
- [ ] **Passo 3: implementar** o serviço; a trava é um `Set` de `nodeId` liberado em
  `finally`. O PTY de `launch` sempre é encerrado ao concluir.
- [ ] **Passo 4:** PASSA. Remova a trava de propósito e confirme que o teste I2 falha.
- [ ] **Passo 5: commit** `feat(nuvem): serviço que cria e acompanha sessões na nuvem`.

### Tarefa 4: IPC, preload e tipos do renderer

**Arquivos:** criar `cloud-session-ipc-handlers.cjs` e `.test.cjs` (modelo:
`agent-usage-ipc-handlers.test.cjs`); modificar `main.cjs`, `preload.cjs`,
`src/vite-env.d.ts`.

**Interfaces — produz:** `registerCloudSessionIpcHandlers(deps: { ipcMain; service; shell; resolveAccountEnv }): void` com os canais `cloud-session:launch`, `cloud-session:follow-up`, `cloud-session:open`; `window.felixo.cloudSession.{ launch, followUp, open }` com os mesmos tipos do serviço.

- [ ] **Passo 1: testes que falham** — payload com tipos errados, `nodeId` vazio e
  `url` fora do padrão (`isCloudSessionUrl`) são recusados sem chamar o serviço
  (I6); `open` chama `shell.openExternal` só com URL válida; payload válido
  chega ao serviço; erros viram `{ ok: false, code, message }` sem stack.
- [ ] **Passo 2:** `node --test` no arquivo → FALHA.
- [ ] **Passo 3: implementar** e registrar em `main.cjs` e `preload.cjs`; declarar os
  tipos em `vite-env.d.ts`.
- [ ] **Passo 4:** PASSA; `npm run typecheck` (dentro de `app/`) sem erros.
- [ ] **Passo 5: commit** `feat(nuvem): canais IPC do agente na nuvem`.

### Tarefa 5: Tipo de nó, migração 019 e repositório

**Arquivos:** criar `storage/migrations/019_canvas_cloud_session_nodes.sql`; modificar
`storage/canvas-repository.cjs:11`, `storage/canvas-repository.test.cjs`,
`src/features/canvas/types.ts` (`CanvasNodeType` + `CloudSessionNodeData`).

**Interfaces — produz:** `CanvasNodeType` ganha `'cloud-session'`;
`CloudSessionNodeData` e `CloudSessionErrorCode` exatamente como spec §5.2.

- [ ] **Passo 1: teste que falha** — espelho do teste de `notionTasks` em
  `canvas-repository.test.cjs:120`: salvar um nó `cloud-session` com `data_json`,
  reabrir o banco e listar devolve o nó; os tipos antigos continuam sendo salvos.
- [ ] **Passo 2:** `node --test electron/services/storage/canvas-repository.test.cjs` → FALHA (CHECK rejeita).
- [ ] **Passo 3: implementar** a migração recriando `canvas_nodes` com o `CHECK`
  ampliado (copiar a estrutura da `013`), mais `NODE_TYPES` e os tipos.
- [ ] **Passo 4:** PASSA, junto com `backward-compatibility.test.cjs` e a suíte de storage.
- [ ] **Passo 5: commit** `feat(nuvem): tipo de nó cloud-session e migração 019`.

### Tarefa 6: Estado puro do cartão

**Arquivos:** criar `src/features/canvas/services/cloud-session-state.ts` e `.test.ts`.

**Interfaces — produz:**
- `createDraft(input: { cwd: string; accountId?: string }): CloudSessionNodeData`
- `markLaunching(data): CloudSessionNodeData`
- `applyLaunchResult(data, result: LaunchResult, nowIso: string): CloudSessionNodeData`
- `appendFollowUp(data, entry: { at: string; text: string; ok: boolean; error?: CloudSessionErrorCode }): CloudSessionNodeData` (máx. 20)
- `startNewSession(data): CloudSessionNodeData` (volta a `draft`, mantém task, cwd, accountId)
- `normalizeLoaded(raw: unknown): CloudSessionNodeData` (`launching` → `failed(interrupted)`, tipos inválidos viram rascunho, campos cortados nos limites)
- `canRetryWithoutConfirmation(code: CloudSessionErrorCode): boolean` (só os 4 códigos que provam "nenhuma sessão criada").

- [ ] **Passo 1: testes que falham** — cada transição do spec §5.3; `normalizeLoaded` de
  um nó `launching` nunca devolve `launching` (I9); `appendFollowUp` descarta o 21º
  mais antigo; `startNewSession` limpa `session` e `followUps`; `applyLaunchResult` com
  `created` marca `created` e guarda `createdAt`; `canRetryWithoutConfirmation('timeout')` é `false`.
- [ ] **Passo 2:** `npx vitest run src/features/canvas/services/cloud-session-state.test.ts` → FALHA.
- [ ] **Passo 3: implementar** (funções puras, sem I/O).
- [ ] **Passo 4:** PASSA. Troque `launching` por `draft` em `normalizeLoaded` e veja o teste I9 falhar.
- [ ] **Passo 5: commit** `feat(nuvem): estado do cartão do agente na nuvem`.

### Tarefa 7: Cartão no canvas

**Arquivos:** criar `components/CloudSessionNode.tsx`; modificar os arquivos de
registro do mapa (padrão do `notionTasks`); `useCanvasPersistence.ts` (aplicar
`normalizeLoaded` ao carregar); `components/CanvasView.tsx` (registro, criação e
"Trazer para cá").

**Interfaces — consome:** Tarefas 4 e 6. **Produz:** nó React `CloudSessionNode`
registrado como `'cloud-session'`; entrada "Agente na nuvem" no menu de ferramentas.

- [ ] **Passo 1:** teste de geometria (`node-geometry.test.ts`) com tamanho padrão e
  mínimo do `cloud-session`; teste em `useCanvasPersistence.test.ts` de que um nó
  salvo como `launching` reabre como `failed`/`interrupted`.
- [ ] **Passo 2:** `npx vitest run` nesses dois arquivos → FALHAM.
- [ ] **Passo 3: implementar** o cartão com os estados do spec §7 (rascunho,
  confirmação, criada, falha), `aria-live`, foco inicial e **diálogo de confirmação
  antes de Disparar e de Nova sessão**. "Trazer para cá" cria um terminal com
  `command: 'claude'`, `args: ['--teleport', id]`, mesma pasta e conta, `launchMode: 'launcher'`
  (sem texto inicial). Aviso fixo sobre o crédito e dica do teleport.
- [ ] **Passo 4:** os testes passam; `npm run typecheck` e `npm run lint` limpos.
- [ ] **Passo 5: commit** `feat(nuvem): cartão do agente na nuvem no canvas`.

### Tarefa 8: Inventário e exportação

**Arquivos:** modificar `inventory/data/nodes.ts` e `inventory/canvas-inventory.ts`,
regenerar `docs/projeto/INVENTARIO-CANVAS.md` (`npm run docs:inventario-canvas`);
`canvas-transfer.cjs` e seu teste.

- [ ] **Passo 1: teste que falha** — `canvas-transfer`: exportar um `cloud-session` em
  `created` devolve `draft` sem `session`, `followUps`, `cwd` nem `accountId`;
  importar nunca devolve `created` (I8).
- [ ] **Passo 2:** `node --test electron/services/canvas-transfer.test.cjs` (ou o nome real do teste) → FALHA.
- [ ] **Passo 3: implementar**; descrever cada botão do cartão no inventário.
- [ ] **Passo 4:** PASSA, e `npx vitest run src/features/canvas/inventory` passa
  com o documento regenerado.
- [ ] **Passo 5: commit** `feat(nuvem): inventário do canvas e exportação do cartão`.

### Tarefa 9: Documentação e validação final

**Arquivos:** `IA.md` e `docs/projeto/IA.md` (entradas datadas), `ARQUITETURA.md`,
`GUIA-USUARIO.md`, `README.md`, `docs/README.md` (índice), spec (ajuste do menu) e
roteiro manual em `docs/validation/CHECKLIST-AGENTE-NUVEM.md`.

- [ ] **Passo 1:** escrever as entradas e seções (o que mudou, motivo, alternativa
  descartada, evidência do spike, o que não foi validado).
- [ ] **Passo 2:** rodar `npm test`, `npm run test:native`, `npm run test:frontend`,
  `npm run lint`, `npm run build` e registrar a saída real.
- [ ] **Passo 3: validação real** com `felixo devtools` (perfil isolado) ou o app em
  desenvolvimento: criar o cartão, disparar uma sessão real numa pasta descartável,
  conferir ID e link, enviar follow-up, abrir o link e testar "Trazer para cá".
  Registrar o que não foi possível validar.
- [ ] **Passo 4: commit** `docs(nuvem): documentação e checklist do agente na nuvem`.
- [ ] **Passo 5:** push da branch, acompanhar o CI até estado final e **parar antes
  de mesclar em `main`**.

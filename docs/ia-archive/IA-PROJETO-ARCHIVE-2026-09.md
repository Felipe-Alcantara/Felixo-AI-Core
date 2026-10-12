# Arquivo do IA.md — 2026-09

> Registros movidos, na íntegra e sem edição, de [`docs/projeto/IA.md`](../projeto/IA.md) em 2026-10-12
> (compactação sem perda do template de contexto). Não edite aqui: se uma decisão mudar,
> acrescente uma entrada nova e datada no `docs/projeto/IA.md`.

## Passada de brand integration — 2026-09-12

- O Brand Kit v1.0 passou a ser a fonte oficial dos assets em
  `app/public/brand/`: masters SVG, exports PNG, favicons, tokens e marcas de
  providers.
- `FelixoMark.tsx` usa os SVGs fornecidos diretamente; a geometria não é mais
  redesenhada em JSX. O app icon do Electron e o favicon apontam para exports
  oficiais do kit.
- O frontend importa `felixo-brand-tokens.css` e mantém apenas aliases
  semânticos legados em `index.css`, evitando uma segunda paleta concorrente.
- O sistema visual do canvas continua em `docs/design/`: surfaces, nodes,
  connections e motion compartilham a linguagem Black Space, White Light e
  Distributed Routes.
- Regra permanente: os SVGs oficiais em `/brand` são a fonte da verdade da
  marca Felixo AI Core. Nenhum agente pode regenerar, reinterpretar,
  simplificar ou alterar sua geometria sem uma task explícita de redesign.
- A identificação de Claude, Codex/OpenAI e Gemini nos nodes continua derivada
  do comando real configurado e usa assets locais pequenos; o provider não
  domina a identidade Felixo.

## Snapshot atual — 2026-09-02

- O canvas é a superfície principal do produto: agentes em PTY real, arquivos,
  notas, grupos, páginas web, ferramentas e conexões compartilhadas.
- O modo de chat foi depreciado. Continua no código para compatibilidade com
  sessões e exportações antigas; novas features e decisões devem apontar para
  o canvas.
- **Limites e uso** consulta fontes reais por conta/perfil, mostra dados
  completos e redigidos do `/status` do Claude e deixa explícita a ausência de
  cota quando o provider não publica uma.
- A documentação vigente está em `README.md`, `docs/README.md`, `docs/guias/`
  e `docs/projeto/`; `docs/_legado/` é apenas histórico.
- O empacotamento POSIX corrige a permissão do `spawn-helper` nativo do
  `node-pty` antes de distribuir o app; sem isso, o terminal do macOS falha
  com `pty_spawn_failed`/`posix_spawnp failed`.
- A branch de desenvolvimento/release é `main`. O launcher ainda preserva o
  `--update` explícito com branch configurável e o update silencioso da branch
  atual.
- O workflow de release valida o artefato real nos três SOs: PTY nativo,
  npm-runtime empacotado, instalação/atualização de CLI e persistência dos
  shims antes de promover a pré-release.
- O CI mantém uma política de dependências reproduzível: audit npm completo e
  `--omit=dev` separados, SBOM CycloneDX, `pip-audit` com SBOM do launcher e
  inventário do `app.asar`/`npm-runtime` de cada pacote. O Dependabot separa
  segurança, patch/minor agrupados e majors individuais.
- O bundle inicial é dividido por uso: canvas/chat, ferramentas do menu,
  Markdown e runtime PTY entram por chunks relativos sob demanda. O entry da
  compilação de 01/09/2026 ficou em 191,73 KiB cru (60,37 KiB gzip), sem o
  aviso de chunk grande; o benchmark Electron guarda startup, menu, primeiro
  painel e referências dos assets.

## [2026-09-02] Política contínua de dependências, SBOM e inventário do instalador

**Task.** Automatizar a auditoria npm completa e comparativa de produção, a
auditoria do launcher Python, os SBOMs e a comprovação do conteúdo que chega ao
instalador, além de separar as atualizações do Dependabot por risco.

**Implementação.** O CI preserva os JSONs e códigos de saída de `npm audit`,
produz o SBOM CycloneDX do lock e empacota o app antes de validá-lo.
`package-inventory.cjs` lista os manifestos dentro do `app.asar`, mede recursos
desempacotados e exige o `resources/npm-runtime/npm` real, com tamanho, hash e
versão. O Release gera o mesmo inventário em cada runner. O Dependabot separa
updates de segurança, patch/minor agrupados e majors individuais para npm,
Python e GitHub Actions.

**Decisão de gate.** Advisories não críticos da árvore completa continuam
visíveis para atualização, mas qualquer crítico bloqueia. O comparativo
`npm audit --omit=dev` é o gate obrigatório de produção; falha de execução, SBOM
inválido, inventário ausente ou `npm-runtime` vazio também bloqueiam. O
`pip-audit --strict` mantém o mesmo rigor para o lock Python.

**Validação local.** Os testes focados passaram 9/9; os relatórios reais
registraram 4 advisories não críticos no grafo completo, zero na produção e 759
componentes no SBOM npm. `npm run pack` passou e o inventário confirmou duas
variantes Linux presentes no diretório local, com 3.084 arquivos do
`npm-runtime`. PyYAML validou os três YAMLs alterados e ESLint não encontrou
erros nos scripts.

**Estado final.** Implementação, testes e documentação concluídos; a publicação
remota e o acompanhamento do CI/release fazem parte do fechamento operacional
desta task.

## [2026-09-01] Bundle inicial dividido por carregamento sob demanda

**Task:** reduzir o custo pago pelo primeiro carregamento do renderer sem
quebrar o app empacotado, o fluxo canvas-first ou o caminho legado de chat.

**Diagnóstico:** o build anterior transformava 721 módulos em um único entry de
1.727,72 kB (1.687,23 KiB; 499,05 kB na saída do Vite, 483,71 KiB na bancada
gzip), incluindo o canvas, todas as ferramentas, Markdown, xterm/PTY e chat.
Isso também mantinha o alerta de chunk acima de 500 kB.

**Implementação:** `App.tsx` passou a carregar `CanvasView` e
`ChatWorkspace` com `React.lazy`. `CanvasToolPanels` passou a ter um loader
independente para cada uma das 12 ferramentas. O ponteiro/foco aquece somente
a opção apontada, e `Suspense`/error boundary mantém loading e erro visíveis no
mesmo painel. `DeferredMarkdownContent` tira o parser e os realces de sintaxe
do caminho inicial; `DeferredTerminalSessionStore` preserva o contrato dos
componentes, mas adia o `TerminalSessionStore` até haver um terminal. O Vite
continua em `base: './'`, portanto cada `import()` resolve dentro do
`file://` do pacote.

**Medição e proteção:** `app/scripts/bundle-load-benchmark.cjs` cria um
`userData` temporário por amostra, abre o `dist` em nova `BrowserWindow`, mede
startup e menu, mede o primeiro uso do Fetch All e lista bytes cru/gzip. O
check exige o painel real depois do `import()`, garante que o chunk não entrou
no startup e valida 200 referências relativas de JS/CSS; o CI executa a
bancada depois do build em Linux, Windows e macOS. O JSON é ignorado pelo Git
por ser resultado de medição local.

**Resultado local:** dez amostras no Linux, comparadas com uma recompilação do
commit `a2efc42`: entry 1.687,23/483,71 KiB → 191,73/60,37 KiB; startup p50/p95
1.868,065/2.250,549 ms → 1.588,362/2.193,116 ms; menu p50/p95
656,519/741,861 ms → 685,680/731,206 ms. O p50 do menu oscila em torno da
animação fixa de 620 ms; o p95 caiu. O primeiro Fetch All leva
431,662/593,429 ms p50/p95 no novo fluxo porque seu código deixa de ser pago
no startup; a abertura seguinte reutiliza o módulo carregado.

**Validação:** testes unitários do benchmark, `npm run build` sem alerta de
chunk grande, `npm run lint` com apenas os dois avisos React preexistentes de
`SearchPanel.tsx`, referências de assets sem ausências e benchmark Electron
com dez amostras aprovado. Empacotamento/release continua coberto pelo job de
release; a confirmação nos três runners fica como gate remoto antes de
promover a versão.

**Estado:** implementação, medição e documentação concluídas; aguardando o
commit, push e validação do CI/release conforme o fluxo do projeto.

[2026-06-18] PIVÔ — De chat mascarado para terminais interativos reais (node-pty + xterm.js).
CONTEXTO: O caminho de mascarar o terminal como chat era instável porque `cross-spawn` usa pipes (não PTY); CLIs interativos detectam `isatty()=false` e se comportam de forma imprevisível, e o parser de stdout→chat era frágil. Nova essência do projeto: dashboard estilo n8n onde cada nó é um terminal de verdade, com o qual o humano interage direto. Orquestração permanece humana por ora (um passo de cada vez para não travar como antes).
DECISÃO (conviver, não substituir): mantido o caminho `child_process` + JSONL (orquestração estruturada existente, ~352 testes) intacto; ADICIONADO um caminho PTY paralelo. Contrato preservado conforme Guia Mínimo de Qualidade (preservar contratos / mudança pequena e rastreável).
DETALHE: Novo `services/pty-process-manager.cjs` — classe `PtyProcessManager` espelhando o contrato do `CliProcessManager` (`spawn`/`get`/`has`/`write`/`kill`/`killAll`) com semântica PTY: `spawn` roda o shell (ou comando) num pseudo-terminal e faz stream dos bytes crus via `onData`; `resize(cols,rows)` mantém o CLI redesenhando para o tamanho da view; kill graceful (SIGTERM→SIGKILL após 5s, timer `unref`) vs `force` imediato; reusa `createCliEnv` e `platform.getDefaultShell`. Saída crua é destinada ao xterm.js no renderer — distinta do terminal humanizado (`cli:terminal-output`), que continua servindo o caminho JSONL.
ABI/BUILD: `node-pty` é addon nativo; ABI do Node (testes) ≠ ABI do Electron (app). Para nunca cair em erro de ABI confuso: `npm run dev` roda `rebuild:electron` antes de subir; `pretest` roda `rebuild:node` antes dos testes; `electron-builder` rebuilda sozinho no `dist`/`pack` (npmRebuild default). O `require('node-pty')` é lazy dentro de `resolveSpawnPty()` e injetável (factory fake nos testes), então `node:test` nunca toca o binário nativo.
TESTE: `pty-process-manager.test.cjs` — 10 testes com PTY fake injetado (spawn+stream, command/args/dims explícitos, write isolado por sessão, resize com bookkeeping + skip redundante, clamp de dims inválidas, kill force vs graceful, cleanup no exit, re-spawn substituindo sessão, killAll). Suíte total: 362 pass, 0 fail. `npm run lint` limpo.
PRÓXIMO PASSO: Fase 2 — componente xterm.js no renderer + IPC `pty:*`. Depois Fase 3: canvas estilo n8n (React Flow) com cada nó embutindo um terminal expansível.

[2026-06-18] Fase 2 — Terminal interativo visível (xterm.js + IPC PTY).
DETALHE: `services/pty-ipc-handlers.cjs` (padrão `register*IpcHandlers`) liga o renderer ao `PtyProcessManager`: `pty:spawn`/`pty:write`/`pty:resize`/`pty:kill` (invoke) + push de `pty:data` (bytes crus) e `pty:exit` para a janela via `webContents.send`. `dispose()` faz `killAll({force})` e é chamado no `before-quit` do `main.cjs`. Bridge `window.felixo.pty` exposta no `preload.cjs` e tipada no `vite-env.d.ts`.
COMPONENTE: `features/chat/components/LiveTerminalPanel.tsx` — monta um `Terminal` xterm.js + `FitAddon`, liga `terminal.onData`→`pty.write` (teclado→PTY), `pty.onData`→`terminal.write` (PTY→tela), `ResizeObserver`→`fit()`+`pty.resize` (view→PTY). Cleanup no unmount: remove listeners, `pty.kill(force)`, `terminal.dispose()`. Nome distinto do `TerminalPanel.tsx` humanizado (caminho JSONL) — são dois renderizadores diferentes. Distinto: este pinta bytes crus, o outro mostra eventos formatados.
TESTE-VISUAL: botão flutuante "Terminal" em `App.tsx` abre overlay com o `LiveTerminalPanel` (id de sessão por abertura). Ponto de teste descartável até a Fase 3 (canvas) substituir por nós.
TESTE: `pty-ipc-handlers.test.cjs` — 8 testes (validação de sessionId, shaping de erro, spawn encaminha data/exit à janela, erro sem sessionId, write/resize/kill encaminhados, dispose→killAll). Stub de `electron` via `Module._load` para carregar sob `node:test`. Suíte total: 370 pass, 0 fail. `npm run build` (tsc+vite) e `npm run lint` limpos.
PRÓXIMO PASSO: Fase 3 — canvas estilo n8n (React Flow), cada nó embutindo um `LiveTerminalPanel` expansível, com conexões visuais entre nós.

[2026-06-18] BUG — Terminal mostrava "Processo encerrado (codigo 0)" com o agente vivo.
CAUSA: React StrictMode monta o efeito do `LiveTerminalPanel` duas vezes em dev com o mesmo `sessionId`. O cleanup da 1ª montagem dava `pty.kill` na sessão que a 2ª acabara de criar (id compartilhado), e o `pty:exit` resultante vazava para a view ativa.
FIX: cada montagem do efeito gera um id de sessão PTY único (`sessionId::uuid`) e filtra `pty:data`/`pty:exit` por esse id, isolando as montagens. Segue a convenção `crypto.randomUUID?.()` já usada no projeto.

[2026-06-18] ✅ VALIDAÇÃO VISUAL — Pivô confirmado de ponta a ponta pelo usuário.
DETALHE: Claude Code rodou interativo dentro do `LiveTerminalPanel` (banner ASCII colorido renderizando nativo via PTY — algo impossível no caminho antigo de pipes), e o terminal permanece aberto aguardando entrada após o fix do StrictMode. Fases 1 e 2 do pivô (chat mascarado → terminais reais) entregues e funcionais.

[2026-06-18] Fase 3 — Canvas estilo n8n como tela principal (React Flow).
CONTEXTO: Essência nova do projeto. Decisões do usuário: canvas vira a tela principal (chat acessível por toggle), 2 tipos de nó (terminal + nota), e persistência em SQLite já nesta fase.
STACK: `@xyflow/react` (React Flow 12) adicionado.
BACKEND: Migration `005_canvas.sql` cria `canvas_nodes` (id/type∈{terminal,note}/position_x/position_y/width/height/data_json/timestamps/archived_at, índice por updated_at), seguindo o padrão soft-delete das migrations 002-004. `storage/canvas-repository.cjs` (factory list/save/delete, normalize+map, dims opcionais como null) espelha `notes-repository`. `canvas-ipc-handlers.cjs` (`canvas:list/save/delete`) no padrão `register*IpcHandlers`, wired no `main.cjs` com `{ database }`. Bridge `window.felixo.canvas` no preload + tipo `PersistedCanvasNode` no vite-env. Glob de teste do `package.json` passou a incluir `electron/services/storage/*.test.cjs` (antes os testes de storage não eram coletados pelo `npm test`).
FRONTEND: Feature isolada em `features/canvas/`. `CanvasView` monta o React Flow com `nodeTypes` {terminal, note}, toolbar para adicionar nós, Background/Controls/MiniMap, conexões entre nós (decorativas). `TerminalNode` embute o `LiveTerminalPanel` (id do nó = identidade da sessão PTY) com `NodeResizer`. `NoteNode` é um textarea editável (sticky note). `useCanvasPersistence` (hook) é dono do estado dos nós, hidrata do backend uma vez e persiste posição/tamanho/data com debounce de 400ms (salva no commit do drag/resize, não a cada frame); callbacks injetados (onTextChange) são removidos antes de persistir (data tem que ser JSON puro). `App.tsx`: canvas é a tela default, com toggle flutuante canvas↔chat (botão de terminal de teste da Fase 2 removido — terminais agora são nós).
DECISÃO (set-state-in-effect): hidratação dos nós persistidos foi movida para dentro do hook (no callback do load), e a injeção do `onTextChange` acontece em render time via `useMemo`, evitando `setState` derivado em `useEffect` (regra `react-hooks/set-state-in-effect`).
TESTE: `canvas-repository.test.cjs` — 4 testes (CRUD + soft-delete, nota com dims null, normalize rejeita type/id inválidos, coerção de defaults). Suíte total: 374 pass, 0 fail. `npm run build` (tsc+vite) e `npm run lint` limpos.

[2026-06-18] ✅ VALIDAÇÃO VISUAL — Fase 3 confirmada pelo usuário.
DETALHE: Dois nós-terminal independentes lado a lado no canvas, ambos com shell vivo (status "ativo"), redimensionáveis (NodeResizer), refletidos no MiniMap. Toolbar Terminal/Nota e toggle Chat funcionando. O pivô completo (chat mascarado → dashboard n8n com terminais reais) está de pé como tela principal.
PRÓXIMO PASSO: ideias para quem contribuir — persistir edges/conexões (hoje visuais, não salvam), nós orquestrados (ler saída estruturada), presets de prompt por nó.

[2026-06-19] Fase 3.1 — Rodada de melhorias do canvas (feedback do usuário, commits pequenos).
1. DRAG: nós não moviam (corpo é nodrag para poder digitar). Cada nó ganhou um `NodeHeader` que é o único drag handle (prop `dragHandle`); header também remove o nó. `GroupNode` tem seu próprio header editável.
2. UI: minimap/controles do React Flow colidiam com o rodapé (toggle Chat) e usavam tema claro. Minimap foi para o topo-direito, controles ganharam margem, e há override de CSS para o tema escuro (`.react-flow__controls-button`, `.react-flow__minimap`).
3. COR DA NOTA: seletor de cor no header (amber/emerald/sky/rose/zinc) via `note-colors.ts`; cor persiste. Callback do nó virou `onDataChange(id, patch)` genérico (era `onTextChange`).
4. MARKDOWN NA NOTA: toggle editar/visualizar; preview reusa `MarkdownContent` (remark-gfm → checklists `- [ ]`) sobre painel escuro; edição em textarea monospace.
5. PROJETO NO TERMINAL: botão Terminal virou `TerminalMenu` (split + caret) — "Local (sem projeto)" usa cwd padrão, ou escolhe um projeto e abre o terminal na pasta dele (cwd=path). Projetos vêm de `window.felixo.projects.list`.
6. NÓS-GRUPO: tipo `group` (subflow). Migration 006 amplia o CHECK de type e adiciona `parent_id` (SQLite recria a tabela). `GroupNode` (título editável), reparenting por drag-stop (hit-test sobre limites do grupo), grupos renderizados atrás dos filhos. Persistência carrega `parentId`+`extent:'parent'`.
TESTE: suíte 375 pass, 0 fail (novo teste de grupo+parentId). `npm run build` e `npm run lint` limpos. Cada item saiu em commit próprio (feat/fix) seguindo a política de git.
NOTA DE DÍVIDA: reparenting só reparenta nós top-level (posição absoluta); arrastar um filho para fora ou entre grupos não foi coberto nesta rodada.

[2026-06-19] Fase 3.2 — Reconcepção do terminal: blocos recolhidos + drawer lateral (pedido do usuário).
VISÃO (do usuário): não quer terminais grandes "jogados" no canvas. Cada nó deve ser um BLOCO PEQUENO e limpo (título/status/preview); ao EXPANDIR, o terminal real abre num PAINEL LATERAL à direita (redimensionável), sem inflar o canvas. O terminal deve RODAR EM BACKGROUND mesmo recolhido e INDICAR se o agente está trabalhando ou já terminou.
ARQUITETURA: O `LiveTerminalPanel` criava/matava o xterm+PTY junto do componente — incompatível com "vivo em background". Extraído para uma camada de sessões: `terminal/terminal-session-store.ts` (`TerminalSessionStore`) é dona do `Terminal` (xterm) e do PTY, mantém vivos, e expõe `ensure/attach/detach/fit/focus/subscribe/remove`. O elemento DOM do xterm é MOVIDO (attach) entre o card e o drawer — não recriado — então scrollback e processo sobrevivem. Provider/hooks separados por causa do react-refresh: `TerminalSessionProvider.tsx` (só componente) + `terminal-session-context.ts` (`useTerminalSessions`, `useSessionSnapshot`).
ATIVIDADE (working/idle): derivada do FLUXO de output, sem parsear texto. Recebeu bytes → `working`; silêncio por 1.5s → `idle` (terminou o turno/esperando); `pty:exit` → `exited`. O card mostra spinner (trabalhando) / ponto verde (aguardando) / encerrado.
UI: `TerminalNode` virou um card compacto (ícone, título, badge de atividade, preview das últimas ~6 linhas sem ANSI) com botão expandir. `TerminalDrawer` é o painel lateral direito redimensionável (drag na borda) que faz `attach` do xterm vivo. `CanvasView` virou `CanvasView`(provider) + `CanvasInner`; guarda `expandedTerminalId`, encolhe o canvas (flex) quando o drawer abre, injeta `onExpand` nos nós-terminal.
LIMPEZA: `LiveTerminalPanel.tsx` removido (órfão; lógica migrou para a store).
TESTE: build (tsc+vite) e lint limpos; suíte 375 pass, 0 fail.
DÍVIDA/PRÓXIMO: heurística de idle é por tempo (1.5s) — pode marcar idle no meio de uma pausa do agente; persistência do tamanho do drawer e do estado expandido não foi feita; store ainda sem teste unitário próprio (depende de xterm/DOM).

[2026-06-19] Fase 3.3 — Rodada de refinamentos do terminal/canvas (feedback do usuário, commits pequenos).
6. CWD: `pty-process-manager` usava `process.cwd()` como fallback (pasta do app) — terminal 'Local' abria em .../FelixoVerse. Trocado para `os.homedir()`: sem projeto abre em ~.
5. PREVIEW: o card lia o stream cru e removia ANSI na mão, deixando lixo ('T T T'). Agora `computePreview` lê do buffer já renderizado do xterm (`terminal.buffer.active`, `translateToString`), e `markWorking` só emite na transição working/idle (sem re-render por byte). Card renderiza cada linha truncada.
4. NOMES: `NodeHeader` ganhou modo de título editável (input controlado pelo valor persistido). `TerminalNode` usa para renomear o bloco (persiste em `data.label`); grupos já eram nomeáveis.
3. TROCAR DRAWER: clicar em outro card já trocava `expandedTerminalId`, mas o elemento do terminal anterior ficava no container, empilhando. `attach()` agora limpa terminais estranhos do container antes de montar.
1. SELEÇÃO MÚLTIPLA: `<ReactFlow>` com `selectionOnDrag` + `panOnDrag={[1,2]}` + `multiSelectionKeyCode=['Shift']` + `panActivationKeyCode='Space'`. Arrastar no vazio = caixa de seleção; Espaço/botão-do-meio = pan.
2. AGENTE+PROJETO: `TerminalMenu` virou um painel com seletor de agente (Nenhum/Claude/Gemini/Codex → comando) e de projeto (Local/projeto → cwd); abre com qualquer combinação (ou nada). Comandos reais vêm do cli-detector (`claude`/`gemini`/`codex`). Nome do bloco derivado: '<Agente> · <projeto|local>'.
TESTE: build (tsc+vite) e lint limpos; suíte 375 pass, 0 fail. Cada item em commit próprio (feat/fix).
PENDENTE: grupos (subflow) seguem com o reparenting limitado da Fase 3.1 — usuário deixou para depois.

[2026-06-20] Fase 3.4 — Funções do chat trazidas para o canvas (menu retrátil de ferramentas).
DECISÃO (do usuário): painéis PRÓPRIOS do canvas, falando direto no IPC, sem mexer no ChatWorkspace (zero risco de regressão; aceita leve duplicação visual). Menu retrátil no canto superior esquerdo.
BASE: `components/tools/CanvasToolsMenu` (botão "Ferramentas" que expande a lista) + `CanvasPanel` (painel flutuante reutilizável). `CanvasView` guarda `activeTool` e renderiza o painel ativo. Adicionar painel novo = 1 componente + 1 entrada no menu + 1 linha no switch.
PAINÉIS (todos direto no bridge, sem o chat): Projetos (`projects.*` — listar/adicionar via pickFolder+detectRepos/remover; ao mudar, recarrega a lista do TerminalMenu), Notas (`notes.*` — CRUD inline), Modelos (`models.*` — listar/remover; criação fica no chat), Prompts (`defaultAutomations` + `automations.list` — copia o prompt pro clipboard, já que no canvas não há chat para "aplicar"), Git (`git.getSummary/stageAll/commit` — escolhe projeto, mostra branch/status, stage all, commit).
TESTE: build (tsc+vite) e lint limpos; suíte 375 pass, 0 fail. Um commit por painel.
PENDENTE/PRÓXIMO: Skills, Exportar e Configurações (Felixo/orquestrador) ainda não trazidos (mais acoplados ao chat). Edição/salvamento das notas/projetos é por keystroke (sem debounce). Painéis abrem um de cada vez (activeTool único).

[2026-06-21] Fase 3.5 — Atalho Q e bloco-arquivo .md compartilhado (memória entre agentes).
ATALHO: tecla 'Q' alterna select/pan, mas só com o canvas focado (pane do React Flow ou body) — `isCanvasFocused`. Decisão do usuário: em vez de listar onde NÃO disparar, só disparar no canvas nu (nunca em campo/terminal/painel).
CONTEXTO (ideia do usuário, melhor que persistir scrollback): o estado das conversas vira ARQUIVOS .md no disco. Um bloco-arquivo no canvas = um .md real; o agente (que recebe o caminho absoluto) edita o arquivo enquanto trabalha, o bloco re-renderiza ao vivo, e outros agentes leem/escrevem o mesmo arquivo → memória compartilhada. Persistência sai de graça (estado mora no arquivo, não no terminal efêmero). DECISÃO: arquivos em userData/canvas-files (NÃO no projeto — não pode vazar pro git de quem usa); novo tipo de bloco (coexiste com a nota); file watcher.
BACKEND: `app-paths` ganhou `canvasFiles` (userData/canvas-files, criada no init). `canvas-files-ipc-handlers`: list/read/write/resolve + watch/unwatch (fs.watchFile, push `canvas-file:changed`). `resolveSafePath` confina nomes ao diretório (só basename, força .md, bloqueia traversal/absoluto) — com testes. `resolve()` devolve o caminho absoluto para dar ao agente. dispose() para os watchers no before-quit. Migration 007 amplia o type para 'file'.
FRONTEND: `FileNode` renderiza o .md (MarkdownContent), observa mudanças (re-lê no `canvas-file:changed`), edita (grava de volta), botão "copiar caminho" (para colar no agente: "edite este arquivo"). Botão "Arquivo" na toolbar cria o .md e o bloco; `fileName` persiste no data do nó.
TESTE: build (tsc+vite) e lint limpos; suíte 378 pass, 0 fail (+3 do resolveSafePath).
SOBRE CONEXÕES (pergunta do usuário): ligar blocos hoje é só visual e NÃO persiste (edges não tocam o backend) — adiado de propósito; o usuário priorizou a persistência via arquivos primeiro. Ideias futuras anotadas: encadear saída→contexto, gatilho ao terminar, anexar prompt a terminal.

[2026-06-21] Fase 3.6 — Conexões com significado: arquivo→terminal + edges persistidas.
DECISÃO (usuário): ligar um bloco-arquivo a um terminal deve INFORMAR O CAMINHO ao agente (não colar conteúdo); dispara no momento da ligação (onConnect); e as conexões PERSISTEM.
EDGES PERSISTIDAS: migration 008 cria `canvas_edges` (source/target, soft-delete). `canvas-repository` ganhou listEdges/saveEdge/deleteEdge (+normalizeEdge, com testes). IPC `canvas:list-edges/save-edge/delete-edge` + bridge + tipo `PersistedCanvasEdge`. Frontend: `canvas-storage` ganhou load/save/deleteCanvasEdge; `CanvasView` hidrata edges ao montar, salva no onConnect, remove no onEdgesChange. As linhas voltam ao reabrir.
AÇÃO ARQUIVO→TERMINAL: `TerminalSessionStore.sendText(id, texto)` injeta texto no PTY. No onConnect, `announceFileToTerminal` detecta um par file↔terminal (qualquer direção), resolve o caminho absoluto do .md (`canvasFiles.resolve`) e digita no terminal uma linha-comentário com o caminho ("leia e mantenha suas anotacoes nele"), para o agente reconhecer/editar o arquivo. Combina com o file watcher: o agente edita → o FileNode re-renderiza ao vivo.
TESTE: build (tsc+vite) e lint limpos; suíte 380 pass, 0 fail.
PENDENTE/IDEIAS: a linha é enviada como comentário (inerte no shell; o agente lê). Outros tipos de conexão (terminal→terminal encadeando saída, gatilho ao terminar) seguem em aberto.

[2026-06-22] Fase 3.7 — Prompt do "plano vivo" ao ligar arquivo→terminal (configurável).
VISÃO (usuário): o .md ligado NÃO é um prompt — é um PLANO VIVO compartilhado (estilo plan.md): fases, checklists, testes, metas, modelos, decisões, e sinalização entre agentes (ex.: "Fase 1 em andamento por Claude", "Codex no front-end", "Claude aguardando decisão", "grande demais pro MVP", opções pro usuário). Agentes seguem e registram progresso ali, commitam por fase, e coordenam pelo arquivo.
PROMPT PADRÃO: `services/file-link-prompt.ts` — `DEFAULT_FILE_LINK_PROMPT` (protocolo completo) + `buildFileLinkPrompt(template, path, agent)` com placeholders {{path}}/{{agent}}. Substituiu a linha-comentário fraca anterior. `announceFileToTerminal` passou a usar o template e o nome do agente (comando do terminal).
EDITÁVEL: o texto é salvo em settings (chave `canvas.file-link-prompt`) — IPC `canvas:get/set-file-link-prompt` (settings-repository genérico), bridge `getFileLinkPrompt/setFileLinkPrompt`. O canvas carrega o valor salvo num ref no início; `SettingsPanel` (novo item "Configuracoes" no menu de ferramentas) edita/salva/restaura padrão e atualiza o ref na hora.
TESTE: build (tsc+vite) e lint limpos; suíte 380 pass, 0 fail.

[2026-06-22] Refatoração — Separação chat ↔ canvas com features/shared (branch refactor/separa-chat-canvas).
MOTIVO: o canvas virou o produto principal mas o repo ainda misturava chat e canvas; o canvas importava de `features/chat`. Por ser refatoração estrutural, foi feita em branch (política de git) com validação a cada passo.
RESULTADO: `src/features/` agora tem três irmãs com dependência só num sentido: `canvas` → `shared`, `chat` → `shared`, e `shared` não depende de ninguém. **canvas e chat não se importam mais** (acoplamento zero). O que era compartilhado saiu de `chat/`: `MarkdownContent` → `shared/components`; tipos `AutomationDefinition/AutomationScope` → `shared/types/automations` (re-exportados por `chat/types` para não quebrar o chat); catálogo `defaultAutomations` → `shared/data/automations`.
PADRÃO (modo padrão): `App.tsx` já renderiza o canvas por default e mantém o chat acessível por um toggle — comportamento preservado, agora com a estrutura coerente. Nada do chat foi removido (legado já preservado em `legacy/chat-mascarado`).
TESTE: cada passo com tsc+vite+lint+test verdes; suíte 380 pass, 0 fail. Commits pequenos (refactor:).

[2026-06-22] Fase 3.8 — Exceção de bootstrap: agente em repo + .md vazio escreve o plano.
REGRA (usuário): ao ligar arquivo→terminal, SE o terminal está em um projeto (tem cwd) E o .md está vazio/em branco, o próprio agente deve analisar o repositório e ESCREVER no .md um plano de evolução (fases de melhoria/expansão/escala). Caso contrário (sem projeto, ou .md já preenchido) mantém o prompt normal de plano vivo.
IMPL: `file-link-prompt.ts` ganhou `DEFAULT_FILE_BOOTSTRAP_PROMPT` (analisar repo → escrever plano com visão geral, fases numeradas + checklists/testes, MVP vs grande demais, riscos/decisões, sinalização entre agentes) + `buildBootstrapPrompt`. `announceFileToTerminal` agora lê o conteúdo do .md (`canvasFiles.read`), checa `cwd` do terminal e `.trim()` do conteúdo; escolhe bootstrap vs normal. "Em repo" = terminal aberto com projeto (cwd); "vazio" = sem conteúdo útil (trim). Editável: settings `canvas.file-bootstrap-prompt` (IPC get/set + bridge); `SettingsPanel` refatorado em `PromptField` reutilizável com 2 campos (normal + bootstrap), salvar atualiza o ref na hora.
TESTE: build (tsc+vite) e lint limpos; suíte 380 pass, 0 fail.

[2026-06-22] Padrão de linguagem — Prompts e textos de UI do canvas reescritos com português acentuado/correto, seguindo o padrão de linguagem do projeto. Os prompts (plano vivo + bootstrap) passaram a instruir o agente a seguir o template de contexto (`TEMPLATE-CONTEXTO-IA` / IA.md) ao escrever o `.md`, apontando os guias na pasta `Padrão de qualidade - Felixo System Design/` do repo ou, se ausente, na fonte no GitHub (`Felixo-System-Design`).

[2026-06-22] Lembrete de padrão de qualidade — Terminal aberto COM agente (Claude/Gemini/Codex) recebe, logo após o spawn, uma instrução para sempre seguir o padrão de qualidade (independente do prompt), apontando a pasta de padrões no repo ou a fonte no GitHub. `quality-standard-prompt.ts` define o texto padrão; a store injeta via `initialText` em `ensure()` (~1.2s após spawn; transiente — não persiste nem reenvia ao reabrir). Editável + toggle (default ligado) nas Configurações, persistido em `settings` (`canvas.quality-standard-prompt`/`-enabled`). Shell puro não recebe.

[2026-06-22] Opções de spawn do agente (modelo/esforço/yolo) — Ao criar um terminal-agente, o menu oferece modelo, esforço e yolo por agente, montando as FLAGS REAIS de cada CLI (verificadas via `<cli> --help` na máquina, não chutadas): Claude `--model`/`--effort <low|medium|high|max>`/`--dangerously-skip-permissions`; Codex `--model`/`-c model_reasoning_effort=<low|medium|high|xhigh>`/`--dangerously-bypass-approvals-and-sandbox`; Gemini `--model`/(sem esforço)/`--yolo`. `services/agent-launch-options.ts` cataloga agentes+modelos e `buildAgentArgs` gera os args; os campos se adaptam (Gemini não mostra esforço). Os args ficam no `data` do nó (persistem ao reabrir, já fluem store→IPC→pty-process-manager→node-pty). Modelos são listas extensíveis por agente.

[2026-06-22] Detecção de repositórios ao adicionar pasta — `projects:detect-repos` agora: se a pasta selecionada já é um repo (`.git` próprio), retorna só ela e NÃO desce (evita registrar um repo aninhado — ex.: o repo de padrões vendorizado dentro de outro projeto — como projeto à parte; cobre o aviso do usuário sobre repo-dentro-de-repo). Senão, varre as subpastas diretas (1 nível) e retorna um por repo; o frontend salva cada um. Dedupe por caminho no frontend (ProjectsPanel e addProjectFolder) — readicionar uma pasta-mãe não cria duplicatas; `addProjectFolder` retorna o id existente quando o caminho já está cadastrado. DÍVIDA: `projects-repository.save` ainda dedupa só por id (ON CONFLICT(id)); a dedupe por caminho vive no frontend.

[2026-06-22] Limpeza completa e portabilidade do canvas — A barra do canvas ganhou **Limpar**, **Exportar** e **Importar**. Limpar exige confirmação, cancela saves pendentes, encerra PTYs/watchers e remove fisicamente nós, conexões e `.md` do diretório dedicado. Exportar gera um manifesto `.fxcanvas` versionado (`felixo-canvas`, versão 1) com o estado vivo do React Flow e somente os Markdown registrados; arquivo registrado mas ausente entra vazio para ser recriado. Importar lê até 60 MB, valida formato, versão, limites, IDs, grupos, conexões e nomes confinados antes da confirmação; depois substitui os `.md` e troca o SQLite numa transação, com restauração dos arquivos anteriores se qualquer etapa falhar. Caminhos `cwd` e argumentos de terminal não viajam; apenas `claude`, `codex` e `gemini` são preservados como comandos conhecidos, usando opções padrão. Entradas tentam impedir traversal, arquivos duplicados, comandos arbitrários e pacotes acima dos limites. O renderer remonta o React Flow após importar para restabelecer watchers, e saves pendentes são reagendados se a importação operacional falhar. TESTE: build e lint limpos; suíte 390 pass, incluindo manifesto portátil, segurança, arquivos, transação SQLite e fluxo IPC com rollback.

[2026-06-22] Correções do canvas (scroll/terminal) e animações.
1. SCROLL NO ARQUIVO: bloco-arquivo não rolava com o mouse — o React Flow capturava o wheel para zoom/pan. `FileNode` ganhou a classe `nowheel` (do React Flow) na visualização e no textarea; agora o conteúdo rola normalmente sob o cursor.
2. TERMINAL CORTADO + SELEÇÃO BUGADA: o CSS do xterm (`@xterm/xterm/css/xterm.css`) nunca era importado — sem ele a tela e a camada de seleção ficavam mal posicionadas, cortando a última linha e bugando a seleção de texto. Importado em `main.tsx`. O `TerminalDrawer` ganhou um `ResizeObserver` que re-ajusta (`fit`) o terminal quando a caixa estabiliza (após a animação de abertura), eliminando a linha cortada.
3. ANIMAÇÕES: keyframes em `index.css` (slide do drawer, fade/scale dos painéis e do menu de ferramentas) + hook `useExitAnimation` (toca a saída antes de desmontar). Aplicado em `CanvasPanel` (todas as abas), `TerminalDrawer` e `CanvasToolsMenu`. Respeita `prefers-reduced-motion`.
TESTE: suíte 392 pass. DÍVIDAS (resolvidas na rodada seguinte de 06-23): lint acusava `react-hooks/refs` em `CanvasView.tsx`; e o `tsc -b` (o typecheck real do build) estava quebrado — a verificação tinha usado `tsc --noEmit` no tsconfig raiz (`files: []`), que não checa nada. Lição: validar com `npm run build`/`tsc -b`, não `tsc --noEmit` na raiz.

[2026-06-22] Atividade do terminal — fim do "sempre trabalhando".
BUG (usuário): o card do terminal ficava eternamente "trabalhando" mesmo com o agente parado. CAUSA: CLIs de agente animam um spinner/contador continuamente enquanto aguardam input; cada frame emitia bytes, chamava `markWorking` e reiniciava o timer de idle, que nunca disparava. FIX em `terminal-session-store.ts`: `computeSignature` lê o viewport do xterm normalizando fora glifos de animação (braille, `|/-\`, blocos, cursor) e contadores de tempo (`12s`, `1m04s`); `onOutput` só conta como trabalho real quando a assinatura muda; `scheduleIdleCheck` só marca `idle` após silêncio significativo real (sem mudança de assinatura por `IDLE_AFTER_MS`). Substitui a heurística antiga de "qualquer byte = working" (dívida anotada na Fase 3.2).

[2026-06-23] Reconcepção do .md do canvas — de "plano para MVP" para SCRATCHPAD VIVO.
VISÃO (usuário): a ideia central do projeto é servir de harness onde modelos mais baratos fiquem em loop refinando o trabalho através do arquivo do canvas. O formato "plano para MVP" (fases numeradas, MVP vs grande demais, template de contexto formal) virou complexidade desnecessária e atrapalhava esse loop. O .md deve ser leve o suficiente para um modelo barato manter preciso a cada passada, e o canal de conversa entre agentes deve ser simples.
DECISÃO: o .md vira um SCRATCHPAD de formato livre com seções fixas curtas — Objetivo / Estado atual / Travas / Próximo passo / Sinais entre agentes. "Sinais entre agentes" (linhas datadas: agente — o quê — status) é o canal de coordenação, desacoplado de fases. O bootstrap (repo + .md vazio) deixa de gerar um plano de evolução amplo e passa a escrever um DIAGNÓSTICO concreto e observável do repo, em categorias que o agente encontra lendo o código: 🐛 problemas, 🚧 incompleto, 🔧 funções auxiliares, 📈 melhorias (pequeno e grande porte). Motivo de trocar "MVP" por categorias: "MVP" é amplo/subjetivo demais para um modelo barato; categorias observáveis viram checklist de trabalho real.
IMPL: `file-link-prompt.ts` reescrito (`DEFAULT_FILE_LINK_PROMPT` + `DEFAULT_FILE_BOOTSTRAP_PROMPT`); `quality-standard-prompt.ts`, `CanvasView.tsx` e `SettingsPanel.tsx` tiveram a linguagem "plano vivo" alinhada para "scratchpad" (comentários, help da UI). A lógica de *quando* disparar bootstrap (repo + vazio) não mudou — só o conteúdo dos prompts. As Fases 3.7/3.8 acima descrevem o formato "plano vivo" anterior e ficam como trilha histórica.
SEGUIMENTO: o toggle por bloco abaixo (mesma data) entregou a parte que ficou pendente.
TESTE: suíte 392 pass (typecheck real validado depois, junto do fix de build).

[2026-06-23] Toggle por bloco (scratchpad ↔ plano) + diagnóstico sob demanda.
DECISÃO (usuário): em vez do diagnóstico disparar automático ao ligar arquivo→terminal, ele vira uma AÇÃO EXPLÍCITA por bloco. O bloco-arquivo ganha modo `scratchpad` (padrão) ou `plan`, persistido em `data.mode` (JSON puro, sobrevive ao `stripFunctions`).
IMPL: `FileNodeData.mode` + `DiagnosisRequestStatus` em `types.ts`. `FileNode` mostra um seletor Scratchpad/Plano no header; no modo Plano, botão "Gerar diagnóstico" chama `onGenerateDiagnosis(id)` (injetado pelo CanvasView no memo dos nós-arquivo) e exibe feedback (ok / sem terminal ligado / etc.). `CanvasView`: `announceFileToTerminal` simplificada (sempre injeta o prompt de scratchpad no connect; não decide mais bootstrap); nova `requestRepoDiagnosis(fileNodeId, nodes, edges, store, bootstrap)` acha o terminal conectado ao arquivo e dispara o prompt de diagnóstico, retornando status pra UI. `generateDiagnosis` (useCallback) declarada antes do memo que a usa (ordem importa pro lint `react-hooks`).
FIX JUNTO (dívidas da rodada anterior): (a) `react-hooks/refs` — o quality standard virou estado (`useState`) com ref espelhado só pros callbacks; o memo recomputa quando o padrão carrega/salva (corrige bug latente do initialText preso). (b) build quebrado — nós tipados como `CanvasFlowNode = Node<CanvasNodeData>` em `useCanvasPersistence`, restaurando a checagem de `data` no `tsc -b`.
TESTE: `npm run build` (tsc -b + vite), `npm run lint` e suíte (392 pass) limpos.
PENDENTE/IDEIAS: o modo é só por bloco e não muda o conteúdo já escrito; o diagnóstico assume 1 terminal conectado (pega o primeiro); sem teste unitário próprio do FileNode (depende de DOM/React Flow).

[2026-08-11] Concluído — Bug “Prompt inicial no codex demora demais pra chegar no terminal”.
IDENTIDADE: Bug: Prompt inicial no codex demora demais pra chegar no terminal.
CAUSA: a entrega do `initialText` aguardava atrasos fixos de 1,2 s no primeiro ciclo e 2,5 s depois de uma tela de aceite, mesmo quando a linha de entrada já podia ser reconhecida. Isso acumulava latência perceptível e duplicava a espera que o detector de tela já controla.
FIX: `terminal-session-store.ts` reduziu os atrasos de início e pós-aceite para 250 ms. A proteção permanece orientada pela tela: o texto só é escrito quando há saída desenhada, a linha de entrada está visível/pronta e as reconferências continuam ativas.
VALIDAÇÃO: testes automatizados da suíte de terminal preservados; validação completa em execução (`npm test`).

[2026-06-23] Paridade chat→canvas — busca visual e skills; decisões de descarte.
CONTEXTO: revisão de quais funções do antigo modo chat faltavam no canvas. Decisões do usuário sobre cada lacuna:
- DESCARTADO POR DESIGN: exportar conversa (não faz sentido no terminal); QA Logger e painel de Código (observabilidade de backend — esta versão não dá problema o bastante para justificar). Histórico de sessões/Composer/ChatThread são intrínsecos ao chat e já têm substituto no canvas (terminais reais + scratchpads .md).
- ADIADO: Orquestrador (Configurações + Dashboard) — não existe camada de orquestração no modo canvas ainda; fica para quando ela for construída.
- MANTIDO COMO ESTÁ: painel Modelos do canvas (lista/remove). Pergunta em aberto registrada: ele pode ser redundante com as opções de agente/modelo/esforço do menu do terminal — decidir em rodada futura.
- ENTREGUE nesta rodada: busca visual + skills (abaixo).
BUSCA VISUAL: `SearchPanel` (novo item "Pesquisar" no menu de ferramentas) busca BLOCOS por título, nome do arquivo, texto da nota e comando do terminal (sem buscar o conteúdo dos .md em disco — só os campos do `data`). Clicar num resultado chama `focusNode`: `setCenter(x,y,{zoom})` na instância do React Flow capturada no `onInit` (os painéis ficam fora do `<ReactFlow>`, então não têm `useReactFlow`) e seleciona só aquele nó. `FlowPositionMapper` foi ampliado para incluir `setCenter`.
SKILLS: design do usuário — skill = ponteiro nomeado para um arquivo (nome/descrição/caminho), não um prompt embutido. `SkillsPanel` faz CRUD; `buildSkillActivationPrompt` monta a instrução "use a skill em <caminho>, leia e siga". Ativar envia ao terminal expandido (`store.sendText`) ou copia para o clipboard se nenhum estiver aberto. Persistência na tabela `settings` via `canvas:get/set-skills` (chave `canvas.skills`), sanitizada no backend (`sanitizeSkills` descarta entradas sem id/nome/caminho) — sem migration nova, no padrão dos outros ajustes do canvas. Tipo `CanvasSkill` em `types.ts` e espelhado no `vite-env.d.ts`.
TESTE: `npm run build` (tsc -b + vite), `npm run lint` e suíte (393 pass, +1 do round-trip/sanitização de skills) limpos.

[2026-07-04] Auditoria das ferramentas do canvas — 4 correções de UX/robustez + notas do canvas no painel.
CONTEXTO: verificação de que as 8 ferramentas do menu (Pesquisar, Projetos, Notas, Modelos, Prompts, Skills, Git, Configurações) funcionam de ponta a ponta. Todas as pontes IPC existiam; os defeitos eram de painel.
CORREÇÕES: (1) menu Ferramentas fecha ao selecionar (antes cobria o painel recém-aberto); (2) NotesPanel salvava a cada tecla via IPC e recarregava a lista inteira — agora edição local com debounce de 500 ms por nota, timers limpos no unmount; (3) GitPanel engolia erros de status/stage/commit — agora exibe a mensagem do backend, tem botão de refresh e dica quando não há projeto; (4) PromptsPanel protege a cópia contra falha do clipboard.
NOTAS DO CANVAS: o painel Notas lia só o banco de notas do chat (`notes:list`) e dizia "Nenhuma nota ainda" com blocos de nota visíveis no quadro. Agora tem duas seções: "Notas no canvas" (nós `type: 'note'`, clicar chama `focusNode`, "Nova nota" cria bloco via `addNode`) e "Notas salvas" (persistidas via IPC). Props `nodes`/`onFocusNode`/`onAddNote` passadas por `CanvasToolPanels`.
DESCOBERTA: a detecção de repos em Projetos varre só um nível abaixo da pasta escolhida (proposital, não desce em repo já detectado); busca recursiva com limite de profundidade ficou proposta, sem decisão.
TESTE: `npm run build`, lint dos arquivos alterados e suíte (396 pass) limpos.

[2026-07-30] Qualidade da função de prompts (cli-prompt.ts + presets de orquestração) — dedup, testes, heurísticas e conteúdo.
CONTEXTO: pedido explícito de revisão em 4 frentes na lógica que monta o prompt enviado às CLIs orquestradas (`app/src/features/chat/services/cli-prompt.ts` + `orchestrator-prompt-presets.json`).
DEDUP: `deepFreeze`/`createOpenEndedOrchestrationRules` estavam implementados duas vezes (uma em `orchestrator-prompt-presets.cjs` via `require`, outra em `orchestrator-prompt-presets.ts` via `import` do mesmo JSON). Extraídos para `electron/services/orchestration/orchestrator-prompt-presets-core.cjs` (CommonJS puro, `createPromptPresetsRuntime(promptPresets)`), consumido por `require()` do lado Electron e por `import` do lado Vite/frontend. Tipos expostos via `.d.cts` irmão (TS 5+ resolve declaração de `.cjs` só por `.d.cts`, não `.d.ts`) — não foi preciso ligar `allowJs` no tsconfig.
TESTES: não existia nenhum framework de teste em `app/src` (zero `.test.ts`, zero vitest/jest). Instalado `vitest` (natural com Vite já presente) via `npm run test:frontend` (`vitest.config.ts`, `include: src/**/*.test.ts`). Cobertura nova: `cli-prompt.test.ts` (createCliPrompt — contexto enxuto vs completo, protocolo de orquestração condicional, instruções de autonomia do Claude, memórias globais, skills, limite de 12 mensagens de histórico com offset de numeração, diff de projetos adicionados/removidos, anexos com preview; mais `shouldUseOrchestrationProtocol`, `shouldUseLeanContextForCurrentPrompt`, `resolveActiveProjectCwd` isolados) e `delegation-policy.test.ts` (`requiresDelegation`).
HEURÍSTICAS: os testes revelaram um bug real de regex em `TRIVIAL_PROMPT_REGEX` (`delegation-policy.ts` e seu espelho `.cjs`): o stem `obrigad` era seguido de `\b`, mas essa fronteira nunca casa dentro de "obrigado"/"obrigada" (a letra seguinte ainda é caractere de palavra) — agradecimentos comuns caíam no ramo de heurística por tamanho/verbo de ação em vez de trivial. Corrigido para `obrigad[oa]s?` nos dois arquivos (mantidos em sincronia, como o comentário do `.ts` já pedia). Também ampliada `SIMPLE_CURRENT_REQUEST_PATTERNS` em `cli-prompt.ts`: só cobria saudações de abertura fixas; confirmações/agradecimentos curtos de fechamento (valeu, obrigado, blz, beleza, sim, entendi etc.) recebiam contexto completo desnecessário.
CONTEÚDO DO JSON: `orchestrator-prompt-presets.json` mantido com a mesma estrutura de chaves (todos os consumidores — `cli-prompt.ts`, `orchestrator-settings-storage.ts`, `orchestration-runner.cjs`, `orchestrator-prompt-presets.test.cjs` — leem chaves específicas, reorganizar quebraria contrato). Só `delegationOnly.rules` foi enxugado: bullets redundantes sobre "exceção por intuição/urgência" e "metaperguntas" mesclados sem perder nenhuma instrução.
TESTE: `npm run build` (tsc -b + vite), `npm test` (electron, 396 pass) e `npx vitest run` (25 pass, novo) limpos após cada commit.
LIMITAÇÃO: dedup cobre só `deepFreeze`/`createOpenEndedOrchestrationRules` (o pedido de duplicação real de lógica). `delegation-policy.ts`/`.cjs` continuam sendo dois arquivos espelhados por design pré-existente (comentário "Keep in sync" no `.ts`) — fora do escopo pedido, mas o fix de regex foi replicado nos dois para não divergir.

[2026-07-30] FIX — dedup de `orchestrator-prompt-presets-core.cjs` quebrava `npm run dev` (tela preta) na entrada acima.
CONTEXTO: ao rodar o app após o merge da entrada anterior, a janela do Electron abriu preta (só a moldura, sem UI). O `vite build` (produção) tinha passado limpo, mas o `vite dev` nunca foi exercitado antes do merge.
CAUSA: `orchestrator-prompt-presets.ts` (frontend) importava `createPromptPresetsRuntime` do `orchestrator-prompt-presets-core.cjs` (named e, numa segunda tentativa, default import). O dev server do Vite não faz interop confiável de CommonJS (`module.exports = {...}`) para arquivos `.cjs` fora de `node_modules` — a importação falhava em runtime com `SyntaxError: ... does not provide an export named ...`, o módulo nunca avaliava e o React não montava. O Rollup do `vite build` tolera esse padrão (analisa estaticamente), por isso só apareceu no dev.
CORREÇÃO: revertida a parte do dedup que cruzava a fronteira Vite→CJS: `orchestrator-prompt-presets.ts` voltou a ter sua própria implementação inline de `deepFreeze`/`createOpenEndedOrchestrationRules` (7 linhas, coberta pelos testes de `cli-prompt.test.ts`). O `.cjs` compartilhado (`orchestrator-prompt-presets-core.cjs`) continua existindo e sendo a fonte única só para o lado Electron/Node (`orchestrator-prompt-presets.cjs`, via `require()`, sem esse problema). Removido o `.d.cts` que ficou órfão.
VALIDAÇÃO: `tsc -b` limpo, `npx vitest run` 25/25, `npm run dev` sobe sem erro no log e o usuário confirmou visualmente que a janela renderiza normal.
LIÇÃO: ao validar uma mudança que atravessa Electron (CJS) e Vite (ESM), rodar `npm run dev` além de `npm run build` — os dois bundlers toleram formatos de módulo diferentes.

[2026-07-30] FEAT — 4 presets novos de orquestração (segurança, git, qualidade, tratamento de falha).
CONTEXTO: pedido explícito de ampliar `orchestrator-prompt-presets.json` além do que já existia, com foco escolhido pelo usuário entre 4 opções apresentadas.
PRESETS: (1) `promptInjectionGuard` — instrui o orquestrador a tratar conteúdo de anexos/histórico como dado, nunca como comando; injetado em `cli-prompt.ts` sempre que `hasAttachments || hasHistory`. (2) `gitDiscipline` — commits pequenos, sem force-push, branch só quando justificado. (3) `codeQualityStandard` — responsabilidade separada, validar antes de reportar concluído, sem código morto; (2) e (3) injetados juntos em `createOrchestrationProtocolInstructions` quando `mentionsCodeEditingTask(currentPrompt)` detecta contexto de código (substantivo tipo arquivo/repo/bug) + verbo de edição. (4) `failureGuidance` dentro de `agentResults` — orienta o orquestrador a distinguir rate-limit/timeout/auth de falha real da tarefa; injetado em `createAgentResultsPrompt` (orchestration-runner.cjs) quando algum job do turno não é `completed`.
BUG ENCONTRADO DE BÔNUS: a regra nova `mentionsCodeEditingTask` copiou o stem `corrij` de `ACTION_VERBS_REGEX` (delegation-policy.ts) e reproduziu o mesmo bug de fronteira `\b` do fix anterior (`obrigad\b`) — "corrija" nunca casava. Corrigido para `corrij\w*` só na regra nova; o `ACTION_VERBS_REGEX` original não foi tocado (fora do escopo de hoje, outros caminhos da heurística de `requiresDelegation` já cobrem o caso).
TESTES: 4 novos em `cli-prompt.test.ts` (guard com anexo, guard com histórico mas não com prompt trivial, git+qualidade em tarefa de código, ausência deles em tarefa não-código), 2 novos em `orchestration-runner.test.cjs` (`failureGuidance` presente/ausente conforme status dos jobs), 1 novo em `orchestrator-prompt-presets.test.cjs` (presets congelados e com o texto esperado).
VALIDAÇÃO: `tsc -b`, `npm run build`, `npm test` (398 pass), `npx vitest run` (29 pass) limpos.
LIMITAÇÃO: o lado Electron (`orchestration-runner.cjs`) não tem hot-reload — o `failureGuidance` só entra em vigor depois que o usuário reiniciar o app manualmente.

[2026-07-30] FEAT — Canvas: criar/editar/excluir prompts customizados no PromptsPanel.
CONTEXTO: o `PromptsPanel.tsx` do Canvas (`src/features/canvas/components/tools/`) só listava e copiava automations; criar/editar/excluir já existia no Chat (`automation-storage.ts` + IPC `automations:save`/`automations:delete`) mas nunca foi ligado ao Canvas.
IMPLEMENTAÇÃO: seguido o padrão já usado pelo `NotesPanel.tsx` do Canvas — edição inline com autosave debounced (500 ms) via IPC direto (`window.felixo.automations.*`), sem importar do `features/chat` (convenção do projeto: painéis do Canvas falam direto com IPC). Botão "Novo prompt" cria automation com `scope: 'chat'` vazia; campos nome/descrição/prompt/scope editáveis inline só para automations customizadas (`isDefault !== true`); lixeira remove via `automations:delete`. Automations padrão (as 3 pré-fabricadas) continuam somente leitura.
VALIDAÇÃO: `tsc -b`, `npm run build`, `eslint` no arquivo, `npm test` e `npx vitest run` limpos. Sem suíte de teste de componente React no projeto (só serviços puros têm cobertura) — verificação funcional ficou para o usuário conferir manualmente no app.

[2026-07-30] FEAT — Numeração dos terminais abertos + painel "Terminais" para navegar entre eles.
CONTEXTO: pedido de um "id" por terminal do canvas que atualiza conforme os terminais abertos, com uma lista para o usuário passear entre eles.
IMPLEMENTAÇÃO: `nodes` no CanvasView.tsx é sempre append-only (`addNode` faz `[...current, node]`, nunca reordena), então a posição de um terminal nesse array já é a ordem de criação. `renderedNodes` (CanvasView.tsx) computa um `Map<id, posição>` sobre os terminais a cada render e injeta `terminalIndex` (1-based) nos dados renderizados do node — igual à convenção já usada por `initialTextReady`: campo de `TerminalNodeData` documentado como render-time only, nunca persistido (a função que persiste nodes trabalha sobre `nodes`, não sobre `renderedNodes`, então nunca vê esse campo). `TerminalNode.tsx` mostra "#N" no cabeçalho, ao lado do ícone. Nova ferramenta "Terminais" (`TerminalsPanel.tsx`) lista todos os terminais nessa mesma ordem/numeração, com indicador de atividade por linha (`useSessionSnapshot` por item, já que hooks não entram em loop) e clique centraliza+seleciona o bloco — mesmo padrão de `onFocusNode` do `SearchPanel`/`NotesPanel`. Como fecha lacunas a cada render, fechar o terminal #2 de 3 renumera o #3 para #2 automaticamente.
COORDENAÇÃO MULTI-AGENTE: outro agente estava editando `TerminalNode.tsx` e `terminal-session-store.ts` em paralelo (feature não relacionada: badge "aguardando aprovação"/`waiting_approval`), sem deixar nota no diretório de coordenação (`canvas-files` vazio no momento). Para não commitar o WIP alheio: `git stash push --keep-index` nos dois arquivos deles, reaplicada minha edição isolada sobre o HEAD limpo, validado build+testes+lint só com a minha parte, commitado, depois `git stash pop` nos dois (merge automático sem conflito — hunks em regiões diferentes do arquivo). Ao restaurar o trabalho deles, `TerminalsPanel.tsx` ficou com type error (`Record<SessionActivity, string>` sem `waiting_approval`, que só existe no lado deles). Corrigido o mapeamento de cor pra esse estado, mas **deixado sem commit de propósito**: commitar agora faria o histórico do `main` referenciar um valor de tipo que só existe no working tree, quebrando bisect até o outro agente commitar a feature dele. Esse ajuste de uma linha entra junto quando eles (ou eu, depois) commitarem `waiting_approval`.
VALIDAÇÃO: `tsc -b`, `eslint` (types.ts, CanvasView.tsx, CanvasToolPanels.tsx, CanvasToolsMenu.tsx, TerminalNode.tsx, TerminalsPanel.tsx), `npm run build`, `npm test` (398 pass) e `npx vitest run` (29 pass) limpos, testado isoladamente do WIP concorrente antes do commit. Sem verificação visual no app — usuário optou por conferir por conta própria.
LIMITAÇÃO: sem suíte de teste de componente React no projeto, a lógica de numeração (inline dentro do `useMemo` de `renderedNodes`) não tem cobertura automatizada — validada só por leitura + tsc + build.

[2026-07-30] FEAT — Lista de terminais vira dock fixo, clique abre pra digitar, setas navegam rápido.
CONTEXTO: usuário pediu 3 ajustes sobre a lista de terminais da entrada anterior: (1) painel fixo no canvas, não algo que se abre/fecha pelo menu; (2) clicar num terminal da lista deve mostrar no canvas E abrir a janela do terminal pra digitar (antes só centralizava); (3) setas cima/baixo trocam rapidamente entre os terminais.
(1) FIXO: `TerminalsPanel` saiu do switch de `CanvasToolPanels`/`CanvasToolsMenu` (removido de `CanvasTool`) e passou a ser renderizado direto pelo `CanvasView.tsx`, sempre montado (`absolute bottom-4 right-4`, canto livre — Controls fica bottom-left, MiniMap top-right). O componente mesmo decide não renderizar nada quando não há terminal.
(2) CLIQUE ABRE PRA DIGITAR: `onSelect` de cada linha agora chama `onFocusNode` (centraliza/seleciona) E `onExpandNode` (abre o `TerminalDrawer`, que já reusa a sessão xterm em background e foca ela automaticamente via `store.focus`).
(3) SETAS: aqui apareceu uma tensão real de arquitetura — `TerminalDrawer` sempre chama `store.focus(sessionId)` no `useEffect` quando o `sessionId` muda, roubando o foco do teclado do dock para o terminal. Se cada seta abrisse o drawer (como o clique faz), a segunda tecla de seta em sequência iria parar no shell (histórico do bash, não troca de terminal) em vez de continuar navegando a lista. Resolvido separando os dois gestos: seta cima/baixo só move o destaque + centraliza no canvas (`onFocusNode`), sem abrir o drawer — mantém o foco no dock, então dá pra "trocar rapidamente" segurando a seta. Enter (ou clique) confirma a linha destacada e aí sim abre o drawer pra digitar.
BUG DE LINT ENCONTRADO: primeira versão clampava o índice ativo (`activeIndex`) dentro de um `useEffect` chamando `setState` — anti-padrão pego pelo `eslint-plugin-react-hooks` (`set-state-in-effect`, cascata de renders desnecessária). Corrigido calculando o índice clampado no próprio corpo do componente (`Math.min(rawActiveIndex, terminals.length - 1)`) em vez de sincronizar via effect.
COORDENAÇÃO MULTI-AGENTE: mesma técnica da entrada anterior (`git stash push --keep-index` nos dois arquivos do outro agente, valida+commita isolado, `git stash pop` devolve o trabalho dele por cima). Dessa vez sem conflito de merge porque não precisei tocar em `TerminalNode.tsx` de novo. O ajuste de uma linha pra cor do estado `waiting_approval` em `TerminalsPanel.tsx` continua sem commit, pelo mesmo motivo já registrado.
VALIDAÇÃO: `tsc -b`, `eslint` (limpo depois do fix do `set-state-in-effect`), `npm run build`, `npm test` (398 pass) e `npx vitest run` (29 pass), testados isolados do WIP concorrente antes do commit. Sem verificação visual no app.

[2026-07-31] FIX — `start_app.py` corrigido para funcionar em macOS/Windows/Linux, com suíte de testes e CI multiplataforma.
CONTEXTO: o repositório foi apresentado ao time e o setup falhava em várias máquinas macOS. Revisão do launcher encontrou 8 defeitos, sendo o principal de macOS e nenhum coberto por CI (o workflow só validava `app/`).
(1) PEP 668 — CAUSA RAIZ DO PROBLEMA NO MAC: `ensure_python_requirements` e o bootstrap do menu rodavam `pip install` no Python do sistema. Com Homebrew no macOS (e o Python de distro no Debian/Ubuntu) o pip recusa com `error: externally-managed-environment` e o setup morria ali. Como o `requirements.txt` passou a listar `questionary`/`rich`, isso quebrava tanto Instalar quanto Iniciar. FIX: `run_pip_install` detecta a mensagem e repete com `--user`; dentro de venv não repete (lá `--user` é inválido) e falhas de outra natureza não disparam retry. Mensagens de erro passaram a dizer o que fazer (criar venv), em vez de só propagar o código de saída.
(2) INCOMPATIBILIDADE COM PYTHON 3.9 — descoberta ao montar a matriz de CI: `NodeBinAdder = Callable[[Path | str | None], None]` é atribuição de módulo, avaliada na hora do import; `from __future__ import annotations` adia anotações, não isso. Em Python 3.9 (o `python3` de sistema no macOS 12/13, justamente as máquinas afetadas) o import falhava com `TypeError` antes do menu conseguir explicar qualquer coisa. FIX: união entre aspas. Teste de regressão faz auditoria de AST procurando `|` avaliado em tempo de import.
(3) LIMPEZA DE PROCESSOS MATAVA PROGRAMA ALHEIO: `cleanup_app_processes` fazia `pgrep -f <app/node_modules>` e matava tudo que casasse. `pgrep -f` casa a linha de comando inteira, então pegava editor, shell e até o próprio `grep` com aquele caminho aberto — e rodava antes de subir o app, podendo derrubar a sessão de outra pessoa no mesmo checkout. Confirmado na máquina de dev: o processo do Copilot no VS Code casava o filtro antigo. FIX: só encerra processo cuja linha de comando nomeia um binário que o launcher realmente inicia (vite/electron/concurrently/wait-on), nunca a própria árvore de processos.
(4) MENU FALHAVA EM SILÊNCIO: quando o bootstrap do TUI falhava, `main()` caía em `run_direct(parse_args())` e subia o Electron direto — escondendo o erro de setup de quem estava justamente tentando resolvê-lo. FIX: falha com mensagem clara e código 1, como exige o GUIA-START-APP-SCRIPT.
(5) `os.killpg` sem tratamento no Ctrl+C: se o grupo sumisse entre o `poll()` e o kill, saía stack trace cru. FIX: `signal_process_group` cai para o processo isolado e engole erro de processo já colhido.
(6) `_menu_status` montava `str(None)` quando o binário do Node sumia entre a descoberta e a sondagem. FIX: `describe_installed_node` retorna `None` e o Status mostra estado real (incluindo a versão mínima exigida).
(7) CTRL+C TRAVAVA ~16s E MENTIA — encontrado rodando o app de verdade, não por leitura: `stop_process` também roda de dentro do handler de SIGTERM, que interrompe a thread principal já bloqueada em `Popen.wait()`. Nesse estado o objeto `Popen` não serve para colher o filho: tanto `wait(timeout=...)` quanto `poll()` travam no lock que o wait externo segura e nunca reportam a saída. Resultado: os dois timeouts de 8s estouravam sempre, o launcher mandava um SIGKILL desnecessário e imprimia "The app process did not exit" com o processo já morto. FIX: `process_has_exited` usa `os.waitpid(..., WNOHANG)`, que lê o status direto do SO sem passar pelo lock. Medido: Ctrl+C saiu de ~16s para 0.3s (rc 130), sem a mensagem falsa e sem processo órfão. Primeira tentativa de correção usou `poll()` e não resolveu — o diagnóstico só fechou depois de reproduzir o cenário isolado.
(8) SEM CI PARA O LAUNCHER: nenhum dos defeitos acima era pego automaticamente. FIX: job `launcher` no `ci.yml` roda os testes em Linux/Windows/macOS × Python 3.9 e 3.13, sem depender de Node.
VALIDAÇÃO: 55 testes (`python3 -m unittest discover -s tests`) passando, contra 7 antes. Cada correção foi verificada por teste de mutação — revertendo o fix no código, o teste correspondente falha (confirmado para PEP 668, filtro do pgrep, fallback do `main()`, fallback do killpg e a união do 3.9). Fluxo PEP 668 validado fim-a-fim com um interpretador falso que reproduz a recusa do Homebrew: recupera via `--user`. App subiu de verdade (`--skip-install --web`, Vite ok) e a limpeza não deixou processo órfão.
LIMITAÇÃO: não há máquina macOS/Windows nem Python 3.9 neste ambiente — a cobertura nesses alvos vem do CI, não de execução local. A compatibilidade com 3.9 foi verificada por auditoria de AST e emulação da semântica, não por interpretador real.

[2026-07-31] REFACTOR — `start_app.py` modularizado em `felixo_launcher/`, testes divididos por módulo.
CONTEXTO: continuação direta da entrada anterior. Ao revisar a entrega contra o checklist do padrão de qualidade, o item 2 ("arquivos faz-tudo devem ser tratados como sinal de refatoração") apontou um problema que a correção de macOS tinha agravado: o `start_app.py` estava com 1609 linhas e 73 funções cobrindo 9 responsabilidades distintas, e as correções somaram ~355 linhas a ele. Usuário optou por modularizar agora, direto no `main`.
ESTRUTURA: `start_app.py` continua na raiz — o `GUIA-START-APP-SCRIPT.md` exige isso — mas virou entrypoint fino (26 linhas) que só chama o pacote. `felixo_launcher/` ficou com um módulo por responsabilidade: `paths` (caminhos), `config` (arquivo local de configuração), `node` (descoberta de Node/npm), `commands` (resolver/executar comandos filhos), `process` (parar app e limpar processos), `node_deps` (npm install), `python_deps` (pip + bootstrap do menu), `git` (atualizar checkout), `runner` (preparo de ambiente e caminho por flags), `menu` (menu interativo), `cli` (entrypoint). Dois nomes mudaram de casa por pertencerem melhor a outro módulo: `CONFIG_FIELDS` saiu de `paths` para `config`, e `ensure_tui_dependencies` saiu de `menu` para `python_deps`.
TESTES TAMBÉM DIVIDIDOS: manter um `test_start_app.py` único importando tudo de um entrypoint fino recriaria o mesmo arquivo faz-tudo do outro lado. Virou um arquivo de teste por módulo (`test_node`, `test_process`, `test_python_deps`, `test_tui_bootstrap`, `test_status`, `test_windows`, `test_requirements`, `test_python_compat`) + `tests/support.py` com os helpers compartilhados.
ARMADILHA DE `mock.patch` QUE APARECEU AQUI: com módulo único, `patch("start_app.X")` sempre funcionava. Depois de separar, um módulo que faz `from .outro import X` guarda a própria referência a `X` — então patchar no módulo que *define* não afeta quem *importou*. Dois testes passaram a rodar código real sem avisar: o do menu chegou a abrir o menu interativo de verdade e travou a suíte, e o de Status executou o `/bin/node` real (v18.19.1) em vez do mock. Corrigido patchando onde o nome é procurado (`felixo_launcher.cli.ensure_tui_dependencies`, `felixo_launcher.menu.probe_command`), não onde é definido.
`test_python_compat` PASSOU A DESCOBRIR OS ARQUIVOS: antes tinha uma lista fixa (`LAUNCHER_FILES`) que já nascia desatualizada depois da divisão. Agora varre `felixo_launcher/*.py` e `tests/*.py`, com um teste extra que falha se a varredura não encontrar nada — sem isso, um glob vazio faria as outras verificações passarem por vacuidade.
COMANDO DE TESTE MUDOU: `python3 -m unittest discover -s tests -t .` (o `-t .` é necessário para os imports relativos do pacote de testes). CI e README atualizados no mesmo passo; confirmado que o comando antigo falha, para a mudança não ser por suposição.
VALIDAÇÃO: 56 testes passando (era 55; o novo é a guarda da varredura). Comportamento preservado provado por mutação — os 5 defeitos da entrada anterior foram reintroduzidos um a um no código já modularizado e cada um derrubou a suíte (filtro do pgrep, retry PEP 668, fallback do `main()`, colheita via `waitpid`, união do 3.9). App real: menu desenha com as 6 opções, `--web` sobe o Vite, Ctrl+C sai em 0.3s (rc 130) sem mensagem falsa e sem órfão. Auditoria de AST em todos os módulos: nenhum nome indefinido, nenhum import não usado — pegou dois `import` faltando (`json`, `re` em `node.py`) que o parse sozinho não acusaria.

[2026-07-31] FIX — Correções encontradas rodando o app de verdade (o que os testes não pegaram).
CONTEXTO: usuário rodou `python3 start_app.py` na máquina dele (Ubuntu, `/usr/bin/python3`) e a entrega anterior falhou na tela: parede de erro do PEP 668 no Instalar/Setup, e o Iniciar bloqueado com "Falha instalando dependências Python". Correção anterior estava validada só com pip simulado — o simulador aceitava `--user`, o pip real do Debian não. Lição: teste com dublê que eu mesmo escrevi confirma a minha suposição, não a realidade.
(1) `--user` TAMBÉM É BLOQUEADO NO DEBIAN/UBUNTU: o retry que eu tinha adicionado não resolvia nada aqui. Verificado rodando `pip install --user rich` no python do sistema: mesma recusa. FIX: cadeia de fallback — install simples → `--user` → `--break-system-packages` (o override que o próprio PEP 668 define). Homebrew costuma aceitar o `--user`; Debian precisa do terceiro passo.
(2) INSTALAVA O QUE JÁ ESTAVA INSTALADO: `ensure_python_requirements` chamava pip incondicionalmente. Como Ubuntu já traz `questionary`/`rich`, a parede de erro aparecia para instalar pacotes que já estavam lá. FIX: checa `tui_dependencies_importable()` antes e sai com 0 — na máquina do usuário isso sozinho já elimina toda a saída de erro.
(3) DEPENDÊNCIA DO MENU BLOQUEAVA O APP: `_menu_start` e `run_direct` abortavam quando o pip falhava. Mas esses pacotes só desenham o menu — o app é Node e não precisa deles; pior, o menu já estava na tela quando a mensagem aparecia. FIX: avisa em amarelo e segue. `_menu_install` também deixou de chamar tudo de "falhou" quando só a parte Python falhou e o Node ficou pronto.
(4) DETECTOR DE IMPORTS CAPTURAVA COMENTÁRIO: apareceu na tela como `Missing npm dependencies detected: finished a turn, ready for more`. O `[\s\S]*?` da regex atravessava linhas e casava a palavra `import` de um trecho com uma string qualquer muito depois — no caso, prosa dentro de um comentário em `terminal-session-store.ts`. FIX: regex ancorada em início de statement e sem cruzar aspas/;. Validada em 9 casos (incluindo import multilinha e string que contém a palavra import) e contra a base inteira: 23 specifiers reais, zero lixo.
(5) CTRL+C DEMORAVA DEMAIS NO DESKTOP: encontrado rodando o app Electron de verdade, não por leitura. O caminho desktop (npm → concurrently → electron) tem processo que ignora SIGTERM; com os dois timeouts de 8s, o encerramento levava 8s+ mesmo depois do processo morrer. FIX: `GRACEFUL_STOP_TIMEOUT=5s` e `FORCED_STOP_TIMEOUT=2s` — SIGKILL não é capturável, então esperar 8s depois dele era puro desperdício. Medido com árvore que ignora SIGTERM: 8.12s → 5.10s; no caso normal (o que de fato acontece), 0.09s.
(6) FALSO POSITIVO NO GUARD DE 3.9: o teste que criei na entrega anterior acusava `re.MULTILINE | re.VERBOSE` como união PEP 604. É OR de flags, válido em qualquer versão. FIX: o teste passou a distinguir união de *tipos* (operando que nomeia tipo ou `None`) de OR de valores; confirmado que continua pegando a união real por mutação.
VALIDAÇÃO: 61 testes passando (era 56). App desktop rodado de verdade com screenshot da tela: canvas carregado, toolbar completa, terminal ativo e dock de Elementos — o launcher entregou o app funcionando. Menu real dirigido por stdin mostra "Dependências prontas" sem parede de erro, e o Iniciar sobe o Vite em vez de bloquear.
LIMITAÇÃO: as correções (1) e (2) foram verificadas no Debian/Ubuntu real desta máquina; no macOS continuam sem execução real — a cobertura lá segue sendo o CI.

[2026-07-31] FEAT — Atualização automática e silenciosa a cada início do app.
CONTEXTO: usuário pediu que o launcher faça fetch/pull sozinho antes de abrir, para o time não precisar ficar rodando `git pull` só para descobrir se saiu versão nova.
DECISÃO CENTRAL — ATUALIZA A BRANCH ATUAL, NÃO A DE PRODUÇÃO: o `update_source_from_branch` que já existia (menu "Atualizar" e `--update`) puxa de `origin/production`. Usar ele no início seria perigoso: o usuário estava em `main`, e um pull silencioso de `production` arrastaria o checkout para outro lugar sem pedir. O novo `auto_update` só faz fast-forward da branch em que a pessoa **já está**.
SEGUNDA DECISÃO — NUNCA BLOQUEIA O APP: como isso roda em todo início, uma conveniência de fundo não pode ser o motivo de o app não abrir. `auto_update` retorna bool (atualizou ou não) em vez de código de erro, e toda condição adversa simplesmente pula: sem git, fora de checkout, sem rede, tree sujo, histórico divergido, detached HEAD. Isso contrasta de propósito com o `update_source_from_branch`, que é explícito e trata falha como falha — os dois convivem com contratos diferentes e o docstring do módulo registra o porquê.
TREE SUJO É O CASO IMPORTANTE: `merge --ff-only` recusaria de qualquer jeito, mas o risco real era deixar alguém no meio de um conflito num lançamento em que ela só queria abrir o app. Trabalho não commitado sempre ganha da atualização.
TIMEOUT: `fetch` sem rede fica pendurado. Comecei com 10s e medi — 10.1s de espera olhando terminal vazio, ruim demais para toda inicialização. Baixado para 4s, que é o custo total do recurso quando não há rede; com rede e já atualizado, 0.087s (contagem de commits via `rev-list --count` antes de qualquer coisa cara).
DESLIGÁVEL: `FELIXO_AUTO_UPDATE=off` ou `--no-auto-update`. Necessário para CI, que precisa compilar o commit que baixou — verificado que o job atual só roda `--help`, que sai antes de qualquer update.
ORDEM IMPORTA: o auto-update roda **antes** do `ensure_dependencies`, com `force_install` quando puxou commits novos, para que um `package.json` atualizado tenha as dependências instaladas no mesmo início.
VALIDAÇÃO: 78 testes (era 61), sendo 17 novos em `tests/test_git.py` — incluindo 3 de integração que criam repositórios git de verdade e provam o fluxo real: puxa commit novo (v1→v2), preserva arquivo com alteração local não commitada, e não imprime nada quando já está em dia. Demonstração fim-a-fim num clone real: detectou "VERSAO 1" → atualizou → "VERSAO 2 - NOVA". Offline medido em 4.1s (cortado pelo timeout, app abre em seguida).

## Registro de Trabalho — 2026-09-01 (parte 22) — índice de conexões do Canvas

PEDIDO: reduzir o custo de renderização do Canvas, que repetia varreduras de
`edges` e `nodes.find()` para cada terminal e arquivo.

FEITO: criado `canvas-connection-index.ts`, com construção linear do mapa de
nós, terminais, links arquivo↔terminal e nomes de arquivos por terminal.
`CanvasView` usa a mesma instância, memoizada por `nodes`/`edges`, no
`renderedNodes` e no efeito de resolução. Direções invertidas, deduplicação,
hidratação, remoções e arestas inválidas têm cobertura em
`canvas-connection-index.test.ts`; as ações pontuais continuam fora do hot
path.

BENCHMARK: o fixture opt-in mediu baseline versus índice em 100/500/1.000 nós
e 252/1.252/2.502 arestas, nos cenários render, drag, resize, criação/remoção
de aresta e mudança de dados. p50/p95 baseline → índice (ms):

| nós | render | drag | resize | aresta | dados |
|---:|---:|---:|---:|---:|---:|
| 100 | 0,60/1,02 → 0,29/0,43 | 0,41/0,48 → 0,12/0,34 | 0,38/0,42 → 0,29/0,32 | 0,41/0,73 → 0,19/0,26 | 0,31/0,49 → 0,11/0,12 |
| 500 | 5,18/6,25 → 1,53/1,69 | 4,34/6,00 → 1,10/1,39 | 4,72/5,08 → 1,02/1,51 | 7,08/8,34 → 1,49/1,61 | 9,65/10,28 → 1,62/1,64 |
| 1.000 | 27,68/27,68 → 4,41/4,41 | 30,28/30,28 → 3,95/3,95 | 20,51/20,51 → 4,17/4,17 | 20,34/20,34 → 3,29/3,29 | 21,28/21,28 → 3,64/3,64 |

VALIDAÇÃO: `npm test` 917 testes, 907 aprovados, 10 skips e zero falhas;
`npm run test:frontend` 724 aprovados e 1 skip opt-in; build com 717 módulos;
lint sem erros e os 2 avisos React existentes; `git diff --check` limpo.

LIMITE: o benchmark mede a derivação do hot path e confirma equivalência, mas
não substitui React Profiler/medição de heap nem uma sessão visual do app.
Prompts, retomada e links continuam cobertos pelos contratos existentes e não
foram alterados.

Estado final: implementação e cobertura concluídas, com a limitação visual
registrada para revisão posterior.

## Registro de Trabalho — 2026-09-01 (parte 23) — medição do renderer do Canvas

FEITO: criada a bancada `npm run benchmark:canvas-connections`, com rota
controlada no Electron/Vite, React Profiler e heap/GC. A matriz usa 100, 500 e
1.000 nós, 253, 1.253 e 2.503 arestas, cinco cenários, baseline/índice, um
aquecimento, ordem alternada e cinco repetições. A projeção compartilhada foi
conferida para garantir que o índice e o baseline renderizam os mesmos links,
agentes e nomes de arquivos.

RESULTADO: coleta Windows x64 de 01/09/2026 (Node 24.18.0, Electron 41.10.7,
viewport 1.584×936) reduziu o p95 em todas as 15 combinações, entre 5,96% e
89,81%. Em 1.000 nós, render inicial foi 269,92→131,66 ms e drag foi
10,20→5,60 ms. O heap delta p95 ficou entre -0,85 e +0,36 MiB contra o
baseline.

INSTRUMENTAÇÃO: `CanvasView` aceita `?canvas-profiler=1` para registrar commits
em `window.__felixoCanvasProfiler`, mas o Profiler não fica ativo por padrão.
O harness é deliberadamente leve: usa ReactFlow real, porém não inicia PTYs nem
acessa arquivos persistidos.

VALIDAÇÃO: backend 917 aprovados/10 skips, frontend 729 aprovados/1 skip,
build com 721 módulos, lint sem erros e `git diff --check` limpo. A tabela
completa, o método e as limitações estão em `app/benchmarks/README.md`.

LIMITE: a coleta não substitui a validação visual interativa de links,
labels, prompts, retomada ou remoção no Canvas real; o delta de heap não é
análise de retenção em sessão longa.
## [2026-09-01] PTY do macOS falhava no app empacotado por permissão do helper

### Sintoma

O app instalado no macOS mostrava `Camada de inicialização do PTY: não foi
possível criar a sessão: pty_spawn_failed` ao abrir um terminal de agente. A
mensagem correspondia ao `posix_spawnp failed` já observado anteriormente no
runner macOS, mas o build continuava permitindo que o defeito chegasse ao
usuário.

### Causa

`node-pty@1.1.0` distribui os binários
`prebuilds/darwin-{arm64,x64}/spawn-helper` no tarball npm com modo `0644`.
O projeto já mantinha `node-pty` fora do `app.asar`, porém o
`electron-builder` preservava esse modo ao copiar o arquivo para
`app.asar.unpacked`. O macOS consegue ler o binário, mas `posix_spawnp` exige
que o helper tenha bit de execução; por isso nenhuma CLI chegava a iniciar.

### Correção

- `app/scripts/fix-native-pty-permissions.cjs` foi adicionado como hook
  `afterPack`; ele procura os helpers no diretório realmente desempacotado e
  restaura o modo executável antes da assinatura/distribuição.
- `pty-native-assets.cjs` aplica a mesma correção de forma idempotente no
  modo desenvolvimento e prefere o caminho `app.asar.unpacked` quando o app
  já está empacotado.
- O `asarUnpack` existente permanece obrigatório: a permissão correta não
  resolve um executável que ainda esteja virtualizado dentro do asar.
- O hook falha o build macOS se o helper não estiver presente, evitando
  publicar outro instalador em que todo terminal quebre.

### Evidência e validação

- O tarball oficial de `node-pty@1.1.0` foi conferido: os helpers chegam como
  `-rw-r--r--`.
- `npm test`: **925/925** testes Electron/backend.
- `npm run test:frontend`: **721/721** testes.
- `npm run lint`: zero erros; permanecem somente os 2 avisos React anteriores
  em `SearchPanel.tsx`.
- `npm run build`: **716 módulos** transformados, com apenas o aviso conhecido
  de chunk acima de 500 kB.
- `npm run pack` Linux terminou com sucesso; no artefato real os dois helpers
  Darwin em `resources/app.asar.unpacked` ficaram com modo **775**.
- Testes específicos cobrem desenvolvimento, `afterPack`, app.asar,
  plataforma Windows e a ausência de alteração quando o helper já é
  executável.

### Limite

Esta máquina é Linux; a execução efetiva de uma PTY nativa dentro de um `.app`
macOS depende do próximo job `macos-latest`/instalador publicado. A correção
foi desenhada para o caminho do builder e o CI deve confirmar o artefato
Darwin antes da distribuição.

Estado final: correção pronta para commit, push e acompanhamento do CI/release.

## [2026-09-01] Cobertura nativa do /status do Claude e da fila de escrita nos três SOs

### Lacuna investigada

A auditoria multi-OS havia encontrado duas coberturas incompletas: a fila de
escrita atravessava uma PTY real apenas no Linux e pulava Windows/macOS por
usar `/bin/sh` + `cat`; a consulta de limites do Claude exercitava somente um
PTY falso, no adapter do sistema atual. Assim, a suíte não verificava o
ConPTY, o shell de login do macOS, a navegação por setas ou a passagem real de
`CLAUDE_CONFIG_DIR`.

### Implementação

- `pty-write-queue.integration.test.cjs` agora cria uma fixture Node temporária
  e passa pelo `PtyProcessManager` e `node-pty` reais. O launch spec nativo é
  exercitado em cada runner: execução direta no Linux, shell de login no macOS
  e `cmd.exe`/ConPTY no Windows.
- A fixture cobre payload grande com centenas de linhas, acentos, emoji,
  marcador posterior para verificar FIFO, EOF e uma linha delimitada abaixo do
  limite canônico do terminal. Os timeouts são sempre limpos e o processo é
  encerrado no `finally`, evitando que a suíte fique viva por 20 segundos após
  um teste já concluído.
- `claude-usage-query.integration.test.cjs` instala um shim `claude`/`claude.cmd`
  temporário, sem rede e sem credenciais reais. O processo filho usa modo raw,
  responde a `/status`, registra as setas de navegação e publica um quadro
  sintético Status/Usage. O teste verifica os percentuais, detalhes, perfil,
  `CLAUDE_CODE_SKIP_PROMPT_HISTORY`, `CLAUDE_CONFIG_DIR` e o launch da
  plataforma.
- A consulta nativa também prepara o `spawn-helper` do `node-pty` no macOS,
  o mesmo cuidado já aplicado ao terminal do Canvas; sem essa etapa o helper
  pode chegar do tarball npm sem permissão de execução e falhar em
  `posix_spawnp`.
- O CI ganhou um passo nomeado para executar explicitamente as duas integrações
  na matriz Linux/macOS/Windows. Não há `skip` por sistema: ausência de
  `ComSpec`, shell ou addon compatível produz diagnóstico explícito e falha o
  runner.

### Validação

No Linux, o gate focado passou com **5/5** testes em 2,8 s; `npm test` passou
com **932/932** testes unitários. A partir daqui, `npm test` descobre somente os
testes Node unitários e `npm run test:native` mantém as duas integrações nativas
isoladas, permitindo que a matriz confirme ConPTY e shell de login do macOS sem
deixar o runner unitário pendurado quando um handle nativo demora a ser
liberado. A confirmação efetiva dos três runners será registrada junto do
commit/release após o push.

Estado final: implementação concluída localmente, pronta para commit, push,
acompanhamento do CI/release e encerramento da task no Notion.

## [2026-09-01] Typecheck incremental do build

### Causa encontrada

Os projetos `tsconfig.app.json` e `tsconfig.node.json` já declaravam
`tsBuildInfoFile`, mas não declaravam `incremental`. Como ambos usam `noEmit`,
o `tsc -b` encontrava o cache, porém considerava `src/App.js` e
`vite.config.js` ausentes e reconstruía os projetos em todas as execuções.
Isso mantinha o typecheck repetido na faixa de 51–58 s e perto de 670 MiB de
RSS no ambiente local.

### Implementação

- `incremental: true` foi declarado nos dois tsconfigs, preservando `noEmit`,
  `skipLibCheck`, os includes completos e todas as regras de segurança de
  tipos.
- O `npm run build` continua usando `tsc -b` antes do Vite; o build mode agora
  reconhece os `.tsbuildinfo` como saída observável e salta projetos sem
  entradas alteradas.
- `npm run typecheck:full` usa `--force` para uma auditoria limpa, enquanto
  `npm run typecheck` é o caminho incremental normal.
- `typecheck-performance.cjs` mede o comando oficial em cinco execuções frias
  e cinco incrementais, com p50/p95 de tempo e RSS, sem apagar caches ou
  ocultar erros. Quatro testes cobrem argumentos, percentis, resumo e falhas.

### Medição local

Linux x64, Node 25.9.0, TypeScript 6.0.3, percentil linear:

| Modo | Baseline p50/p95 | Atual p50/p95 | RSS baseline p50/p95 | RSS atual p50/p95 |
| --- | ---: | ---: | ---: | ---: |
| Frio | 51,41 / 54,67 s | 52,60 / 54,24 s | 673.060 / 683.753 KiB | 662.904 / 668.941 KiB |
| Sem mudança | 54,96 / 58,01 s | 0,80 / 0,93 s | 674.420 / 682.664 KiB | 72.364 / 72.650 KiB |

O caminho sem mudança reduziu aproximadamente 98,5% do tempo e 89,3% do
RSS. O cold permaneceu equivalente em parede, com queda de RSS e sem remoção
de qualquer fonte da verificação.

### Validação

`npm run typecheck:full`, `npm run build`, `npm test` (943/943),
`npm run test:frontend` (734 + 1 skip), `npm run test:native` (5/5), lint
(0 erros, 2 avisos React preexistentes), `npm run pack` e o smoke do artefato
Linux passaram. A confirmação multi-SO será registrada junto do CI/release.

[2026-09-01] Correção complementar da integração nativa — o glob original de
`npm test` incluía as fixtures `*.integration.test.cjs`, fazendo o job Windows
ficar preso quando um handle ConPTY falhava durante a limpeza. A descoberta de
testes Node foi isolada em `scripts/run-node-unit-tests.cjs`; as integrações
passaram a `npm run test:native`, com concorrência 1. A fixture Windows usa
modo raw para Ctrl-Z, aceita um marcador de EOF quando o console consome o
controle e remove somente os CRs de confirmação do protocolo.

Também corrigido `PtyProcessManager.safeKill`: `node-pty` não aceita sinal
explícito no Windows, então o manager agora chama `kill()` nessa plataforma.
`pty-process-manager.test.cjs` cobre a regressão e evita que timeout/restart do
drawer deixe processos ou handles ConPTY vivos. Validação local: manager
43/43, `npm test` 933/933 e `npm run test:native` 5/5; a confirmação remota da
matriz e do release permanece pendente neste ponto.

## [2026-09-01] Retenção e renderização do histórico da CLI

O histórico do chat legado passou a ter duas camadas. A camada visual é
limitada por sessão a 240 chunks, 240.000 caracteres e 32.000 caracteres por
chunk; a orquestração usa uma janela global de 720 eventos. Texto adjacente do
mesmo item é coalescido, a cauda é mantida e a interface sinaliza o volume que
ficou fora da janela. A fila do hook é agrupada por frame/timeout e os chunks
imutáveis são memoizados, reduzindo cópias e renders desnecessários.

Os eventos também são arquivados em JSONL temporário fora do estado React,
com sequência, metadados, status e tamanho lógico. O IPC recupera o replay
completo para a exportação de análise e permite limpar sessões ignoradas; o
arquivo é rotacionado/limpo no início, no clear e no encerramento. Assim, a
janela visual pode ser pequena sem fazer cópia, exportação ou diagnóstico
perderem os eventos necessários.

A bancada Electron mede baseline e atual com as mesmas fixtures (40; 600;
2×320; 4×120), Profiler, latência p50/p95, DOM, heap após GC e RSS. O check
pesado passou: na fixture longa foram retidos 240 de 527 chunks lógicos; na de
alta frequência, 480 de 564; e a de quatro sessões reteve 428. Os maiores DOMs
atuais foram 27/172/343/308 contra 27/377/404/308 no baseline. No run isolado
da fixture longa, o p95 ficou 31,70 ms → 32,55 ms e o heap p95 2,95 MiB →
1,94 MiB; a diferença de tempo é tratada como variância local, não como ganho
universal. A exportação de análise mantém o histórico completo enquanto a
execução está disponível.

Validação local: `npm test` 951/951, `npm run test:frontend` 742 + 1 skip,
`npm run test:native` 5/5, lint sem erros (2 warnings React preexistentes),
`npm run typecheck:full`, build, testes do store/JSONL/runner e benchmark
Electron `--check` passaram. CI/release multi-SO e o registro no Notion são os
próximos passos do workflow.

## Registro de Trabalho — 2026-09-02 (parte 24) — tamanho e custo do npm-runtime do instalador

PEDIDO: executar a task do Notion [“Felixo AI Core/Performance — Medir e
reduzir o npm-runtime no instalador”](https://app.notion.com/p/Felixo-AI-Core-Performance-Medir-e-reduzir-o-npm-runtime-no-instalador-3cc91f95497e81bc8283eb354c823b89).

DIAGNÓSTICO: o hook `beforePack` copiava a árvore de `npm 11.19.1` para
`build/npm-runtime`, removendo apenas `docs`, `man` e Markdown. O projeto não
media quantidade/bytes do recurso, compactação, startup nem primeira
instalação do npm no Electron, e o smoke não informava o tamanho do runtime
efetivamente presente no artefato.

IMPLEMENTAÇÃO:

- `bundle-npm-runtime.cjs` passou a exportar a política anterior para
  comparação e a política atual, que remove apenas documentação, source maps e
  diretórios não runtime: `test(s)`, `__tests__`, `example(s)`, `fixture(s)`,
  benchmarks, coverage, snapshots, `.github` e `.nyc_output`;
- a cópia mantém `bin/npm-cli.js`, `lib`, `package.json`, dependências de
  produção e o Python/arquivos auxiliares do `node-gyp`; nenhuma remoção de
  módulo de runtime é inferida por nome;
- `npm-runtime-performance.cjs` cria JSON por SO com bytes descompactados,
  arquivos, `tar.gz` portátil com mtime fixo, startup, primeira instalação e
  atualização. O smoke local offline executa lifecycle, PATH, prefixo,
  permissões e persistência em cada política;
- o CI roda `npm run benchmark:npm-runtime:check -- --iterations=2` na matriz
  Ubuntu/Windows/macOS e sobe um relatório por runner; o workflow de release
  sobe também o JSON do smoke do instalador;
- `release-smoke.cjs` registra `runtime.files`, `runtime.unpackedBytes` e
  `timings` do npm, mantendo o artefato e os dados do usuário descartáveis.

MEDIÇÃO LOCAL: Linux x64, Node 25.9.0, Electron 41.10.7 e npm 11.19.1, três
repetições. Baseline → atual: 1.557 → 1.527 arquivos; 8.882.285 → 8.814.897
bytes descompactados (−67.388 B, −0,76%); 2.310.946 → 2.264.260 bytes
`tar.gz` (−46.686 B, −2,02%). No último run, startup p50/p95: 361,935/400,447
→ 396,303/403,559 ms; primeira instalação: 1.071,468/1.336,693 →
1.073,195/1.347,825 ms; atualização: 1.091,226/1.154,682 →
1.099,577/1.110,710 ms. O tempo fica registrado para acompanhamento e não é
tratado como uma melhoria universal de uma única máquina.

VALIDAÇÃO: `npm test` 958/958, `npm run test:frontend` 742 aprovados + 1
skip, `npm run test:native` 5/5, typecheck completo, build, lint sem erros
(somente os 2 warnings React preexistentes), testes focados, benchmark com
`--check`, `npm run pack`, smoke de `release/linux-unpacked` e `git diff
--check` passaram. O smoke empacotado mediu runtime de 1.527 arquivos e
8.814.897 bytes, startup 415 ms, primeira instalação 941 ms, atualização
1.017 ms, PTY, PATH, permissões, prefixo e persistência válidos.

LIMITE: `tar.gz` é uma métrica comparável do conteúdo e não o formato final de
cada instalador. A confirmação dos valores específicos de Windows e macOS
fica nos JSONs da matriz CI/release.

Estado final: implementação, medição, validação e documentação concluídas;
pronta para commit, push, acompanhamento do CI/release e encerramento da task
no Notion.

## Registro de Trabalho — 2026-09-03 — Canvas: degradação e ciclo de vida no Linux

A task de performance foi investigada com as bancadas de PTY/xterm e React
Flow. Em Linux x64 (4 CPUs, 11,6 GiB, Electron 41.10.7), 20 terminais com
8.000 linhas e scrollback de 20k chegaram a 706,0 MiB de RSS p95 do renderer,
264,20 MiB de delta de heap do stream e resume de 8,09s. O limite adaptativo
de 5k reduziu esses números para 565,4 MiB, 180,08 MiB e 4,59s, mantendo
saída, identidade, attach/detach e resume íntegros. O heap pós-GC retornou
próximo da linha de base; a carga explica a degradação observada, sem provar um
vazamento global.

A causa concreta encontrada foi o caminho genérico de remoção do React Flow:
ele persistia a exclusão, mas podia deixar a sessão do terminal viva. A nova
fronteira `releaseRemovedCanvasNodes` libera PTY/xterm/listeners/timers dos
terminais removidos uma única vez, sem carregar o runtime lazy para outros
tipos de nó. A geração de limpeza do `DeferredTerminalSessionStore` evita que
um `ensure` atrasado recrie uma sessão após `clear`. Testes unitários cobrem os
dois contratos e o gate de scrollback usa delta de heap quando o RSS do
renderer compartilhado está contaminado.

A bancada React Flow real também foi executada com 1.000 nós e 2.503 arestas;
o índice reduziu p95 em criação/remoção de aresta (59,70 → 14,38 ms) e mudança
de dados (61,90 → 12,31 ms), enquanto render inicial, drag e resize ficaram
dentro da variância registrada. Documentação detalhada, comandos e limitações
estão em `app/benchmarks/README.md` e `ARQUITETURA.md`. A coleta de heap usa
`performance.memory` e não substitui snapshot DevTools com webviews e CLIs
reais; esse limite foi registrado para eventual investigação específica.

## Registro de Trabalho — 2026-09-03 — avaliar alternativa ao npm-runtime do instalador

PEDIDO: executar a task [Felixo AI Core/Arquitetura — Avaliar alternativa ao
npm embutido sem perder a instalação de CLIs](https://app.notion.com/p/Felixo-AI-Core-Arquitetura-Avaliar-alternativa-ao-npm-embutido-sem-perder-a-instala-o-de-CLIs-3cc91f95497e81e99473da3d6facda1).

DIAGNÓSTICO: o app instala CLIs oficiais sem depender de Node/npm do usuário,
usando `app/node_modules/npm` empacotado, prefixo isolado em `userData/clis`,
shims `node`/`npm` apontando para o Electron e PATH controlado. Portanto, uma
troca por pnpm, Yarn ou Corepack precisa conservar instalação/atualização,
binários, permissões, offline, perfis isolados e CLIs com dependências nativas;
alterar somente o `package.json` não seria uma avaliação suficiente.

IMPLEMENTAÇÃO:

- `app/scripts/package-manager-alternatives-performance.cjs` passou a
  comparar o npm-runtime atual, pnpm, Yarn Classic, Yarn moderno e Corepack.
  A bancada usa versões controladas pelo Corepack, prefixos/cache/store
  descartáveis, um `tar.gz` local, o modo Node do Electron e sem alterar
  instalações globais;
- o npm reutiliza a bancada de runtime existente. pnpm é exercitado com
  `global-dir` e `PNPM_HOME/bin`; Yarn Classic com `global-folder` e
  `prefix/bin`; ambos validam instalação, atualização, prefixo, PATH, shim,
  execução e versão da CLI. O fixture usa `--ignore-scripts` para não executar
  código externo; scripts nativos de CLIs oficiais ficaram explicitamente como
  gate de migração;
- Yarn moderno é medido no runtime/startup e sondado com `global add`; sua
  falha esperada é registrada porque PnP/`dlx` não equivale ao global install
  persistente requerido pelo launcher. Corepack é medido como ponte, com
  runtime próprio e bootstrap frio/quente dos gerenciadores;
- o script aceita `--check` e `--strict`, grava JSON sem caminhos privados e
  tem testes unitários para parsing, medição, recomendação e validação;
- `app/package.json`, `ci.yml`, README, guia do desenvolvedor, guia de execução,
  arquitetura e catálogo de benchmarks documentam o comando. CI executa a
  comparação na matriz Ubuntu/Windows/macOS e publica um JSON por runner;
- a bancada do npm passou a exportar somente as funções necessárias para
  reutilização, sem mudar a política de empacotamento nem o caminho de
  produção.

MEDIÇÃO LOCAL: Linux x64, Node 25.9.0, Electron 41.10.7, duas repetições.
O npm 11.19.1 mediu 1.527 arquivos, 8.814.897 bytes descompactados e
2.264.260 bytes em `tar.gz`; startup p50/p95 de 2.093,213/2.786,998 ms,
primeira CLI 2.857,103/2.925,176 ms e atualização 3.391,189/3.666,694 ms.
pnpm 11.25.0 mediu 456 arquivos, 20.297.574 bytes e 5.084.086 bytes
comprimidos; startup direto 4.317,236 ms, primeira CLI p50/p95
11.677,711/12.243,780 ms e atualização 11.542,162/12.322,060 ms. Yarn
Classic 1.22.22 mediu 12 arquivos, 5.340.738 bytes e 1.248.008 bytes
comprimidos; startup 1.463,817 ms, primeira CLI 5.282,926/5.672,203 ms e
atualização 5.086,890/5.115,949 ms. Yarn moderno 4.10.3 mediu 2 arquivos,
2.990.376 bytes e 1.057.416 comprimidos, mas não ofereceu global install.
Corepack 0.34.6 mediu 54 arquivos, 1.040.114 bytes e 229.072 comprimidos;
bootstrap frio ficou entre 2.681,567 e 8.203,432 ms, com aquecimento entre
823,922 e 2.527,011 ms.

DECISÃO: manter o npm-runtime. pnpm funcionou, porém foi aproximadamente 2,3x
maior descompactado que o npm e muito mais lento no fixture; Yarn Classic foi
menor, mas exige layout/política global próprios; Yarn moderno não atende ao
contrato de instalação; Corepack adiciona versões, cache e bootstrap/rede, sem
eliminar os artefatos dos gerenciadores. O resultado não autoriza remover o
npm-runtime.

VALIDAÇÃO: testes da nova bancada (4/4), lint focado e execução real Linux com
`--iterations=1 --check` e `--iterations=2 --check` passaram; npm, pnpm e Yarn
Classic instalaram/atualizaram a fixture e executaram os binários, e Yarn
moderno falhou no `global add` de forma esperada. A matriz CI passa a repetir o
check nos três SOs. Ficam como gates futuros: CLIs oficiais reais, lifecycle e
dependências nativas, rede/proxy/offline, memória, artefato empacotado e
confirmação nativa em Windows/macOS; esses pontos não bloqueiam esta avaliação
arquitetural.

Estado final: investigação, bancada reproduzível, recomendação, testes e
documentação concluídos; pendente apenas commit, push, acompanhamento do CI e
registro/encerramento da task no Notion conforme o workflow.

## Registro de Trabalho — 2026-09-04 (parte 26) — memória e custo operacional no artefato

PEDIDO: executar a task do Notion [“Felixo AI Core/Performance — Medir memória e custo operacional do gerenciador alternativo no artefato”](https://app.notion.com/p/Felixo-AI-Core-Performance-Medir-mem-ria-e-custo-operacional-do-gerenciador-alternativo-no-artefat-3d091f95497e81d98a65ff105f1c4e44?source=copy_link).

DIAGNÓSTICO: a bancada arquitetural já comparava bootstrap, tamanho, instalação
e atualização, mas não media RSS, CPU, árvore de processos, I/O, concorrência
de agentes nem crescimento persistente no prefixo do gerenciador que saiu no
artefato.

IMPLEMENTAÇÃO:

- `app/scripts/package-manager-operational-performance.cjs` é a bancada
  complementar; preserva a avaliação arquitetural existente em
  `package-manager-alternatives-performance.cjs` e mede o `npm-runtime` em
  `release/*/resources/npm-runtime`, com fallback explícito ao runtime da fonte,
  contra pnpm, Yarn clássico e a rota Corepack disponíveis no host;
- cada cenário usa fixture local offline, prefixos por agente, caches,
  configuração e `HOME/USERPROFILE` temporários, com instalações frias e
  repetições quentes concorrentes para 1/2/5/10 agentes;
- o relatório sanitizado guarda p50/p95 de duração, RSS, CPU, processos/árvore,
  I/O, arquivos e bytes no disco frio/quente, crescimento persistente, deltas
  contra npm e gate de 120 s, 512 MiB RSS, 64 processos e 512 MiB de disco;
- a checagem Windows usa identidade do processo (nome/data de criação) para
  rejeitar PID reciclado como falso órfão, filtra executáveis fora da árvore
  lançada e repete uma vez falhas transitórias. O CI e o release publicam JSON
  de custo operacional, sem substituir o smoke de compatibilidade já existente.

VALIDAÇÃO LOCAL: `node --test scripts/package-manager-operational-performance.test.cjs`
passou 11/11; `node --check scripts/package-manager-operational-performance.cjs`
e `git diff --check` passaram. O benchmark completo
`npm run benchmark:package-managers:performance:check -- --iterations=2 --agents=1,2,5,10`
passou em Windows x64, com 16 cenários, npm-runtime 11.19.1 do artefato
desempacotado local e pnpm 10.28.0. Máximos: npm cold/hot p95 5.499/5.847 s e
RSS 123,2/131,8 MiB; pnpm 2.910/2.755 s e RSS 131,5/115,8 MiB; disco
40.354/22.136 B; crescimento frio→quente 0 B; processos 4/3; órfãos 0. A
recomendação automática foi `avaliar-pnpm`, sujeita à decisão humana.

LIMITE: Yarn clássico e Corepack ficaram indisponíveis neste host. O runner
mede o gerenciador e a CLI fixture, não abre renderer/canvas/terminal nem mede
energia; esses sinais dependem dos benchmarks Electron/release-smoke. A matriz
CI/release é necessária para confirmar os três sistemas operacionais e o
artefato produzido limpo.

## Registro de Trabalho — 2026-09-04 (parte 27) — estabilização da medição

O primeiro CI da bancada revelou duas falhas de integração que foram corrigidas
antes do fechamento: `measureTree` contabilizava o tamanho do link simbólico,
embora devesse ignorá-lo sem seguir o alvo, e o teardown do Windows ainda podia
expor por cerca de 750 ms um filho `cmd/node` terminado. A coleta agora ignora
links e repete a consulta de identidade após a janela de teardown; um processo
persistente continua sendo reportado. Também removi `--agents` das chamadas do
benchmark arquitetural legado, mantendo essa carga somente na bancada
operacional que a suporta.

Validação local após os ajustes: 11/11 testes da bancada, sintaxe e diff limpo;
16 cenários Windows x64 passaram para npm-runtime e pnpm com `--check`, sem
órfãos. O CI intermediário identificou o caso Yarn Classic com 10 agentes; a
nova execução deve ser a referência para confirmar a matriz e o artefato.

## Registro de Trabalho — 2026-09-04 (parte 28) — CI e artefatos finais

A execução de referência confirmou a bancada no artefato produzido, não apenas
no checkout. O commit [98b5e27](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/98b5e27be9f3045056c0a577d9150606fc496118)
passou no [CI multi-SO](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33845253343)
em Linux, macOS e Windows. O [release workflow](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33846335610)
também passou em todos os jobs e publicou a [v0.1.187](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.187)
como Latest, com 26 assets, inventário do empacotamento e smoke do instalador
nos três sistemas.

O inventário confirmou `npm-runtime` fora do `app.asar`, com npm 11.19.1:
1.527 arquivos e 8.813.796 bytes no Linux arm64/x64 e macOS arm64, e 1.554
arquivos e 8.827.803 bytes no Windows x64. A bancada operacional repetiu duas
iterações, instalação fria/quente e 1/2/5/10 agentes para cada gerenciador
disponível: 16 cenários por SO, 48 cenários de gerenciador no total, todos
bem-sucedidos, sem órfãos e com crescimento frio→quente de 0 B. Todos os
budgets passaram: p95 de instalação abaixo de 120 s, RSS abaixo de 512 MiB,
árvore abaixo de 64 processos e disco abaixo de 512 MiB.

Nos resultados finais, o npm teve p95 frio/quente máximo de 1.467/1.473 ms no
Linux, 1.673/1.473 ms no macOS e 9.334/8.749 ms no Windows. O Yarn Classic
teve 961/1.027 ms, 963/984 ms e 14.834/13.152 ms, respectivamente; o RSS p95
permaneceu abaixo de 149 MiB e o disco máximo foi 61 KiB. A recomendação
automática foi `avaliar-yarn-classic` nos três SOs por menor média de p95, mas a
decisão de migração continua humana: o npm-runtime permanece no caminho de
produção até a validação das CLIs oficiais, dependências nativas, lifecycle,
cache e rollback. pnpm/Corepack foram registrados como indisponíveis nessa
rota de release, sem transformar ausência em sucesso silencioso; a comparação
arquitetural anterior continua sendo a referência para esses candidatos.

Os 11 testes focados e a sintaxe do runner passaram localmente. O benchmark
operacional foi executado com perfis temporários, fixture local offline,
prefix/cache/configuração isolados e sanitização; não tocou userData,
credenciais ou instalação global reais. Renderer/canvas, latência de interação,
energia/bateria e sessões reais de provider não fazem parte desta medição. O
profiler/heap do Canvas e a sessão Linux longa já têm tasks próprias; a
correlação direta entre instalação e responsividade/energia foi aberta como
follow-up separado.

## [2026-09-02] Fix: "Limites e uso" mostrava CLIs de IA instaladas como "não instalada" em perfil Windows com espaço no nome

Bug relatado pelo usuário ("Limites de uso também não está funcionando neste
PC"), reproduzido ao vivo chamando `detectCli()` com o ambiente real desta
máquina: Claude Code, Codex, Gemini e Openia apareciam com `detected: false`
mesmo instaladas via npm. Duas causas, ambas só expostas quando o npm instala
a CLI globalmente no Windows:

1. `getExecutableExtensions()` (`win32.cjs`) testava a extensão vazia (`''`)
   antes de `.cmd`. O npm cria três arquivos por CLI — o shim POSIX sem
   extensão, `.cmd` e `.ps1` — e o resolvedor sempre achava o shim POSIX
   primeiro. `detectCli` só liga `shell: true` para caminho terminado em
   `.cmd`/`.bat`, então o `execFile` tentava rodar o script Unix como binário
   nativo do Windows e falhava.
2. Mesmo resolvendo o `.cmd` certo, `execFile` com `shell: true` no Windows
   concatena comando e argumentos crus para o `cmd.exe /c` sem citar o
   caminho. Um perfil de usuário com espaço no nome — "Felipe Martins" nesta
   máquina — quebra o comando ao meio: o `cmd.exe` só reconhece o pedaço antes
   do espaço. Numa conta sem espaço no nome o mesmo código passava batido, o
   que explica o app funcionar noutra máquina e não nesta ("neste PC" no
   relato do usuário era o sintoma certo).

Corrigido em `3d3c68d`: `getExecutableExtensions()` agora testa as extensões
reais antes de `''`; `detectCli()` cita o executável entre aspas antes de
rodar via shell. Dois testes novos em `cli-detector.test.cjs` cobrem os dois
bugs (extensão vencendo o shim POSIX; citação sobrevivendo a espaço no
caminho); o teste existente que checava a chamada ao shell foi atualizado
para esperar o caminho citado.

Reverificado nesta sessão após a correção: `claude` (2.1.260), `gemini`
(0.57.0) e `openia` (0.1.0) agora reportam `detected: true` com a versão
correta nesta máquina. `codex` continua `detected: false`, mas por causa
raiz diferente e legítima — o pacote `@openai/codex` instalado aqui está sem
a dependência opcional `@openai/codex-win32-x64` (`codex --version` falha
com "Missing optional dependency", fora do escopo deste fix; reinstalar com
`npm install -g @openai/codex@latest` resolve). `ollama` reporta
`detected: false` porque genuinamente não está instalado nesta máquina
(`where ollama` não encontra nada). `npm test` no diretório `app/` roda
limpo para o escopo tocado (`cli-detector.test.cjs`, 20/20); as 6 falhas
observadas numa rodada completa da suíte (symlink sem permissão em
`package-inventory.test.cjs`, RSS de processo real em
`package-manager-operational-performance.test.cjs`, e mais 4 suítes com
efeitos colaterais de ambiente) são pré-existentes e alheias a este fix.

## [2026-09-07] Fix: instalação gerenciada do Codex sem dependência opcional nativa no Windows

A task [Felixo AI Core/Agentes — corrigir erro ao criar perfis do Codex (dependência opcional ausente no Windows)](https://app.notion.com/p/Felixo-AI-Core-Agentes-corrigir-erro-ao-criar-perfis-do-Codex-depend-ncia-opcional-ausente-no-Win-3d491f95497e8127bdf2df563c7a96bb) apontou que o npm podia terminar com código 0 sem materializar `@openai/codex-win32-x64`, deixando a criação de perfis falhar só quando a CLI era executada.

O manifesto gerenciado passou a declarar os pacotes nativos do Codex para Windows x64/arm64. O novo `managed-cli-health.cjs` verifica o `package.json` do pacote esperado dentro do prefixo do app. A instalação automática usa essa verificação tanto para validar uma instalação anterior quanto logo após instalar: se a primeira tentativa aparenta sucesso mas o pacote falta, uma segunda instalação é executada automaticamente. Se a ausência persistir, o status inclui a mensagem original do Codex (`Missing optional dependency ... Reinstall Codex: npm install -g @openai/codex@latest`), e o retry já existente da interface continua disponível.

Os testes cobrem o prefixo incompleto, a recuperação na segunda tentativa e a falha persistente; o resumo do status também foi testado para não esconder o diagnóstico. A validação local focada passou com 27/27 testes, sintaxe, ESLint e `git diff --check`. O teste usa diretório temporário e simula Windows sem modificar a instalação global ou credenciais. A confirmação em artefato empacotado e nos três runners fica para o CI/release desta entrega.

## [2026-09-08] Operação: destravar atualização local do app Linux

O app em execução estava em `v0.1.199` e mostrava apenas o indicador
`Falha ao atualizar`. A investigação confirmou que a instalação local era o
pacote Debian em `/opt/Felixo AI Core`, com `resources/package-type=deb`; a
release `v0.1.209` estava íntegra e continha o `.deb` e os manifestos esperados.

Para destravar a máquina sem encerrar a sessão atual, baixei o artefato oficial
`Felixo-AI-Core-0.1.209-linux-amd64.deb`, confirmei `100.891.844` bytes e
validei o SHA-512 publicado
`+Kxzzl8eICMva63Pc9rJjsGdpGaO0KsyHJhp54FlDMjS41NTM64TaMHHUcipri2krs6cgRtMsJcKyQwxY4KOmA==`.
A instalação via `pkexec dpkg --install` terminou com sucesso e o `dpkg` agora
reporta `felixo-ai-core 0.1.209` como instalado. O processo já aberto continua
carregando a versão antiga em memória; fechar e reabrir o app é necessário para
confirmar visualmente a nova versão e repetir o check do updater.

Não houve alteração de código-fonte nem novo deploy nesta operação. O estado
pré-existente `M app/package.json` foi preservado sem edição.

## [2026-09-08] UX: tarefas do Notion abertas como workspace no Canvas

O painel de tarefas do Notion estava funcional, mas apresentava conexão,
seleção de database, filtros, criação e todas as tarefas empilhados numa coluna
estreita. Isso tornava a superfície mais parecida com um formulário do que com
uma view do Notion.

`CanvasPanel` agora aceita a variante `workspace`; ela ocupa a área ampla do
Canvas sem cobrir a coluna de ferramentas, preserva o redimensionamento das
outras superfícies e esconde a alça de arrasto quando a ferramenta trabalha
como página. `NotionTasksPanel` usa essa variante e foi reorganizado para:

- mostrar a database e a conexão como cabeçalho/breadcrumb;
- manter conexão, database e credenciais dentro de `Configurar` recolhível;
- abrir criação/edição somente quando `Nova tarefa` ou `Editar` for acionado;
- renderizar as tarefas numa tabela compacta com colunas de título, estado,
  prioridade, prazo e ações, incluindo detalhes expansíveis e link para o
  Notion;
- manter sincronização, filtro por estado, busca, conclusão, edição e lixeira.

Validação local desta mudança: `npx tsc -b --pretty false`, `npx vite build`,
ESLint nos dois componentes e 22/22 testes de `panel-sizing` e
`canvas-surfaces` passaram. O CI do commit anterior de documentação
(`34252730074`) terminou com falhas ambientais conhecidas — `403` ao finalizar
um artefato no Ubuntu e `AttachConsole failed` no teste nativo de PTY do
Windows — enquanto macOS, política de dependências e launchers passaram; isso
não está relacionado ao código desta UX.

## [2026-09-08] Correção: tarefas do Notion como bloco real do Canvas

A primeira versão da UX ampla ainda era montada como `CanvasPanel` absoluto.
Visualmente ocupava a área central, mas continuava sendo uma superfície
flutuante; por isso a lista não podia ser arrastada, redimensionada ou
reencontrada como um bloco do Canvas.

O clique em `Ferramentas > Tarefas Notion` agora cria ou focaliza um nó
`notionTasks` no React Flow. O bloco é persistido junto dos demais nós,
possui cabeçalho de arraste, redimensionador, alças de conexão e remoção pelo
Canvas. A tabela, configuração, busca, filtros e operações CRUD do Notion
foram preservadas no conteúdo incorporado do nó. O repositório Electron e o
schema TypeScript também aceitam o novo tipo ao salvar/carregar e exportar o
Canvas.

Validação local: `npx tsc -b --pretty false`, `npx vite build`, ESLint dos
arquivos alterados, 30/30 testes focados de geometria/superfícies e 9/9 testes
do repositório de nós passaram.

## [2026-09-08] Correção: expandir tarefas do Notion com o conteúdo da página

A consulta da database do Notion devolve propriedades da tarefa, mas não
devolve o corpo da página. A expansão usava apenas o campo `rich_text` da
propriedade de descrição e mostrava `Sem descrição` quando a nota tinha
conteúdo em blocos.

O cliente Notion agora lê `/v1/blocks/{page_id}/children` sob demanda, pagina
os resultados e percorre blocos aninhados com limite de profundidade e
quantidade. Títulos, listas, checkboxes, toggles, citações, callouts, código,
divisores, links, imagens, tabelas e páginas filhas recebem uma representação
textual segura para o renderer.

O fluxo foi exposto por serviço, IPC e preload como
`notion:tasks:content`/`getTaskContent`. O painel carrega o corpo ao expandir,
mantém fallback para a propriedade de texto, sinaliza carregamento/erro e
permite tentar novamente sem esconder o link para o Notion. Foram adicionados
testes para extração de blocos aninhados e para o serviço de conteúdo da tarefa.

## [2026-09-08] Correção: exibir propriedades das tarefas do Notion no Canvas

As páginas expandidas já carregavam o corpo da nota, mas a UI mostrava apenas
as colunas resumidas de título, etapa, prioridade e prazo. Com isso, as demais
propriedades retornadas pela database pareciam não ter sido sincronizadas.

A expansão agora exibe uma seção `Propriedades` com todos os campos não vazios
da combinação entre o schema da database e `task.fields`, mantendo o título na
coluna principal. O formatter trata valores textuais, booleanos, listas,
datas, URLs, selects/status, rich text e relações sem quebrar quando o Notion
devolve uma forma diferente de objeto.

Foi feito smoke test contra a database real usando a conexão principal
descriptografada apenas em memória, sem imprimir nem persistir a chave. A
resposta continha 22 propriedades de schema e os campos preenchidos da tarefa
real foram encontrados antes da renderização. Validação local: TypeScript,
Vite, ESLint, 30/30 testes focados de Canvas, 8/8 testes do cliente/serviço
Notion e `git diff --check` passaram.

## [2026-09-08] Correção: renderizar Markdown no corpo das notas Notion

Depois da inclusão das propriedades, o corpo das notas ainda aparecia como
texto literal: marcadores como `##`, `- [ ]`, links e blocos de código eram
mostrados sem a formatação visual esperada.

O detalhe expandido agora reutiliza `DeferredMarkdownContent`, o mesmo renderer
sanitizado usado pelas notas e arquivos Markdown do Canvas. Assim, títulos,
listas, checkboxes, links, citações, tabelas, código e ênfase são renderizados
como Markdown, mantendo o conteúdo da página seguro e a seção de propriedades
separada acima do corpo.

Validação local: TypeScript, ESLint, build Vite com 2.474 módulos, 30/30
testes focados de Canvas, 8/8 testes do cliente/serviço Notion e
`git diff --check` passaram.

## [2026-09-10] Prova operacional real: entrega de catálogo de contexto no app empacotado, nos três SOs

Task: [Felixo AI Core/Prompts — validar entrega real dos catálogos em app
empacotado nos três SOs](https://app.notion.com/p/Felixo-AI-Core-Prompts-validar-entrega-real-dos-cat-logos-em-app-empacotado-nos-tr-s-SOs-3d691f95497e8107b59ce45d8f25c488).
O smoke de release já provava PTY real e npm empacotado dentro do binário
publicado (`electron/release-smoke.cjs`, `scripts/release-smoke.cjs`, rodado
pela matriz de Release em ubuntu-latest/windows-latest/macos-latest); faltava
a mesma prova para o contrato de entrega de catálogo — shim `felixo`
instalado por este entrypoint empacotado → arquivo real gravado por
`writeContextFile()` → `felixo context read <nome>` → corpo de volta byte a
byte, incluindo o caso "artefato não encontrado".

Em vez de um harness novo, estendi `runPackagedReleaseSmoke()`: escreve dois
artefatos `catalog-prompt` reais (markdown, acentuação, emoji, newline duplo
— simulando a "combinação ordenada" que `context-file-delivery.ts` monta
quando entrega vários prompts juntos), instala o shim de verdade apontando
para o próprio entrypoint empacotado, e roda `felixo context read` dentro de
um PTY real (mesmo `PtyProcessManager` do canvas) — inclusive uma quarta
leitura contra um nome inexistente, para provar o erro "Artefato de contexto
não encontrado".

A primeira tentativa (push `97e7977`) reprovou nos três SOs, e cada rodada
seguinte revelou uma causa real e diferente, sempre medida no log/relatório
JSON da própria matriz, nunca suposta:

1. Um PTY POSIX (termios `onlcr`) e o ConPTY do Windows traduzem `\n` para
   `\r\n` na leitura — a comparação byte a byte precisa normalizar isso antes
   de comparar contra o arquivo (gravado com `\n` puro).
2. O runner `windows-latest` usa PowerShell 7 (`pwsh.exe`) como shell padrão
   (o adaptador win32 prefere pwsh quando existe). O PSReadLine e o ConPTY
   intercalam sequências ANSI/VT de posição de cursor e cor NO MEIO do texto
   impresso quando uma linha excede a largura do terminal — não só no fim.
   Um `Error` com um recorte da saída real foi necessário para enxergar isso
   (o diagnóstico do processo é truncado a 2000 caracteres por
   `scripts/release-smoke.cjs`; o recorte teve que viajar pelo arquivo de
   status, não pelo `Error` lançado, para sobreviver).
3. Mesmo sem ANSI, uma linha mais longa que as 80 colunas padrão do PTY
   ainda reflui: o ConPTY insere um `\n` de verdade no ponto de quebra e
   duplica o caractere anterior a ele. Corrigido abrindo a sessão de smoke de
   contexto com `cols: 1000`.
4. Mesmo com largura suficiente, o PRIMEIRO comando executado num shell
   pwsh/ConPTY recém-aberto perde linhas em branco — um artefato de
   inicialização do console, não do shim nem do arquivo (a mesma leitura,
   repetida como segundo comando, chega intacta). Corrigido com uma leitura
   de aquecimento descartável antes da sequência que o smoke realmente
   verifica.

A captura real do run que expôs a causa 2 foi salva como fixture —
`app/electron/__fixtures__/release-smoke-windows-conpty-sample.txt` — e um
teste prova a normalização contra essa evidência real, não uma reprodução
aproximada. `.gitattributes` marca esse arquivo `-text` porque os `\r`/`\n`
nele são dado, não fim de linha.

**Resultado final, medido na matriz de Release (run 34440446169), publicado
como release v0.1.246:** os três SOs terminaram com `result: "passed"` e
`contextDelivery: { ok: true, missingArtifactReported: true, files: [dois
byte-exact] }` — confirmado lendo os três `release-smoke-<os>.json` baixados
da run, não só o resumo verde do workflow.

**Limitação declarada, não escondida:** o botão Inserir/combinar do canvas e
a submissão com exatamente um Enter são comportamento do renderer
(`terminal-session-store.ts`), fora do alcance de um PTY isolado do processo
principal — seguem cobertos só por unidade (`terminal-session-store.test.ts`).
O mesmo vale para os quatro cenários de falha do item 5 da task (sessão
encerrada, permissão negada, falha de `pty:write`) fora do caso "artefato
ausente", que este smoke já cobre de ponta a ponta. Abri
[Felixo AI Core/Prompts — validar o botão Inserir/combinar e os cenários de
falha da entrega de catálogo dentro do app
empacotado](https://app.notion.com/p/Felixo-AI-Core-Prompts-validar-o-bot-o-Inserir-combinar-e-os-cen-rios-de-falha-da-entrega-de-cat-l-3d791f95497e811cb5cdfc72cac7cb5b)
como a subtask que cobre especificamente esse gap.

Empacotamento local (`npm run pack`) segue bloqueado nesta máquina Windows
por um defeito de `fs.cpSync` alheio a este trabalho
(`bundleNpmRuntime()` falha copiando `node_modules/npm` com "EPERM/The
operation completed successfully", reproduzido isoladamente antes de tocar
qualquer arquivo desta task) — por isso toda a validação packaged real
aconteceu via a matriz de CI, não localmente.

Testes: 12/12 em `electron/release-smoke.test.cjs` (dois novos casos usam a
mesma técnica de `agent-command-install.test.cjs` — rodar o shim de verdade
via `child_process`, sem `node-pty`, para provar o caminho de produção num
teste unitário) e `scripts/release-smoke.test.cjs` (7/7). `npm run lint` e
`npm run typecheck` limpos (2 avisos React pré-existentes, alheios).

## [2026-09-12] Auditoria e otimização profunda de performance do Canvas

O mapa de performance e os artefatos brutos estão em
[`docs/performance/PERFORMANCE.md`](../performance/PERFORMANCE.md). A regra
operacional é medir antes/depois, identificar o contexto da máquina e escrever
**NÃO MEDIDO** quando uma bancada não conseguir provar um número.

Nesta passada, o Canvas deixou de manter uma animação ambiental infinita e um
filtro SVG `feTurbulence` em tela inteira; a textura passou a ser CSS estática,
sem remover a atmosfera autoral. O callback de movimento deixou de publicar
percentual de zoom quando o valor arredondado não mudou, e o diagnóstico que
copiava saída de terminal para o console foi removido. Não houve alteração de
contrato IPC, PTY, persistência, seleção, conexões ou ferramentas.

Guardrails: não introduzir loops/polling para decoração, blur/filter/glow amplo,
serialização do grafo em `mousemove` ou state React por byte de terminal;
preservar culling, batching, scrollback limitado e a separação das sessões PTY
da árvore React. O mount inicial de 500 nodes continua acima de um frame e
permanece um gargalo conhecido para uma futura otimização específica.

## [2026-09-16] Canvas — cobertura de interação, oclusão e acessibilidade

O retângulo útil do React Flow agora é calculado em um serviço puro a partir da
ocupação publicada pelas superfícies do canvas. Topbar, sidebar, painel,
inspector e statusbar deixam de esconder o ponto usado por criação, foco,
`fitView` e organização; a gaveta do terminal é irmã flex e não sofre desconto
duplo. O culling mantém os gatilhos montados depois da primeira abertura para
que o fechamento devolva o foco ao botão correto.

O smoke isolado do Canvas grava uma fixture com terminal, nota, arquivo, grupo,
desenho, Excalidraw, página e tarefas Notion; testa seleção, arrasto curto,
handles, gaveta, notificações, `Escape`, URL inválida, reload e contagens sem
duplicação. `MockTerminalSessionStore` impede shell/CLI real quando
`FELIXO_DEVTOOLS_MOCK_PTY=1`. A migration 013 torna `drawing` e
`excalidrawDrawing` persistentes no SQLite. Labels de inputs dos nodes fecham a
auditoria determinística de acessibilidade; axe-core continua fora do workspace.

Validação: `npm test` 1.336 pass em 52 suítes; frontend 958 pass/1 skip;
native 5/5; typecheck, lint, build, testes focados e `test:canvas-smoke` verdes.


## 2026-09-19 — Modais redimensionáveis nos dois eixos

12 modais ganham alças (direita, inferior, canto) via `useResizableDialog` +
`DialogResizeHandles`; regra pura em `features/shared/dialog/dialog-sizing.ts`
(10 testes: invariante de janela em várias resoluções, `2*dx`, persistência,
lixo salvo, armazenamento que lança, engolir o clique de soltar). Risco tratado: o
fundo fecha o modal no `click`, e soltar o mouse fora da moldura após arrastar o
dispara. Não verificado numa janela real (nada foi visto rodando).
Validação: tsc, eslint e vitest (1089 pass) verdes.

## 2026-09-19 — Rolagem no terminal do Claude Code (alternate screen)

Causa (já conhecida): o Claude Code entra no alternate screen (`ESC[?1049h`) e liga rastreio
de mouse no boot; o xterm.js não tem scrollback nesse buffer. **Confirmado no binário da CLI
2.1.278** (leitura das strings): `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` "forces the classic
renderer any time"; existe também `/tui fullscreen` / `CLAUDE_CODE_NO_FLICKER=1` para o caminho
inverso (a própria CLI desliga o fullscreen sozinha após falhas de boot).

Medição do boot num PTY (30×100, 10 s, sem enviar prompt): sem a variável, `?1049h` = sim e
rastreio de mouse (`?1000h/1002h/1003h`) = sim; com a variável, ambos = não.

Implementação: opção global "Rolagem no terminal do Claude Code" (Configurações, **desligada por
padrão**, `felixo-ai-core.claude-terminal-scroll`). O store manda só `classicScreen: boolean` no
`pty:spawn`; o processo principal converte em `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` **apenas**
para o executável `claude` (nunca ambiente arbitrário vindo do renderer). Vale para terminais novos.

NÃO verificado: `scrollHeight` vs `clientHeight` do xterm com a variável (falta janela real),
efeito em menus, seleção com o mouse (`terminal-mouse-selection.ts`), cópia e flicker — por isso
o padrão continua desligado. O teste que detecta a volta do `?1049h` no boot não entrou: exige o
`claude` instalado e autenticado, que o CI não tem.

## 2026-09-20 — CI: flakes do Validate do Windows (tetos, smoke, audit do npm)

Evidência: nesta semana o smoke de montagem (`checarMontagem`, 20 s) falhou 5 vezes no runner
Windows e passou no rerun (a última em 19/09 no CI da main do #62, run 35461628950, com o app
montando logo depois); um benchmark ficou ~26 min pendurado; o `npm audit` recebeu 400/503.

Feito: (1) `timeout-minutes` em todos os passos de teste/benchmark/build dos jobs Validate e
Dependency policy e teto de 45 min no job Validate (o mais lento medido é ~13 min no Windows;
tetos = várias vezes a duração medida do passo); (2) o app expõe `data-felixo-hydrated` e o smoke
espera esse sinal em vez do texto da barra de status; teto de 45 s no Windows (20 s nos outros) e
o tempo real de cada subida passa a sair no log (`canvas pronto em N ms`) — **p50/p95 ainda NÃO
medidos: falta acumular execuções**; (3) a falha do smoke diferencia "APP LENTO" (canvas montou e
segue carregando) de "APP NÃO MONTOU" (`canvas-smoke-diagnostics.cjs`, com teste); (4) `npm audit`
tenta até 3 vezes só quando NÃO veio relatório e `verify-dependency-policy.cjs` diz que o erro do
registro não é vulnerabilidade — continua falhando fechado.

Não feito: decidir quais benchmarks bloqueiam o PR (só o de responsividade já é informativo) e o
destino do pre-release parcial v0.1.368 (decisão do Felipe). O efeito real dos tetos e do timeout
maior só se comprova nas próximas execuções do CI.

## 2026-09-20 — Borda colorida no nó com notificação não lida

A anotação de 14/09 pedia cores "sincronizadas com as das notificações", mas o painel usava uma
cor só (`--color-error`): não existiam categorias. Criadas em `terminal/notification-category.ts`,
a partir do `SessionSnapshot` da notificação: **Precisa de resposta** (`waiting_approval`, âmbar,
pulsa), **Terminou** (`idle` ou saída 0, verde) e **Falhou** (saída ≠ 0 ou `error`, rosa).

A cor mora em UM lugar, no CSS (`--felixo-notify-<categoria>`, com valor próprio no tema de alto
contraste); o item do painel e a borda do nó usam o mesmo token. Só notificação NÃO lida pinta o
nó (ler remove a borda); no mesmo nó vence a mais urgente (falhou > precisa de resposta >
terminou). A borda é declarada depois da moldura escolhida pela pessoa (`frameColor`), então a
notificação vence a moldura enquanto existir. A pulsação respeita `prefers-reduced-motion` e o
Modo Performance. Testes: mapeamento snapshot→categoria, borda só enquanto não lida, prioridade,
e o teste que confere que os tokens existem nos dois temas e que a borda usa o mesmo token.

NÃO verificado: nada visto numa janela real (contraste real das três cores sobre o canvas, a
pulsação, e os nós que não são terminal); sem cobertura no smoke.

## 2026-09-20 — Benchmark operacional (Windows): espera dos órfãos passou de 750 ms para até 6 s

"processos órfãos detectados em yarn-classic" derrubou o Validate/Windows três vezes (PR #52, PR #55
e o CI da main do #65, run 35519847921); o log mostra o benchmark inteiro passando e só o recheck
de órfãos falhando, sem relação com o diff. `findOrphans` reverificava UMA vez após 750 ms; agora
`settleOrphans` reverifica a cada 500 ms por até 6 s (mantendo a checagem de identidade do processo).
Um filho que permanece depois do prazo continua reportado — o gate não foi afrouxado. Testes: filho
que some durante a espera, filho que permanece e caso sem órfãos. NÃO verificado no runner: só o CI
mostra se 6 s bastam; se ainda falhar, o log do processo remanescente é o próximo dado.

Também em 20/09 (PR #66): o passo "Benchmark terminal scrollback policy" do Windows morreu com
segfault do node-pty (exit 139, `AttachConsole failed`), igual ao do PR #51. O passo agora repete
até 3 vezes SOMENTE quando o código de saída é 139; qualquer outro código falha na hora (laço
testado com funções falsas: recupera no 3º segfault e não repete falha real). Não verificado no
runner: se o segfault for determinístico numa máquina, as 3 tentativas também falham.

Ainda em 20/09 (CI da main do #66): o smoke do Windows falhou no `waitFor` de 5 s do painel de busca
(`checarPainelNosDoisEixos`, o mesmo que já tinha caído nos PRs #48 e #55). O screenshot de falha
mostra o painel "Pesquisar" ABERTO — apareceu depois do teto, ou seja, runner lento. Os 13
`timeout: 5_000` de interação do smoke viraram `INTERACTION_TIMEOUT_MS` (20 s no Windows, 5 s nos
demais). Não verificado: só as próximas execuções do Windows mostram se 20 s bastam.

E na reexecução da mesma main (20/09): "arrasto pequeno da nota nao persistiu" (`checarInteracoes`). Não
era timeout: o smoke esperava 800 ms FIXOS depois de soltar o mouse e lia a posição salva; a gravação
tem atraso e no runner Windows passou disso. O arrasto e a criação de conexão agora esperam a mudança
aparecer no armazenamento (polling de 200 ms até `INTERACTION_TIMEOUT_MS`); se nunca aparecer, o erro
continua sendo o mesmo de antes (falha real). Não verificado: o screenshot da falha mostra a nota SELECIONADA
(o mouse chegou nela) mas não permite ver se ela se moveu — inconclusivo; só o CI do Windows mostra se o
polling resolve. Se ainda falhar mesmo esperando até 20 s, o arrasto pode ser um problema real.

Erro meu no mesmo PR (#67): a 1ª versão do polling usava `page.waitForFunction(async () => ...)`, que
NÃO espera — a Promise devolvida já é "verdadeira" e a espera termina na hora. Resultado: como eu
tinha REMOVIDO os 800 ms fixos, o smoke passou a ler a posição sem esperar nada e falhou em ~1,5 s no
macOS (o CI do PR pegou). Corrigido com `esperarAte` (`scripts/canvas-smoke-wait.cjs`, polling no lado
do Node com `page.evaluate`, 4 testes com relógio falso, inclusive o caso "Promise que resolve falsa
não conta"). Não reproduzi o `waitForFunction` num navegador (não há um aqui): a conclusão vem do tempo
da falha (1,5 s < 5 s de teto) e do comportamento documentado; o teste do helper protege o novo código.

## 2026-09-20 — Criar perfil de conta (Codex/Claude/Gemini): reprodução e pasta órfã

Task: reproduzir a falha ao criar perfil depois da correção de 07/09 (dependência opcional
`@openai/codex-win32-x64`, que continua no manifesto e com testes: `managed-cli-manifest`,
`cli-auto-install`, `managed-cli-health`).

Reprodução feita aqui (Linux, CLIs reais instaladas, `userData` temporário, o próprio
`createCliAccountStore` + `buildProfileEnv` do app): `create` OK nas três CLIs, pasta criada
(vazia em Codex/Claude; `.gitconfig` espelhado no Gemini) e a CLI respondeu com o isolamento
certo (`codex login status` → "Not logged in"; `claude auth status --json` → `loggedIn:false`
com `configDirectory` na pasta do perfil; `gemini --version` OK). O "exit 1" de codex/claude é
o estado normal "não logado". NÃO reproduzido: Windows (a máquina do Felipe) e o fluxo
interativo de login — a anotação de 14/09 não diz qual CLI nem qual mensagem, e não há log
persistido; sem isso a falha original segue sem causa conhecida.

Defeito real achado na investigação e corrigido: `create` fazia `mkdir` + espelhamento (no Gemini
copia `.ssh`) + gravação do registro; se qualquer passo depois do `mkdir` falhasse (disco cheio,
permissão), sobrava uma pasta órfã — com chaves ssh copiadas — sem conta registrada, invisível
para `remove`, e cada nova tentativa criava outra. Agora a criação desfaz a pasta em caso de erro
(o erro que sobe é o da criação, mesmo se a limpeza falhar). 2 testes novos (o primeiro falhava
antes do conserto). Item 4 da task (pastas de tentativas antigas): na máquina do Felipe, pastas
em `cli-profiles/<cli>/` cujo id NÃO consta em `config/cli-accounts.json` são órfãs e podem ser
apagadas à mão; o app não faz essa varredura.

## 2026-09-20 — Decisão: como um agente controla um navegador de verdade

**Decisão:** o caminho principal é o **3 — o navegador do próprio AI Core como ferramenta**, exposto
a qualquer agente (Codex, Claude, Gemini) pelo comando `felixo` (fila `agent-requests`, lista de
ações fechada), operando o `webContents` dos blocos Página Web. O **2 — MCP de navegador no Codex CLI**
fica como complemento imediato para sites externos fora do canvas. O **1 — embutir o app do Codex —
está descartado**.

**Fontes oficiais lidas em 20/09/2026** (`learn.chatgpt.com`, para onde as URLs antigas de
`developers.openai.com` redirecionam; lidas por resumo, não por cópia integral):
- *Browser* do Codex: disponível no app desktop do ChatGPT e na web; "não está disponível no Codex
  CLI nem na extensão de IDE".
- Extensão para Chrome: "Chrome, Edge, Brave, Opera ou Vivaldi" — **não Firefox**.
- Codex CLI **suporta MCP**: `codex mcp add <nome> -- <comando stdio>` ou `[mcp_servers.<nome>]` no
  `config.toml` (stdio: `command`/`args`/`env`/`cwd`; HTTP: `url`); "Playwright: Control and inspect a
  browser using Playwright" está entre os exemplos.
- O `codex` local (0.154.0) tem `codex mcp add|list|get|remove|login|logout`.

**Prova de conceito 2 (MCP), sem credenciais e com perfil em memória.** `@playwright/mcp` 0.0.82
(`--headless --isolated`, Chromium do Playwright), falando JSON-RPC por stdio com uma página local:
`initialize` → 25 ferramentas (`browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_fill_form`, `browser_evaluate`, …) → abriu a página, achou o botão por referência (`e2`),
clicou e leu o texto novo (`segredo-do-clique-42`). O Codex registrou o servidor num `CODEX_HOME`
temporário (`[mcp_servers.playwright]`, status *enabled*). O servidor também aceita
`--cdp-endpoint` e `--browser firefox` (build do Playwright, NÃO o Firefox instalado da pessoa).

**Prova de conceito 3 (navegador do AI Core), no app real** (Electron 41 sob Xvfb, build `dist`,
`FELIXO_DEVTOOLS_PORT`, perfil isolado, `FELIXO_DEVTOOLS_MOCK_PTY=1`): um cliente CDP puro
salvou um bloco `webpage` apontando para uma página local; o `webview` apareceu como alvo CDP
(`type: webview`); um clique real (`Input.dispatchMouseEvent`, com `mouseMoved` antes) no botão da
página mudou o texto, lido depois (`segredo-do-webview-77`). Nada de cookies ou sessão reais.

**Por que 3 e não os outros**
- **1 (embutir o app do Codex):** o Browser dele mora no app do ChatGPT, outro processo Electron; não
  existe webview de outro app, e reparent de janela é frágil e diferente em cada SO. Não resolve
  Codex CLI, Claude nem Gemini.
- **2 (MCP Playwright):** funciona hoje, mas só para o Codex (cada CLI configura MCP do seu jeito),
  abre um navegador à parte (não é o bloco do canvas que a pessoa está vendo), baixa um navegador
  (~115 MB) e não usa o perfil isolado do navegador interno. Serve para sites fora do canvas.
- **3:** um único canal para os três agentes, no bloco que a pessoa vê, com o perfil escolhido
  (`--profile`). O canal já existe (`felixo browser open`), falta ampliar as ações.

**Como fazer o 3 sem abrir a porta de depuração:** a PoC usou a porta CDP da instância de
automação, que expõe o app inteiro (inclusive `window.felixo`) a qualquer processo local; não
serve como recurso. A versão de produto deve ser uma lista FECHADA de ações no `felixo browser`
(`snapshot`, `ler`, `clicar`, `preencher`), resolvidas no processo principal pelo `webContents` do
bloco, e pedir confirmação (`felixo perguntar`) para ações sensíveis em perfis com login.

**Achado de ambiente (útil para o `felixo devtools`):** aqui o app só respondeu ao CDP depois de
passar `--no-sandbox` na LINHA DE COMANDO do Electron; o `appendSwitch('no-sandbox')` do
`main.cjs` chega tarde para o zygote e o renderer morre ("Unable to access /dev/shm"), deixando o
alvo aberto mas mudo — a mesma aparência do travamento de `felixo devtools connect`. Isso vale
para este ambiente restrito; não foi verificado no Windows nem no macOS.

**NÃO verificado:** um turno real do Codex chamando as ferramentas do Playwright MCP (só o
registro e o servidor foram testados; um turno usaria a conta/limite da pessoa); o Firefox
real da pessoa (nenhuma via oficial o controla: a extensão só cobre Chromium); a PoC 3 fora do
CDP (o canal `felixo browser` com ações de controle ainda não existe).

## 2026-09-20 — Electron sob Xvfb no Linux: instrumentação antes de qualquer flag nova

A task pedia capturar o stderr real ANTES de mais uma tentativa (três às cegas já falharam). Feito, sem
mudar o padrão do CLI: (1) `FELIXO_DEVTOOLS_DEBUG_LOG=<arquivo>` liga stdout+stderr do Electron
detached num arquivo (`createDetached`; sem a variável continua `stdio: 'ignore'`); (2) o erro do
`felixo devtools launch` agora diz se o Electron **encerrou** antes de abrir o CDP (código e sinal) ou
**seguia vivo e mudo**, e anexa o fim do log quando ele existe — antes os dois casos eram o mesmo
"fetch failed"; (3) o CI ganhou um passo **informativo** no Linux (`continue-on-error`) que roda o
smoke sob `xvfb-run` com o log ligado e sobe `electron-devtools-*.log` como artefato. 3 testes novos
no `felixo-devtools.test.cjs`. O gate do Linux (`if: runner.os != 'Linux'`) continua como estava até
haver causa documentada e 2-3 execuções verdes.

Pista independente (NÃO é a causa provada dos runners): num ambiente Linux restrito local o app só
respondeu ao CDP com `--no-sandbox` na LINHA DE COMANDO; o `appendSwitch('no-sandbox')` do `main.cjs`
chega tarde para o zygote e para a checagem do sandbox SUID, que roda antes do `main.cjs`. Se o log do
CI mostrar `FATAL ... sandbox`, a correção provável é passar `--no-sandbox` no `launch` (só Linux, só
instância de automação) — a decidir com o log real na mão, não antes.

**Causa raiz (evidência real do CI, run 35540428944, x64 e ARM idênticos):**
`FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166 The SUID sandbox helper binary was found, but
is not configured correctly. Rather than run without sandboxing I'm aborting now. ... chrome-sandbox is
owned by root and has mode 4755.` O Chromium checa o sandbox SUID ao iniciar o processo do navegador,
ANTES do `main.cjs`; por isso o `appendSwitch('no-sandbox')` da 3ª tentativa nunca teve como funcionar.
Correção: `felixo devtools launch` passa `--no-sandbox` na linha de comando no Linux (só na instância de
automação; 1 teste novo). O passo do Linux segue informativo até 2-3 execuções verdes seguidas; só então
o `if: runner.os != 'Linux'` sai.

**Gate reativado no Linux (20/09/2026).** Com a causa corrigida, o smoke rodou verde no Linux
(ubuntu-latest e ubuntu-24.04-arm) em: (1) o CI do PR #70 depois do push da correção (run 35540981631),
(2) o CI da main do #70 (run 35541689317) e (3) o CI do PR que reativou o gate. O passo "Test Canvas PR
smoke" agora roda nos três SOs (Linux sob `xvfb-run`, log do Electron em `FELIXO_DEVTOOLS_DEBUG_LOG` e
sobe como artefato se falhar) e o passo informativo do diagnóstico foi removido. Limitações honestas:
3 execuções verdes não provam determinismo absoluto (a flake do Windows mostrou isso); a 3ª foi um PR,
não uma reexecução da main, porque reexecutar o CI da main dispara outro Release e o `release.yml` tem
`cancel-in-progress: true` — uma reexecução com Release em andamento poderia cancelar a publicação.

## 2026-09-20 — Notion no canvas: database genérica, papéis de tarefa e um bug de escrita

Observação da instância REAL da pessoa (captura só da janela do AI Core, feita a pedido, guardada só
na pasta temporária da sessão e não enviada a lugar nenhum): o bloco Tarefas Notion (database
"Tarefas — HOME", 55 linhas) mostrava **Estado = "Felixo-AI-Core"** em todas as linhas. A leitura já era
genérica; o que assumia papéis de tarefa era a heurística, e ela estava errada para essa database.

**Leitura corrigida (`normalizePage`).** O estado vinha da PRIMEIRA `status`/`select` da página
(`Repositório` antes de `Etapa`); o checkbox "Em andamento" contava como "concluída". Agora
`pickStatusPropertyName` escolhe: `status` com nome de estado (Etapa, Estado, Status, Situação, Fase);
`select` com esse nome; o primeiro `status`; o primeiro `select`. `pickDoneCheckboxName` só aceita
checkbox com nome de conclusão, ou o único checkbox de uma database SEM coluna de estado. O renderer
repete a regra em `findStatusPropertyName` (`notion-task-sort.ts`) com teste de paridade contra o
módulo do processo principal.

**Bug de escrita achado ao verificar (não era pedido, mas altera dados):** `buildPageProperties` usava o
primeiro checkbox e caía no primeiro `status`/`select` quando nenhum nome batia — na database real,
"Concluir" pela tela gravava em **Esforço** e marcava "Em andamento"; numa database só com
`Repositório` (select) gravaria "Concluído" no repositório. Provado com testes na estrutura real (3
falhavam antes do conserto). A escrita agora usa a mesma regra da leitura, só escreve em `status` ou
em coluna com nome de estado, e a prioridade não cai mais em coluna qualquer. NÃO verificado: se algum
dado real já foi gravado errado por esse caminho — vale conferir "Esforço" e "Em andamento" no Notion.

**Database genérica (fatia 1, só leitura).** `readPropertyValue` agora entrega valor legível para
people, files, relation (ids), unique_id, created_by/last_edited_by e rollup (button/verification → null).
`notion-table-view.ts` formata por tipo: relação vira contagem ("3 relações", o título de cada página
custaria uma consulta por linha) e tipo sem valor legível vira **"não suportado (tipo)"**, nunca vazio.
Sem estado/data/select/checkbox a tabela é genérica: só Nome + todas as colunas (sem Estado/Prioridade/
Prazo vazios nem botão de concluir); a escolha de colunas da pessoa continua valendo
(`hasVisibleColumnsPreference` separa "nunca escolheu" de "escolheu nenhuma"). A ordenação já calculava
uma chave por célula; a tabela agora monta 200 linhas por vez ("Mostrar mais 200"), e cada célula é
formatada uma vez só. O aviso de truncamento (>2.000 linhas) já existia, com teste.

NÃO verificado: nada disto foi visto rodando (a instância da pessoa é a versão instalada, sem esta
mudança) e a edição por tipo, os quadros/listas e o título das páginas relacionadas ficam para depois.

## 2026-09-20 — Canvas resetava a visualização sozinho

Relato da pessoa: "o canvas toda hora fica resetando a visualização". Causa (por leitura do código, sem
reprodução em janela real): o efeito que enquadra o canvas (`CanvasView`, `fitCanvasViewSafely(0)`)
tinha a própria função nas dependências, e ela é recriada a cada mudança de `occupancy` (gaveta do
terminal, painéis, inspector) via `getSafeCanvasScreenRect`. Qualquer abrir/fechar/redimensionar de
superfície refazia o "ver tudo" e jogava fora o pan e o zoom da pessoa.

Correção: `viewport-auto-fit.ts` decide quando reenquadrar. Enquadra na primeira vez de cada revisão do
canvas e em mudanças de layout ENQUANTO a pessoa ainda não mexeu na visão (medida tardia das
superfícies no boot); depois que ela move o viewport — pan, zoom, botões de zoom, foco em bloco, "Ver
tudo" — a visão é dela e mudança de layout não reenquadra mais. O movimento causado pelo próprio
enquadramento (janela de 400 ms) não conta como da pessoa. Um canvas novo (importar arquivo) volta ao
automático. 6 testes cobrem os casos, inclusive o do bug.

NÃO verificado: não vi o reset acontecendo nem a correção funcionando numa janela real; a instância da
pessoa é a versão instalada. Se o reset persistir depois desta correção, há outra fonte de reenquadramento
ainda não achada (por exemplo, remontar o React Flow por `canvasRevision` inesperadamente).

Também em 20/09 (CI do PR #72): o benchmark de scrollback do Windows terminou com **exit 3** depois de
imprimir o JSON completo e sem nenhuma linha de erro do benchmark (`PostQueuedCompletionStatus: (6) The
handle is invalid`) — `abort()` do Electron no encerramento, mesma família do crash do node-pty do #51. O
retry do passo (antes só o 139) agora repete também o 3, até 3 vezes; outros códigos (o 1 de falha real do
benchmark, por exemplo) falham na hora, e um crash persistente sai com o código real. Laço testado com
funções falsas. Não verificado no runner: só as próximas execuções mostram se 3 tentativas bastam.

## 2026-09-21 — Correção da janela do enquadramento automático (regressão do #73)

O smoke do Windows do PR #75 falhou com "grupo fixture ocluido por topbar" (bloco sob a barra do topo) num boot
lento (`canvas pronto em 14968 ms`). Causa, no que eu mesmo entreguei em `viewport-auto-fit.ts` (v0.1.395): a
janela de 400 ms que separa "movimento do nosso ajuste" de "movimento da pessoa" abria no PLANEJAMENTO do ajuste;
num PC/runner lento o `requestAnimationFrame` executa depois da janela, o ajuste era tratado como movimento da
pessoa e os reenquadramentos por mudança de layout paravam — o enquadramento inicial, calculado com a medida
antiga das superfícies, ficava errado. Corrigido: a janela conta da EXECUÇÃO do ajuste (`markAutoFitExecuted`),
movimento programático com ajuste pendente é "nosso", e evento DOM real (mouse/roda/toque, `onMove` com evento)
é sempre da pessoa. 9 testes, incluindo o cenário lento (plano em t=1000, execução em t=16000). NÃO verificado:
o smoke do Windows passar de forma estável com esta correção (só o CI mostra) e nada foi visto numa janela real.

Ainda em 20/09 (CI da main do #73): o teste de integração nativo "payload grande chega inteiro e o marcador
posterior preserva a ordem" (`pty-write-queue.integration.test.cjs`) falhou UMA vez no Windows: o recebido tinha
**9 caracteres a mais** que o esperado no meio da linha 131 de um payload de ~43 mil (nada faltou). Passou na
reexecução. Não é do diff (viewport e CI) e é intermitente, mas o teste é de CORREÇÃO do produto: pode ser o
ConPTY injetando sequência de escape numa escrita grande (o que afetaria colar prompt grande no Windows) ou
ruído do teste. O `assert.equal` do Node trunca o texto, então os bytes não apareceram. Instrumentação:
`describeDivergence` (`__fixtures__/text-divergence.cjs`, 3 testes) mostra o índice da primeira divergência, os
tamanhos e o trecho com controles escapados; usada nos três testes de payload. NÃO investigado: a causa — só a
próxima falha, agora com os bytes na mensagem, permite decidir entre bug real e ruído do teste.

E2E de contexto (`canvas-context-e2e.test.ts`, cenário "claude-confianca-de-pasta"), Windows, 3 falhas em runs do #75:
`expect(contextIndex).toBeGreaterThan(decisionIndex)` recebeu -1 com a decisão de confiança presente. Mecanismo (lido
no código do fake): `write()` junta ao buffer de referência QUALQUER escrita que chegue até 40 ms depois de um trecho de
contexto; se um Enter cai nessa janela, o evento vira `context-submitted` e o teste, que procura `context`, não acha. Há
invariantes em outros cenários exigindo ZERO `context-submitted` (o produto não pode enviar contexto sozinho), então
aceitar os dois tipos no teste poderia esconder um bug real. Ainda não se sabe QUEM mandou o Enter. A mensagem da falha
agora traz a sequência completa de eventos; só a próxima falha decide entre artefato de tempo do fake e bug do produto.

## 2026-09-21 — Ciclo de PR mais rápido

Medição (Windows, run da main do #76): ~12 min de passos, dos quais os benchmarks somam ~4,8 min (custo
operacional 145 s, scrollback 74 s, responsividade 50 s), o smoke 134 s e o E2E de contexto 81 s, tudo em série.
Ciclo por PR ≈ CI do PR (~13 min) + CI da main (~13 min) + Release (~11 min).

Feito (autorizado pela pessoa, que escolheu as três opções propostas):
1. `concurrency` no `ci.yml`: em PR um push novo cancela a run anterior da branch; na `main` nunca cancela (o
   Release depende do CI de cada commit).
2. **Auto-merge ligado** no repositório (`allow_auto_merge`): `gh pr merge --auto --squash` faz o PR entrar sozinho
   quando os checks obrigatórios passam.
3. **Release só quando o app muda.** Novo workflow `Release gate` (`release-gate.yml`) roda depois do CI da `main`,
   decide com `release-relevant.sh` (14 casos de teste; na dúvida publica) e só então dispara o `Release` por
   `workflow_dispatch`. Commits só de docs/teste/`ci.yml` não publicam. O filtro NÃO fica dentro do `release.yml`
   porque o `concurrency` dele cancelaria uma publicação em andamento por causa de um commit irrelevante. O
   `release.yml` perdeu o gatilho `workflow_run` (fica só `workflow_dispatch`).
4. **Benchmarks em job paralelo.** O job `Benchmarks (<os>)` roda em paralelo ao `Validate` os passos que não
   dependem de build (npm runtime, alternativas, custo operacional, responsividade, scrollback); o do bundle
   continua no `Validate`. Mesmos passos, mesmos gates, outra máquina ao mesmo tempo: o Windows deve cair de ~13
   para ~8 min. As verificações obrigatórias da `main` ganharam `Benchmarks (ubuntu|windows|macos-latest)`.
NÃO feito de propósito: paralelizar passos DENTRO do mesmo job (os testes sensíveis a tempo já falham de forma
intermitente no Windows e a contenção pioraria isso). NÃO verificado: o `Release gate` só roda de verdade na `main`
depois do merge; se ele falhar, nenhum instalador sai e é preciso disparar `Release` à mão (`workflow_dispatch`).

## 2026-09-21 — Canvas: artefatos de imagem gerados sem expor chave

Implementada a infraestrutura de imagem do Canvas. O processo principal grava bytes gerados em
`userData/generated-images` com nome sanitizado e escrita atômica, normaliza o MIME e devolve somente
uma referência persistível (`path`, `name`, `mimeType`, tamanho e metadados permitidos: prompt, modelo,
data, custo e requestId). Respostas de provedor, cabeçalhos, URLs privadas e chaves não atravessam a
ponte IPC. O evento `canvas:image-generated` cria o `FileNode` automaticamente; o preload guarda eventos
que chegam antes da montagem do Canvas.

O `FileNode` agora renderiza apenas rasterizações allowlisted via `data:` local lido pelo processo
principal, com limite de 25 MB e autorização por caminho. SVG, MIME desconhecido, arquivo ausente,
grande ou corrompido cai para fallback com reparo, abertura no aplicativo do sistema e salvamento de
cópia. Há zoom acessível por teclado e botões, ações para copiar o caminho, duplicar um artefato
gerado, remover temporário e mostrar prompt/modelo/data/custo permitido. Imagens externas só ganham
acesso depois do picker nativo e a concessão em memória é perdida no reinício; artefatos internos são
autorizados apenas dentro da pasta gerada. Exportação/importação remove caminhos absolutos e preserva
metadados seguros para reparo.

Também foi evitada a leitura binária de imagens como texto por agentes do Canvas. A geração efetiva
via Openia continua sendo a task de integração IPC separada já registrada no Notion; esta fatia fornece
o contrato de armazenamento, autorização, persistência e apresentação para ela.

Verificação: `npm test` (1.524 testes, 61 suítes), `npm run test:frontend` (1.148 testes, 120 arquivos,
1 arquivo pulado), `npm run lint`, `npm run typecheck`, `npm run build` e testes direcionados de IPC/
transferência/preview passaram. O build mantém apenas o aviso já conhecido de chunks acima de 500 kB.

## 2026-09-21 — Openia: geração de imagem via IPC, processo filho e arquivo de saída (lado do Felixo)

Decisões (perguntadas à pessoa, com as opções): **(1) quem gera** — o Openia ganha um subcomando `image` e o
Felixo o chama como processo filho (a chave continua só no Openia; o AI Core nunca a lê, hoje proibido de
propósito); **(2) escopo** — só o lado do AI Core com testes (serviço, IPC, validação, cancelamento, limpeza),
sem tela nova; **(3) capacidade** — o Openia informa `outputModalities` em `models --json`; ausente = desconhecido
e nada é oferecido; **(4) repositório do Openia** — já estava clonado (com outro nome de pasta,
`Testes-com-ia`, remote `Felipe-Alcantara/Openia`); usado só para LER, sem alterações lá.

Implementado (`openia-image-service.cjs`, 23 testes novos com filho simulado e com um `openia` falso rodando
como processo de verdade): schema fechado do pedido (`prompt`, `model`, `requestId`; qualquer pasta/caminho é
recusado); exige capacidade informada; pasta privada por pedido; filho sem shell (exceto `.cmd` no Windows),
prompt por stdin, stderr descartado; leitura só do que o filho LISTOU (nome simples, arquivo regular, dentro da
pasta, ≤ 25 MB, bytes raster — SVG/HTML recusados); gravação por `saveGeneratedImage` (a infraestrutura do outro
agente, mesmo dia) e aviso ao canvas só depois de gravar tudo; `pending/success/error/cancelled`; cancelamento
e tempo (180 s) matam o grupo de processos (Windows: `taskkill /T /F`) e esperam o filho sair; varredura de
pastas órfãs ao iniciar e `shutdown()` no `before-quit`; mensagens fixas por código (nunca stderr/chave/traceback).
Contrato para o lado do Openia: `docs/projeto/OPENIA-IMAGEM-CONTRATO.md`.

Verificação de que os testes pegam o defeito: mutação — trocar o kill do grupo de processos por kill só do filho
faz o teste "cancelar mata o filho E o neto" falhar ("o processo neto ficou órfão"); revertido.

NÃO verificado: nada disto rodou contra um Openia real (a 0.1.0 não tem `image`; o teste usa um `openia` falso);
nenhuma imagem foi gerada de verdade; o cancelamento do grupo no Windows (`taskkill /T /F`) só é exercitado pelo
CI, não visto rodando; não há tela para pedir imagem (fica em task própria).

## 2026-09-21 (correção) — Openia imagem: conformar ao contrato REAL do Openia

**Erro meu de investigação, registrado:** o PR #81 (v0.1.402) foi escrito contra um clone do Openia que estava
5 commits atrás do remoto. Nele eu tinha definido um contrato que o Openia real NÃO tem: prompt por stdin,
`--out-dir`, envelope `files[].name`, custo, códigos `key_missing`/`content_policy`, e `outputModalities` em
`models --json`. O Openia upstream já tinha o comando `openia image` (commits `d1b542e`..`9bb9099`) com outro
contrato; contra ele, o serviço publicado não funcionaria. Percebi ao checar as tasks do Openia no Notion
(marcadas Concluídas) e fazer `git fetch` no clone.

Corrigido nesta entrada: prompt em `--prompt=<texto>`; `--output-dir`, `--request-id`, `--cancel-file`,
`--timeout`/`--retries`; envelope versionado (`outputs[].path` absoluto, sem custo) e mapeamento por CÓDIGO DE
SAÍDA (2/3/4/5/6/124/130); só arquivos diretamente na pasta do pedido; cancelamento cooperativo por arquivo
antes do kill; `requestId` que nunca começa com `-`/`_`. Removidos: o gate por `outputModalities` e o campo de
custo. Contrato reescrito em `docs/projeto/OPENIA-IMAGEM-CONTRATO.md`.

**Decisão da pessoa (perguntada):** como o Openia não lista capacidade, o **AI Core consulta o catálogo
público** `GET https://openrouter.ai/api/v1/images/models` (verifiquei que responde HTTP 200 sem credencial;
o Openia o chama com a chave, mas ela não é exigida) — sem chave, sem redirecionamento, 10 s / 2 MiB, cache de
10 min. Modelos fora da lista são recusados antes de executar o filho.

Verificação: 28 testes do serviço (incluindo um `openia` falso que fala os argumentos, o envelope e os códigos
reais, com cancelamento cooperativo e com kill do neto), 2 mutações pegas (sem arquivo de cancelamento; sem exigir
a pasta do pedido) e uma execução de ponta a ponta contra o Openia REAL (upstream extraído, `HOME` falso, sem
chave, sem custo): o serviço passou os argumentos reais, incluindo um prompt que parece opção, e devolveu
`authentication_error` com mensagem fixa e nenhuma pasta sobrando.

NÃO verificado: nenhuma imagem foi gerada de verdade (exige chave e gasta crédito); o cancelamento cooperativo
contra o Openia real (sem chave ele falha antes); o `taskkill /T /F` e o atalho `.cmd` do Windows só o CI
exercita; a consulta do catálogo dentro do Electron empacotado (testada com `fetch` simulado e por `curl`).

## 2026-09-24 — Instalador gerenciado: processo órfão no timeout/cancelamento (extraído para `core/process-tree.cjs`)

Fatia da task "CLI — cobrir layout, scripts e reinício do instalador nos três sistemas" (esforço "Dias";
recorte explícito abaixo). Achado ao ler `managed-cli-installer.cjs`: no timeout de 10 min o código matava só
o processo do `npm` com `child.kill('SIGKILL')`, sem `detached: true` no spawn — quando `npm install` roda um
script de pós-instalação (processo-neto), matar o npm não mata o script. No POSIX porque o processo herda o
grupo do próprio app (sem `detached`, `process.kill(-pid)` nem seria seguro tentar); no Windows porque não
existe kill de grupo por sinal nenhum. Também não existia NENHUM cancelamento externo — só o timeout.

Esta é a mesma classe de bug de três ocorrências anteriores já documentadas neste repositório (duas
`getManagedCliLayout`/`ensureManagedCliRuntime` usando separador do SO real em vez do pedido; a detecção de
CLI no Windows não resolvendo `.cmd` antes de executar) — nos três casos, cada arquivo tinha sua própria
implementação da mesma lógica sensível a plataforma, e ninguém varria as outras cópias quando uma delas era
corrigida. `openia-image-service.cjs` já tinha uma implementação de "matar árvore de processo" testada e
correta (a própria task de geração de imagem, mesma sessão anterior); extraí para `core/process-tree.cjs`
(puro, sem Electron) em vez de escrever uma terceira cópia, e o instalador e o serviço de imagem passaram a
compartilhar a mesma.

Decisão pedida à pessoa: erro inesperado do kill (ex.: EPERM, não ESRCH) deve propagar ou ser engolido? As
duas chamadas existentes acontecem em contexto fire-and-forget (`setTimeout`/callback de abort, sem `await`
nem `.catch()`) — uma rejeição ali vira exceção não tratada e derruba o processo principal do app inteiro,
pior que o órfão que o módulo existe para evitar. Resposta: nunca rejeitar; `onError` opcional para quem
quiser logar.

Corrigido em `managed-cli-installer.cjs`: spawn com `detached: platformName !== 'win32'`; timeout E
cancelamento externo (`AbortSignal`, novo — não existia em nenhuma camada) agora chamam `killProcessTree` e
SÓ resolvem depois (quem chama pode, na sequência, apagar a pasta temporária da instalação; resolver cedo
arriscaria apagar um diretório que um script de pós-instalação ainda não soltou).

Verificação: `core/process-tree.test.cjs` (10 testes: os dois ramos de plataforma isolados por injeção, e
DOIS testes de PROCESSO REAL — avô→pai→neto — provando primeiro o bug reproduzido sem a correção, depois a
correção matando o neto de verdade); `managed-cli-installer.test.cjs` ganhou 4 testes (árvore no timeout, não
`child.kill` direto; `detached` correto por plataforma; cancelamento antes e durante a instalação; cancelar
depois de já ter terminado não muda nada). `npm test` 1566/1566 (+14), `eslint` e `tsc -b` limpos.

**Recorte desta sessão** (a task-mãe é "Dias" de esforço; entreguei a fatia de maior risco de confiabilidade,
com prova real, não a matriz inteira): NÃO feito — matriz de instalação Python/script (só o caminho npm foi
tocado), smoke empacotado real nos três SOs, mensagens de erro estáveis por ecossistema, e validação de que o
`taskkill`/grupo POSIX funcionam de verdade fora do CI (só visto rodando em Linux aqui). Tasks de pendência
abertas no Notion.

## 2026-09-25 — CI e Release mais curtos sem perder cobertura (workflows e shell)

Decisões da pessoa aplicadas: todos os ganhos sem perda; node-pty com prebuild no Windows; comparação
yarn/pnpm/corepack só no Linux por PR (o `Dependency policy` continua completo) + nightly nos 4 SOs; o E2E de
contexto continua com 50 repetições.

1. **Main reaproveita o CI do PR.** Job `reuse` no `ci.yml` (só em push): acha o PR mergeado do commit,
   compara a árvore Git do commit da main com a do head do PR e procura a run `pull_request` verde do head
   (SHA completo). Tudo batendo, os outros jobs são pulados e a run fica verde; o job copia da run do PR os
   artefatos `terminal-scrollback-<os>` (baseline do gate de regressão). Nunca derruba a run
   (`continue-on-error` + saída 0); push direto, PR desatualizado, run ausente ou erro de API = CI completo.
   Achado ao testar: em erro HTTP o `gh api` imprime o corpo JSON no stdout — sem validar o formato (SHA de
   40 hex), duas respostas de erro iguais pareceriam árvores iguais.
2. **Seletor de release por inclusão** (`release-relevant.sh`): só publica o que entra no instalador
   (`build.files`, `extraResources`, hooks, entradas do vite build, package.json/lock) ou gateia o Release.
   Corrige um bug: `app/resources/skills/*/SKILL.md` casava com `*.md` e nunca publicava.
3. **Cortes no caminho crítico:** responsividade do terminal em job exploratório; lint só no Ubuntu;
   bancadas de gerenciador do PR e do release com `--managers=npm-runtime` (flag implementada na frente de
   scripts) e novo `nightly.yml` com a comparação completa nos 4 SOs + audits; Windows do release com
   `-c.npmRebuild=false` (node-pty 1.1.0 traz prebuild N-API win32-x64; o rebuild levava 107 s); smokes de
   cmd.exe/path longo em job próprio depois do publish; `vite build` sem o `tsc -b` repetido; removidos o
   cache de TypeScript, os `if` mortos de `workflow_run` e o `apt-get install xvfb`.

Verificação: PyYAML nos 5 workflows; actionlint 1.7.12 + shellcheck 0.11.0 sem achado novo em relação à
main (o único é o SC2016 informativo pré-existente no aviso do Gatekeeper); `release-relevant.test.sh` com
20 casos novos (8 falham contra o seletor antigo); o passo `decide` rodado contra commits reais da main
(14 merges de PR recentes, de #90 para trás → reuso; `e3c4204`, push direto → CI completo; #75, sem run
`pull_request` verde para o head → CI completo) e contra um `gh` falso (árvores diferentes, erro nas duas árvores, erro no `run list`); download
dos 4 artefatos de uma run real de PR; electron-builder 26.15.3 num projeto-sonda confirmou "skipped
dependencies rebuild reason=npmRebuild is set to false"; os 15 checks obrigatórios da main continuam com
os mesmos nomes. NÃO verificado: nenhum workflow rodou no GitHub (só roda depois do merge); o empacotamento
Windows com o prebuild só o Release real prova, pelo smoke do app instalado.

**Ajustes na junção das duas frentes (mesmo dia), a partir da revisão adversarial e de testes contra dados
reais:**

- A decisão de reuso saiu do YAML para `.github/scripts/ci-reuse.sh`, com 12 cenários em `ci-reuse.test.sh`
  (um `gh` falso no PATH), rodados no job `Release scripts`. Ela passou a rejeitar run verde que seja de PR
  para outra base, mas **só com evidência**: a API esvazia `pull_requests` quando a branch do PR é apagada,
  o que acontece em todo merge daqui (medido na run 36170804309 do #90). Exigir a base na lista faria o
  reuso nunca acontecer; com a regra final, o merge do #90 é reaproveitado e um push direto (`e3c4204`) não.
- A lista de inclusão do seletor de release tinha divergido na própria junção: `package-manager-selection.cjs`,
  exigido pelos dois gates de gerenciador do `release.yml`, não disparava release. O novo
  `.github/scripts/release-inputs.cjs` deriva do `release.yml` e do `build` do `package.json` o que o Release
  executa ou empacota (com o fecho dos `require` locais), e o teste exige que tudo isso dispare release. Sem a
  correção, o teste falha nos casos certos. `.gitattributes` também entrou na lista (muda os bytes que o
  checkout do Windows empacota).
- A bancada de alternativas passou a recusar `--check` sem `npm-runtime`, como a operacional. É gate do
  Release e, antes, passaria sem medir o npm que o app usa.
- O smoke do Windows registra a ACL também do `conpty.node`, que o node-pty 1.1.0 carrega por padrão no
  Windows 10+ (o `pty.node` é o fallback winpty), e o job exploratório usa caminho relativo no `source`.

Validação da árvore combinada, nesta máquina: `npm test` 1640/1640, frontend 1182 + 1 ignorado, lint, build,
os 4 testes de `.github/scripts`, actionlint sem achado novo, e as duas bancadas com os argumentos exatos do
CI (`--check --managers=npm-runtime`): alternativas em 17,9 s e operacional em 44,6 s, com pnpm, Yarn e
Corepack como `not-selected`.

**Limitação declarada:** o repasse de `--managers` dentro do `main()` das duas bancadas não tem teste
unitário; só executar o `main()` pegaria sua remoção, e isso instalaria pacotes reais dentro do `npm test`
de todo PR. Se regredir, o custo é só de tempo (o CI volta a medir a matriz inteira), visível no JSON que o
job publica.

**Bancadas Electron que falhavam com o passo verde (mesmo dia, a partir da primeira run do PR):** a run
36188414436 (`ab8e043`) caiu em `Benchmarks (macos-latest)` com `posix_spawnp failed` na bancada de
scrollback. A causa é que o `spawn-helper` do node-pty vem sem permissão de execução no tarball do npm, e só
a bancada de responsividade o corrigia. Com a separação dos jobs, a de scrollback passou a rodar sem essa
correção. Agora ela chama `ensureNodePtySpawnHelperExecutable` antes de carregar o node-pty. Ao investigar,
apareceu uma falha pior: no processo principal do Electron, `process.exitCode = 1` não derruba o passo.
Medido com o Electron 41.10.7 do projeto: erro depois de `app.quit()` sai com 0, e erro antes do app ficar
pronto deixa o processo pendurado até o teto do job. Só `app.exit(1)` sai com 1 nos dois casos. As quatro
bancadas Electron (scrollback, bundle, conexões do canvas, saída do terminal) passaram a usar um helper
único, `app/scripts/electron-exit.cjs`, com 4 testes. Prova na bancada de scrollback com `--counts=99`
(argumento inválido): a versão da main fica pendurada (exit 124 no `timeout`) e a nova sai com 1.

A correção expôs a bancada de bundle quebrada desde `be69f76` (12/09). Nesse commit, "Ferramentas" deixou de
ser um botão com `title` e virou o grupo recolhível `SidebarSection` da sidebar do canvas. A bancada procurava
o botão antigo, o `throw` dentro do `executeJavaScript` chegava só como "Script failed to execute", e o job
`Validate` ficava verde com 0/5 amostras em toda run da main desde então. Agora a bancada abre o grupo pelo
cabeçalho (`button[aria-expanded]` com o texto "Ferramentas"), espera só o `data-felixo-canvas-ready` e
devolve o motivo como texto em vez de `throw`. Nesta máquina, `benchmark:bundle:check` voltou a medir 5/5:
startup p50 1323 ms, menu p50 71 ms, Fetch All sob demanda p50 414 ms, chunk do Fetch All fora do startup.
Também foram corrigidos três textos com mojibake (dois na bancada de conexões e um no
`canvas-context-e2e.test.ts`). O comentário em `pty-process-manager.cjs:960` ficou como estava porque cita a
forma quebrada de propósito.

No Windows, a mesma correção de saída revelou uma terceira falha escondida. A bancada de bundle lançava
`EPERM` ao apagar o userData temporário dentro do `finally`, e isso acontecia em toda run: as quatro últimas
runs verdes da `main` (`b8cc9ad`, `a51d692`, `b9f1f48`, `aadb01d`) têm o `[bundle] falhou: EPERM` no job
`Validate (windows-latest)`. A primeira tentativa (`e80fb07`, `maxRetries` no `rmSync`) não resolveu, e a run
36198231288 continuou com EPERM. Uma sonda com o Electron 41.10.7 mostrou o motivo: o Chromium grava o perfil
(`Local State`, `Preferences`, índice do `Cache`) durante o próprio encerramento, depois de qualquer JS. A
remoção em `finally`, `will-quit`, `quit` e `process.on('exit')` deixou a pasta recriada com 9 arquivos no
Linux. No Windows esses arquivos ainda estão abertos, daí o EPERM. Por isso a limpeza virou
`removeBenchmarkUserData`, que tenta e só avisa, como a `removeTemporaryDirectory` do `release-smoke.cjs`.
Lançar ali também trocava o erro real da bancada pelo EPERM. Sobram ~32 KB por execução na pasta temporária,
um custo aceito: os runners são descartáveis e um processo externo só para apagar isso seria desproporcional.
O teste novo falha se a função voltar a lançar (provado revertendo a correção).

## 2026-09-25 — Registro retroativo: política de performance, matriz visual e gate de regressão (PRs #86–#90)

Estes cinco PRs entraram na `main` em 25/09 sem entrada neste arquivo, o que descumpre o passo de
documentação do fluxo de trabalho. Esta entrada foi escrita no mesmo dia, depois dos merges, com os fatos
tirados dos commits e das runs. Ela não reescreve nada anterior.

**#86 (`b8cc9ad`) — política do Modo Performance.** `docs/projeto/POLITICA-PERFORMANCE.md` converte em metas
por cenário o baseline já medido (20 terminais × 8.000 linhas no Linux, `5cfc40a`: renderer RSS p95 de 706 MiB
com scrollback fixo contra 565 MiB com o adaptativo) e mapeia no código os quatro modos: normal, performance,
reduced motion e safe mode pós-crash. O orçamento também virou código, em
`app/src/features/shared/performance/performance-budget.ts` com teste, para não depender só da prosa. O
mapeamento achou quatro lacunas: o reduced motion do SO não cobre minimapa nem céu animado; o modo não entra
sozinho por carga; o safe mode não existe; não há telemetria. Elas foram abertas como tasks e não
implementadas neste PR.

**#87 (`15723a3`) e #88 (`a51d692`) — matriz visual.** A matriz tema × viewport × DPR do
`app/scripts/canvas-smoke.cjs` só fotografava o layout base. Ela passou a abrir o painel Buscar, o menu de
contexto e o modal de handoff em dois viewports críticos, e a cobrir fonte maior, reduced motion e locale no
viewport de 320 px. Por custo de CI, entrou um viewport por dimensão nova, e não a combinação completa.
Surgiram três achados em telas menores que 768 px, abertos como tasks: o painel de ferramentas vaza ~8 px
porque o `PANEL_MIN_WIDTH` nunca cede; a dock de terminais recolhidos intercepta cliques mesmo vazia; e, com
fonte maior, "Selecionar" e "Enquadrar" aparecem colados. O CI também revelou dois flakes que não se
reproduziam localmente. No #87, o bounds-check de 2 px do modal foi relaxado. No #88, o clique em
"Enquadrar todos os blocos", que o Playwright às vezes dava como fora da viewport, passou a ser disparado
via DOM.

**#89 (`b9f1f48`) e #90 (`aadb01d`) — gate de regressão entre commits.** Antes só existiam limiares fixos
dentro de uma mesma execução, e um PR que piorasse todos os cenários por igual passava. Agora
`app/scripts/benchmark-regression-gate.cjs` compara o benchmark de terminal do PR com o artefato
`terminal-scrollback-<os>` do último run verde da `main`. Sem baseline disponível, o gate não falha, porque
a ausência de baseline não prova regressão. A calibração saiu do ruído medido em quatro rodadas no próprio
PR: o mesmo commit variou até 63% em resume e 72,8% em heap num cenário de base pequena. Por isso o CI
passa `--threshold=60`, aplica um piso absoluto por métrica e usa `--exclude-metric=resumeMs` (o resume
continua medido, só não decide). O #90 fez o gate citar no resumo do job o commit e a run do baseline, o
head do PR e o critério. Uma chave desconhecida em `--exclude-metric` passou a ser erro. Os releases
v0.1.416 (#86), v0.1.417 (#89) e v0.1.418 (#90) saíram pelo Release gate.

Validação à época: CI verde nos 4 SOs em cada PR. No #90, o CI da `main` falhou uma vez num passo que o PR
não tocou (órfão intermitente do yarn-classic no Windows). O rerun passou e o problema foi aberto como task.
Os detalhes de cada PR estão nas páginas das tasks no Notion e no relatório diário de 25/09.

**Release real do #91 (mesmo dia, 20:07–20:17):** a `main` reaproveitou o CI do PR. A run 36199742100 levou
14 s: só o job `Reaproveitar CI do PR` rodou, citando a run 36199170625, e os 4 artefatos de baseline foram
copiados. O Release 36199766874 publicou a v0.1.419 8m13s depois do merge (a mediana medida antes era
19m25s). O `Publish windows-latest`, já com o prebuild do node-pty, levou 7m17s e passou no smoke do app
instalado. O job novo `Smoke exploratório (Windows)` aparecia com X vermelho: o smoke de path longo falhava
com o diagnóstico do próprio app (`pty-spawn-error-long-path`, 318 caracteres), como já falhava nas releases
v0.1.416 a v0.1.418, quando ainda era um passo com `continue-on-error` dentro do publish. Isso não é
regressão. O que mudou foi a apresentação: o `continue-on-error` ficou só no job, que pintava vermelho em
todo release. Agora os dois smokes têm `continue-on-error` também no passo. O tratamento do path longo
segue nas tasks de Terminal do Notion.

**Flake do PTY no Windows: hipótese e correção no emissor (mesmo dia, 20:30).** A falha apareceu de novo no
CI da `main` do `3c7c668` (run 36200639956): `native count=20`, uma sessão parada em **1.110** de 2.003
linhas, o mesmo número da run 36197035555. Nas duas vezes a sessão travada era ociosa (índices 17 e 12), ou
seja, uma das que escrevem as 2.000 linhas num único `process.stdout.write` e chamam `process.exit(0)`
`holdMs` (5 s) depois. No Windows, a escrita num TTY (o ConPTY) é assíncrona, e a documentação do Node avisa
que `process.exit()` descarta escritas pendentes em `process.stdout`. Com 20 PTYs disputando CPU, 5 s podem
não bastar para drenar ~240 KB. Por isso o emissor agora só agenda o exit no callback da última escrita, e os
pedaços intermediários seguem sem esperar, então o ritmo das sessões ativas não muda. Dois testes novos rodam
o emissor com stdout, timers e exit falsos: falham antes da correção e passam depois. A bancada real com
`--counts=1,20` completou tudo no Linux. A hipótese só se confirma com runs do Windows sem
`output-complete=false`; a task do Notion "CI — sessão PTY para no meio no benchmark de scrollback do Windows
(count=20)" continua aberta até lá.

## 2026-09-25 — TypeScript 7 lado a lado com a API do 6

**Task.** Adotar o TypeScript 7.0.2 (compilador nativo em Go) sem perder o
typescript-eslint, que ainda exige `typescript` >=4.8.4 <6.1.0 (conferido no
registro: 8.69.0 instalado e 8.70.1, a mais nova, com o mesmo peer) e cuja
issue de suporte ao 7 (typescript-eslint#10940) segue aberta. Decisão da
pessoa: "lado a lado".

**Forma oficial, conferida na fonte.** A seção "Running Side-by-Side with
TypeScript 6.0" do anúncio do 7.0 recomenda, para ter o `tsc` do 7 e a API do 6:
`"@typescript/native": "npm:typescript@^7.0.2"` e
`"typescript": "npm:@typescript/typescript6@^6.0.2"`. O pacote
`@typescript/typescript6` (6.0.2) reexporta a API de `@typescript/old`
(`npm:typescript@^6`, hoje 6.0.3) e só declara o bin `tsc6`. O
`@typescript/old`, porém, declara `tsc` e `tsserver`; na microsoft/typescript-go
#4567 um mantenedor explicou que o npm decide o conflito de bin por ordem
lexical e que o nome `@typescript/native` funciona no npm (Yarn Berry e Bun
resolvem diferente). Provado aqui: `node_modules/.bin/tsc ->
../@typescript/native/bin/tsc` após `npm ci` limpo com o npm 11.17.0 local e
após `npx -y npm@10 ci --ignore-scripts` (npm 10.9.9) numa cópia do
package.json/lockfile; nos dois, `tsc -v` = `Version 7.0.2` e
`require('typescript').version` = `6.0.3`. `tsserver` continua sendo o do 6.

**Mudanças.**
- `app/package.json`/lockfile: os dois aliases. O lockfile traz os 20 pacotes
  nativos opcionais `@typescript/typescript-<os>-<arch>` 7.0.2 (inclusive
  win32-x64, darwin-arm64/x64, linux-x64/arm64 da matriz da CI). Nenhuma outra
  entrada do lockfile mudou além de `typescript` (6.0.3 → compat 6.0.2) e das
  novas `@typescript/native` e `@typescript/old`.
- `scripts/typescript-toolchain.cjs` (novo): fonte única dos caminhos
  (compilador em `@typescript/native`, API em `typescript`), leitura do alvo
  real de `node_modules/.bin/tsc` (link no POSIX, shim `.cmd` no Windows) e a
  regra do lançador do 7.
- `scripts/typescript-toolchain.test.cjs` (novo, roda no `npm test` dos quatro
  runners): o alvo do bin `tsc` pertence ao typescript 7.x; `npm exec -- tsc -v`
  com o mesmo npm do teste (`npm_execpath`) imprime a versão do
  `@typescript/native`; `require('typescript')` e o typescript-eslint resolvem a
  mesma API 6.x. Sem rede: `npm exec` com bin local não consulta o registro
  (conferido em `libnpmexec`). O parser do `.cmd` é testado em qualquer SO com o
  shim real gerado pelo cmd-shim do npm 10.9 (7.0.0) e do npm 11 (8.0.0),
  idênticos. O teste remove `npm_config_call`/`npm_config_package` herdados,
  porque um `npm exec -c` externo quebrava o `npm exec` interno (EUSAGE).
- `scripts/typecheck-performance.cjs`: executava `node_modules/typescript/bin/tsc`,
  que não existe no pacote de compatibilidade; agora executa e reporta
  `@typescript/native`. O lançador `bin/tsc` do 7 faz `process.execve` para o
  executável nativo só fora do Windows e com Node >= 22.15 (docs do Node:
  adicionado em v22.15.0/v23.11.0); fora disso o PID amostrado seria o do
  lançador, então o RSS vai `null` com aviso no log.
- Nenhum tsconfig mudou; `.github/` não foi tocado.

**Validação (Linux x64, Node 25.9.0, npm 11.17.0).** `npm run build` (tsc -b +
vite) ok; `npm test` 1628/1628; `npm run test:frontend` 123 arquivos, 1182
testes ok e 1 pulado (o benchmark opt-in `FELIXO_CONNECTION_BENCHMARK=1`);
`npm run lint` ok e `npm ls typescript` sem peer inválido. Os testes novos também
passaram com Node 22.22.3 + npm 10.9.8 (a combinação da CI). O TS 7 não acusou
erro novo no código; um arquivo temporário com erro de tipo, variável não usada
e `enum` gerou TS2322/TS6133/TS1294 com saída 1, e foi removido. Um
`.tsbuildinfo` gravado pelo 6 é rejeitado pelo 7 ("generated with version
'6.0.3' that differs with current version '7.0.2'"), então o fallback
`restore-keys` do cache de typecheck da CI não gera falso verde. `npm audit` e
`npm audit --omit=dev`: `found 0 vulnerabilities`; `npm audit signatures`:
1026 pacotes com assinatura verificada.

**Medição no notebook de referência (i5-6200U, 2 núcleos/4 threads, ~2 GB
livres, swap cheio; load average 5,8–7,5 por outros processos).** A/B
intercalado, cinco pares de `tsc -b --force`: TS 6.0.3 (`tsc6`) mediana 25,82 s,
33,27 s de CPU de usuário e 774.436 KiB de pico; TS 7.0.2 mediana 3,20 s,
6,53 s e 462.596 KiB (−87,6% tempo, −80,4% CPU, −40,3% RSS). Na `main` antes da
troca, `benchmark:typecheck` (3 amostras) deu frio p50 34,34 s / 775.220 KiB e
incremental 0,35 s / 71.944 KiB; depois, frio 3,12 s / 470.164 KiB e incremental
0,11 s / 19.796 KiB. Detalhes em `app/benchmarks/README.md`.

**Não verificado / riscos.**
- Windows e macOS só serão provados quando o `npm test` rodar na CI com o
  teste novo; aqui só Linux.
- `.github/dependabot.yml` com dependências em alias `npm:` não foi verificado
  (o arquivo não foi alterado; há PR aberto mexendo em `.github/`). Hoje as
  atualizações de versão do npm estão desligadas (`open-pull-requests-limit: 0`)
  e só as de segurança ficam ativas.
- O pacote `typescript` de compatibilidade não traz `lib/tsserver.js` (só
  `typescript.js`, `tsserverlibrary.js` e `tsc.js`); o `tsserver` do 6 fica em
  `node_modules/@typescript/old`. Não foi testado como um editor configurado
  para "usar a versão do workspace" reage a isso.
- O aviso `allow-scripts` do npm sobre `electron@41.10.7` aparece desde antes
  da troca (o `allowScripts` do package.json cita 41.3.0) e não foi tocado.

**Ideias para quem quiser contribuir.** Quando o typescript-eslint suportar o 7
(ou o 7.1 publicar a API nova), remover o alias do 6 e voltar a
`"typescript": "^7"`. Em máquinas com pouca RAM, avaliar `--singleThreaded`
(opção do 7.0.2): em três pares intercalados mediu 4,18–5,31 s e
361.248–375.196 KiB de pico, contra 3,18–3,49 s e 456.504–495.056 KiB do
padrão, ou seja, troca ~1–2 s por ~90 MiB a menos; o projeto manteve o padrão.

## 2026-09-25 — Bancada de renderização da UI com Modo Performance e escolha de GPU

**Por quê.** A task "Performance — comparar Modo Performance ligado vs desligado no benchmark" pedia o ganho
real do modo, e o Felipe pediu medições nesta máquina com o modo ligado e desligado e nas duas GPUs (Intel HD
520 e GeForce 920MX). Nenhuma bancada media isso: as de conexões e de saída do terminal comparam estruturas
de dados e não ligam o modo.

**O que entrou.** `app/scripts/ui-render-performance.cjs` (`npm run benchmark:ui-render`) sobe o app real com
o `dist` de produção num perfil temporário, popula o canvas pela ponte `window.felixo.canvas`, alterna o modo
pelo `localStorage` da tela de Configurações e repete a mesma interação em rodadas intercaladas. Ela mede FPS,
p95/p99 de quadro, estilo/layout/paint/composição pelo tracing (total e por quadro) e long tasks. A GPU que
renderizou vem do CDP, e a bancada falha se não for a pedida. 11 testes unitários.

**Achados no caminho, todos medidos:**
1. A instância de automação (porta CDP) rasterizava sempre por software (`disable-gpu`), então nenhuma
   automação media a GPU: o primeiro relatório dizia `GPU: Disabled`. A decisão virou
   `shouldUseSoftwareRendering` em `electron/core/graphics-mode.cjs`. A automação continua em software por
   padrão, mas aceita `FELIXO_GRAPHICS_MODE=hardware` explícito no lançamento. O modo salvo no perfil não
   conta, e assim `--real-profile` segue no padrão seguro. Quatro testes novos, um deles falha com a regra
   antiga. O app normal não muda.
2. No X11 com PRIME, o offload da NVIDIA pelo GLX derruba o GL do Chromium (`ANGLE Display::initialize error
   12289: Invalid visual ID requested`), e o Electron fica preso. O ANGLE sobre Vulkan funciona e renderiza na
   920MX. Isso vale como dado para a task "Hardware — oferecer escolha de GPU": no Linux, uma opção de GPU
   dedicada precisa lançar o app com Vulkan, não só com as variáveis de offload.
3. Com Vulkan, o Chromium escolhe a dedicada por conta própria (`__VK_LAYER_NV_optimus=non_NVIDIA_only` e
   `MESA_VK_DEVICE_SELECT` não mudaram isso). A integrada é medida pelo GL, o caminho padrão do app.

**Primeiros números (não são o resultado).** Uma rodada curta de validação, com dois workflows rodando em
paralelo, já mostrou o Modo Performance multiplicando o FPS: Intel/GL de 19,2 para 32; NVIDIA/Vulkan de 28,8
para 49,6. Com a máquina ocupada, esses números só provam que a bancada funciona. A medição de verdade, com a
máquina quieta e várias rodadas, fica registrada numa entrada própria.

## 2026-09-26 — Dreno do PTY nativo espera o fim da saída, não uma janela fixa

A correção de 25/09 (`7b6907a`, em que o emissor só sai depois de drenar a última escrita) não acabou com o flake
do Windows. Houve mais duas ocorrências já com ela, no CI do PR #93 (runs 36218374141 e 36218883853), com
sessões paradas em 1.826 e 977 de 2.003 linhas: uma ativa e outra ociosa. Somando as de 25/09 (1.110 nas
três), os cortes variam, o que aponta para **tempo** e não para um limite fixo. A causa estava na bancada:
depois que os filhos saíam, ela esperava uma janela fixa de `nativeDrainMs` (2 s) a partir da saída e
desistia. No Windows, com 20 ConPTYs disputando 4 vCPUs, o conhost continua entregando saída depois que o
processo sai, e a bancada chamava de "saída incompleta" uma entrega apenas lenta. Agora a janela conta a partir
do **último dado recebido**. Ela desiste só quando nada chega por 2 s, e o teto continua sendo o
`settleDeadline`. Dois testes com um PTY falso cobrem os dois lados: a saída que chega depois do filho sair é
esperada (falha com a regra antiga), e sem mais saída a bancada desiste rápido, sem ir até o teto. A bancada
real `--counts=1,20` completou no Linux. A confirmação no Windows depende das próximas runs.

## 2026-09-26 — Flake do PTY no Windows: a causa é a desmontagem da fase anterior

Depois de duas correções (`7b6907a` e `c4e0fb0`) que não acabaram com o flake, rodei um experimento no
Windows do CI, numa branch descartável `exp/conpty-dll` que não vai para a main. Ele usou a própria
`benchmarkNativePtys`, com rodadas intercaladas, cada uma num processo próprio:

| Condição (count=20, 2.000 linhas por sessão) | Rodadas com perda |
| --- | ---: |
| Isolado, Node puro, ConPTY do sistema / `conpty.dll` | 0/8 · 0/8 |
| Isolado, processo principal do Electron, sistema / dll | 0/8 · 0/8 |
| Sequência 1→5→10→20 como a bancada, sem pausa entre fases | **1/8** (sessões 4 e 5 em 1.154/1.155) |
| A mesma sequência esperando os PTYs anteriores morrerem + 3 s | 0/8 |

Nem o Electron nem o tipo de ConPTY causam a perda sozinhos. O que corta a saída de sessões novas é abrir 20
PTYs logo depois de matar os da fase anterior, enquanto o node-pty ainda desmonta os antigos (os
`AttachConsole failed` do log vêm dessa desmontagem). Na bancada completa, que ainda tem o renderer aberto, a
taxa chegou a ~50%. Agora, depois do `kill`, cada fase espera os PTYs saírem de fato (teto de 15 s) e mais 3 s
antes da próxima (`waitForProcessesToExit`, com dois testes). No Linux, a bancada com `--counts=1,5,20`
passou.

**Risco de produto (hipótese, não medida no app):** o app também roda o node-pty no processo principal do
Electron. Fechar muitos terminais e abrir muitos logo em seguida no Windows pode fazer as sessões novas
perderem saída. Fica registrado na task do flake para ser medido no app real.

## 2026-09-26 — Medição da renderização: Modo Performance, duas GPUs e Tailwind 4

Primeira medição do custo de desenhar a UI real nesta máquina (i5-6200U, Intel HD 520 + GeForce 920MX),
com a bancada `ui-render-performance.cjs`. A tabela completa está em `docs/projeto/POLITICA-PERFORMANCE.md`
("Ganho medido").

**Uma primeira matriz (05:04–05:23) saiu enviesada e foi descartada.** A execução `main` na Intel da 1ª
repetição, a primeira da matriz com cache frio, ficou ruim em todas as rodadas (9 a 22 FPS), e isso fazia o
Tailwind 4 parecer duas vezes mais rápido. A 1ª rodada de cada execução também era sempre mais lenta
(aquecimento), e ela caía no modo `off`, o que inflava o ganho do Modo Performance. A bancada ganhou
`--warmup` (padrão 1: uma passada da interação fora do relatório), e a matriz v2 (05:24–05:37) começou com
uma execução descartada. Os números abaixo são da v2.

- **Modo Performance:** +23% de FPS na Intel (39,5 → 48,5) e +16% na 920MX (45,5 → 52,8). O estilo por
  quadro cai ~76%. Com 1.000 blocos (1ª matriz, sem esse viés relevante nessa ordem de grandeza) dobra o
  FPS, de ~2 para ~4,3, mas a composição domina e o app continua travado.
- **GPU dedicada** (ANGLE sobre Vulkan, o único caminho que funciona no X11 com PRIME): +15% de FPS no modo
  normal e +9% no Performance, com quadro p95 25–33% menor, a 48 blocos. A 1.000 blocos, nenhuma diferença
  (gargalo em CPU e composição). A opção de GPU da task de hardware "só entra se a medição mostrar ganho
  real": o ganho existe mas é moderado, e a decisão fica com o Felipe.
- **Tailwind 4 × 3:** sem regressão. FPS, p95, estilo e paint iguais dentro do ruído nas duas GPUs e nos
  dois modos, e a abertura (2,4–2,7 s) também. O único sinal é a composição total, 10–20% maior no v4, sem
  efeito em FPS nem em p95.

## 2026-09-25 — Tailwind 4: migração do major com a cascata do v3 preservada

**Task.** Migrar o app do Tailwind 3.4.19 para o major mais recente (4.3.3,
`latest` no npm), um PR só para esse major, aceitando os padrões novos do v4 e
mantendo a precedência entre o CSS próprio e as utilities como era no v3. Base:
`main` em 6ba115d (TypeScript 7 já dentro). Registro gravado em 26/09/2026,
00:43 (o trabalho atravessou a meia-noite).

**Fonte conferida.** Guia oficial de upgrade e páginas de instalação com Vite,
detecção de fontes, estilos próprios e Preflight lidos no código-fonte do site
(tailwindlabs/tailwindcss.com); tipos e comportamento do `@tailwindcss/vite`
4.3.3 lidos no pacote instalado (a raiz de varredura padrão é o `root` do Vite,
`app/`); CSS de cada utility tirado do design system do próprio v4
(`__unstable__loadDesignSystem(...).candidatesToCss`).

**O que mudou (5 commits).**
- Dependências: `tailwindcss` ^4.3.3 e `@tailwindcss/vite` ^4.3.3 (plugin
  recomendado pelo guia para Vite, em `vite.config.ts`); saem `autoprefixer`
  (o v4 prefixa), o `postcss` direto (o Vite 8 já depende dele),
  `postcss.config.js` e `tailwind.config.js`. Lock: +29 pacotes (Tailwind,
  oxide e lightningcss com binários por plataforma) e −44 (cadeia PostCSS do
  v3); nenhuma outra versão mudou.
- `index.css`: `@import 'tailwindcss' source('.')` (mesmo escopo do `content`
  do v3; a saída ficou idêntica à da detecção automática de `app/`), `@theme`
  com fontes e sombras do antigo config, tokens `@layer utilities` viraram
  `@utility`, `.markdown-content` segue em `@layer components`, regras de
  elemento em `@layer base`, classes próprias sem camada e
  `button:not(:disabled) { cursor: pointer }` (o Preflight do v3 devolvia
  `cursor: default` aos desabilitados; o do v4 não tem essa regra). Motivo e
  medição da cascata em `ARQUITETURA.md` ("Tailwind 4 e a cascata do CSS
  próprio").
- Templates: saída do `npx @tailwindcss/upgrade@4.3.3` revisada troca a troca
  (1072 trocas em 83 arquivos) + 10 `rounded` isolados que a ferramenta pulou
  dentro de template literal, renomeados à mão.
- Cascata: 32 atributos `!` mortos dos handles/redimensionadores do React Flow
  removidos e 11 usos de 6 utilities com variante ganharam `!` (lista na ARQUITETURA).

**Reescritas da ferramenta revertidas.** A ferramenta trata qualquer string
como classe. Voltaram ao original: `terminal-session-store.ts:1056`
`removeEventListener('blur-sm', …)` (vazaria o listener de blur da janela);
`focus-restore.ts:17` `Pick<HTMLElement, … | 'blur-sm'>` (TS2344, conferido
rodando o `tsc`); `useFocusRestore.ts:15` e `:88` (tipo e evento reenviado
`'blur-sm'`) e os comentários `:85`/`:117`; `useFocusRestore.test.ts:119, 129,
147, 170, 177` (o teste tinha sido reescrito junto e passaria com o bug);
`canvas-starfield.test.ts:17, 37` (`shadow` → `shadow-sm` no nome do teste);
`terminal-drawer-pin.test.ts:56` (`rounded` → `rounded-sm`). No `index.css`:
`@utility markdown-content` + 18 `@utility hljs-*` gerados de CSS de terceiro
(voltou `@layer components`) e o bloco de compatibilidade que forçava borda
gray-200 (a decisão foi aceitar o `currentColor` do v4). Mantido, conferido: o
comentário de `menu-panel-timing.ts:3` (`duration-[180ms]` → `duration-180`)
acompanha a classe dos botões.

**Descoberta que mudou a análise.** Sem `@tailwind variants` no `index.css`, o
v3 anexava as utilities com variante no FIM da folha, depois do CSS próprio.
Ou seja, a precedência antiga era: utility sem variante < classe própria <
utility com variante (empates). Nenhuma disposição de camadas do v4 reproduz
isso, porque as duas famílias de utility saem juntas em `@layer utilities`.

**Validação.**
- `npm run build` ok; `npm test` 1659/1659; `npm run test:frontend` 123
  arquivos, 1182 testes ok e 1 pulado (benchmark opt-in); `npm run lint` sem
  problemas; `npx tsc -b` ok depois de cada commit de código.
- `npm audit` e `npm audit --omit=dev`: `found 0 vulnerabilities`;
  `npm audit signatures`: 990 pacotes com assinatura verificada e 252 com
  atestação.
- Navegador: o Electron 41.10.7 instalado traz Chromium 146.0.7680.216
  (`process.versions.chrome`); o v4 exige 111+.
- Comparação visual: estilos computados de todos os elementos do app real
  (`felixo devtools`, perfil isolado, fixture do `canvas-smoke`, 1280×800) em
  19 estados — canvas nos temas escuro e alto contraste, 13 painéis, menu de
  cor, gaveta, modal de handoff e chat — com `:hover` e `:focus-visible`
  forçados via CDP em cada elemento interativo, v3 (`main`) × v4, primeiro com
  o dev server e por fim contra o `dist/` de cada lado (modo `--packaged`).
  Na rodada final, sem o painel de limites (cujo estado de carregamento mudou
  entre as duas execuções): 9.280 elementos em repouso e 10.336 leituras
  forçadas; o que sobra de diferença é só a lista de mudanças esperadas abaixo
  e ruído de conteúdo (rótulo "última sincronização" do System Design, tamanho
  interno do canvas do Excalidraw). Duas capturas do v3 entre si deram 0
  diferenças.

**Mudanças visuais esperadas (padrões do v4, aceitos).**
- Paleta padrão em OKLCH: zinc/sky/emerald etc. mudam um pouco (zinc-400
  161,161,170 → 159,159,169; foco sky-400 56,189,248 → 0,188,255; accent
  sky-500 14,165,233 → 0,166,244; emerald-400 52,211,153 → 0,212,146); em tela
  P3 os saturados ficam mais vivos.
- Placeholder sem cor própria: gray-400 → cor do texto a 50% (72 campos nos
  estados medidos, ex. título dos nós).
- `text-xs/sm/base` têm altura de linha proporcional no v4 (1,333/1,4286/1,5)
  e não mais em rem: onde o CSS próprio troca o `font-size` ou o filho usa
  `text-[10px]/[11px]`, a linha encolhe — ações da sidebar ~1 px mais baixas,
  cabeçalho da gaveta do terminal 57 → 48 px, cabeçalhos de painel 73 → 69 px.
- `space-y-*`/`divide-*`: a margem/borda vai para a base do item anterior em vez
  do topo do seguinte (mesmo espaço; muda se o último filho estiver oculto).
- 31 usos (17 classes) de `*-(--var)/N` passam a pintar; no v3 não geravam CSS
  (lista no relatório da PR); o mais visível é o botão do aviso de CLI
  (`CliSetupNotice.tsx:121`), que ganha fundo branco a 90%.
- Botão de espessura ativo do desenho (`DrawingNode`, `opacity-70` +
  `opacity-100`): 70% → 100% (ordem das utilities do v4).
- Hover sobre `.felixo-primary-action` desabilitado com `hover:bg-white/16` (17
  botões) mantém o cinza de desabilitado; o v3 pintava branco 16% por cima.
- Borda sem cor = `currentColor`: nos estados medidos nenhuma borda visível
  dependia do gray-200; na análise estática só `ModelManagerModal.tsx:610` e
  `:654` (cores `border-theme-error/30` e `/40` que nunca existiram) passam de
  gray-200 para a cor do texto.
- `hover:` só vale com `@media (hover: hover)`; no Electron desktop medido é
  `true`, então só muda em dispositivo cujo ponteiro principal é toque.
- `transition`/`transition-colors` passam a animar também `outline-color` (e
  `translate`/`scale`/`rotate`).

**Medição (notebook de referência, 2 núcleos/4 threads).** CSS principal
`index-*.css`: 136.322 → 171.770 bytes (+26,0%), gzip -9 24.044 → 27.172
(+13,0%; o Vite reporta 24,49 → 27,74 kB). Todos os CSS do `dist`: 293.731 →
329.179 bytes (+12,1%), gzip 48.794 → 51.922 (+6,4%). O crescimento vem dos
fallbacks de `color-mix()` (178 `@supports`), 58 `@property` e das 5 camadas;
o CSS próprio sem camada é 88,7 KB dos 171,8 KB. `vite build` (A/B em duas
rodadas, 3 execuções cada): v3 med. 10,65 s (load ~8) e 8,11 s (load ~4–5);
v4 med. 5,55 s (load ~3–4) e 5,15 s (load ~4,4). `npm run build` (typecheck
incremental + vite): v3 15,2 s e 12,7 s; v4 8,4 s e 8,2 s.

**Não verificado / riscos.**
- Windows e macOS só serão provados pela CI (aqui só Linux x64).
- A comparação visual cobre os 19 estados listados; modais do chat, Notion com
  dados e telas estreitas não foram capturados — para eles valem a análise
  estática (cascata, bordas sem cor, renomes) e a revisão do diff.
- O painel de limites ficou fora da rodada final por diferença de dados entre
  as execuções; na rodada com dev server ele não mostrou mudança fora da lista.
- Ferramenta de comparação ficou fora do repo (scripts de sessão); não há
  teste automático que pegue regressão de cascata no futuro.

**Ideias para quem quiser contribuir.** Transformar a captura de estilos
computados (v3 × v4 com estados forçados via CDP) num `npm run` de regressão
visual reutilizável; revisar as 31 classes `*-(--var)/N` e as duas
`border-theme-error/30|40` que nunca existiram para decidir se ficam como o v4
pinta; avaliar se os 17 botões primários devem ganhar `enabled:hover:` para
deixar a intenção explícita.

## 2026-09-26 — Quarentena do flake do PTY no Windows (decisão do Felipe)

Três correções na bancada (`7b6907a`, `c4e0fb0`, `c129913`) reduziram, mas não acabaram com a perda de saída
da fase nativa com 20 PTYs no Windows: ainda falhava em cerca de metade das runs, e o experimento controlado
não isolou a causa fora do contexto completo da bancada. O Felipe escolheu a **quarentena só desse item**. No
Windows, `native count=20` com timeout ou saída incompleta vira anotação `::warning::` no CI
(`quarantineWarnings`) e não reprova o `--check`. Continuam bloqueando o `count=20` nos outros SOs, as
contagens 1, 5 e 10 no Windows e toda a fase do renderer. Dois testes fixam as duas fronteiras. A investigação
continua na task "CI — sessão PTY para no meio no benchmark de scrollback do Windows", que também registra o
risco de o app real perder saída ao abrir muitos terminais logo depois de fechar outros no Windows.

## 2026-09-26 — Funções que existiam sem acesso pela interface

**Contexto.** O pedido foi: "acho que tem algumas funções inacessíveis pela interface". Uma auditoria no app
real confirmou quais funções tinham backend e ponte (`window.felixo`) prontos, mas nenhum caminho na tela, e
quais trechos eram código morto. Cada achado virou um item numa branch própria. A branch
`feat/ui-funcoes-sem-acesso` reúne os dez itens: são 35 commits trazidos por cherry-pick, sem conflito textual.
Os arquivos mexidos por mais de um item foram conferidos à mão: `index.css` (4 itens), `vite-env.d.ts` (4),
`preload.cjs` (2), `CanvasView.tsx` (2) e `CanvasToolPanels.tsx` (2). Abaixo, cada função, o caminho na UI, as
decisões e a validação.

**1. Fetch All: escolher as pastas-raiz.** Caminho: Canvas → barra lateral → **Ferramentas** → **Fetch All** →
cartão "Escopo da varredura" → "Raízes configuradas (N)". **Adicionar pasta** abre o seletor nativo (uma ou
várias pastas). O X de cada linha ("Deixar de varrer esta pasta") tira a raiz. Cada linha mostra o nome da pasta
e o caminho completo. Sem nenhuma raiz, continua valendo a alternativa "Ou varra todos os discos locais (N)",
que exige confirmação. Com pelo menos uma raiz, essa alternativa some e a varredura fica liberada.
- Canal novo `fetch-all:pick-roots` (ponte `fetchAll.pickRoots()`): ele só abre o seletor, preso à janela, e
  devolve `{ ok, paths }` (vazio ao cancelar) ou `{ ok: false, message }`. Quem grava continua sendo
  `saveSettings`, que já valida e normaliza.
- O `projects:pick-folder` não foi reusado porque ele também concede à pasta o acesso de projeto. Escolher onde
  varrer não é abrir um projeto.
- O painel grava `{ ...settings, scanRoots }`. Mandar só `scanRoots` faria `normalizeSettings` completar o resto
  com o padrão e apagaria as pastas ignoradas. Um teste do serviço fixa esse contrato.
- A lógica pura (cancelar ou repetir pasta não grava; nome curto da raiz) fica em `tools/fetch-all-roots.ts`. A
  lista é o componente `tools/FetchAllScanRoots.tsx`.
- Ficam de fora `excludeDirs` e `analyzeWorkers`. Essa decisão continua em aberto na auditoria, que recomenda não
  expor `excludeDirs` e calcular os workers pelo hardware.
- Validação: `node --test` do handler e do serviço (89 testes; os 3 novos do handler falhavam antes), vitest de
  `fetch-all-roots` e `FetchAllScanRoots` (13 testes) e o app real num Xvfb próprio sem DBus, com o diálogo GTK
  dirigido por xdotool (21 checagens).

**2. Chat legado: excluir conversa.** Caminho: tela Chat → "Recentes" → passar o mouse numa conversa (ou chegar
nela com Tab) → lixeira à direita → confirmar `Excluir a conversa "<título>"?`. A mesma lixeira aparece no painel
**Pesquisar**, que alcança as conversas além das cinco recentes. Se a conversa estava aberta, a tela volta para
um chat novo. A exclusão arquiva no SQLite (`archived_at`, canal `chats:delete`). Hoje não há restauração pela
interface.
- A confirmação (`window.confirm`, o padrão do `NotesModal`) e a regra ficam num lugar só, `deleteSession` no
  `ChatWorkspace`, que atende as duas entradas. O componente novo é `DeleteSessionButton`. O CSS da lixeira é o
  mesmo da lista de modelos, por seletor agrupado.
- Armadilha: `chats:save` zera `archived_at` (ON CONFLICT), então qualquer save depois da exclusão reativaria a
  conversa. Por isso `deletedChatSessionIdsRef` bloqueia os saves desde antes de esperar o backend, e excluir a
  conversa aberta usa `clearConversation()`, um reset sem salvar.
- Contrato: `deleteChatSessionFromBackend` passou de booleano para `ChatSessionDeletion` (`archived`,
  `local-only` ou `failed` com `message`). Ele não tinha chamador.
- O `SearchPanel` fechado ficava montado e transparente, com os botões ainda na ordem do Tab. Agora ele ganha
  `inert` e `aria-hidden`.
- Validação: vitest de `chat-history-storage`, `DeleteSessionButton` e `SearchPanel` (8 dos testes falhavam antes)
  e o app real com 9 conversas semeadas (21 checagens, inclusive exclusão só pelo teclado e recarga).

**3. Openia: gerar imagem pelo canvas.** Caminho: Canvas → barra lateral → **Criar** → **Gerar imagem**, logo
abaixo de "Abrir imagem". O popover pede a descrição (até 4.000 caracteres; Ctrl/Cmd+Enter gera) e o modelo, do
catálogo público de imagem do OpenRouter, que só é carregado quando o popover abre. A imagem entra no canvas como
bloco temporário, com "Remover temporário". A chave do OpenRouter fica no Openia: o Felixo não a lê. Gerar pode
custar créditos.
- O gatilho é `canvas/components/GenerateImageButton.tsx`. O estado fica numa store externa
  (`canvas/services/openia-image-store.ts` + `useOpeniaImageGeneration`), porque a geração dura até minutos e o
  botão desmonta quando a seção recolhe ou quando se vai ao Chat. O `CanvasView` não mudou: a imagem continua
  chegando pelo `canvas:image-generated`.
- Se a janela recarregar no meio, o id do pedido fica em `sessionStorage` e o desfecho vem de
  `openia.imageStatus` (a cada 2 s). Por isso o `status()` do serviço agora devolve também a `message` fixa em
  erro e cancelamento. O último modelo escolhido fica em `localStorage`. Na primeira vez não há escolha
  automática, porque gerar custa dinheiro.
- "Gerar" e "Cancelar" são dois botões fixos com `aria-disabled`. Na primeira versão, um botão só trocava de
  papel, e no app real um clique em Cancelar que chegou junto com o fim da geração disparou outra geração.
- `.felixo-field[aria-invalid='true']` ganhou o aro de erro, que vale também para o campo de URL de Página Web.
- Validação: `node --test` do serviço (o teste novo de `status()` falhava antes), vitest da store (13 testes) e o
  app real com um Openia falso na frente do PATH (`FELIXO_CLI_PATHS`) e o catálogo real. Nenhuma geração real
  foi feita, para não gastar créditos.

**4. Diagnóstico das CLIs de IA.** O IPC `clis:diagnose`, que só lê e nunca instala, ganhou dois pontos de acesso:
- tela Chat → ícone **Configurar modelos** → "Gerenciar modelos" → "CLIs oficiais" → ícone **Diagnosticar
  CLIs**, ao lado de "Atualizar detecção";
- o aviso "Não foi possível instalar as CLIs de IA" (só aparece quando a instalação automática falha), que ganhou
  **Ver diagnóstico** antes de "Tentar de novo".

Cada CLI com instalação automática (Codex, Claude, Gemini) mostra a causa, como "Não instalada", "Instalada, mas
invisível ao app" ou "Bloqueada por permissão", e a próxima ação. **Copiar texto para o suporte** copia o
`supportText`, que o processo principal já minimiza. Com diagnóstico na tela, **Instalar** só aparece quando
`recommendInstall` é verdadeiro. Reinstalar não resolve PATH, permissão, atalho quebrado, timeout nem rede. O
diagnóstico é uma fotografia: fechar o gerenciador o descarta, e no aviso uma falha nova remonta o painel pela
identidade do aviso (`noticeKey`).
- Arquivos novos em `app/src/features/setup`: `cli-diagnosis.ts`, `useCliDiagnosis.ts` e `CliDiagnosisView.tsx`.
- Bug corrigido: no Tailwind 3, a opacidade sobre cor arbitrária com `var()` (`bg-[var(--x)]/90`) não gera CSS,
  e isso deixava "Tentar de novo" quase invisível. A correção usa `color-mix`. A guarda
  `setup-tailwind-classes.test.ts` cobre só `src/features/setup`; o mesmo padrão aparece em cerca de 30 classes de
  outras telas (`grep -rnoE "[a-z:-]+-\[var\(--[a-z0-9-]+\)\]/[0-9]+" app/src`).
- Validação: vitest de setup e chat (85 testes, inclusive paridade com `cli-diagnostics.cjs`) e o app real com
  HOME/PATH mínimos e `FELIXO_MANAGED_CLI_ROOT` de fixture (22 checagens). O aviso de falha foi simulado com
  `felixo devtools main "mainWindow.webContents.send('clis:setup-status', …)"`.

**5. Felixo System Design: ler cada guia.** Caminho: Canvas → engrenagem **Configurações** no rodapé do rail →
seção "Felixo System Design" → "Ver índice (N documentos)" → clicar num guia. O mesmo vale no modal
"Configurações" do Chat. O guia abre renderizado em Markdown logo abaixo do item, numa moldura com rolagem
própria. Fica um guia aberto por vez. O conteúdo vem do cache da última sincronização, sem rede.
- O canal `system-design:get-document` existia na ponte, mas nenhuma tela o usava. Arquivos novos em
  `app/src/features/shared/system-design/`: `system-design-document.ts` (leitor que nunca rejeita) e
  `SystemDesignDocumentIndex.tsx` (acordeão que reaproveita `DeferredMarkdownContent`).
- A moldura tem `role=region`, rótulo "Conteúdo de <caminho>" e `tabIndex=0`, para rolar pelo teclado. O botão tem
  `aria-expanded` e `aria-controls`.
- Performance: a prévia é memoizada e a chave é `caminho@sourceSha`. Sem isso, cada sincronização re-analisava o
  Markdown aberto: 4,4–5,6 s de thread principal bloqueada contra 0,85–1,16 s depois, medido com o maior guia
  (~49 KB) no notebook de 2 núcleos, em build de dev.
- Validação: vitest (15 testes novos), `node --test` do canal `get-document` e o app real com 32 guias
  sincronizados.

**6. Zoom da janela no menu Exibir.** Caminho: barra de menu → **Exibir** → "Aumentar zoom", "Diminuir zoom" e
"Tamanho real". Os atalhos Ctrl/Cmd + `=` `+` `-` `0` não mudaram.
- Os itens chamam `applyZoomAction`, a mesma função do atalho. Os roles `zoomIn`/`zoomOut`/`resetZoom` não
  servem: no Electron 41 instalado eles mudam o nível em 0,5 sem teto nem piso e agem no `webContents` focado,
  que pode ser um `<webview>` do canvas.
- O acelerador é só exibido (`registerAccelerator: false`, opção só do Linux/Windows). A tecla continua tratada
  no `before-input-event`, cujo `preventDefault` também bloqueia o atalho do menu no macOS. Isso não foi testado
  num Mac.
- Correção: `Ctrl+_` (Ctrl+Shift+-) deixou de diminuir o zoom e volta a chegar ao terminal, onde é o "desfazer"
  do readline e de CLIs de agente.
- Validação: `node --test` de `app-menu` e `window-zoom-shortcuts` (20 testes; os novos falhavam antes) e o app
  real sob Xvfb, com clique real no menu, limites de ±3 e atalho sem disparo duplo (18 checagens).

**7. Remover conexão ou blocos pela barra de status.** Caminho: Canvas → clicar numa conexão ou no cabeçalho de
um bloco (Shift+clique ou caixa de seleção para vários). A barra de status do rodapé mostra "1 conexão
selecionada", "N blocos selecionados" ou "N itens selecionados" e o botão **Remover [Delete]**. Com o canvas
travado, o botão fica desativado ("Destrave o canvas para remover"). O botão chama o mesmo `deleteElements` do
React Flow que a tecla Delete usa, então os blocos levam junto as conexões ligadas a eles. Não há confirmação nem
desfazer, igual à tecla.
- Bug corrigido no caminho: `edgesWithHandles` forçava os handles `s-<lado>`/`t-<lado>` em todo bloco, mas só
  terminal e arquivo os desenham. Uma conexão com nota, desenho, Excalidraw, Página Web ou Tarefas Notion ficava
  gravada e contada na barra, mas sem desenho e sem como clicar para apagar. A regra foi para
  `services/edge-handle-routing.ts` (`SIDE_HANDLE_NODE_TYPES`), com teste que confere a lista contra os
  componentes. Quem der handles laterais a outro bloco precisa incluir o tipo ali.
- Decisão: corrigir no roteamento e não dar handles ao bloco Notion, porque o defeito atingia os cinco tipos sem
  handles laterais.
- Validação: vitest (20 testes novos) e o app real antes (conexões invisíveis reproduzidas) e depois (22
  checagens).

**8. Gaveta do terminal: largura padrão com o mouse.** Caminho: Canvas → abrir um terminal → borda esquerda da
gaveta. O grip agora é visível, igual ao da sidebar e dos painéis, com a dica "Arraste para redimensionar; dois
cliques para a largura padrão". Dois cliques devolvem a largura de abertura. Pelo teclado, continua valendo Home
com foco na alça, e as setas ajustam (seta para a direita estreita).
- A largura padrão (45% da janela, entre 440 e 720 px) vem de uma fonte só, `getDefaultDrawerWidth` em
  `terminal-drawer-pin.ts`, usada ao abrir e ao restaurar. Um teste varre viewports de 320 a 3840 px contra a
  fórmula antiga.
- A alça usa `felixo-resize-handle` com o modificador novo `felixo-resize-handle--left`.
- Validação: vitest (50 testes) e o app real com mouse de verdade (arrastar, dois cliques, Home).

**9. Skills do sistema: não enviar aos agentes.** Caminho: Canvas → **Ferramentas** → **Skills** → bloco "Skills do
sistema (N)" → ícone de olho cortado ao lado de "Ativar" ("Não enviar aos agentes"). O recolhível **Ocultas (N)**,
logo abaixo, lista as ocultas, e o X de cada uma as restaura. A escolha fica na configuração
`canvas.skills.hidden` e vale entre sessões. Antes, isso só era possível pelo DevTools.
- `canvas:list-available-skills` ganhou `hiddenBuiltinIds` e `hiddenSkills`, só com campos novos.
  `canvas:set-skills-settings` agora limpa os ids: aceita só strings, sem vazios e sem repetidos.
- Bug corrigido: o `CanvasView` lia o catálogo de skills uma vez só, ao montar. Ocultar uma skill, ligar skills
  de terceiros ou salvar uma skill própria só chegava aos agentes novos depois de reiniciar o app. Agora o
  painel avisa (`onCatalogChange`) e o canvas atualiza a lista.
- O ícone fica sempre visível, e não só no hover, porque o problema a resolver era justamente a função não ser
  encontrada.
- Validação: `node --test` (5 testes novos que falhavam antes), vitest do catálogo e o app real antes e depois
  da correção. Uma CLI `claude` falsa em `FELIXO_CLI_PATHS` deixa criar um "Agente" sem abrir o Claude de
  verdade, e o `initialText` persistido mostra o que o agente recebeu.

**10. Código morto removido.** Não cria caminho novo. O que saiu:
- `ChatSuggestion`, `chatSuggestions` e `quickPrompts` (a tela inicial do chat usa `ideaStarters`);
- o painel flutuante de Tarefas Notion: ele existe só como bloco do canvas, e o menu Ferramentas → Tarefas Notion
  cria ou foca esse bloco;
- `core/shell-adapter.cjs` e a variável `FELIXO_SHELL`, que só ele lia e que nunca teve efeito no PTY. O shell do
  terminal vem de `platform.getDefaultShell`, e as regras foram testadas em `electron/core/platform/index.test.cjs`;
- `getTerminationStrategy` e `getPlatformInfo` dos adaptadores de plataforma, que só o shell-adapter chamava;
- os canais `files:save-generated-image`, `chats:get` e `notion:database:schema`, com o preload e os tipos. A
  ponte não expõe mais `files.saveGeneratedImage`, `chats.get` nem `notion.getSchema`. `saveGeneratedImage`
  continua no processo principal, chamado pelo serviço de imagem.

Cada remoção de canal tem um teste que falhava antes. A tabela de variáveis de `RODAR-VIA-CODIGO-FONTE.md`
perdeu `FELIXO_SHELL`. Os documentos em `docs/_legado/` que ainda citam `shell-adapter.cjs`, `FELIXO_SHELL` e
`quickPrompts` ficaram como estavam, porque são registro histórico.

**Documentação atualizada junto.**
- `README.md`: exclusão de conversa, bloco Tarefas Notion, leitura dos guias, remover pela barra, gaveta,
  diagnóstico das CLIs e geração de imagem.
- `docs/guias/GUIA-USUARIO.md`: cada função no seu lugar, mais a seção "Zoom da janela". O guia dizia que
  **Ferramentas → Modelos** abria o "Gerenciar modelos", mas aquele painel do canvas só lista e remove modelos. O
  gerenciador abre pela tela Chat, e o texto foi corrigido.
- `docs/guias/GUIA-DESENVOLVEDOR.md`: exemplo de teste que citava o shell-adapter, dicas de verificação com
  `felixo devtools` e o padrão de "função que só tinha atalho".
- `docs/projeto/OPENIA-IMAGEM-CONTRATO.md`: `message` no `image-status` e onde a interface usa o contrato.

**Validação da integração (26/09/2026, Linux, notebook de 2 núcleos).**
- `npm run lint`: sem avisos.
- `npm run build`: `tsc -b` e `vite build` ok, só com o aviso de chunk > 500 kB que já existia.
- `npm test`: 1691/1691.
- `npm run test:frontend`: 137 arquivos e 1286 testes; 1 arquivo e 1 teste pulados, o benchmark opt-in que já
  existia.
- No app real, um script `felixo devtools` percorreu o caminho principal de cada item na branch integrada: 59
  checagens, 0 falhas. Ele cobriu:
  - a ponte (canais novos presentes, mortos ausentes);
  - o menu Exibir (Aumentar zoom → 0,5; Tamanho real → 0);
  - a conexão nota→arquivo desenhada e removida pela barra;
  - o popover "Gerar imagem" (foco, Esc);
  - o aviso de falha com "Ver diagnóstico";
  - ocultar e restaurar uma skill;
  - gravar uma raiz do Fetch All e tirá-la pelo X, com a pasta ignorada preservada;
  - o bloco Tarefas Notion sem painel;
  - os dois cliques na alça da gaveta (584 → 512 → 584 px);
  - um guia do System Design renderizado;
  - a lixeira do chat arquivando no backend;
  - o diagnóstico no gerenciador de modelos.

Os scripts de verificação ficaram fora do repositório.

**Achado da integração, anterior a esta branch.** Com a gaveta de um terminal aberta, a barra de status do canvas
fica muito estreita: 160 px medidos numa janela de 1320 px, porque ela reserva 18rem à direita para o inspector
"Elementos". O conteúdo quebra em duas linhas e vaza da altura da barra. As regras de `.felixo-canvas-statusbar`
não mudaram nesta branch, e o conteúdo que a barra já tinha ("Meu canvas · N blocos · N conexões · Canvas
pronto") passa de 160 px. Ou seja, o defeito é anterior. O item 7 piora o caso, porque abrir a gaveta seleciona o
terminal e acrescenta "1 bloco selecionado" e o botão Remover. O botão continua visível e clicável. Medido no app
com a barra forçada a várias larguras e um bloco selecionado: a 900 px tudo cabe; a 640 px e a 520 px os itens já
quebram de linha, mas o botão fica inteiro; a 420 px o botão sai da caixa da barra. Não foi corrigido aqui porque
é uma decisão de layout da barra: `nowrap`, container query que esconda primeiro o que não muda, ou a barra passar
por baixo do inspector.

**Riscos que ficam.**
- A exclusão de conversa, a remoção pela barra e a remoção de raiz do Fetch All não têm "desfazer". As duas
  primeiras seguem o padrão já existente (confirm / tecla Delete); a terceira não é destrutiva.
- Remover métodos de `window.felixo` quebraria um script externo que os chamasse. No repositório não há nenhum
  chamador.
- Windows e macOS não foram testados à mão em nenhum item. A estrutura do menu por plataforma está coberta por
  teste unitário.
- `CliDiagnosis` está duplicado entre `cli-diagnosis.ts` e `vite-env.d.ts`, no mesmo padrão de `CliSetupStatus`.
  Um teste de paridade compara com a saída real do backend.

**Ideias para quem quiser contribuir.**
- Restaurar conversas arquivadas pela interface.
- Mostrar o preço por modelo no seletor de imagem: hoje o serviço descarta o `pricing` do catálogo.
- Ampliar a guarda contra `-[var(--x)]/NN` para todo o `src` e corrigir as ~30 classes que hoje não geram CSS.
- Unificar `TerminalSideHandles`/`FourSideHandles` num componente comum para nota, desenho, Página Web e Tarefas
  Notion, para o traço sair pelo lado mais próximo nesses blocos também.
- Traduzir o `aria-label` padrão das conexões do React Flow ("Edge from X to Y").
- Fazer o `canvas-smoke` conferir as conexões no DOM (`.react-flow__edge`), e não só a persistência.
- Levar para `app/scripts/` os métodos de bancada usados aqui:
  - o seletor nativo dirigido num Xvfb sem DBus;
  - CLIs falsas via `FELIXO_CLI_PATHS`;
  - o aviso de falha simulado por `devtools main`.

## 2026-09-26 — Funções sem acesso sobre o Tailwind 4: rebase e classes na sintaxe nova

**Task.** A branch `feat/ui-funcoes-sem-acesso` (PR #94, 38 commits) foi escrita sobre o Tailwind 3, e a `main`
recebeu o Tailwind 4.3.3 (PR #93, cc34310) logo depois. O trabalho foi rebasear sobre a `main`, passar para a
sintaxe do v4 as classes que o PR acrescentou e provar que toda classe usada nos arquivos do PR gera CSS. Registro
gravado em 26/09/2026, 06:06.

**Rebase (38 commits, conflito em 8 arquivos).** Em cada um ficaram a função nova do PR e a sintaxe do v4:
- `FetchAllPanel.tsx`: a lista "Raízes configuradas" da `main` deu lugar ao `FetchAllScanRoots` do PR.
- `SearchPanel.tsx`: a linha virou `div.felixo-session-row` com a lixeira; o `hover:bg-white/[0.05]` do PR entrou
  como `hover:bg-white/5`.
- `ModelManagerModal.tsx`: o botão "Diagnosticar CLIs" ao lado de "Atualizar detecção", com `hover:bg-white/8`.
- `CliSetupNotice.tsx`: "Tentar de novo / Depois" passou para `CliSetupFailureActions`.
- `TerminalDrawer.tsx` (dois commits): primeiro o `title` e o `data-*` do duplo clique sobre a classe da `main`;
  depois a alça passa a `felixo-resize-handle felixo-resize-handle--left`, sem utility.
- `SkillsPanel.tsx`: a lista com ocultar/restaurar.
- `MarkdownContent.tsx`: o `<a>` virou `MarkdownLink`.
- `IA.md`: as duas entradas, a do Tailwind 4 antes desta série.

Quando o lado do PR reescrevia a linha inteira, entrou o texto do PR e a troca de sintaxe foi para o commit de
conversão, para não conflitar de novo nos commits seguintes.

**Conversão (25 linhas em 7 arquivos).** Um script de sessão leu só as linhas adicionadas
(`git diff origin/main...HEAD`), extraiu os literais de string e passou cada token pelo design system do próprio
v4 (`candidatesToCss`, `canonicalizeCandidates`) e pela tabela de renomes do guia. Cada troca foi revisada à mão,
só dentro de lista de classe. As trocas:
- Renomes que mantêm o visual do v3: `rounded-sm` → `rounded-xs` (1), `outline-none` → `outline-hidden` (2) e
  `focus-visible:outline` → `focus-visible:outline-solid` (1).
- Grafia canônica, com o mesmo CSS: `rounded` → `rounded-sm` (11), `text-[var(--x)]` → `text-(--x)`,
  `text-[var(--color-error)]` → `text-theme-error`, `/[0.08]` → `/8`, `/[0.06]` → `/6` e `break-words` →
  `wrap-break-word`.
- "Tentar de novo" voltou a `bg-(--f-core-white)/90`, a forma da `main`. O `color-mix` do PR só existia porque o
  v3 descartava essa classe.

Não foram trocados dois falsos positivos: `!hasUrlScheme(...)` (negação em JS) e o comentário do teste que cita a
forma do v3. O PR não tem `shadow`, `blur`, `ring` sem largura, `flex-shrink`/`flex-grow` nem `!` prefixado.

**Cascata.** Todo o CSS que o PR põe no `index.css` são classes próprias sem camada, como manda a regra da `main`.
O PR não usa `@apply` nem seletor com utility. A análise estática cruzou cada utility das linhas novas com as regras
próprias do mesmo elemento. Nenhuma utility com variante (`hover:`, `focus-visible:`, `disabled:`) disputa
propriedade com regra própria, então nenhuma precisou de `!`.

**Prova contra o CSS do build.** `npx vite build` e depois todos os tokens de classe dos 44 `.ts/.tsx` do PR (sem
testes), tirados de `className`/`*ClassName`, `cn()` e das constantes que essas expressões citam. Cada token foi
conferido como seletor em `dist/assets/index-*.css`, com o escape do `CSS.escape`. O resultado final: 499
tokens, 486 com seletor. Os 13 restantes não são classe ou são ganchos:
- Valores de JS que a heurística das constantes pegou: `\n`, `info`, `neutral`, `pan`, `select`, `status` e
  `syncing`.
- `contains-task-list` e `task-list-item`: classes do remark-gfm que o código lê com `className?.includes`.
- `hljs` e `language-*`: a convenção do highlight.js.
- `nopan` e `nowheel`: ganchos do React Flow.

A prova achou três defeitos, corrigidos em commits próprios:
- Três classes `felixo-*` sem regra nem leitor foram removidas: `felixo-statusbar-selection`, criada neste PR, e
  `felixo-shell` e `felixo-chat-sidebar`, da `main`, que nunca tiveram CSS (conferido com `git log -S`).
- `border-theme-error/30`, `border-theme-error/40` e `bg-theme-error/[0.06]` do gerenciador de modelos nunca
  geraram CSS. É a pendência que a entrada do Tailwind 4 registrou. Ganharam `@utility` na família
  `theme-error`, e `/[0.06]` passou a `/6`.

**Guarda do aviso das CLIs.** `setup-tailwind-classes.test.ts` procurava `bg-[var(--x)]/N`, que o v4 gera. Agora o
teste compila o `index.css` com o `compile` do `tailwindcss` e exige que toda classe das listas dos `.tsx` da pasta
saia no CSS. Conferido que falha: com `shadow-inset` enxertado, acusa "CliDiagnosisView.tsx: shadow-inset". O
limite é que um literal só conta como lista quando ao menos metade dos tokens gera CSS. O v4.3.3 ainda gera
`flex-shrink-*`, `decoration-slice` e `overflow-ellipsis`, então a guarda não os pega; por isso os renomes do guia
passam pela revisão do diff.

**Validação.** `npm ci` (Tailwind 4.3.3 e `@tailwindcss/vite` 4.3.3 no `node_modules`), `npm run lint` sem
problemas, `npm run build` ok, `npm test` 1691/1691 e `npm run test:frontend` com 140 arquivos, 1306 testes ok e 1
pulado. No app real (`felixo devtools`, perfil isolado, dev server deste worktree, sob o `flock`), o roteiro de
integração da série foi repetido: 59 checagens, 0 falhas, mais uma captura do zoom pelo menu Exibir. As capturas `tw4-*.png` foram comparadas com as `integracao-*.png`
(Tailwind 3), do mesmo roteiro e na mesma janela 1320×710: a lista de Recentes do chat saiu idêntica pixel a pixel. Nas outras
oito, de 0,58% a 1,84% dos pixels diferem, e a diferença é só deslocamento vertical de 1 a 4 px de texto (a altura de
linha proporcional do v4 na barra lateral e nas listas do gerenciador de modelos). Não há diferença de cor, borda,
raio ou fundo nos elementos do PR: "Remover" da barra de estado, popover "Gerar imagem", "Tentar de novo" (branco a
90%), ícones de ocultar skill, raiz do Fetch All, grip da alça da gaveta, guia do System Design e botão
"Diagnosticar CLIs".

**Mudanças visuais esperadas.** São as da entrada do Tailwind 4: altura de linha proporcional (itens da barra
lateral ~1 px mais altos no topo), paleta em OKLCH. A única mudança de propósito é no gerenciador de modelos. O
aviso "Trocar a conta de…" passa a ter borda vermelha a 30% e fundo vermelho a 6%, e "Desconectar e abrir login"
borda vermelha a 40%. No v4 eles pintavam `currentColor`.

**Não verificado / riscos.**
- O aviso de troca de conta do gerenciador não foi capturado, porque exige o fluxo de login de uma CLI oficial. A
  correção foi conferida no CSS gerado: os seletores existem, com `color-mix` e fallback.
- `hover:bg-theme-error/20` em `AgentConfigFields.tsx`, arquivo que este PR não toca, também não gera CSS; ficou
  fora do escopo.
- Os scripts de análise (linhas adicionadas, cascata e prova contra o `dist`) são de sessão e ficaram fora do
  repositório.
- Windows e macOS só serão cobertos pela CI.

**Ideias para quem quiser contribuir.**
- Levar a prova contra o `dist` para um `npm run` que rode sobre todo o `src`.
- Pôr `--color-theme-error` no `@theme` para que `bg-theme-error/N` funcione em qualquer degrau, sem uma `@utility`
  por valor.

## 2026-09-26 — Hardware: escolha de placa de vídeo e ajuste pelo número de CPUs

**Task.** "Hardware — oferecer escolha de GPU e ajustar o app pelo número de CPUs". Decisões do Felipe:
"Placa de vídeo: Automático / Integrada / Dedicada" como opção avançada, Dedicada experimental e com volta
automática se a GPU falhar, valendo no próximo início; em máquina com poucas CPUs, sugerir o Modo
Performance (nunca ligar sozinho) e derivar limites internos das CPUs. Branch `feat/hardware-gpu-cpu`,
feita sobre `b4ca0fc9` e rebaseada sobre `d0496cd6` (#94) antes da entrega; tudo abaixo foi repetido depois
do rebase. Registro gravado às 08:06.

**Fonte conferida (Electron 41.10.7 = Chromium 146.0.7680.216).**
- `use-angle`/`vulkan` em `ui/gl/gl_switches.cc` (e na lista que o `GpuProcessHost` copia para o processo
  de GPU); features `Vulkan` (`gpu/config/gpu_finch_features.cc`), `DefaultANGLEVulkan` e `VulkanFromANGLE`
  (`ui/gl/gl_switches.cc`).
- `force_high_performance_gpu`/`force_low_power_gpu`: documentados em `docs/api/command-line-switches.md` do
  Electron 41; são workarounds de driver que o `gpu_process_host.cc` copia para o processo de GPU e que
  `SetupGLDisplayManagerEGL` (`gpu/ipc/service/gpu_init.cc`) usa só no Windows e no macOS.
- O Electron relê o `--enable-features` depois do script principal (`PostEarlyInitialization`), então o
  `appendSwitch` antes do `whenReady` vale; um segundo `appendSwitch` substitui o primeiro
  (`base::CommandLine::AppendSwitchNative`), por isso as features são mescladas.
- README do driver NVIDIA 580 ("PRIME Render Offload"): no Vulkan, `__NV_PRIME_RENDER_OFFLOAD` só carrega o
  `VK_LAYER_NV_optimus`, que reordena a lista de GPUs.

**Medido nesta máquina (i5-6200U, 4 CPUs lógicas, HD 520 + 920MX, X11, PRIME on-demand, driver 580.178.04).**
1. O processo de GPU do Electron 41 no Linux nasce de um zygote criado antes do `main.cjs`: variáveis
   gravadas em `process.env` no main não chegam a ele (`/proc/<pid>/environ` vazio para `__NV_*`; um processo
   utilitário, lançado direto, recebe). A task pedia confirmar essa herança: ela não existe. Como o Chromium
   já escolhe a NVIDIA sozinho com Vulkan, a Dedicada ficou só com os switches, sem mexer no ambiente (que
   também vazaria para os terminais).
2. Com as variáveis do `prime-run` herdadas do shell, o GL padrão falha (`ANGLE Display::initialize error
   12289: Invalid visual ID requested`) e a janela cai para `disabled_software`. Por isso a Integrada, nesse
   caso, limpa o ambiente e relança o app uma vez (`app.relaunch()` antes do `whenReady` funciona; o
   relançado leva `FELIXO_GPU_ENV_SANITIZED=1` e não relança de novo).
3. `app.getGPUInfo('basic'|'complete')` no Linux devolve a coleta de antes do processo de GPU: renderer vazio,
   `gl=none` e a NVIDIA marcada como ativa mesmo desenhando na Intel. Serve para contar placas (2 aqui), não
   para dizer qual está em uso; a tela lê o renderer pelo WebGL (a mesma string do CDP, sem a versão do
   driver) e o CDP é a referência nas verificações.
4. `app.getGPUFeatureStatus()` no `whenReady` é sempre `disabled_software`; o `gpu-info-update` chega 1,2 a
   1,4 s depois, e o `did-finish-load` pode vir antes dele (8 ms antes, numa rodada com a dedicada). Isso
   revelou um bug antigo: a recomendação do modo compatível era avaliada no `whenReady` e gravava uma
   recomendação falsa em aberturas saudáveis (vista na tela de Configurações). Corrigido junto, com o mesmo
   observador de `gpu-info-update` que a confirmação da placa usa.

**O que entrou (7 commits de código e ferramenta, mais este registro).** `electron/core/gpu-preference.cjs` (preferência em `gpu-preference.json`,
plano por SO, relançamento limpo), `gpu-start-guard.cjs` (marcador de início pendente, veredito, volta para
Automático), `gpu-info-watcher.cjs`, `electron/services/gpu-preference-session.cjs` (confirmação depois de
janela carregada + `gpu-info-update`, reversão se a GPU desligar ou o processo de GPU cair, IPC);
`GpuPreferenceField` recolhido em "Opções avançadas: placa de vídeo" (só com 2+ placas), aviso de volta
automática nas Configurações e no app; `hardware-profile.cjs` (CPUs por `os.availableParallelism()`, limiar
4) e a sugestão do Modo Performance (lembra a resposta; desligada na automação, salvo
`FELIXO_DEVTOOLS_HARDWARE_NOTICES=1`); `analyzeWorkers` do Fetch All derivado das CPUs quando não há valor
salvo (2 por CPU, de 2 a 8: nada muda com 4 ou mais); `npm run check:hardware`.

**Verificação no app real (`npm run check:hardware -- --expect-integrada=0x8086 --expect-dedicada=0x10de`,
sob o flock), 7/7 cenários ok:**

| Cenário | GPU em uso pelo CDP | Estado |
| --- | --- | --- |
| Automático | Intel HD 520, ANGLE/OpenGL | nada aplicado |
| Integrada | Intel HD 520, ANGLE/OpenGL | escolhida pela tela, vale na reabertura |
| Dedicada | GeForce 920MX, ANGLE/Vulkan (`vulkan: enabled_on`) | marcador confirmado, sessão saudável |
| Início pendente deixado no perfil | Intel (Automático) | voltou para Automático antes de aplicar, aviso e "Entendi" |
| Dedicada com `--disable-gpu-compositing` | 920MX, `gpu_compositing: disabled_software` | revertida nesta sessão, aviso na tela |
| Integrada com o ambiente do `prime-run` | Intel, compositing ligado | relançou; processos só com `FELIXO_GPU_ENV_SANITIZED=1` |
| Sugestão de CPU | — | aparece com "4 processadores lógicos", não liga sozinha, "Agora não" lembrado após recarregar, "Ligar" liga |

"Em uso agora" bateu com o CDP em todas as aberturas, e nenhuma abertura saudável recomendou o modo
compatível. Uma captura da tela real (`scrot`, janela visível por ~20 s) mostrou a Integrada e a Dedicada
desenhando normalmente. Depois do rebase: `npm run lint` ok; `npm run build` ok; `npm test` 1747/1747;
`npm run test:frontend` 1331 ok e 1 pulado; `npm run test:canvas-smoke` ok (matriz visual inclusa).

**FPS.** Não foi medido de novo nesta rodada. A referência é a medição da bancada (tabela em
`POLITICA-PERFORMANCE.md`: dedicada +9% a +15% a 48 blocos). A bancada lançou com as variáveis de PRIME na
linha de comando e o app não as usa, mas pelo item 1 e pelo README da NVIDIA elas só reordenam a lista do
Vulkan, e o renderer e o dispositivo no CDP são os mesmos.

**Não verificado / riscos.**
- Windows e macOS: switches conferidos na fonte, sem teste em máquina com duas placas. A rede de segurança
  cobre falha de início, mas não prova que a placa pedida foi a usada; a tela mostra a GPU em uso.
- Linux com outra combinação (AMD dedicada, Wayland): a Dedicada depende de o Chromium escolher a discreta
  no Vulkan, medido só com NVIDIA no X11.
- Prazo de 30 s para o `gpu-info-update`: sem resposta, o marcador fica e o próximo início volta para
  Automático; fechar o app nos primeiros ~2 s de uma abertura com a escolha tem o mesmo efeito.
- Na Integrada com o ambiente do `prime-run`, os terminais abertos pelo app deixam de herdar essas
  variáveis (o ambiente limpo é o do processo relançado). Com o dev server do Vite, o relançamento é pulado
  e só anotado.
- Perfis antigos já têm `analyzeWorkers: 8` gravado pelas versões anteriores; esse valor é respeitado.

**Ideias para quem quiser contribuir.** Levar a bancada `ui-render-performance.cjs` a medir pelo mecanismo do
app (semeando `gpu-preference.json`) em vez das variáveis na linha de comando; testar a escolha numa máquina
Windows/macOS com duas placas e registrar o resultado; oferecer a escolha do backend (GL × Vulkan) da
integrada, se alguém medir ganho.

## 2026-09-26 — Placa de vídeo: correções da revisão (relançamento no AppImage e contagem de placas no Windows)

**Contexto.** A revisão da branch `feat/hardware-gpu-cpu` apontou dois defeitos. Este registro vem depois da
entrada "Hardware: escolha de placa de vídeo e ajuste pelo número de CPUs" e não a reescreve. A base continua
`d0496cd6` (#94). Registro gravado às 11:20.

**1. Integrada + variáveis do `prime-run` no AppImage: o app fechava e não voltava.**
- Reproduzido com uma sonda no Electron 41.10.7, empacotada pelo electron-builder 26.15.3 no alvo AppImage do
  `package.json`. `app.relaunch()` e `app.relaunch({ execPath: APPIMAGE })` devolvem `true`, mas nenhum
  processo novo nasce em 20 s. O binário mora na montagem `/tmp/.mount_*`, que o runtime desmonta quando o
  app sai; o relauncher do Electron (`shell/browser/relauncher*.cc`) só executa depois disso. Desempacotado,
  o relançado nasce em menos de 1 s. O `check:hardware` rodava `electron .` e por isso não pegava o caso.
- O relançamento não gravava marcador. Por isso cada abertura relançava e fechava, sem aviso e sem volta
  para Automático (reproduzido com o `prepareGpuStart` da branch, três aberturas seguidas).
- Correção:
  - `electron/core/app-relaunch.cjs`: no AppImage, reabre o próprio `.AppImage`, destacado. Só entra nesse
    caminho quando o executável está dentro do `APPDIR`, para que um `APPIMAGE` herdado de outro programa
    não conte; `APPIMAGE` e `APPDIR` são do runtime tipo 2 (docs.appimage.org).
  - Fora do AppImage, continua o `app.relaunch()`, e o `false` que `App::Relaunch` devolve é tratado,
    embora a tipagem diga `void`.
  - `gpu-start-guard.cjs` grava `pendingRelaunch` antes de sair; o processo com `FELIXO_GPU_ENV_SANITIZED=1`
    o apaga.
  - Se uma abertura sem a marca ainda encontra o pedido, volta para Automático com o motivo novo
    `relaunch-failed` e não relança de novo. Relançamento recusado na hora segue no Automático, com aviso.
  - A marca deixou de vazar para os terminais e para os apps abertos pelo Felixo.
- No AppImage, o processo relançado herda o pipe de manutenção do runtime do primeiro AppImage. Por isso
  a primeira montagem (somente leitura, do mesmo arquivo) fica de pé enquanto o app relançado roda. Medido:
  em até 10 s depois de o app fechar, os dois daemons saem e não sobra montagem.

**2. Windows com uma placa via a opção como se tivesse duas.**
- Conferido na fonte (Chromium 146.0.7680.216 e Electron 41.10.7):
  - `CollectDriverInfoD3D` guarda todo adaptador do `EnumAdapters`, inclusive o "Microsoft Basic Render
    Driver" (WARP, 0x1414:0x8c), que o Windows 8+ sempre lista (guia DXGI da Microsoft).
  - `EnumerateFields` põe NPUs no mesmo `gpuDevice`.
  - `SetupGLDisplayManagerEGL` ignora `force_low_power_gpu` e `force_high_performance_gpu` com
    `GpuCount() <= 1`, e só acha a placa pedida pelo `gpuPreference` (2 = baixo consumo, 3 = alto
    desempenho).
  - O Chromium só marca `gpuPreference` com duas placas reais (`gpu_info_collector_win.cc` e
    `gpu_info_collector_mac.mm`).
- Correção em `electron/core/gpu-devices.cjs`:
  - tira os renderizadores por software pelo critério de `IsSoftwareRenderer`;
  - no Windows e no macOS, a opção só aparece com uma placa marcada 2 e outra marcada 3;
  - no Linux, onde as duas vêm com `gpuPreference` 0, vale a contagem de placas reais.
- Não testado em Windows nem em macOS reais: os formatos vieram da fonte e estão nos testes.

**Validação.** Os testes novos falharam contra o código anterior: 5 do guard, 2 da sessão e o módulo novo.
`npm run lint` ok; `npm run build` ok; `npm test` 1767/1767; `npm run test:frontend` 1331 ok e 1 pulado.
No app real, sob o flock, rodaram `npm run check:hardware -- --expect-integrada=0x8086
--expect-dedicada=0x10de` (8/8) e, com `--app-image`, o AppImage x64 desta branch (5/5).

| Cenário | `electron .` (dist) | AppImage |
| --- | --- | --- |
| Automático | Intel HD 520, GL | Intel HD 520, GL |
| Integrada | Intel HD 520, GL | Intel HD 520, GL |
| Dedicada | GeForce 920MX, Vulkan (`enabled_on`) | GeForce 920MX, Vulkan |
| Integrada + `prime-run` | Intel, compositing ligado, pedido apagado | idem, pelo `.AppImage` reaberto |
| Relançamento perdido | Automático, `relaunch-failed`, aviso, sem relançar | idem |

Pendente, GPU desligada e a sugestão de CPU também passaram. Nesta máquina a sessão lista 2 placas
(0x10de e 0x8086) e mostra a escolha.

**Achado, sem correção nesta rodada.** Aberto no Automático com as variáveis do `prime-run`, o GL cai para
software e o Chromium nega acesso à GPU. O `app.getGPUInfo()` então rejeita antes de coletar
(`GpuAccessAllowed`, `electron_api_app.cc`), a sessão fica sem placas e a opção some. Uma sonda fora do app,
com as mesmas variáveis, lista as duas placas. Isso já acontecia antes desta correção: quem abre o Felixo
sempre assim (ex.: `/etc/environment`) não chega a ver a Integrada, que seria justamente a saída.

**Ideias para quem quiser contribuir.**
- Contar as placas no Linux sem depender do acesso à GPU (ex.: pelo `/sys/bus/pci`) para esse caso.
- Rodar `check:hardware` numa máquina Windows e numa macOS com duas placas e registrar o resultado.

## 2026-09-26 — Placa de vídeo: não bloqueantes da segunda revisão e limitações conhecidas

**Contexto.** A segunda revisão da branch `feat/hardware-gpu-cpu` (três lentes: contagem de placas, relançamento
e spawn, comportamento padrão) não achou bloqueante e deixou não bloqueantes. Esta rodada corrige os escolhidos e
registra os que ficam para depois. Vem depois das entradas "Hardware: escolha de placa de vídeo e ajuste pelo
número de CPUs" e "Placa de vídeo: correções da revisão" e não as reescreve. Base: `9ec3922c`. Registro gravado
às 12:57.

**Corrigido (cada item com teste que falhava antes, em commits pequenos).**
1. **Abertura durante o relançamento.** Abrir o app de novo enquanto o relançado da Integrada + `prime-run` ainda
   nascia (cerca de 2 s de montagem do AppImage, sem janela) revertia a escolha para Automático com
   `relaunch-failed`, e o relançado nascia no Automático: duas instâncias e a escolha trocada.
   - `relaunchApp` devolve o pid do `.AppImage` reaberto (ele vira o processo do app), e o início o anota em
     `pendingRelaunch` antes do `app.exit`.
   - `prepareGpuStart` trata o pedido como em andamento com menos de 30 s (`RELAUNCH_GRACE_MS`, que cobre o
     `app.relaunch()` sem pid) ou com o pid vivo. Nesse caso não grava nada, não aplica GPU e devolve
     `notApplied: 'relaunch-in-progress'`, que a tela explica.
   - O pid vivo só conta até 5 min depois do pedido (`RELAUNCH_PID_MAX_AGE_MS`): um pid reaproveitado não prende
     a escolha. Passado o prazo e com o pid morto, vale o comportamento anterior.
2. **Escolha salva escondida.** Com Integrada ou Dedicada salva, o campo aparece mesmo sem duas placas nesta
   abertura (modo compatível, em que o `getGPUInfo` é recusado; eGPU desconectada; MUX só na dedicada). Só
   Automático fica habilitado, com o motivo. O `check:hardware` achou no app real um defeito dessa mudança: salvar
   Automático escondia o campo no mesmo clique, junto com a confirmação. Agora o campo fica depois de salvar
   (`shouldShowGpuChoice(status, { justSaved })`).
3. **Aviso do modo compatível.** `evaluateGpuAfterReady` decidia só pelo primeiro `gpu-info-update`. Na sequência
   medida (`enabled` e, 41 ms depois, `disabled_software`), quem estava no Automático perdia o aviso. Agora lê o
   status a cada evento durante 2 s (`GPU_STATUS_SETTLE_MS`) e no fim da janela. Incompatibilidade grava na hora;
   uma leitura saudável depois não apaga; a recomendação antiga só é limpa com a janela inteira saudável. A espera
   pelo primeiro evento, que tirou o falso positivo do `whenReady`, continua.
4. **macOS com placa NVIDIA.** A lista de bugs do Chromium 146 (`gpu_driver_bug_list.json`, entrada 326: macosx,
   0x10de, qualquer categoria de multi-GPU) liga `force_low_power_gpu`, que o `SetupGLDisplayManagerEGL` testa
   antes do `force_high_performance_gpu` (conferido na fonte da tag). `describeGpuDevices` devolve
   `unavailablePreferences: { dedicada: 'macos-nvidia-forced-low-power' }` e a tela desliga só a Dedicada, com o
   motivo.
5. **AppImage.**
   - `resolveRunningAppImage` exige `APPDIR` absoluto, existente e diferente da raiz, e `APPIMAGE` absoluto e
     arquivo regular.
   - Compara `realpath(execPath)` com `realpath(APPDIR)`, o que resolve o TMPDIR atrás de link simbólico (como
     no Silverblue).
   - O relançado sai sem as entradas da montagem antiga no `PATH`, `LD_LIBRARY_PATH`, `XDG_DATA_DIRS` e
     `GSETTINGS_SCHEMA_DIR`.
   - Com o app extraído (`appimage_extracted_*`), o relançado recebe `APPIMAGE_EXTRACT_AND_RUN=1`: o runtime
     consome a flag `--appimage-extract-and-run`, e sem a variável o relançado tentava montar por FUSE.
6. **Relançamento recusado.** `applyGpuLaunchPlan` guarda o valor anterior das variáveis que mexe, e
   `restoreGpuLaunchEnv` as devolve quando o spawn é recusado. Os terminais da sessão, que segue no Automático,
   voltam a herdar as variáveis do `prime-run`.
7. **Ligação no `main.cjs`.** O início da placa saiu para `electron/core/gpu-launch.cjs` (`startGpuPreference`).
   Os testes cobrem a ordem (plano aplicado antes do relançamento) e a marca `FELIXO_GPU_ENV_SANITIZED` apagada
   nos outros ramos. Conferido por mutação: trocar a ordem ou deixar a marca faz os testes falharem.
8. **Guarda morta.** Saiu o `relaunchingForGpu` do `whenReady`. Medido de novo num Electron 41.10.7: depois de um
   `app.exit(0)` antes do ready, nada roda (nem no mesmo tick, `nextTick`, timer ou `whenReady`).
9. **Pequenos.**
   - Os testes do Apple Silicon usam `deviceId` 0 (o AGXAccelerator só traz vendor-id).
   - O comentário de `gpu-devices.cjs` agora diz que cada switch precisa só da própria marca e de
     `GpuCount() > 1`.
   - O tipo diz que `devices`, no Windows, pode incluir NPUs e não serve para contar placas.

**Limitações conhecidas (ficam como task; nada disso foi corrigido nesta rodada).**
- **Custo do `getGPUInfo('basic')` a cada abertura no Windows.** As Configurações e o `HardwareNotices` pedem
  `graphics:get-config`, que espera a lista de placas também para quem nunca mexeu na opção. No Windows isso
  inclui `CollectNPUInformation` (carrega o `DXCore.dll`) e a enumeração do DXGI na thread principal do
  navegador. No Linux a resposta chegou em até 16 ms depois do `did-finish-load`; no Windows ainda não foi
  medido, e é preciso medir numa máquina Windows antes de decidir (ex.: só ler as placas quando a opção abre).
- **Descritores herdados pelo relançado.** O Electron não marca como CLOEXEC os fds do processo principal, e o
  filho do spawn herda sockets, eventfds, `icudtl.dat`, o snapshot do V8 e o pipe de manutenção do runtime do
  primeiro AppImage. Por isso o daemon FUSE e a montagem antiga ficam de pé durante a sessão relançada (visto
  de novo nesta rodada: um processo com o `APPDIR` antigo continua vivo). Depois da limpeza do item 5, nenhum
  caminho do relançado aponta para ela. Fechar esses fds antes do spawn exige um passo nativo ou um lançador
  intermediário.
- **`relaunch-failed` atribuído errado com perfil sem escrita no nascimento do relançado.** Se o perfil não
  aceita escrita quando o relançado nasce, ele abre no Automático (`profile-unwritable`) sem apagar o pedido.
  Quando a escrita volta, a abertura seguinte acusa `relaunch-failed`, embora o relançamento tenha acontecido. O
  pedido não fica preso; só a mensagem erra a causa.
- **Linux com duas dedicadas, BMC ou passthrough.**
  - Duas dedicadas (AMD+NVIDIA, duas NVIDIA) ou BMC ASPEED + NVIDIA: a opção aparece, mas a Integrada não muda
    nada, e a Dedicada cai na primeira `DISCRETE` do Vulkan (ANGLE `vulkan_icd.cpp`), que pode ser a que já
    desenha.
  - Intel+NVIDIA com `prime-select nvidia`: a Integrada não faz nada.
  - Dedicada sem driver Vulkan: o ANGLE usa a integrada, e a tela diz "Nesta abertura: Dedicada". O "Em uso
    agora" mostra a verdade.
  - VM VMware (SVGA 0x15ad) com NVIDIA em passthrough: a contagem dá 1 placa e a opção some, embora a Dedicada
    por Vulkan funcionasse.
  - Uma saída possível: depois do início, comparar o fornecedor do renderizador do WebGL com o da placa pedida
    e avisar.
- **Também sem correção.**
  - `ok: true` do relançamento só quer dizer que o exec deu certo. Um runtime que morre depois não é visto na
    hora; com o pid anotado, a abertura seguinte depois de 30 s volta para Automático.
  - Extraído, o relançado usa o mesmo `appimage_extracted_<md5>` que o processo que sai apaga. Aqui funcionou
    porque o md5 do `.AppImage` (cerca de 1,5 s) termina depois da limpeza (cerca de 0,16 s, medido na revisão).
    Um disco muito mais rápido no md5 poderia inverter a ordem.

**Validação.**
- Gates (depois do último commit de código): `npm run lint` ok; `npm run build` ok; `npm test` 1790/1790;
  `npm run test:frontend` 1336 ok e 1 pulado.
- `check:hardware` com `electron .` (dist), sob o flock, com `--expect-integrada=0x8086
  --expect-dedicada=0x10de`: 11/11 ok. Os cenários novos:
  - `relancamento-em-andamento`: pedido com o pid vivo e 90 s de idade. Ficou no Automático com
    `relaunch-in-progress`, sem mexer no arquivo, sem aviso e sem relançar.
  - `escolha-salva-compativel`: Dedicada salva no modo compatível. Só Automático habilitado, o motivo na tela,
    e a escolha voltou para `auto` pela tela.
  - `relancamento-perdido` agora usa um pedido de 10 min sem pid.
- AppImage x64 reconstruído desta branch (electron-builder 26.15.3):
  - `dedicada`, `integrada-prime-run`, `relancamento-perdido`, `relancamento-em-andamento` e
    `escolha-salva-compativel`: 5/5.
  - `integrada-prime-run` com o TMPDIR atrás de link simbólico: ok. O mesmo caso no pacote da rodada anterior
    reproduziu o defeito: o CDP não abriu em 60 s, porque o app fechou sem voltar.
  - `integrada-prime-run` com `--app-image-arg=--appimage-extract-and-run`: ok. O relançado rodou com
    `APPIMAGE_EXTRACT_AND_RUN=1` e `APPDIR` em `appimage_extracted_*`.
  - Com a checagem nova do ambiente, o pacote anterior falha com "o PATH do relançado tem a montagem antiga", e
    o desta branch passa.
- Não sobrou montagem nem extração de teste em `/tmp`.

**Ideias para quem quiser contribuir.**
- Medir o custo do `getGPUInfo('basic')` numa máquina Windows, com e sem NPU.
- Um lançador intermediário que feche os fds herdados antes de reabrir o `.AppImage`.
- Avisar quando o renderizador do WebGL não é da placa pedida (Linux com duas dedicadas ou sem Vulkan).

## 2026-09-26 — Tutorial do canvas, Ajuda e novidades: plano aprovado

**Task.** Tutorial inicial não bloqueante no canvas, um lugar para reabri-lo (Ajuda) e um aviso discreto de
capability nova, tudo com estado versionado. O plano completo, com decisões, alternativas descartadas, riscos
e o mapa aceite → teste (T1.a–T3.d), está em [`PLANO-TUTORIAL-CANVAS.md`](../projeto/PLANO-TUTORIAL-CANVAS.md). Branch
`feat/tutorial-canvas`, a partir de `f42eb661` (#95). Registro gravado às 14:50.

**Decisões centrais (detalhe e motivo no plano).**
- Quem já usa o app não recebe o tutorial automático; os sinais de uso anterior são lidos em `main.tsx`,
  antes de o tema e o Modo Performance gravarem no mount, com um marcador de primeiro boot que cobre um
  primeiro boot interrompido.
- Uma única autoridade de estado: o SQLite do main (`settings['onboarding.state']`), com compare-and-set em
  `BEGIN IMMEDIATE`. Sem espelho no localStorage e sem função de mesclagem: num conflito, o mesmo evento é
  reaplicado sobre o estado mais novo.
- Novidade detectada por identidade (id do catálogo fora de `knownFeatures`), nunca por versão do app,
  hash ou comparação de arquivo. O catálogo tem um livro de versões (`CATALOG_HISTORY`) conferido em teste.
- A política de automação é decidida no main (molde do `hardware:get-profile`): a instância do
  `felixo devtools` não abre nada nem grava nada sozinha, salvo `FELIXO_DEVTOOLS_ONBOARDING=1`.
- O tour não é modal, não escurece a tela, não anima, nunca clica nem expande nada e não cria agente.

**Divergências registradas.** Do GUIA-ONBOARDING-E-AJUDA (sem overlay bloqueante, sem `animate-ping`, sem
`hasSeen` booleano) e do "modais prendem foco" do System Design (o tour é `aria-modal="false"`, sem trap).

**Estado.** Só o plano neste passo; o código entra nos commits seguintes, na ordem da seção "Ordem de
commits" do plano.

## 2026-09-26 — Tutorial do canvas: catálogo, textos e state machine (commit 3 do plano)

Registro gravado às 15:01. Arquivos novos em `app/src/features/onboarding/`: `onboarding-catalog.ts`,
`onboarding-messages.ts`, `onboarding-state.ts`, os testes U-cat, U-msg e U-state e
`onboarding-test-fixtures.ts` (catálogos de fixture, PRNG semeado e geradores de fuzz, usados só pelos testes).

**O que ficou pronto.**
- Catálogo v1 com o tour `inicial` (6 passos), o mini-tour `novidade-ajuda`, a feature `feature.ajuda`
  (`anunciarParaQuemJaUsa: true`), o livro de versões `CATALOG_HISTORY` e a guarda de compilação
  `CANVAS_TOOL_FEATURES satisfies Record<CanvasTool, 'base' | FeatureId>`.
- Textos pt-BR completos (passos, card, região live, aviso e Ajuda), plural por `Intl.PluralRules`, pseudo-locale
  `en-XA` gerado do pt-BR e resolução de locale tudo ou nada por card.
- State machine pura: `normalizeOnboardingState` (nunca lança; fuzz de 500 valores, metade mutações de um estado
  válido), `applyOnboardingEvent` (devolve o mesmo objeto num no-op), `decideAutomaticOpening`, gatilho de canvas
  ao vivo, `describeHelpEntries`, retomada por sessão e serialização que preserva extras e ids desconhecidos.

**Desvios do plano, com motivo.**
- `MessageKey` é derivado do próprio `PT_BR` (`satisfies Record<string, Message>`), em vez de uma união separada
  mais `satisfies Record<MessageKey, Message>`. A garantia é a mesma (pt-BR completo por construção) sem manter
  duas listas de ~60 chaves em sincronia.
- Os nomes das ferramentas do passo 5 ("Notas" e "Prompts") estão escritos no texto pt-BR, e o U-cat confere
  que são exatamente `TOOL_LABELS[citaFerramentas[i]]`. Formatar a partir de `TOOL_LABELS` em tempo de execução
  exigiria importar o módulo do canvas no chunk das mensagens, e o próprio plano só permite `TOOL_LABELS` no
  teste do catálogo.
- Passo com `requires` fica oculto também com a capability `desconhecido` (o plano cita só `indisponivel`):
  o tutorial nunca descreve o que pode não existir neste ambiente.
- `resolveOnboardingLocale` só casa um pseudo-locale (`-XA`/`-XB`) pelo nome exato; sem isso, `en-US` cairia
  em `en-XA` pelo idioma.
- O teste de migração v1→v2 exercita `migrateRaw` com uma tabela de fixture (a normalização atual só conhece o
  schema 1, então não existe versão menor para migrar dentro do próprio `normalize`).

**Validação.** `npx vitest run src/features/onboarding`: 74 testes ok; `npm run typecheck` ok; `eslint` da pasta ok.

## 2026-09-26 — Tutorial do canvas: estado no SQLite, IPC e política de automação (commit 4 do plano)

Registro gravado às 15:04.

**O que ficou pronto.**
- `electron/services/storage/onboarding-state-repository.cjs`: leitura tolerante (JSON inválido ou envelope sem
  revisão vira `corrupted: true`, revisão 0) e `compareAndSetOnboardingState` com `BEGIN IMMEDIATE`, um SELECT e um
  UPSERT na chave `onboarding.state`, envelope `{ revision, value }`.
- `electron/services/onboarding-ipc-handlers.cjs`: canais `onboarding:read` (com `appVersion` e `automation`) e
  `onboarding:write` (valida objeto simples, `schemaVersion` inteiro ≥ 1, `expectedRevision` inteiro ≥ 0 e no máximo
  64 KiB em bytes UTF-8). `ipcMain`, banco, versão, política e relógio são injetados.
- `electron/core/onboarding-automation.cjs`: `autoOpen` falso com porta de depuração válida, salvo
  `FELIXO_DEVTOOLS_ONBOARDING=1`; sem porta é sempre produto.
- Registro no `main.cjs` logo depois de `registerOrchestratorSettingsIpcHandlers`, ponte `onboarding` no
  `preload.cjs` (sempre presente, não só no devtools) e tipos `OnboardingReadResult`/`OnboardingWriteResult` no
  `vite-env.d.ts`.

**Detalhes de implementação que o plano não fixava.**
- O `ROLLBACK` só roda se o `BEGIN IMMEDIATE` desta função deu certo. Com uma transação de outro módulo aberta na
  mesma conexão, o `BEGIN` falha e um `ROLLBACK` incondicional desfaria o trabalho alheio (há teste para isso).
- A escrita grava a forma JSON do valor recebido (o que a leitura devolve), nunca o objeto clonado pelo IPC.
- A porta conta como válida só entre 1 e 65535, a mesma condição com que o `main.cjs` liga o CDP.
- O processo filho do N-mp fica em `electron/__fixtures__/onboarding-cas-worker.cjs`, a pasta de fixtures que o
  `electron/` já usa; sem `.test` no nome, o runner não o executa como teste.

**Validação.** `node --test` dos quatro arquivos novos: 21/21 (N-repo, N-mp com 20 rodadas entre dois processos
node reais, N-ipc com o contrato do preload e do `vite-env.d.ts`, N-auto); `npm run typecheck` ok;
`node --check` de `main.cjs` e `preload.cjs` ok.

## 2026-09-26 — Tutorial do canvas: store, sinais de boot e retomada por sessão (commit 5 do plano)

Registro gravado às 15:19.

**O que ficou pronto.**
- `onboarding-store.ts`: `createOnboardingStore(deps)` e o singleton `onboardingStore`, com
  `useOnboardingSnapshot()` sobre `useSyncExternalStore` (snapshot de servidor constante). Leitura com prazo de
  4 s, decisão automática uma vez por store depois da leitura e da hidratação, reivindicações pessimistas,
  abrir/pular/concluir otimistas numa fila de escrita, conflito resolvido reaplicando o mesmo evento, retomada
  por `sessionStorage` sem escrita, gatilhos de capability e de canvas, reset e falha de render isolada.
- `onboarding-boot-signals.ts` (chunk de entrada, sem React): foto das chaves `felixo*` e marcador de primeiro
  boot; chamado em `main.tsx` antes do `createRoot`.
- `onboarding-devtools.ts`: falha forçada lida só com `window.felixo.devtools`.
- Testes U-store (35 casos), U-prop (500 sequências de 40 eventos com dependências espiãs e uma sonda em
  `fetch`) e U-boot. O U-prop foi conferido com duas mutações de propósito (pular rebaixando `concluido`;
  novidade com `autoOpen` falso): as duas reprovaram, e o código voltou ao original.

**Desvios e acréscimos ao plano, com motivo.**
- `session` é um getter (`() => storage`), como no `openia-image-store`: acessar `window.sessionStorage` pode
  lançar, e o getter deixa cada acesso protegido.
- Dependência `log` (QA Logger, escopo `renderer:onboarding`) para a recuperação e as falhas de escrita que o
  plano manda registrar. O U-prop confere que a store só chama as dependências de I/O previstas mais leituras
  puras (relógio, locale, sinais, falha forçada, `schedule`, `log`).
- API além do plano: `canvasUnmounted()` (o portão "só com o CanvasView montado" precisa saber quando o canvas
  sai), `focusBeforeOpen()` (o elemento focado é capturado pela store no instante da abertura, antes de o chunk
  preguiçoso carregar e o menu da Ajuda fechar) e `settled()` (testes e smoke esperam leitura, avaliação e
  escritas terminarem).
- `TourSession.falhaForcada`: a falha forçada é lida a cada abertura, e a camada só consulta o snapshot, sem ler
  `sessionStorage` no render.
- Rótulos de `decisao` além da lista do plano: `sem-ponte`, `retomada`, `recuperado`, `anunciado`, `carregando`,
  `suprimido:recuperaria` e `suprimido:anunciaria`.
- Se a pessoa abre um tour pela Ajuda antes de a leitura terminar e a decisão automática é anunciar uma
  novidade, a store espera o tour fechar em vez de gastar o anúncio sem mostrar o aviso (teste dedicado).

**Validação (gates completos em `app/`).** `npm run lint` ok; `npm run build` ok; `npm test` 1811/1811;
`npm run test:frontend` 1458 ok e 1 pulado (152 arquivos).

## 2026-09-26 — Tutorial do canvas: âncoras estáveis e obstáculos de posicionamento (commit 6 do plano)

Registro gravado às 15:33.

**O que ficou pronto.** Só atributos, sem mudança de comportamento:
- `data-felixo-tour-anchor`: `rail-menu` (toggle do menu do canvas) e `rail-projetos` no rail, pela prop opcional
  `tourAnchor` do `ActivityRailButton`; `secao-criar` e `secao-ferramentas` no botão de título do
  `SidebarSection` (prop opcional `anchorId`, que a sidebar do chat não passa); `criar-bloco` no gatilho do
  "Novo bloco"; `criar-agente` na moldura `.felixo-sidebar-agent-trigger`, nunca nas metades (a metade "Agente"
  lança a CLI); `inspector-elementos` na linha do cabeçalho "Elementos" e `inspector-puck` no puck.
- `data-felixo-tour-avoid` no cartão do `CliSetupToast` e na caixa `role="status"` do `NoticeToast` dos
  HardwareNotices, não no wrapper `inset-x-0` de largura total.

**Desvio.** A prop `controls` do `ActivityRailButton` (`aria-controls`) fica para o commit 9, junto do botão
Ajuda, o único que a usa. A âncora `rail-ajuda` também nasce com o botão.

**Validação.** `npm run lint` e `npm run build` ok.

## 2026-09-26 — Tutorial do canvas: posicionamento, alvo e foco puros (commit 7 do plano)

Registro gravado às 15:40.

**O que ficou pronto.** `app/src/features/onboarding/onboarding-layout.ts`, sem DOM de verdade (DOM e medidas
injetados): `resolveStepTarget` (cadeia de alvos com `[inert]`/`aria-hidden`/`hidden`, `visibility`,
`opacity`, retângulo vazio, 50% na janela e na sidebar rolável, `elementFromPoint` no centro e
`needsReveal` abaixo da dobra), `computeCardPlacement` (folha em viewport compacto; lados na ordem preferido,
baixo, cima, esquerda; desvio de `[data-felixo-tour-avoid]`), `computeRingRect`, `computeSidebarReveal`,
`canStealFocus`, `decideFocusOnOpen`, `resolveReturnFocus`, `hasOpenModal` e
`ancestorCreatesContainingBlock`.

**Decisões que o plano não fixava.**
- A matriz do U-layout reprovou o primeiro desenho em 720×500 com o card 2× mais alto e o `NoticeToast`: nenhum
  lado cabia inteiro e a folha cobria o aviso, embora houvesse espaço. O posicionamento ganhou uma segunda passada:
  ao lado do alvo (direita/esquerda), com a altura limitada à faixa livre da coluna mais próxima do alvo (janela
  menos obstáculos, pelo menos 160 px) e o corpo rolando.
- Depois de esquerda, a ordem de lados ainda tenta a direita (relevante para o inspector, cujo preferido é a
  esquerda).
- `canStealFocus` é lista de permissão (`null`, `body`, `html` e a região do canvas); a lista do plano (campos,
  xterm, gaveta, webview, diálogos, menus) fica documentada em `FOCUS_OWNERS_SELECTOR` e testada. Um botão que a
  pessoa focou também não perde o foco para a abertura automática.
- As superfícies do próprio tour (`[data-felixo-onboarding]`) nunca contam como oclusão do alvo.
- O teto do card ancorado é o espaço daquele lado, não a altura medida, para arredondamento de subpixel nunca cortar
  o rodapé.

**Validação.** U-layout: 493 casos (matriz de 6 viewports × 9 alvos × 4 conjuntos de obstáculos × 2 alturas de
card, só asserts relacionais, mais casos nomeados de alvo, foco, modal e containing block). Conferido com duas
mutações de propósito (ignorar obstáculos; ignorar oclusão), que reprovaram 52 e 2 casos; o código voltou ao
original. `npm run lint` e `npm run build` ok.

## 2026-09-26 — Tutorial do canvas: tutorial não bloqueante no canvas (commit 8 do plano)

Registro gravado às 15:52.

**O que ficou pronto.**
- `OnboardingMount` (eager), logo depois do `<CanvasToolbar/>` dentro de `[data-felixo-region="canvas"]`: região
  live sempre montada e vazia, com `data-felixo-onboarding-decisao`; `canvasReady`, `canvasUnmounted` e
  `canvasNodeTypes`; a camada entra só por `lazy(import('./onboarding-ui-entry'))` dentro do
  `OnboardingErrorBoundary`.
- Chunk preguiçoso único `onboarding-ui-entry` (22,4 kB, 8,1 kB gzip no build): mensagens, layout,
  `onboarding-ui-model.ts` (textos prontos do card, do aviso e dos anúncios), `OnboardingTourLayer` (casca:
  medição, observadores, posição pela ref, Esc, foco), `OnboardingTourCard` e `OnboardingNotice`
  (apresentacionais). "Tutorial do canvas" só aparece nesse chunk.
- CSS: tokens `--felixo-z-onboarding-ring: 54` e `--felixo-z-onboarding: 55`, classes `.felixo-onboarding-*` sem
  animação nem transição, tamanhos em rem, foco visível na própria classe, alto contraste e forced-colors. As
  classes do card, do anel e do aviso também entram nos blocos de reduced motion e de Modo Performance.
- `CanvasView`: `nodeTypesKey` só é montada quando o catálogo tem gatilho de canvas (o v1 não tem).

**Desvios e acréscimos, com motivo.**
- Store: `TourSession` ganhou `titulo` e `lang`, o aviso ganhou `titulo` e `lang`, e o anúncio ganhou `lang`
  (`announce(texto, lang)`). O `lang` do documento é capturado na abertura, como a falha forçada, para a camada
  não ler o DOM no render; o anúncio leva o idioma do catálogo usado.
- `reportFailure(error, componentStack)`: o boundary passa a pilha de componentes e a store registra um único erro no
  QA Logger (escopo `renderer:onboarding`). O boundary não loga de novo, para a falha não aparecer duplicada.
- `onboarding-ui-model.ts` é um arquivo a mais que o plano: separa a formatação dos textos (pura, testada no U-ui)
  da casca e dos componentes.
- O anel e o card ficam invisíveis por CSS até a camada escrever `data-visivel`/`data-modo` pela ref, em vez de
  estilo inline (o U-ui confere que a marcação não tem `style` com posição).
- `nokey` entrou na lista de marcadores do `setup-tailwind-classes.test.ts` (é lido pelo React Flow em JS), que agora
  varre também `features/onboarding`, com caminho relativo portátil entre sistemas.
- `nodeTypesKeyOf` em `onboarding-state.ts`, o inverso de `parseNodeTypesKey`, para o `CanvasView` montar a chave.

**Validação.**
- U-ui (card por passo × pt-BR/en-XA, contador, Voltar com `aria-disabled`, Concluir, ids de labelledby e
  describedby, sem coordenadas, aviso sem `autofocus`, anúncios), U-bound (sonda estática de importações, rede,
  processo e ponte; Mount só por lazy; métodos do boundary com store falsa e real) e U-css (conferido com três
  mutações de propósito, que reprovaram; o CSS voltou ao original).
- `npx vitest run src/features/onboarding src/features/setup`: 690/690. `npm run lint` e `npm run build` ok.
- App real (`felixo devtools`, perfil isolado, sob o lock): com a abertura suprimida, a decisão exposta é
  `suprimido:abriria-inicial`, sem card, e as 8 âncoras existem. Com sessão de retomada no passo 2 e reload, o card
  aparece ancorado à direita da moldura "Agente" (anel no alvo), sem mover o foco, e a região live diz "Tutorial
  retomado no passo 2 de 6: Agente."; Próximo troca o texto e anuncia "Passo 3 de 6: Contexto"; o passo 4 fica à
  esquerda do cabeçalho "Elementos"; Esc no card fecha, limpa a sessão, anuncia "Tutorial fechado. Reabra em Ajuda."
  e devolve o foco à região do canvas (a Ajuda ainda não existe neste commit).

## 2026-09-26 — Tutorial do canvas: Ajuda no rail (commit 9 do plano)

Registro gravado às 16:13.

**O que ficou pronto.**
- Botão "Ajuda" (`CircleHelp`) no grupo superior do rail, depois de Notificações: `aria-expanded`,
  `aria-controls`, `data-felixo-help-trigger`, âncora `rail-ajuda`, ponto estático de novidade e
  `aria-label="Ajuda (1 novidade)"` com plural pela contagem. Abrir a Ajuda dispensa o aviso de novidade.
- `OnboardingHelpMenu` (chunk preguiçoso, o mesmo do tour): `FelixoPopoverSurface` com `role="group"`, `nokey` e
  `lang`; tutorial do canvas com estado e ação (Iniciar, Continuar do passo n, Rever, Recomeçar), novidades (vazio,
  "Novo" com Ver, "Indisponível nesta versão"), "Redefinir tutoriais" com confirmação na própria tela (nunca
  `window.confirm`) e a linha "O progresso não será salvo nesta sessão." sem persistência. Esc com o foco no menu e
  clique fora fecham e devolvem o foco ao botão; abrir um tour fecha o menu e abre no quadro seguinte, com o foco já
  no botão Ajuda (é para lá que ele volta no fim).

**Desvios e acréscimos, com motivo.**
- `onboarding-help-label.ts` (eager): o rótulo do botão existe antes de qualquer tour e não pode puxar o catálogo de
  textos do chunk preguiçoso; `onboarding-messages.ts` reusa as mesmas constantes, sem texto duplicado. O botão fica
  sempre em pt-BR, como o resto do rail.
- `useOnboardingNovelties()` na store: a barra lateral só re-renderiza quando a contagem de novidades muda.
- `HelpEntry.passoId`: "Continuar do passo n" reabre exatamente no passo salvo.
- `FelixoPopoverSurface` ganhou a prop opcional `lang` (o menu precisa declarar o idioma do conteúdo).
- `describeHelpMenu` em `onboarding-ui-model.ts` e `OnboardingHelpMenuContent` apresentacional, para o U-ui testar
  todos os estados sem portal.
- Clique fora só devolve o foco ao botão se ele não foi para outro controle (um clique no terminal não é desfeito).
- U-cat confere que toda âncora do catálogo está marcada no código do canvas e que `criar-agente` fica na moldura.
- **Bug achado na verificação no app real e corrigido no commit 8 (amend, antes de qualquer push):** o aviso de
  novidade nunca era posicionado (ficava invisível). `onPlaced?.(placeSurface(...))` não avalia o argumento quando
  `onPlaced` não existe, e o aviso não passa esse callback. A medição agora roda antes da chamada opcional.

**Validação.**
- `npx vitest run src/features/onboarding src/features/setup`: 708/708. `npm run lint` e `npm run build` ok (chunk
  `onboarding-ui-entry` com 29,5 kB, 9,8 kB gzip).
- App real (`felixo devtools`, perfil isolado, sob o lock), abertura suprimida: Ajuda com nome "Ajuda"; Enter abre o
  menu com o foco em "Iniciar" e `aria-controls` igual ao id do menu; Esc fecha e devolve o foco ao botão; Iniciar
  abre o tour com o foco no card; Tab percorre Pular → Voltar → Próximo e sai do card; Shift+Tab em Pular volta à
  sidebar; Enter em Voltar no passo 1 não faz nada; Enter em Próximo até o passo 6 mantém o foco no mesmo botão e a
  região live anuncia cada passo; Concluir anuncia a conclusão e devolve o foco à Ajuda; `read()` mostra o inicial
  concluído (as ações da pessoa gravam mesmo com a automação suprimida). O menu mostra "Concluído em 26/09/2026" e
  Rever; Redefinir pede confirmação com o foco em Cancelar; confirmar abre o inicial com foco e preserva
  `knownFeatures`.
- App real com `FELIXO_DEVTOOLS_ONBOARDING=1` e `FELIXO_DEVTOOLS_HARDWARE_NOTICES=1`: o primeiro uso abre sozinho
  (decisão `aberto`, um card, foco no card, marcador removido, revisão 1) sem cruzar o `NoticeToast`; com o estado
  semeado (inicial concluído, `knownFeatures` vazio) e reload, o aviso "Novidade: Ajuda" aparece ao lado da Ajuda
  sem tirar o foco do body, a região live diz "Novidade em Ajuda: Ajuda.", o botão vira "Ajuda (1 novidade)" com o
  ponto, e "Ver" abre o mini-tour com o foco no card, com o inicial ainda concluído.

## 2026-09-26 — Tutorial do canvas: sonda de invocações IPC na automação (commit 10 do plano)

Registro gravado às 16:23.

**O que ficou pronto.**
- `electron/core/ipc-invoke-probe.cjs`: `installIpcInvokeProbe(ipcMain)` envolve `handle` e `on` e conta as
  invocações por canal, sem mudar retorno, exceção nem `this`. `snapshot()` devolve uma cópia congelada, com os
  canais em ordem alfabética.
- `main.cjs` instala a sonda logo depois de calcular `devtoolsPort`, só com porta válida (1 a 65535) e antes do
  primeiro `ipcMain.handle`. O `devtools:main-eval` recebe `ipcProbe` apenas com `snapshot()`; o app normal
  nunca a instala.

**Acréscimos, com motivo.**
- `handleOnce` e `once` não precisam de envoltório próprio: o Electron e o EventEmitter do Node os implementam
  sobre `handle` e `on` da própria instância, então passam pela sonda (há teste). O listener contado guarda o
  original em `.listener`, para `removeListener(canal, original)` continuar funcionando.
- `uninstall()` existe só para os testes devolverem os métodos originais.

**Validação.**
- N-probe (`electron/core/ipc-invoke-probe.test.cjs`): 9/9. Três mutações de propósito (engolir a exceção do handler,
  snapshot mutável, tirar o `.listener`) reprovaram 2, 2 e 1 casos; o código voltou ao original.
- App real (`felixo devtools`, perfil isolado, sob o lock): `felixo devtools main "ipcProbe.snapshot()"` lista os
  canais do boot; depois de um `onboarding.read()` pelo renderer, `onboarding:read` sobe de 1 para 2 e
  `devtools:main-eval` conta a própria leitura. O snapshot é congelado e o objeto exposto só tem `snapshot`.

## 2026-09-26 — Tutorial do canvas: cenários no canvas-smoke (commit 11 do plano)

Registro gravado às 18:01.

**O que ficou pronto.**
- `scripts/canvas-smoke-onboarding.cjs`: os cenários do tutorial, com a página e os helpers injetados pelo
  `canvas-smoke.cjs`. Sessão A (a de sempre, abertura suprimida): SA0 logo depois da montagem e SA1–SA10 no fim,
  sobre a fixture. Sessão B (nova, `FELIXO_DEVTOOLS_ONBOARDING=1` e `FELIXO_DEVTOOLS_HARDWARE_NOTICES=1`, perfil
  novo e canvas vazio): SB1–SB8.
- Sondas em volta dos percursos completos (SA1 e SB2): `ipcProbe.snapshot()` antes e depois (nenhum canal de
  PTY, CLI, rede, crédito, git, arquivo, voz, webview, preset ou escrita no canvas; canais vistos contidos numa
  janela ociosa de controle com a mesma duração, mais `onboarding:*`), requisições para fora da origem do app,
  contagem de blocos, terminais, gavetas e webviews, e diff do localStorage (só a remoção do marcador de primeiro
  boot é permitida).
- `scripts/canvas-smoke-onboarding-geometry.cjs` com N-geo: `rectInside`, `contains`, `intersects`, `inflate`,
  `clipToViewport`, `contrastRatio` (WCAG, com composição de alfa), `flattenLayers`, `containingBlockReason`,
  `diffChannels`, `forbiddenChannels`, `channelsOutside`, `diffStorage`, `storageViolations` e
  `externalRequests`, todos com casos que precisam reprovar. A lista de canais proibidos é conferida contra os
  canais reais do `preload.cjs`.
- `withDevtoolsSession(action, { env })` define e restaura variáveis extras. As capturas de falha das duas
  sessões começam com `canvas-smoke-failure`, o glob que o CI já anexa.
- `ui-render-performance.cjs --onboarding`: abre o tour pela Ajuda antes de cada rodada (e do aquecimento) e
  confere que ele continua aberto no fim. Uso manual.

**Bugs de produto achados pelo smoke (corrigidos antes de qualquer push).**
- **Laço de troca de alvo (SA8).** Com a sidebar recolhida no passo 2 (alvo "menu do canvas"), abrir a sidebar
  fazia o alvo alternar entre `rail-menu` e `criar-agente` dentro do mesmo quadro, até o React parar com
  "Maximum update depth exceeded" e o boundary derrubar o tour. Causa: o teste de alvo aceitava o alvo quando o
  próprio card estava por cima dele; ancorado no menu, o card cobria a moldura "Agente" e a fazia passar;
  ancorado na moldura, o card saía de cima e ela era rejeitada. Correção: o `elementFromPoint` da camada olha
  através do card e do aviso (`pointer-events: none` só durante a leitura), então a escolha do alvo não depende
  de onde o card está. Entrou como fixup no commit 8 (camada do tour).
- **Alvo preso no fallback depois de um deslocamento (SA3).** Abrir a gaveta do terminal rola o contêiner do
  shell (`overflow: hidden`) uns 438 px de lado por um instante, pelo foco que vai para o terminal. Nesse
  instante a moldura "Agente" sai da tela e o tour cai, com razão, no menu do canvas; mas quando o shell volta,
  nada disparava um novo cálculo (os alvos só mudaram de lugar, não de tamanho), e o card ficava no menu por
  cima da sidebar, cobrindo a metade "Agente". Visto no smoke completo, de forma intermitente; o diagnóstico
  anexado à falha mostrou a moldura visível, sem nada por cima e sem ancestral rolado, ou seja, só faltava
  recalcular. Correção em duas partes, fixup no commit 8: (1) a camada escuta `scroll` em captura no documento
  e recalcula quando a rolagem move um candidato (a do xterm é ignorada), no lugar da escuta que existia só no
  `.felixo-sidebar-scroll`; (2) enquanto o tour aponta uma alternativa ao alvo preferido, a posição é
  conferida de novo a cada 500 ms, porque um contêiner pode voltar ao lugar (ou um overlay sair) sem disparar
  evento nenhum. No alvo preferido não há verificação periódica. O SA3 agora exige que o anel volte para a
  moldura depois de fechar a gaveta, e a falha de espera por âncora passou a anexar o diagnóstico do alvo.
- **Volta do chat puxava o foco (SA9).** Um tour aberto pela Ajuda (foco "mover") voltava do chat com o foco no
  card: a camada remonta antes de o canvas hidratar, e o `canvasReady`, que trocava o foco para "manter", chegava
  tarde. Correção: `canvasUnmounted()` já marca o tour aberto com foco "manter". O teste da store passou a exigir
  isso logo depois de desmontar. Entrou como fixup no commit 5 (store).
- As correções do laço e do foco foram conferidas ao contrário: sem elas, o SA8 e o SA9 reprovam. A do
  deslocamento não dá para reverter de forma determinística (depende de outro observador disparar ou não), então
  a conferência foi medir a posição da moldura e a âncora com a gaveta aberta e fechada: sem a correção a
  âncora podia ficar no menu; com ela, volta sempre para a moldura.
- Achado à parte, fora deste PR: o deslocamento lateral do shell ao abrir a gaveta do terminal é visível e vale
  investigar por conta própria.

**Desvios, com motivo.**
- SB7 "forma inválida": a ponte recusa `schemaVersion: 0` (contrato do commit 4: inteiro ≥ 1), então o estado
  inválido chega como num arquivo danificado: `corromperEstadoNoPerfil` trunca o JSON da linha
  `onboarding.state` direto no SQLite do perfil isolado (recusa perfil real). O SB7 também confere que a ponte
  recusa o `schemaVersion: 0`. Não há gancho de escrita no `main-eval`.
- SA1 tira o bloco Excalidraw da fixture antes das sondas. Achado à parte: com o canvas parado, esse bloco
  regrava a si mesmo cerca de uma vez por segundo (`canvas:save` com a cena igual; só o `updatedAt` muda), o
  que tornava impossível provar "zero escritas no canvas" durante o percurso. Fica registrado como pendência
  fora deste PR.
- As sondas esperam o app parar de gravar sozinho antes de abrir a janela (uma amostra de 1,5 s sem canal
  proibido): o smoke chega ao SA1 vindo de 320×720, e o canvas regrava posição e tamanho com atraso depois do
  resize.
- SA2: o Shift+Tab em Pular cai no último controle da sidebar, que hoje é "Limpar" (ordem do documento). A regra
  "o foco nunca passa por Agente nem Limpar" vale para o foco depois de cada ação do tour (abrir, Tab dentro do
  card, Voltar, Próximo, Esc); as saídas do card com Tab/Shift+Tab conferem só que o foco saiu para o lugar
  certo.
- SA3: o gatilho do terminal da fixture é acionado pelo teclado (foco + Enter), porque dependendo do
  enquadramento a dock cobre o bloco.
- SA5: o zoom +3 é aplicado numa janela de 720×500 (≈ 417×289 CSS px, o caso compacto citado no plano), depois
  de 1280×800, 375×667 e 320×720. Em 417×289 a folha cobre o alvo do passo 1, o que o plano permite no modo
  folha.
- SA9: a ida ao chat vem antes do reload, para cobrir o tour aberto pela Ajuda (foco "mover"); depois do reload o
  tour já volta como retomada.
- SB1: a convivência com o `NoticeToast` depende do perfil de hardware que o próprio app devolve
  (`lowCpu && suggestPerformanceMode`), e não de contar CPUs no script; sem a sugestão, o cenário registra que
  pulou e por quê. O clique no aviso é feito no fim do SB2, porque clicar antes tiraria o foco do card no meio do
  percurso só por teclado.
- `ui-render-performance`: a interação que abre e fecha grupos da sidebar passou a excluir o botão Ajuda (que
  também tem `aria-expanded`). Sem isso, a sequência de cliques mudaria só por existir um botão a mais, e os
  números deixariam de ser comparáveis com as medições anteriores.
- `ui-render-performance --onboarding`: a primeira medição com o tour aberto deu MAIS FPS que sem ele, porque o
  card do passo 1 cobre parte da sidebar e os cliques reais nos grupos cobertos caíam no card (a rodada fazia
  menos trabalho). Com a flag, um grupo coberto pelo tour é acionado pelo DOM (o mesmo handler, como o teclado
  faria); sem a flag, nada muda. O `isCoveredByTour` tem teste.

**Validação.**
- N-geo (`scripts/canvas-smoke-onboarding-geometry.test.cjs`): 15/15, com casos que precisam reprovar em cada
  helper. `ui-render-performance.test.cjs`: 13/13 (flag `--onboarding` e o seletor sem o botão Ajuda).
  `npx vitest run src/features/onboarding`: 683/683. `npm run lint` dos arquivos tocados e `npm run build`: ok.
- `npm run test:canvas-smoke` completo, sob o lock, perfil isolado: exit 0 em 9 min 23 s nesta máquina
  (17:50–18:00), com as duas sessões e todos os cenários (SA0–SA10 e SB1–SB8). Destaques: sondas do SA1 com
  delta `{"devtools:main-eval":1,"onboarding:write":2}` e 8 requisições, todas locais; SB2 com
  `{"devtools:main-eval":1,"onboarding:write":1}`; contraste em alto contraste de 21:1 no texto e 14,1:1 no anel;
  convivência com o `NoticeToast` conferida (4 CPUs lógicas). As quatro execuções anteriores reprovaram e
  levaram às correções acima: as escritas do Excalidraw no SA1 e o alvo preso no SA3 três vezes (sem correção,
  só com a escuta de rolagem e na rodada que anexou o diagnóstico).
- Conferências ao contrário: sem a correção da store, o SA9 reprova ("voltar do chat puxou o foco para o
  tour"); antes da correção do teste de alvo, o SA8 reprovava com "Maximum update depth exceeded".

## 2026-09-26 — Tutorial do canvas: documentação, checklist e medição no HD 520 (commit 12 do plano)

Registro gravado às 18:17.

**O que mudou na documentação.**
- `GUIA-USUARIO.md`: seção "Tutorial e Ajuda" (o que o tutorial faz e não faz, teclado, sidebar recolhida,
  janela pequena, retomada, chat, aviso para quem já usava, o menu Ajuda, somente leitura, onde o progresso fica
  e que reinstalar preserva o estado). A frase "menu Ferramentas (canto superior esquerdo)" virou a seção
  Ferramentas da barra lateral, fechada por padrão.
- `ARQUITETURA.md`: seção do tutorial (camadas e chunks, persistência com compare-and-set, canais IPC, política
  de automação, convivência e recálculo) e a sonda IPC no DevTools isolado.
- `LAYOUT-SUPERFICIES.md`: card, anel, aviso e menu Ajuda como overlays que não reservam largura (fora de
  `splitHorizontalSpace`), tamanhos, modo folha, obstáculos, escala de z e a conta do rail.
- `GUIA-DESENVOLVEDOR.md`: `FELIXO_DEVTOOLS_ONBOARDING`, falha forçada, sonda IPC, semear estados pela ponte,
  como anunciar uma função nova no catálogo e os cenários do smoke; comandos `test:canvas-smoke` e
  `benchmark:ui-render -- --onboarding` na tabela.
- `MOTION.md`: o tour não anima em nenhum modo; o "empty state" que entrava em 200 ms não existe no canvas (a
  orientação do primeiro uso é o tutorial).
- `README.md`: a capacidade na lista do status atual, com link para o guia.
- `RELEASE_CHECKLIST.md`: seção 9 com o que a automação NÃO cobre (leitor de tela real, janela visível com
  input real, pergunta de agente real por cima do tour, dois processos no mesmo perfil no Windows e no macOS,
  janela recriada no macOS, reinstalação real pelo NSIS, escala de fonte do sistema, primeiro boot do pacote numa
  máquina com até 4 CPUs, custo no hardware de referência e tradução real).
- `.claude/skills/rodar-app/SKILL.md`: o tutorial vem suprimido no perfil isolado e como ligar ou inspecionar.
- `PLANO-TUTORIAL-CANVAS.md`: `Status: concluido.`

**Medição no notebook de referência (i5-6200U, Intel HD 520, ANGLE/GL).** `ui-render-performance` com 48 blocos,
Modo Performance alternado em cada execução, em pares intercalados sem e com `--onboarding` (4 rodadas cada).
Média das medianas dos dois pares:

| Tutorial | Modo | FPS | Quadro p95 | Estilo por quadro |
| --- | --- | ---: | ---: | ---: |
| fechado | normal | 16,2 | 192,7 ms | 5,00 ms |
| aberto | normal | 15,8 | 195,8 ms | 6,11 ms |
| fechado | Performance | 21,4 | 142,1 ms | 1,24 ms |
| aberto | Performance | 22,1 | 144,3 ms | 1,35 ms |

O tour aberto não tem custo mensurável (as diferenças ficam abaixo da variação entre pares de uma mesma
condição), e o Modo Performance continua dando +40% de FPS com ele aberto. A máquina estava carregada (load
average entre 8 e 11, com outras sessões e o app real abertos), então os valores absolutos ficaram abaixo dos
da manhã e não devem ser comparados com eles. Detalhes em `POLITICA-PERFORMANCE.md`, "Tutorial do canvas
aberto".

**Pendências que ficam fora deste PR (viram tasks próprias).**
- O bloco Excalidraw regrava a si mesmo cerca de uma vez por segundo com o canvas parado (`canvas:save` com a
  cena igual), o que custa I/O no SQLite o tempo todo.
- Abrir a gaveta do terminal rola o contêiner do shell de lado (uns 438 px) por um instante, pelo foco que vai
  para o terminal.
- O passo "`timeout-minutes: 10`" do smoke no CI: a sessão B e os cenários da sessão A somam alguns minutos ao
  smoke (9 min 23 s no total nesta máquina); convém rever o teto no workflow, que este PR não toca.

## 2026-09-26 — Tutorial do canvas: os dois bloqueantes da revisão adversarial

Registro gravado às 21:21.

A revisão adversarial do PR apontou dois bloqueantes. Os dois foram reproduzidos no app real (felixo devtools sob o
lock, perfil isolado, sessões encerradas) antes de qualquer mudança, com um roteiro próprio que mede o card, o alvo
e a sidebar em cada passo. No código anterior o roteiro registrou 22 falhas; depois das correções, nenhuma.

**1. Folha por cima do alvo no zoom alto da janela mínima (T2.c).** Confirmado, e maior do que o relato. O revisor
viu só o passo 1; o roteiro achou mais passos cobertos pelo mesmo motivo:
- 800×500 com zoom +3 (463×289 CSS px): passos 1 (Projetos, 87% coberto) e 2 (moldura Agente, 100%);
- 720×500 com zoom +3 (416×289): passos 1, 2, 3 (Novo bloco, 78%) e 6 (Ajuda, 18%);
- 800×500 com zoom +2,5 (507×317): passos 1, 2 e 3;
- 720×500 com zoom +2 (500×347): passos 1 (32%) e 3 (6%).

A causa: com o alvo no meio de uma janela baixa, a folha de largura cheia não cabe em nenhuma borda sem cruzá-lo, a
faixa acima ou abaixo dele tem menos de 160 px, e o último recurso de `sheetPlacement` ficava com `edges[0]` por
cima dele. A matriz do U-layout já tinha o caso 417×289 com o alvo do rail, mas só conferia "não cruza o alvo" no
modo ancorado, e o SA5 só conferia card e botões dentro da janela. O registro do commit 11 dizia que isso era
permitido no modo folha: estava errado. O plano só deixa cobrir um alvo maior que meia janela.

Correção (`fix(onboarding): folha em coluna ao lado do alvo quando nenhuma borda cabe`): antes de cobrir qualquer
coisa, a folha tenta a coluna ao lado do alvo (à direita do rail e da sidebar, à esquerda do inspector), com no
mínimo 160 px de largura e a altura da faixa livre mais próxima dele; o corpo rola e o rodapé fica visível. Cobrir
um aviso vem antes de cobrir o alvo. O U-layout passou a exigir "não cruza o alvo" em qualquer modo para alvo menor
que meia janela, com as medidas do app como casos nomeados. O SA5 ganhou o assert relacional `coversSmallTarget`
(com N-geo) em toda medida e percorre os seis passos com zoom +3 em 720×500 e +2,5 em 800×500.

**2. Rolagem da sidebar presa no alvo (T1.d e foco visível).** Confirmado. Em 1100×478 e 1280×710, com Ferramentas
aberta e o tour nos passos 2, 3 e 5, a rolagem até o fim voltava no quadro seguinte (709 → 28, 65 ou 385; 477 → 28,
65 ou 385), e o `Tab` deixava de 5 a 12 controles focados fora de vista. A causa: todo recálculo disparado por
rolagem podia "revelar" o alvo de novo.

Correção (`fix(onboarding): a rolagem da sidebar é da pessoa depois que ela rola`): o `SidebarScrollGate`
(`onboarding-layout.ts`, puro) deixa o tour rolar a sidebar até o alvo só enquanto a pessoa não rolou naquele
passo. O eco da rolagem do próprio tour é reconhecido pelo valor escrito. Depois que a pessoa rola, o alvo fica
recortado ou fora de vista, e o anel mostra só a parte dele que aparece na sidebar (some quando nada aparece). O
SA8 confere a rolagem, o alvo mantido, o anel dentro da sidebar, oito `Tab` com o foco à vista e o passo 3
voltando a trazer Novo bloco para a vista.

**Desvios do plano, com motivo.**
- **Folha em coluna.** O plano define a folha como "largura cheia menos margens, na borda oposta ao alvo". Numa
  janela de 416×289 isso não existe sem cobrir o alvo. Alternativa descartada: baixar o piso de 160 px da folha. A
  faixa abaixo da moldura Agente tem 121 px, o que cabe cabeçalho e rodapé do card sem nenhuma linha do corpo. A
  coluna é o único espaço útil. Limitação declarada que sobra: uma janela sem coluna de 160 px dos dois lados do
  alvo e sem 160 px acima ou abaixo dele. Nenhum zoom da janela mínima testado chega lá (até +3).
- **Revelar o alvo.** O plano diz que `computeSidebarReveal` ajusta o `scrollTop`, sem restrição, e que o recálculo
  também escuta a rolagem da sidebar. Agora a rolagem da sidebar ainda recalcula (o anel acompanha), mas só rola
  enquanto a pessoa não rolou no passo. Alternativas descartadas:
  - revelar só quando o `trackKey` muda, como o revisor sugeriu: a troca de alvo também pode vir de uma rolagem
    (o alvo coberto cai na alternativa e volta ao ser descoberto), e revelar nela devolveria a sidebar do mesmo
    jeito;
  - cair na alternativa da cadeia quando a pessoa rola o alvo para fora: as variantes dizem "Abra a seção Criar..."
    com a seção aberta, o que mentiria.
- **Esperas mais curtas no smoke.** A janela invisível da automação desenha poucos quadros por segundo (medi cerca de
  1 por segundo numa sessão isolada com a máquina carregada), e a espera padrão por geometria estável é de 16
  quadros. As conferências novas depois de trocar de passo ou apertar `Tab` usam `QUADROS_CURTOS` (2 + 3 quadros);
  o card é posto no mesmo quadro da troca, e a reação do tour vem no seguinte. A troca de zoom continua com a espera
  completa. Isolados, o SA5 caiu de 392 s para 214 s e o SA8 de 377 s para 223 s.

**Validação.**
- Testes que falham antes: sem a correção 1, o U-layout reprova em 15 casos (8 da matriz em 417×289 e 7 nomeados).
  Sem a correção 2, reprova em 8 (portão e recorte). O SA5 isolado reprova em `rail-projetos` a 416×289 e o SA8 em
  "o tour desfez a rolagem da sidebar feita pela pessoa" (587 voltou a 28). Os dois smokes rodaram com os arquivos
  de produção do HEAD anterior no lugar e os cenários novos.
- Sem laço de layout: com o card parado, nenhuma mutação de estilo em 8 s, tanto ancorado (1280×800) quanto na
  coluna (416×289).
- Cada commit novo conferido sozinho (tsc, vitest de onboarding e setup, eslint e N-geo): 716 e 724 testes.
- Em `app/`: `npm run build` ok; `npm run lint` sem erro nem aviso; `npm test` 1839/1839;
  `npm run test:frontend` 2035 testes e 1 ignorado; N-geo com o Node 22.22.3 (`node --test`) 16/16; U-layout com o
  Node 22 509/509.
- `npm run test:canvas-smoke` completo sob o lock: exit 0 em 12 min 11 s (21:09–21:21, load average de 8 a 19). O
  SA5 levou 16 s e o SA8 45 s dentro do smoke.

## 2026-09-26 — Tutorial do canvas: estabilização do smoke, corte do bundle e verificação

Registro gravado às 22:32 (-03).

- **Smoke SA8** (`166384b0`):
  - o primeiro redimensionamento do SA8, logo depois do reload do SA7, estourava o prazo de 5 s com a máquina carregada: 2 de 3 execuções completas falharam com load entre 12 e 20;
  - a espera do resize no tutorial agora usa `ONBOARDING_TIMEOUT_MS`, e a falha informa o tamanho pedido e o lido;
  - nenhuma asserção mudou: o corpo do `sa8()` ficou idêntico nos três commits, conferido por um verificador.
- **Bundle** (`8f211814`):
  - o chunk do CanvasView, carregado no startup, tinha crescido 10,1 kB gzip com o tutorial, contra os 3–4 KiB do plano;
  - aplicada a mitigação do plano: o canvas fica só com um procurador da store (`onboarding-store-proxy`, 4,7 kB crus), e a store, o estado e o catálogo vêm em chunk preguiçoso;
  - medido pelo build: CanvasView de 324,46/98,92 para 302,64/91,44 kB (cru/gzip), ou seja, +2,62 kB gzip sobre a main; store 21,93/7,49, catálogo 2,51/0,69 e interface 32,01/10,58 kB;
  - a decisão automática sai 18 ms mais tarde na mediana sem ponte (da hidratação à decisão, p50 de 22 para 40 ms). No app real, com a ponte, o ruído da máquina é maior que essa diferença.
- **Guia** (`8e81e777`): a seção Ferramentas do GUIA-USUARIO passou a usar os rótulos reais da interface.
- **Verificação adversarial** do corte do bundle e do SA8 (2 lentes), sem nenhum bloqueante:
  - 716 testes do onboarding e 1031 do canvas;
  - 14 mutações do procurador, das quais 11 foram pegas pelos testes (as 2 sobreviventes e as bordas de robustez ficaram na task de não bloqueantes);
  - app real com a ponte, cobrindo primeiro boot, retomada, usuário antigo e chunk ausente (o canvas segue de pé).
- **CI do PR #96** em `8e81e777`: 21 checks verdes nos 4 SOs; o smoke com os cenários do tutorial leva de 104 a 146 s por runner. O benchmark do terminal (`renderer-xterm count=1`) reprovou uma vez em `166384b0` por ruído e passou ao rodar de novo; o mesmo cenário já tinha acusado ruído no PR #95 (task aberta).
- **Otimização do processo**, pedida pelo Felipe:
  - a CI dos 4 SOs passou a validar em paralelo, no lugar das repetições locais do smoke (~12 min cada nesta máquina);
  - os ajustes de uso rodaram num segundo worktree ao mesmo tempo que a estabilização.

## 2026-09-26 — Tutorial do canvas: três ajustes de uso da revisão

Registro gravado às 22:33.

A revisão de uso apontou três problemas não bloqueantes, todos medidos no app real (felixo devtools, perfil isolado).
Cada um virou um commit com teste que reprova no código anterior.

**1. Pergunta de agente por cima do tour** (`fix(onboarding): o tour cede a um diálogo modal aberto por cima dele`).
O AgentQuestionDialog não pega o foco e escuta o teclado na janela. Aberto por cima do tour, o overlay cobria o card,
mas o foco continuava nele: o Enter no Próximo avançava o tour por baixo do modal, sem anúncio, e o Esc de quem achava
estar no tour dispensava a pergunta do agente. Agora, enquanto houver `[aria-modal="true"]` na tela, o card e o aviso
ficam `inert` no mesmo passo. O foco que estava no tour vai para o body, e as teclas passam a ser do diálogo. Quando o
diálogo fecha, o foco volta ao controle do tour que o tinha, só se ninguém o pôs em outro lugar. As regras são puras
(`nextModalYield` e `resolveFocusAfterModal`).
- Nenhum evento avisa que um diálogo montou, e o plano proíbe observar mutações no body. A conferência é um
  `querySelector` a cada 250 ms, só com o tour ou o aviso na tela, mais uma a cada troca de foco. Alternativas
  descartadas: `MutationObserver` só nos pais atuais dos diálogos (quebra calado se um diálogo mudar de lugar) e
  mudar o AgentQuestionDialog para avisar o tour (é de outra feature, e não foi preciso).
- Nos até 250 ms entre o diálogo abrir e o card ficar inerte, os botões do card consultam o modal na hora e não fazem
  nada. O Esc nesse intervalo continua indo para o diálogo, como o plano já previa.

**2. Menu Ajuda pelo teclado** (`fix(onboarding): Tab para fora do menu Ajuda fecha o menu e volta ao botão`). O
menu é um portal no fim do body. O Tab no último item levava o foco ao topo do app com o menu aberto, e o Shift+Tab no
primeiro caía no "Dispensar" do NoticeToast. Escolhido o padrão que o app já usa para menu em portal, o do
FelixoSelect: o Tab fecha o menu e o foco fica no gatilho. O Tab entre os botões do menu segue normal; só o que sairia
dele fecha e devolve o foco ao botão Ajuda. Setas ficaram de fora, porque o menu é um grupo de botões com texto de
estado, não uma lista de opções. O `aria-controls` do botão continua apontando o menu mesmo fechado, como no
FelixoSelect e no botão Organizar. A regra é pura (`helpMenuKeyAction`, com o `tabTrapTarget` do HandoffDialog).

**3. Texto do passo 6** (`fix(onboarding): o último passo afirma só o que o tutorial garante`). "Nada foi criado e
nenhum agente foi aberto" ficava falso quando a pessoa criava um agente com o tour aberto, o que o T1.d permite. O
texto passou a ser "O tutorial não criou nada nem abriu agentes.", no catálogo pt-BR. A versão do tour não subiu: é
correção de texto de um roteiro que ainda não saiu, e subir marcaria "Atualizado" sem nada novo. A tabela do plano
guarda o rascunho antigo; o texto em vigor é o do catálogo. O guia do usuário também passou a dizer o que o tutorial
não faz, em vez de como o app está.

**Validação.**
- Testes que falham antes: 9 do item 1 (7 no U-layout e 2 no U-ui, o `inert` do card e do aviso), 6 do item 2
  (U-layout) e 1 do item 3 (U-msg).
- Smoke: o SA3 grava uma pergunta de verdade na fila de pedidos do perfil isolado e confere o card inerte, o foco fora
  dele, o Enter sem avançar, o Tab sem entrar no card, a tecla da opção indo para o diálogo, o foco de volta ao Próximo
  e, com o foco levado para fora, nada puxado de volta. O SA2 percorre o menu Ajuda com Tab até sair e confere o menu
  fechado com o foco na Ajuda, e faz o mesmo com Shift+Tab no primeiro controle e com Esc.
- Só esses dois cenários rodaram, isolados, sob o lock do devtools, com o Vite servido deste worktree (conferido pelo
  diretório do processo). Com as correções, o SA2 passou em 6 s e o SA3 em 49 s. Com os arquivos de produção
  anteriores e os cenários novos, o SA2 reprovou em "Tab no menu Ajuda levou o foco para fora com o menu aberto" (o
  foco foi para a região do canvas, no topo do app, como o revisor mediu) e o SA3 em "o card ceder à pergunta do
  agente". O `test:canvas-smoke` completo fica para o CI dos quatro sistemas.
- Em `app/`: `npm run build` ok (CanvasView 324,49 kB, antes 324,46; o chunk do tutorial é preguiçoso); `npm run
  lint` sem erro; `npm test` 1843/1843; `npm run test:frontend` 2051 testes e 1 ignorado; os testes do tutorial
  também com o Node 22.22.3 (vitest), 715/715. Nenhum teste novo é `node:test`.

**Limitações que sobram.**
- O AgentQuestionDialog continua sem puxar o foco e sem prender o Tab. Isso é da feature dele e não mudou; com o card
  inerte, o foco fica no body até a pessoa responder ou dispensar.
- Um diálogo modal que não use `aria-modal="true"` não é reconhecido. Hoje os dois do canvas usam.

## 2026-09-26 — Tutorial do canvas: o foco cedido a um diálogo não fica no body

Registro gravado às 23:13.

A verificação de uso achou um bloqueante no item 1 do registro anterior. Ali está escrito que o foco que estava no tour
vai para o body, "e as teclas passam a ser do diálogo". Não passavam todas: o body conta como canvas para o React Flow
(`deleteKeyCode` Delete e Backspace) e para o atalho `q` (`isCanvasFocused`). Com um bloco selecionado e a pergunta de
um agente por cima do tour, Delete ou Backspace apagavam o terminal por baixo do modal, sem desfazer (a sessão do PTY é
solta e o nó sai do disco), e `q` trocava o modo seleção/pan. Antes do item 1 o foco ficava num botão do card, que tem
`nokey`, e essas teclas não faziam nada.

**Correção** (`fix(onboarding): o foco cedido a um diálogo espera num ponto neutro, não no body`). Ao ceder, o foco que
era do tour vai para um ponto de espera (`OnboardingFocusHold`) antes de o card ficar inerte: um div invisível, irmão
do card e do aviso, com `nokey` e `tabIndex=-1`, sem papel, nome nem texto. Quando o diálogo fecha, o foco volta ao
controle do tour; a espera não conta como foco levado para outro lugar. As regras são puras: `focusHoldOnYield` e o
`hold` de `resolveFocusAfterModal`.
- Descartado: não tornar o card inert. Ele voltaria à ordem de Tab e à árvore de acessibilidade por baixo do modal.
  Mexer no AgentQuestionDialog continua fora (é de outra feature).

**Smoke.** O SA3 seleciona o bloco da fixture pelo teclado do React Flow (Enter no bloco focado), abre uma pergunta de
verdade com o foco no Próximo e aperta Delete, Backspace e `q`. Também corrigi uma instabilidade do próprio SA3
(`fix(smoke): SA3 espera o foco assentar depois de criar o agente`). Na primeira rodada, o TerminalMenu devolveu o foco
ao botão Agente num quadro depois de criar o terminal, e isso aconteceu depois de o smoke focar o Próximo. O Enter sob a
pergunta abriu um segundo agente, e a conferência reprovou em "o foco voltar ao Próximo". A linha do tempo do foco
mostrou a ordem.

**Validação.**
- Testes que falham antes: 5 dos 6 novos (3 no U-layout e os 2 do U-ui, que nem carregam sem o componente); o sexto é
  guarda e passa nos dois.
- Reprodução: SA3 isolado sob o lock, com o Vite deste worktree, com o código anterior e o cenário novo (23:02–23:03).
  Reprovou em "Delete apagou o bloco selecionado por baixo da pergunta", com o foco no BODY e o bloco fora do DOM e do
  disco. Com a correção (23:07–23:08), SA2 em 6,8 s e SA3 em 77,5 s, exit 0: o bloco fica, o modo não muda, o foco
  está na espera e volta ao Próximo quando a pergunta fecha.
- Em `app/`: `npm run build` ok (CanvasView 324,49 kB, igual; `onboarding-ui-entry` 34,14 kB); `npm run lint` sem
  erro; `npm test` 1843/1843; `npm run test:frontend` 2057 testes e 1 ignorado; os testes do tutorial com o Node
  22.22.3, 721/721.

**Limitações que sobram.**
- O AgentQuestionDialog continua sem puxar o foco e sem prender o Tab. Da espera, o Tab leva ao canvas, e um bloco
  focado ali ainda recebe Delete por baixo do diálogo, como sem o tour (o verificador mediu isso sem o tutorial aberto).
- Se o tour fechar por fora (store) com o foco na espera e o diálogo aberto, a espera desmonta e o foco cai no body.
  Nenhum caminho da interface fecha o tour com o diálogo aberto e o foco na espera: os botões do card não agem sob o
  modal, e para chegar à Ajuda o foco precisa sair da espera.

## 2026-09-26 — Tutorial do canvas: a posição do card congela sob um diálogo modal

Registro gravado às 23:35.

A CI do PR #96 no `0f0a8f15` reprovou o SA3 no Ubuntu (Validate ubuntu-latest, run 36288181228): durante a medição de
estabilidade depois do Enter sob a pergunta de um agente, o card foi de `left` 294 a 58. A captura mostrou o card no
alvo reserva do passo 2 (menu do canvas), com outro texto ("Abra o menu do canvas para ver Criar e o botão Agente."),
por baixo da pergunta. Nos outros três sistemas o SA3 passou: o reposicionamento só acontece se algum observador
dispara com o diálogo aberto.

**Causa.** O AgentQuestionDialog tem um fundo `fixed inset-0 z-60`. A resolução do alvo (`evaluateTarget`) confere o
centro de cada alvo com `elementFromPoint`, e com o diálogo aberto o centro de todos cai no fundo: cada alvo da cadeia
é rejeitado e o card cai no último, que é usado sem esse teste. O tour cedia o foco e o teclado ao diálogo, mas não a
posição.

**Correção.**
- `placementFrozen` (pura, em `onboarding-layout.ts`): com um diálogo modal aberto, o que já foi posicionado fica onde
  está. A primeira posição sai mesmo assim, para o card nunca ficar sem lugar.
- `useSurfacePlacement` confere o diálogo no próprio posicionamento (o tour percebe o diálogo até `MODAL_CHECK_MS`
  depois) e recebe `frozen` (o estado cedido) nas dependências: quando o diálogo fecha, os observadores são refeitos e o
  card é reposicionado na hora. Vale para o card e para o aviso de novidade.
- O `useYieldToModal` passou a ser chamado antes do `useSurfacePlacement`, para o estado cedido chegar ao
  posicionamento. O efeito de abertura continua declarado depois do posicionamento.
- Descartado: fazer o teste do centro olhar através do fundo do diálogo. Seria preciso reconhecer o fundo de cada
  diálogo, e o card continuaria se mexendo por baixo de um modal sem motivo.

**Validação.**
- O SA3 ganhou `conferirCardParadoSobAPergunta`: com a pergunta aberta, dispara um `resize` e exige o mesmo alvo, o
  mesmo texto e a mesma posição. Sem a correção reprovou de forma determinística às 23:27 (isolado sob o lock, Vite
  deste worktree): `{"antes":{"ancora":"criar-agente","left":294,"top":54},"depois":{"ancora":"rail-menu","left":58,"top":12}}`,
  igual à CI.
- `onboarding-layout.test.ts`: 4 testes novos. Um documenta a causa (com o fundo cobrindo tudo, `resolveStepTarget`
  cai no reserva), e três cobrem `placementFrozen`.
- Em `app/`: `npm run lint` sem erro; `npm run build` ok (CanvasView 302,67/91,44 kB, igual; `onboarding-ui-entry`
  34,33/11,20 kB); `npm test` 1843/1843; `npm run test:frontend` 2078 testes e 1 ignorado.
- Com a correção, SA2 e SA3 isolados sob o lock (23:34–23:36, exit 0): SA2 em 7,6 s e SA3 em 72,3 s. O card fica no
  mesmo alvo e no mesmo lugar com a pergunta aberta, e as conferências do foco cedido continuam passando.

## 2026-09-28 — Cadeia de contas: Resumo de Decisão

Registro gravado às 13:47. Task "Contas — definir política de cadeia, elegibilidade e ordem de fallback", na
branch `feat/cadeia-contas`, a partir de `origin/main` `116f0569`. A regra está em
[`POLITICA-CONTAS.md`](../projeto/POLITICA-CONTAS.md) e o plano (camadas, dados, máquina de estados, commits e testes) em
[`PLANO-CADEIA-CONTAS.md`](../projeto/PLANO-CADEIA-CONTAS.md).

CONTEXTO: o app já guardava várias contas por CLI, cada uma com a própria pasta de login, mas quando uma conta
batia o limite de uso nada ajudava a seguir em outra. Trocar de conta pode mudar quem paga, então a cadeia é uma
decisão de produto antes de ser código. A investigação (5 frentes em paralelo: contas, limites, renderer,
histórico e custo) achou defeitos que a cadeia precisava ver resolvidos antes:
- queda silenciosa para o Login do sistema quando a lista de contas falhava;
- reanexar um bloco a uma sessão viva sem comparar a conta;
- terminal de conta própria herdando chaves de API do ambiente do app;
- descoberta de sessão do Claude ignorando o `CLAUDE_CONFIG_DIR` do perfil;
- relançamento do Codex reenviando o texto de passagem;
- motivo de disponibilidade cru no log QA;
- dois classificadores de falha (main e renderer) com precedência invertida e "429" solto virando limite.

As decisões foram pedidas ao dono em 28/09/2026, pelo AskUserQuestion, em duas rodadas de 4 perguntas.

ALTERNATIVAS (a recomendação dada e a resposta do dono):

| # | Pergunta | Recomendação | Decisão do dono |
| --- | --- | --- | --- |
| 1 | Quando a troca precisa de confirmação | sempre | **Sempre**: toda troca mostra origem, destino e motivo |
| 2 | Cadeia só no mesmo provedor ou cruzando provedores | mesmo provedor | **Qualquer provedor** (Codex, Claude, Gemini e Openia/OpenRouter), inclusive trocar de provedor |
| 3 | Padrão e ordem | desligada, ordem manual | resposta livre ("várias opções"), detalhada nas perguntas 5 e 6 |
| 4 | Terminal aberto que bate o limite | bloco novo com contexto, depois da confirmação | **Igual**: o antigo fica parado e intacto |
| 5 | Quais estratégias | — | **Ordem manual, Rodízio, Mais quota primeiro e Assinatura antes de uso**, com a nota "uma conta com 50% de limite mas com 20X é maior que uma 100% com 1X" |
| 6 | Padrão ao instalar e ao atualizar | desligada; ao ligar, ordem manual | **Igual** |
| 7 | O orquestrador do chat também pede confirmação | task própria | **Sim, já** |
| 8 | O que esta task entrega | política + base no código | **Tudo agora** |

Recomendações que o dono não seguiu: escopo só no mesmo provedor (2), orquestrador numa task própria (7) e
entrega só da política com a base (8). Com o escopo maior, o plano conta com: confirmação obrigatória com o custo
explícito (tamanho do contexto e quem paga), cadeia desligada por padrão e commits pequenos, cada um verde, com as
mudanças de comportamento marcadas.

Descartado pelo dono, sem reabrir: troca automática sem confirmação, teto de gasto pré-autorizado, migração de
sessão viva e relançar o mesmo bloco em outra conta.

Alternativas técnicas descartadas no plano, cada uma conferida no código ou no pacote instalado:
- guardar a cadeia no `cli-accounts.json`: sem escrita atômica nem lock, e leitura corrompida virava lista vazia.
  Ficou o SQLite, com `BEGIN IMMEDIATE` e compare-and-set (precedente: o estado do tutorial);
- detectar no renderer: a detecção fica no `onData` do PTY no processo principal, com custo O(1) por pedaço e
  leitura adiada da cauda do replay;
- reaproveitar o `NETWORK_FAILURE_PATTERN` (`cli-diagnostics.cjs`): largo demais para a saída de um agente
  ("proxy", "network");
- índice único na posição dos membros: reordenar com UPDATEs em sequência colide no meio da transação;
- ler o multiplicador "20x" da CLI: nenhuma CLI instalada o publica (`claude auth status --json` não traz o
  `rateLimitTier`). Vale a declaração da pessoa;
- filtrar as credenciais herdadas no `buildEnv`: o `node-pty` serializa `undefined` como o texto `"undefined"`, por
  isso o filtro ficou na junção do spawn (`applyProfileEnv`);
- timer novo para o prazo das decisões do orquestrador: usa a varredura de 60 s que já existia.

O plano saiu de 3 propostas independentes, julgadas por 2 juízes. Venceu a de ângulo "risco", com os enxertos dos
juízes.

DECISÃO:
- as 8 decisões acima, mais três derivadas do aceite: só é apta a conta com login conferido pela própria CLI,
  naquela conta, há no máximo 15 min; a quota só pesa com medição atual (valor antigo nunca prova nada); o Gemini
  fica fora até ter checagem de login;
- "Mais quota" compara capacidade absoluta: `menor restante% entre as janelas × multiplicador`;
- interpretações adotadas sem reabrir decisão: todo bloco nasce fixo (`pinned`), inclusive os antigos, e só é
  `chain` o aberto com "Automática (cadeia)" ou criado como continuação confirmada; o Login do sistema pode ser
  origem de aviso, nunca membro nem destino; vale a decisão 6 contra a task irmã que pedia pausar ou encerrar o
  processo antigo: o app nunca escreve no terminal antigo nem o encerra;
- princípios fail-closed P1–P9 (trava no serviço, processo vivo não troca de conta, elegibilidade conservadora,
  classe errada nunca troca, nada reenviado sem prova, decisão só no SQLite com compare-and-set, segredo não sai,
  caminho quente barato e sem laço), cada um com teste.

VALIDAÇÃO: cada commit de correção traz um teste que falha antes (a saída está na mensagem do commit), e as
mudanças de comportamento são marcadas. Os commits 1–14 do plano (política, vocabulário das CLIs, taxonomia, leitor
de reset, adaptador do orquestrador, classe no evento do chat, redação do log QA, migração 017 com repositório
compare-and-set, registro de contas atômico, isolamento de credenciais, conta na sessão do PTY, retomada por conta,
relançamento do Codex e queda silenciosa) estão na branch; os SHAs estão na entrada de 28/09 do `IA.md` da raiz.
Validação final: registrada ao fim da branch (suíte completa, vitest, lint, build, bancada do caminho de saída com
Modo Performance ligado e desligado, smoke de ponta a ponta nos 4 sistemas e verificação manual no Linux com duas
contas Codex reais).


---

## Registros arquivados

Registros antigos movidos, na íntegra e sem edição, para o arquivo. A linha do tempo completa
é este arquivo mais os de `docs/ia-archive/`, em ordem cronológica.

- [2026-10-12] Registros de 2026-08 (66 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-08.md](docs/ia-archive/IA-ARCHIVE-2026-08.md)
- [2026-10-12] Registros de 2026-09 (95 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-09.md](docs/ia-archive/IA-ARCHIVE-2026-09.md)

## 2026-10-01 — Canvas: inventário operacional da superfície, gerado de dados e travado por teste

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Canvas — inventariar todos os elementos, estados e ações da superfície principal" (Notion 3ce91f95-497e-81fc-9c15-fff0cd5d931c). Início às 02:32.

### Contexto

O canvas reúne blocos, arestas, grupos, Mini Map, barra lateral, ferramentas, notificações, gaveta do terminal, diálogos de agente e overlays de outras features. A cobertura estava espalhada em testes isolados e no smoke. O `LAYOUT-SUPERFICIES.md` já inventariava tamanho e eixo, mas não estado, efeito, persistência nem lacuna. A task pede um inventário que sirva de contrato visual/E2E e que seja atualizado sempre que entrar uma tool nova.

### Decisão: dados tipados e três travas, em vez de um documento à mão

- **`app/src/features/canvas/inventory/`.**
  - `canvas-inventory-types.ts` define elemento, estado (os 8 da task), controle, teste e lacuna.
  - `canvas-inventory.ts` agrega os dados e gera o Markdown.
  - `data/` tem um arquivo por frente: `nodes`, `chrome`, `terminal`, `tools-workspace`, `tools-agents` e `overlays`.
- **Trava 1, `tsc`.** `NODE_INVENTORY: Record<CanvasNodeType, …>` e `TOOL_INVENTORY: Record<CanvasTool, …>`. Um tipo de bloco ou uma ferramenta nova sem entrada não compila. É o mesmo truque de `TOOL_LABELS` e `CANVAS_TOOL_FEATURES`.
- **Trava 2, `canvas-inventory.test.ts`.** O teste reprova quando:
  - o número de controles declarados de um arquivo difere do que o código tem (conta `<button`, `role="button"`/`"menuitem"`, `<FelixoSelect`, `<FelixoToggle` e `<ActivityRailButton`);
  - um componente de `src/features/canvas/components/` com controle não é dono de nenhum elemento;
  - o localizador de um controle não aparece no arquivo dono;
  - falta efeito ou falha conhecida;
  - um canal IPC citado não está no `preload.cjs`;
  - um teste citado não existe, ou a função de smoke citada não está no script;
  - uma lacuna não aponta um UUID de task.
- **Trava 3, `toMatchFileSnapshot`.** O `docs/projeto/INVENTARIO-CANVAS.md` é gerado e comparado com os dados. No CI (`CI=true`) o vitest não regrava, então editar um sem o outro reprova. Para regenerar: `npm run docs:inventario-canvas` (`vitest … -u`).
- **Escopo.** Os modais de `features/chat` ficam fora: o canvas não os importa, e o chat é legado. Entram os diálogos do canvas e os overlays de outras features renderizados sobre ele (onboarding, aviso das CLIs, atualização, escolha de link, avisos de hardware, alças de modal, tela de recuperação).

### Como foi levantado

- Seis agentes, um por arquivo de dados, leram o código seguindo cada handler até o efeito (estado, canal IPC, persistência) e a falha (aviso, estado de erro, `catch`). Cada um validou o próprio arquivo com `tsc`, `eslint` e o teste de contrato.
- Lacuna sem task existente ganhou um marcador temporário. Os marcadores foram agrupados por tema num script (`tasks-inventario.cjs`, fora do repositório), que abriu as tasks e trocou os marcadores pelos IDs.
- Os 63 IDs de tasks existentes citados foram conferidos contra a database: todos existem e estão abertos.
- Os quatro bugs de risco alto foram conferidos no código pelo coordenador:
  - `GroupNode.tsx` remove o grupo com `deleteElements`, e os filhos vão em cascata, sem confirmação;
  - `useFileNodeDocument.ts` grava com `void …write()`, sem olhar o resultado;
  - `canvas-storage.ts` devolve `[]` quando `canvas:list` falha;
  - o balão de erro do `DictationButton` é `absolute top-full` dentro da topbar, que tem `overflow: hidden` (`index.css`, `.felixo-canvas-topbar`).

### Números

- 93 elementos: 8 blocos, 16 ferramentas e 69 outras superfícies.
- 349 controles; só 53 (15%) têm um teste que os exercita especificamente.
- 4 elementos sem teste nenhum.
- 271 lacunas (10 de risco alto, 145 médio e 116 baixo):
  - 98 ligadas a 63 tasks existentes;
  - 173 em 12 tasks novas: 6 de bugs (perda de dados, remoções destrutivas, falha mostrada como sucesso, carregamento, foco/acessibilidade e layout), 5 de cobertura de smoke (blocos, moldura, terminal, ferramentas e overlays) e 1 de sobreposição.

### Validação

- `npx tsc -b`, `npx eslint .` e `npx vitest run src/features/canvas/inventory` com `CI=true`: 9/9.
- **Mutação: 10 de 10 mortas, cada uma pelo portão e pela mensagem esperados.**
  - botão novo sem entrada;
  - componente novo sem dono;
  - ferramenta sem entrada (`tsc`);
  - localizador inexistente;
  - canal IPC inexistente;
  - teste inexistente;
  - função de smoke inexistente;
  - lacuna sem UUID;
  - efeito vazio;
  - documento editado à mão.
- **Suíte inteira do renderer (`CI=true npx vitest run`): 2816 passaram, 2 pulados e 1 falha.** A falha é `context-file-delivery.shell.test.ts`, de outra mudança (`2da83fe`), que abre o PowerShell. Isolada, passa duas vezes seguidas: é instabilidade de tempo com a suíte em paralelo.

### Achado de ferramenta

No Node 25.3.0 (Windows), `fs.rmSync(arquivo, { force: true })` **não apaga e não lança erro** num caminho com acento (`F:\Programação\…`); `fs.unlinkSync` apaga. Com `F:\sl`, sem acento, o `rmSync` funcionou em 30/09. É provável que seja a mesma família do `fs.cpSync` que quebra o `bundle-npm-runtime.cjs` no Node 25. A evidência foi anexada à task `3eb91f95-497e-8197-89ea-e8a7a876a357`.

### Limitações

- Os efeitos e os bugs vêm da leitura do código. Ninguém clicou nos 349 controles numa janela, e só os 53 com teste específico têm efeito visto por teste.
- O documento gerado tem cerca de 350 KB: é o contrato inteiro, não um resumo.
- A contagem de controles é por padrão literal. Um botão renderizado por um componente de outra pasta, ou montado sem nenhum desses padrões, não é contado.

## 2026-10-01 — Terminal: Leitura, o Markdown da tela, por bloco

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Terminal — validar snapshots e E2E Markdown em todos os providers" (Notion 3ce91f95-497e-819b-888d-e4712f09af04), com as tasks irmãs do mesmo tema: modo texto/Markdown por sessão (3ce91f95-497e-818a), parser incremental (3ce91f95-497e-8176), seleção/cópia/acessibilidade/desempenho (3ce91f95-497e-81cf), o `stripTerminalAnsi` com ESC 7/8 (3eb91f95-497e-8163) e o link com caractere invisível (3ea91f95-497e-8183). Início às 08:44.

### Decisões do Felipe (Trilha B)

- Fazer todas as tasks do tema, não só a de testes.
- Gravar as saídas reais com as contas dele; os testes usam só as gravações.
- Corrigir aqui a linha que o adaptador do chat não entende.
- Montar o pacote do Linux aqui e rodar o teste de tela nele.
- A Leitura aparece nos dois lugares (aba da gaveta e prévia do cartão), lê **só a tela do terminal**, vem desligada e liga por bloco.

### O que a investigação achou

- As CLIs já desenham o Markdown no terminal: título em negrito (o Codex mantém o `##`), código com cor de sintaxe, tabela com traços de caixa (Claude) ou em colunas (Codex), citação com `▎` ou `>`. A Leitura reconstrói a estrutura desse estilo de célula.
- **Gemini:** o Google recusou a conta pessoal do Felipe no Gemini CLI 0.62.0 ("This client is no longer supported for Gemini Code Assist for individuals… migrate to the Antigravity suite"). Só a tela de login foi gravada; o Gemini fica sem perfil de leitura.
- O arquivo de configuração do sistema do Gemini (`GEMINI_CLI_SYSTEM_SETTINGS_PATH`) só vale numa pasta do root. Para não atualizar o Gemini durante a gravação, o gravador usa uma pasta pessoal própria (`GEMINI_CLI_HOME`) que aponta para o `~/.gemini` real, menos o `settings.json`.
- O Codex aceita `-c check_for_update_on_startup=false`, mas a confiança na pasta por `-c projects."…".trust_level` não evita o diálogo. A pasta de gravação foi confiada uma vez (fica no `config.toml` do Codex).
- **Privacidade:** o Claude escreve na tela normal, ao abrir, um aviso com as regras de permissão do `settings.json` do usuário; na tela cheia esse texto fica escondido atrás. O plano da conta vem separado por um salto de cursor (`Claude` `CSI 48 G` `Pro`). As primeiras gravações tinham os dois; foram refeitas antes de qualquer push, e a branch foi reescrita num commit só.
- Sem as configurações do usuário, o Claude usa a tela clássica; a tela cheia vem de `tui: fullscreen`. Há gravação dos dois modos.
- `stripTerminalAnsi` deixava o "7" do `ESC 7`, apagava o texto de um hyperlink OSC 8 fechado com `ESC \` (o OSC guloso ia até o último fechamento) e soltava o conteúdo de DCS/APC.
- `parseAdapterLine` transformava uma linha não-JSON no meio do stream em `type: 'error'`: o chat encerrava a resposta como falha e a linha sumia dos Logs da CLI.

### O que mudou

- `terminal/reading/` (novo): `reading-lines` (buffer → linhas com estilo, incremental, limite de 2.000 linhas), `reading-profiles` (Claude, Codex e `texto`), `reading-blocks` (falas e blocos, com `sameReadingContent`), `reading-markdown` (escape de toda pontuação ASCII, autolink só para `http(s)`, ênfase pelas regras de flanco), `terminal-reading` (montagem com cache das falas).
- Store: `getReadingSource` e `subscribeOutput` (via `onWriteParsed`), também no store adiado e no falso.
- `TerminalDrawer`: abas Terminal | Leitura; a Leitura por cima do xterm, que fica `inert`/`aria-hidden` e não muda de tamanho. `readingMode` no `TerminalNodeData`, persistido. `TerminalReadingPreview` no cartão, sem controle dentro do botão.
- `scripts/record-terminal-fixture.cjs` (novo): grava a CLI real num PTY com tela virtual, responde à confiança na pasta, para antes de sair, anonimiza pedaço a pedaço e recusa salvar segredo, plano, regra de permissão ou `settings.json` na tela (as duas telas).
- PTY roteirizado: `__felixo_smoke_gravacao_<nome>__` toca uma gravação; as respostas do terminal (OSC 10/11, DCS) deixaram de ser ecoadas como texto.
- `stripTerminalAnsi`: ESC de um caractere com intermediários, OSC/DCS/APC sem atravessar `ESC`; sai o `RESIDUAL_ESCAPE` do detector de retomada.
- Link com invisível: o destino cru segue numa propriedade só aceita com invisível de fato, e a dica e o menu mostram `⟨U+200B⟩`. Vale para link, referência e autolink.
- `parseAdapterLine` devolve `{ cliEvent, parseError }`; a linha aparece como **Linha não reconhecida** nos Logs da CLI e a resposta segue.

### Validação local

- `tsc -b` (no `npm run pack`) e `eslint .` limpos.
- Vitest: 2919 aprovados, 5 pulados (inclui a medição opcional da Leitura).
- Suíte de node: 2378 aprovados no Node 25.9 e no 22.22 (1 pulado nos dois).
- Smoke completo em Xvfb 1280×800 (fonte): sessões A–F aprovadas; F em 281 s (C 187 s, D 128 s, E 65 s).
- **Pacote do Linux** (`npm run pack`, `release/linux-unpacked`): sessão F aprovada no binário empacotado, com o log `Origem: empacotado (…/felixo-ai-core)`, em 181 s.
- Medição (`FELIXO_READING_PERF=1`), i5-6200U com carga ~14: 2.161 linhas no buffer, 2.000 lidas; mediana de 14 ms por redesenho (p95 45 ms), eram 52 ms antes do cache das falas.

### O que ficou de fora (tasks abertas)

- Gemini: conta pessoal recusada no Gemini CLI 0.62; sem perfil de Leitura (3ec91f95-497e-8113).
- Leitura: palavra partida pela largura da CLI, código sem cor e regravação a cada versão nova das CLIs (3ec91f95-497e-8122-a08b).
- Topo do app: na captura com viewport emulado de 1600 px, a busca cobre o nome do app; conferir numa janela real (3ec91f95-497e-8122-b2ca).
- Efeito colateral da gravação: o Codex guardou no `config.toml` a confiança na pasta `~/.cache/felixo-ai-core/fixture-recordings/codex`.

### Fechamento (CI, merge e release)

- **PR #102, 3 commits** (a branch foi reescrita num commit só antes do primeiro push, para as gravações antigas do Claude com a regra de permissão nunca saírem da máquina).
- CI: `Validate` passou nos quatro runners, com o smoke rodando as sessões A–F; a sessão F levou 66 s (macOS), 69 s (Ubuntu), 74 s (ARM) e 85 s (Windows). `Benchmarks (macos-latest)` reprovou no gate já conhecido `renderer-xterm count=1` (delta de heap do stream +131 %) e passou na reexecução.
- **Merge e release.** Squash no `main` como `99bd562` às 12:27; CI do `main` verde; release **v0.1.431** publicada às 12:28, com os instaladores dos três sistemas e os smokes de release (incluindo o exploratório do Windows) verdes.


## 2026-10-01 — Canvas: gate visual com evidência, repetição registrada e smoke no app empacotado

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Canvas — criar gate CI de evidência visual, estabilidade e regressão" (Notion 3ce91f95-497e-8148-92da-ff24b14b270c). Início às 14:38. Retoma as fatias 3–5 que tinham ficado paradas por decisão em 14/09.

### O que já existia (medido antes de mudar)

- O smoke do canvas já era check obrigatório no `Validate` dos quatro runners, com as sessões A–F: montagem, topbar/sidebar/canvas visíveis, Tab, foco ao abrir ferramenta, fixture com todos os blocos, oclusão, auditoria de acessibilidade, interações (com notificações), reload sem duplicar, viewport mínimo, zoom, matriz tema × viewport × DPR, elementos abertos em 320/1280 px, fonte maior, movimento reduzido e locale.
- O Linux, que em 14/09 pulava o smoke, roda desde a correção do `--no-sandbox` (subtask 3db91f95-497e-814d, Concluída).
- Faltava: smoke no app empacotado na CI; artefato de falha com versão, commit e log nos três sistemas (o log só subia no Linux e só na falha); política de repetição e triagem de flake; vários agentes na matriz; e o guia do que o gate exige de uma ferramenta nova.

### Decisões do Felipe (Trilha B)

- O smoke no app empacotado roda **só antes da release** (nem em todo PR, nem toda noite).
- Cada sessão pode **repetir até 2 vezes, qualquer que seja a falha**. Para a repetição não esconder flake, cada tentativa fica registrada e a sessão que só passa na repetição sai como "instável".
- A comparação visual continua **só estrutural** (sem referência pixel a pixel).
- Fechar a task inteira.

### O que mudou

- `scripts/canvas-smoke-evidencia.cjs` (novo, com teste): tentativas por sessão (`FELIXO_SMOKE_TENTATIVAS`, 1 a 3), relatório `build/canvas-smoke-evidencia/relatorio-<os>.json` (versão, commit, sistema, Node, Electron, origem do app, tentativas com duração, erro e captura, comando de reprodução), limpeza de segredo/pasta pessoal/usuário nos erros e no log, e o resumo da run (`GITHUB_STEP_SUMMARY`).
- `canvas-smoke.cjs`: as sessões viraram uma tabela (`SESSIONS`) rodada pelas tentativas; cada tentativa sobe uma instância nova e tem a própria captura (`canvas-smoke-failure-<sessão>-<os>-tentativa-<n>.png`); a repetição da sessão A descarta os cenários visuais da tentativa que falhou; o log do Electron é ligado em todos os sistemas e entra limpo no artefato.
- Sessão A: `checarVariosAgentes` — quatro cartões de agente (PTY falso) em cada tema, em 1280×800 e 375×667, com movimento reduzido: depois de "Enquadrar todos os blocos", todos dentro da janela, com nome e prévia, sem se sobrepor, sem rolagem horizontal e com geometria estável.
- `scripts/packaged-canvas-smoke.cjs` (novo, com teste): prepara o instalador da release como o `release-smoke.cjs` (AppImage extraído, DMG copiado, NSIS instalado) e roda o smoke nele.
- `release.yml`: passo "Smoke do canvas no app empacotado" no `Publish <os>`, antes de enviar os instaladores, e artefato `canvas-smoke-pacote-<os>`.
- `ci.yml`: o artefato `canvas-smoke-evidencia-<os>` sobe sempre (não só na falha).
- `GUIA-DESENVOLVEDOR.md`: seção "Gate visual do canvas (smoke)" — sessões, o que reprova, o que uma ferramenta nova precisa, repetição, tabela de instabilidades conhecidas, evidência e reprodução local (fonte e pacote).

### Validação local

- `eslint .` limpo; vitest 2919 aprovados; suíte de node 2386 (Node 25) e 2388 (Node 22) aprovados, 0 falhas; testes novos: 8 (`canvas-smoke-evidencia.test.cjs`) e 3 (`packaged-canvas-smoke.test.cjs`).
- Sessão A (fonte): uma rodada com falha provocada (o nome do agente fica num campo editável e o caso lia o texto do cartão) mostrou as 3 tentativas, cada uma do zero e com a própria captura, e o relatório `falhou` com o comando de reprodução. Corrigida a leitura (`aria-label` do corpo do cartão), a sessão A passou com os 4 casos de vários agentes. Outra rodada mostrou que a captura era tirada depois da limpeza do caso; a limpeza passou a rodar só no sucesso.
- AppImage montado localmente e smoke A–F nele pelo `packaged-canvas-smoke.cjs`: aprovado, com a sessão D instável (L10 falhou uma vez) — relatório `passou-com-instabilidade`. Task 3ec91f95-497e-81e7.

### Fechamento (CI, merge e release)

- **PR #103, 3 commits.** O `Release scripts` reprovou na primeira rodada: o `release-relevant.test.sh` deriva do `release.yml` os scripts que a release roda, e o `packaged-canvas-smoke.cjs` precisava entrar na lista de inclusão (o `canvas-smoke*.cjs` segue fora: mudar o smoke não publica). O relatório passou a citar o commit da branch no PR (o `GITHUB_SHA` de PR é o merge sintético).
- Instabilidades vistas e reexecutadas: `openia-image-service.test.cjs` no Windows (o teste de cancelamento ficou 240 s esperando o filho; passou depois) e o gate `renderer-xterm count=1` no Ubuntu (+177 %) e no macOS (+157 %), anotados na task 3e891f95-497e-81a6.
- **Merge** `1633b9f` às 16:11. A release **v0.1.432** (run 36912514190) **não foi publicada**: o smoke do canvas no pacote passou no Linux e reprovou no Windows e no macOS nas 3 tentativas. A evidência mostrou o app empacotado instalando as CLIs que faltam no runner ao abrir ("Preparando as CLIs de IA" cobrindo a barra de atividades em 320 px), o que o app de desenvolvimento não faz. A v0.1.432 ficou como pré-release, só com os instaladores do Linux.
- **Correção** `4870600` no `main`: o `packaged-canvas-smoke.cjs` roda com `FELIXO_AUTO_INSTALL_CLIS=0` e `FELIXO_DISABLE_AUTO_UPDATE=1`. CI do `main` verde de primeira; release **v0.1.433** publicada às 16:42 (run 36916252510) com o smoke do canvas no pacote aprovado nos três sistemas: Windows e macOS com todas as sessões de primeira; Ubuntu com a sessão A instável (SA1, `canvas:save` ainda gravando na amostra; task 3ec91f95-497e-811a).

## 2026-10-02 — Canvas: matriz visual com sobreposição da moldura, Modo Performance e execução noturna

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Canvas — automatizar matriz visual de viewport, tema, zoom e quantidade de agentes" (Notion 3ce91f95-497e-81c9-8c3b-def9ed09d58c). Início às 01:48.

### O que já existia

O smoke do canvas (sessão A) já rodava:

- tema × viewport × DPR, só com o layout base: overflow horizontal, estabilidade e elemento dentro da janela;
- zoom (`checarZoomVisual`);
- quatro agentes, sem um sobre o outro (`checarVariosAgentes`, do #103);
- elementos abertos em 320 e 1280 px;
- fonte maior, movimento reduzido e locale.

Faltava o que o aceite pede: limite de sobreposição entre as superfícies da moldura, prova de que o Modo Performance não perde elemento, e uma matriz noturna.

### O que mudou

- **`app/scripts/canvas-smoke-matriz.cjs`, puro, com `canvas-smoke-matriz.test.cjs`.**
  - `MATRIX_SURFACES`: topbar, sidebar, statusbar, pílula de zoom, Mini Map, e a lista Elementos ou o puck.
  - `findSurfaceOverlaps`: limite `OVERLAP_THRESHOLD_CSS_PX` = 1 px nos dois eixos.
  - `findMissingSurfaces`: só o Mini Map pode faltar, e basta a lista Elementos ou o puck.
  - `ALLOWED_OVERLAPS`/`ALLOWED_OUTSIDE`: cada entrada tem motivo, condição `when` e task.
  - `buildMatrixCases('pr' | 'completa')`, em ordem fixa.
- **`checarMatrizVisual`** (`canvas-smoke.cjs`), em cada caso:
  - enquadra (o mesmo enquadramento nos dois modos);
  - grava a evidência geométrica que já existia;
  - mede as superfícies e os blocos do fixture.

  No fim, compara cada caso com o Modo Performance (`felixo-ai-core.performance-mode`) com o mesmo caso sem ele. Os problemas se acumulam e saem juntos, cada um com o rótulo do caso (`dark-320x720-dpr2-performance`), o par e os retângulos.
- **Casos.** PR: 16 (2 temas × 7 viewports, mais o Modo Performance em 320 e 1280). Noturna (`nightly.yml`, job `canvas-visual-matrix`, `FELIXO_SMOKE_MATRIZ=completa`, só a sessão A, nos três SOs): 44 (2 temas × 11 viewports × Modo Performance ligado e desligado). As constantes de tema e viewport do smoke passaram a vir do módulo.

### Medido (smoke local no Windows, sessão A)

- 1280×800 e 3840×2160, nos dois temas e DPR: nenhuma sobreposição e nada fora da janela.
- **Defeitos reais, repetidos nas 3 tentativas:**
  - **320×720:** a lista Elementos cobre a sidebar expandida (187 × 54 px), e a pílula de zoom passa 147 px da borda direita (`right` 466,9 numa janela de 320);
  - **768×900:** o Mini Map cobre a pílula de zoom (200 × 40 px).

  Os três entram como permitidos só no caso em que ocorrem, apontando a task `3ed91f95-497e-8114-a246-f72c73ae50c4`. Assim o gate não esconde regressões novas atrás deles.
- **Modo Performance:** 9/9 blocos do fixture e as mesmas superfícies; só o Mini Map some, como manda o desenho.

### Determinismo

- A medida é de retângulos, não de pixels, e a ordem dos casos é fixa.
- Os IDs do fixture são fixos.
- O fundo estrelado (aleatório) fica fora das superfícies medidas.
- A tolerância de DPR e de fonte vem do limite de 1 px, e só no par que se cruza.

### Tropeço

Na primeira versão, a substituição da `checarMatrizVisual` apagou `MULTI_AGENT_NODES`/`readAgentCards`, que ficavam entre ela e `checarVariosAgentes`. O `eslint` não acusa referência indefinida nos `.cjs`; foi o smoke local que pegou, e o trecho foi restaurado do `HEAD`.

## 2026-10-02 — Performance: fallback gráfico com PC fraco reproduzível (`hardware-check`)

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Performance — validar fallback gráfico em PC fraco reproduzível" (Notion 3d591f95-497e-8192-b911-cdb759933401). Início às 06:51.

### Contexto

Três tentativas anteriores (08/09, 11/09 e 14/09) não tinham hardware fraco, e a pessoa já respondeu que não tem a máquina. O título pede um PC fraco **reproduzível**: em vez de esperar o hardware, a falha que um driver ruim provoca passou a ser provocada no próprio Chromium, dentro do bench que já abria o app real com perfil persistente (`app/scripts/hardware-check.cjs`).

### O que mudou (`app/scripts/hardware-check.cjs`)

- **Cenário `pc-fraco`:** modo Automático com `--disable-gpu-compositing`, que faz o Chromium recusar a composição por GPU, como faz com um driver bloqueado. Quatro aberturas, cada uma com os pixels medidos:
  1. a 1ª grava a recomendação;
  2. a 2ª mostra a recomendação em Configurações e aceita "Usar modo compatível";
  3. a 3ª abre em software pelo modo salvo no perfil;
  4. "GPU normal" volta ao caminho acelerado.
- **Cenário `gpu-caiu`:** derruba o processo de GPU 3 vezes no meio da sessão. Um cenário sem nenhuma queda passou a ser falha: o primeiro rodou verde sem testar nada, porque o CDP chama o processo de `"GPU"`, em maiúsculas.
- **`screenStats`/`looksBlack`:** decodificam a captura do compositor (`devtools:capture-page`) na própria página. "Tela preta" é menos de 0,2% de pixels claros, porque o tema é escuro. A primeira captura de uma janela recém-pintada sai vazia (0,04%) e é descartada.
- **No Windows,** o `stopApp` encerra a árvore com `taskkill /T /F`; antes só o processo principal saía, e os filhos prendiam a pasta. A limpeza do perfil só avisa, para não esconder o erro do cenário.
- **Na automação,** o Automático é software salvo pedido explícito de hardware, e esse pedido vence o modo salvo. Por isso detecção e aceite pedem `hardware`, e a 3ª abertura vai sem a variável, para valer o perfil.

### Medido (Windows 11, AMD Radeon integrada, driver 31.0.21923.1000)

| Abertura | GPU (CDP) | `gpu_compositing` | Pixels claros |
| --- | --- | --- | --- |
| 1, detecção (Automático + GPU recusada) | AMD | `disabled_software` | 0,71 % |
| 3, modo compatível (perfil) | Microsoft Basic Render Driver | — | 1,76 % |
| GPU normal | AMD | `enabled` | 0,71 % |

- A recomendação gravada foi `gpu-feature-disabled` / `gpu_compositing`.
- Na 2ª abertura, a recomendação apareceu, e "Usar modo compatível" gravou `software`.
- **Quedas da GPU:**
  - nas quedas 1 e 2, o Chromium relança o processo e segue na AMD;
  - na queda 3, ele desiste da GPU sozinho (`disabled_software`, renderer "Disabled");
  - a janela desenhou depois de todas;
  - **o app não gravou recomendação nenhuma**, o que virou a task `3ed91f95-497e-8114-ba5c-dd4e2f116800`.

### Limitação

Nenhuma simulação deixou a janela preta: o Chromium cai para software sozinho. A tela preta original nunca foi reproduzida. Ver se ela some numa máquina com o driver ruim continua sendo processo manual (task `3ed91f95-497e-8137-a5e8-f6ca84bb1804`, com o roteiro de 11/09). "Recarregar interface" com PTY vivo foi validado em 14/09 e não foi refeito.

## 2026-10-02 — Notion: validação real no app empacotado (Windows, release v0.1.433)

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Notion — validar conexão real, sincronização e matriz multi-SO no Canvas" (Notion 3d591f95-497e-810c-9f26-ff8a3e6e53ce). Início às 07:29.

### Como

A pessoa autorizou o token do perfil `felipe` da CLI (conexão A) e o do perfil `flavia`, só para leitura (conexão B), além de mutações numa tarefa `[TESTE]` na To Do da HOME. Os tokens foram lidos do store da CLI por um processo Python, só em memória, e toda saída passou por um redator.

O alvo foi o binário da **release v0.1.433 instalada**, numa segunda instância com perfil temporário. O empacotamento local deste dia saía com código 1 sem saída nenhuma; está registrado na task `3eb91f95-497e-8197-89ea-e8a7a876a357`.

Os scripts ficaram fora do repositório e dirigem o app por CDP: a ponte `window.felixo.notion.*` e o bloco Tarefas Notion. Para cortar a rede só do app, o processo principal subiu com `NODE_USE_ENV_PROXY=1` e `HTTPS_PROXY` numa porta morta, o que alcança o `fetch` do Node e não a máquina.

### Medido

- **Conexões.** A pelo formulário real ("Guardar conexão" responde "O token permanece cifrado no processo principal"), e B pela ponte. As duas passaram no teste. A lista expõe `id`, `label`, `profileId`, datas e `hasToken`, nunca o token.
- **Isolamento.**
  - A vê 117 databases e B vê 79, nenhuma em comum, e a To Do não aparece em B.
  - O cache de A lido com a conexão B volta vazio (`syncStatus: "empty"`).
- **Schema.** A To Do tem 23 propriedades. O título é `Tarefa` (`title`), o status é `Etapa`, e há o checkbox `Em andamento`. A lista trouxe 842 abertas.
- **Operações, cada uma conferida no Notion pela CLI.**
  - Criar: Etapa "Entrada".
  - Filtrar por `[TESTE] Felixo`: 1 tarefa.
  - Editar o título.
  - Concluir: Etapa "Concluída".
  - Reabrir: Etapa "Entrada".
  - Arquivar: a página passa a dar 404.

  O "concluir" usa a `Etapa` e nunca marcou `Em andamento`.
- **Offline.**
  - Na mesma sessão, `listTasks` responde `stale: true` com o snapshot. Com a rede de volta, `stale: false` e `fetchedAt` novo.
  - **Depois de reabrir o app sem rede, a interface não chega ao snapshot.** A conexão volta e o aviso é legível, mas a database não volta selecionada e a lista de databases vem só da rede. Virou a task `3ed91f95-497e-814c-b35c-d0e346233d3f`.
- **Vazamento:** nenhum dos dois tokens apareceu em nenhum destes lugares:
  - DOM, localStorage e sessionStorage;
  - respostas de IPC;
  - console;
  - os 95 arquivos do perfil (logs e cache SQLite incluídos);
  - as entradas novas do `%TEMP%`.

  O relatório salvo tem zero ocorrências de `ntn_`.
- **Limpeza.** As duas tarefas `[TESTE]` foram arquivadas, e os perfis temporários, que guardavam a credencial cifrada e o cache, foram apagados.

### Não validado

Linux e macOS: não há máquina. Seguem nas subtarefas `3d791f95-497e-818f-bf69-d1346e2caabb` e `3d791f95-497e-8106-be65-ed2014762ee8`.

## 2026-10-07 — Menus que não fechavam ao clicar fora; rolagem do Claude ligada por padrão

Registro de Claude opus yolo · Felixo-AI-Core.

### Menus flutuantes que ficavam abertos

Sintoma relatado: o menu de cor (clique direito num bloco) e o seletor "Colunas da tabela" do bloco Tarefas Notion
ficavam abertos depois de usar ou clicar fora, poluindo a tela.

Causa: o menu de cor só fechava com Esc, ao escolher uma cor ou pelo `onPaneClick` do React Flow, que só dispara no
fundo vazio do canvas; clique dentro de outro bloco, na sidebar ou num painel não contava. O seletor de colunas só
fechava clicando de novo no próprio botão. Um ouvinte comum de `mousedown` no documento também não resolveria: o
d3-drag dos blocos chama `stopImmediatePropagation` no `mousedown`, e outros menus param a propagação do Esc.

Correção: `useDismissOnOutside` (`app/src/features/shared/focus/useDismissOnOutside.ts`) fecha com `pointerdown` fora
e com Esc, os dois ouvidos na **fase de captura**, e com o `blur` da janela (clique numa página web ou iframe, ou
troca de app). A superfície portaled (`data-felixo-popover-surface`) conta como dentro. O hook foi aplicado ao
`NodeColorMenu` e ao seletor de colunas do `NotionTasksPanel`.

Validação: `useDismissOnOutside.test.ts` (5 testes, inclusive a exigência de captura). No app isolado
(`felixo devtools`, da fonte), o menu de cor fechou ao clicar dentro de outro bloco, ao clicar na sidebar, com Esc
(inclusive com outro menu aberto, caso que falhou com o Esc em bolha), com o `blur` da janela e ao escolher uma cor
(a moldura aplicou). O seletor de colunas do Notion **não foi clicado no app**: aparece só com uma database Notion
configurada, e o perfil isolado não tem conexão. Ele usa o mesmo hook já validado.

### Rolagem no terminal do Claude Code: ligada por padrão

Decisão da pessoa: deixar a opção ligada por padrão. Sem escolha salva, `loadClaudeTerminalScroll` agora devolve
ligado (`parseClaudeTerminalScroll`); só um `off` gravado desliga, então quem já tinha desligado continua desligado.
Os riscos listados na entrada de 2026-09-19 (menus, seleção com o mouse, redesenho) continuam não verificados numa
janela real com o Claude rodando; a decisão de ligar por padrão foi tomada sabendo disso.

Validação: teste novo em `terminal-scroll-preference.test.ts`. No perfil isolado, sem nada salvo, o interruptor em
Configurações aparece ligado, com o aviso "Ativado", e com `off` salvo o carregamento devolve desligado.
`tsc -b`, `eslint` dos arquivos alterados e `vitest` dos módulos tocados limpos.

Estado: concluído.

## 2026-10-07 — Configuração do Notion e aviso do ditado também fecham ao clicar fora

Continuação da entrada anterior: as duas superfícies que ainda só saíam da tela pelo próprio botão.

- **Seção "Configurar" do bloco Tarefas Notion**: recolhe com clique fora ou Esc. Não recolhe com o formulário de
  conexão aberto nem ao trocar de janela (a pessoa sai para copiar o token e volta), para não perder o que foi
  digitado. Para isso o `useDismissOnOutside` ganhou uma lista de refs (o botão fica no cabeçalho e a seção abaixo,
  sem ancestral comum só deles) e a opção `fecharAoSairDaJanela: false`.
- **Aviso do ditado por voz** (`DictationButton`): fecha com clique fora ou Esc. Achado de passagem: o aviso era
  `absolute` dentro da barra do topo, que tem `overflow: hidden`, e **ficava invisível**; a pessoa via só o microfone
  riscado. Agora sai por `FelixoPopoverSurface` (portal), abaixo do botão e contido na janela.

Validação: teste novo em `useDismissOnOutside.test.ts` (painel que ignora o `blur`). No app isolado: a seção
"Configurar" ficou aberta com clique dentro, com `blur` da janela e com o formulário de token aberto, e recolheu com
clique no vazio do bloco, com Esc e pelo próprio botão. O aviso do ditado (erro "Cadastre a chave…") apareceu
visível sob o microfone (captura) e fechou com clique fora, Esc e "Fechar"; clique no próprio aviso não fecha.
`npm run typecheck`, `npm run lint` e `vitest` completo (2980) limpos. `npm test` (testes node) tem 4 falhas de
descoberta de sessão do Claude que **já falham no `main` limpo** neste Windows; não são desta mudança.

Estado: concluído.

## 2026-10-09 — Revisão de coerência dos commits de 08–09/10 e ajustes

Revisão dos 18 commits entre `e370a88` e `e567563` (System Design por projeto e login só no clique, launcher na
`main`, política de git, #108 do Notion). As camadas IPC estão consistentes (handlers, preload, `vite-env.d.ts`), a
migração 018 bate com o repositório e é idempotente, todo `git` do System Design passa por `runGit` com ambiente e
prazo, e o launcher não usa mais `production` no código. O #108 manteve o fechamento ao clicar fora do #107.

Corrigido nesta passada:

- **Login de guia privado fora do Windows.** Com `GIT_TERMINAL_PROMPT=0` sempre, no macOS e no Linux sem o Git
  Credential Manager o clique não abre janela nenhuma, e a frase dizia que o login "foi cancelado".
  `describeGitFailure` agora recebe a plataforma: fora do Windows diz que a janela depende do GCM e manda salvar a
  credencial pelo terminal (`gh auth login`). Teste novo em `git-failure.test.cjs`; o GUIA-USUARIO diz o mesmo.
- **Acentos** nas mensagens de erro do `system-design-repository.cjs`, que podem chegar à tela.
- **`.env.example`** ainda sugeria `FELIXO_PRODUCTION_BRANCH=production`; agora `main`.
- **Teste do PowerShell** (`context-file-delivery.shell.test.ts`): abre dois PowerShell reais; com a máquina ocupada
  cada um levou ~3,8 s e o prazo padrão de 5 s reprovava. Prazo de 30 s só nesse teste.

Ficou registrado, sem mudança:

- **Dois `IA.md`.** `docs/README.md` define a raiz como registro das sessões recentes e `docs/projeto/IA.md` como
  contexto versionado, mas as sessões de 08–09/10 registraram no segundo. Escolher um só é decisão do Felipe.
- A entrada de 08/10 em `docs/projeto/IA.md` ainda cita o GCM no Windows como pendente; a de 09/10 resolveu.
- Instalação antiga sem `system-design.config` gravado não migra documentos da tabela antiga (`loadState`). É só
  cache: a próxima sincronização repõe.
- Corrida rara: sincronização automática que falha por login logo após um clique ainda mostra o aviso de login.
- A política de git manda commitar direto na `main`, mas a proteção do `main` recusa push direto de quem não é
  admin (15 checks obrigatórios); para quem não é admin, o caminho continua sendo PR.

Validação: `git-failure`, handlers do System Design, armazenamento e origem do System Design (97 testes) e o teste do
PowerShell passam; `eslint` dos arquivos tocados limpo; `typecheck` e `lint` completos limpos antes das mudanças.
A suíte completa de testes node e o vitest inteiro **não** rodaram até o fim: a máquina ficou sem memória e a
sessão interrompeu a suíte. O CI do PR roda tudo.

Estado: concluído.

## 2026-10-09 — Divisão do CanvasView: câmera, textos dos agentes e notificações

O `CanvasView.tsx` tinha 3.392 linhas. Três blocos coesos saíram para hooks, um commit por extração, sem mudar
comportamento (mesmo código, mudando só de lugar):

- `hooks/useSafeViewport.ts`: as seis funções que centralizam um bloco ou enquadram o canvas na área útil
  (descontando topbar, sidebar, painéis e inspector) e o tipo `FlowPositionMapper`.
- `hooks/useCanvasPrompts.ts`: instruções de arquivo ligado a terminal, catálogo de skills e o lembrete do padrão
  de qualidade (fonte do System Design e guias por projeto), com os efeitos que carregam e acompanham esses textos.
- `hooks/useCanvasNotifications.ts`: histórico persistido, som e a regra de quando um agente aguardando vira
  notificação nova.

Detalhes que não são "só mover": as refs e os setters que agora chegam por parâmetro ou retorno de hook entraram nas
listas de dependências dos `useCallback`/`useEffect` (o lint exige; a identidade deles não muda, então nada
re-executa a mais). Os dois efeitos que carregam os textos do backend rodam agora junto do resto do
`useCanvasPrompts`, um pouco antes na ordem de montagem; eles só disparam leituras assíncronas e uma inscrição.

`CanvasView.tsx`: 3.392 → 2.924 linhas. Próximas extrações candidatas: o `useMemo` de `renderedNodes` (~265
linhas), `organizeCanvasBlocks` e as operações de bloco de imagem.

Validação: `tsc -b` e `eslint` limpos; `vitest` de `src/features/canvas` com 1.676 testes passando (2 workers,
por causa da memória da máquina).
**Sem conferência visual local**: a máquina estava com menos de 1 GB livre e a sessão interrompeu a abertura
do app. A conferência fica pelo smoke do canvas no CI (Electron real nos três sistemas, com capturas).

## 2026-10-09 — Benchmark de terminal: dois critérios que reprovavam por ruído

O job "Benchmarks" reprovou os PRs #107, #110 e #111 (macOS e Windows) sem relação com o código deles: a bancada
carrega só uma página com o xterm (`benchmarks/terminal-scrollback-harness.html`).

Medido em 8 runs verdes seguidos da `main` (07–09/10), mesmo código:

- **Heap do `adaptive count=1`**: de 12,0 a 35,8 MiB (até 23,8 MiB de salto), enquanto o `current count=1` — a
  mesma configuração, rodada antes no renderer compartilhado — fica em 13,5–16,8 MiB. O piso absoluto do gate
  (`benchmark-regression-gate.cjs`) era 15 MiB, dentro dessa faixa. Passou a 32 MiB.
- **Resume com `count=5`**: abaixo do limite adaptativo (10) as duas políticas usam o mesmo scrollback; a diferença
  de resume entre elas (246–408 ms no macOS) é variação do runner. O `--check` da bancada
  (`terminal-scrollback-benchmark.cjs`) agora só compara o resume a partir do limite adaptativo, como a comparação
  de memória já fazia.

Nos cenários em que a política muda algo (10 e 20 sessões) nada afrouxou: o ganho medido continua exigido
(~95 contra ~150 MiB e ~400 contra ~570 ms com 10 sessões), e 60% de 85–290 MiB passa do piso com folga.

Validação: testes novos com os valores reais que reprovaram (`benchmark-regression-gate.test.cjs`,
`terminal-scrollback-benchmark.test.cjs`, 38 passando). Reexecutando o gate sobre os 8 relatórios reais, par a
par no mesmo sistema (168 pares, mesmo código): o gate antigo reprova 10, o novo nenhum.

Estado: concluído.

## 2026-10-09 — Divisão do CanvasView, parte 2: Organizar em matriz e ações de imagem

Mais dois blocos saíram do `CanvasView.tsx` para hooks, um commit por extração, sem mudar comportamento:

- `hooks/useMatrixArrange.ts`: o "Organizar" (posições da matriz, animação de deslocamento com cancelamento ao
  desmontar, enquadramento do resultado) e as duas funções de classe CSS que só ele usava.
- `hooks/useImageNodeActions.ts`: duplicar a imagem num bloco ao lado, apontar para outro arquivo quando o
  original sumiu e apagar uma imagem gerada temporária.

Como na parte 1, as refs recebidas por parâmetro entraram nas listas de dependências (identidade estável).

`CanvasView.tsx`: 2.924 → 2.728 linhas (3.392 no começo do dia). Restam como maiores blocos o `useMemo` de
`renderedNodes` (~265 linhas), a criação de terminais (`buildTerminalNodeData`, continuação e passagem de
responsabilidade) e o JSX do `return` (~390 linhas).

Validação: `tsc -b` e `eslint` limpos. O vitest local **não rodou**: a fila de trabalho pesado da máquina estava
ocupada (posição 6); a suíte roda no CI do PR, junto com o smoke do canvas no Electron real.

Estado: concluído.

## 2026-10-09 — Divisão do CanvasView, parte 3: Página Web por link/agente e dados do terminal novo

- `hooks/useWebpageOpeners.ts`: os dois caminhos que criam um bloco Página Web sem a sidebar (menu de link global
  e `felixo browser open --embedded`) com os efeitos que os registram. Só mudança de lugar.
- `services/terminal-node-data.ts`: a regra que monta os dados de um bloco de terminal novo (comando, pasta, conta e
  o texto que o agente recebe ao subir) virou **função pura**. Antes era um `useCallback` lendo refs; agora o
  lembrete de qualidade e as skills chegam por parâmetro e o `CanvasView` só repassa. Com isso a regra ganhou
  testes (`terminal-node-data.test.ts`, 7): shell simples sem texto, agente com o lembrete digitado e não
  submetido, passagem de responsabilidade submetida (e não submetida na continuação desmarcada), lançador opaco sem
  contexto, `accountMode` só na cadeia e a cor do preset como moldura.

`CanvasView.tsx`: 2.728 → 2.594 linhas (3.392 no começo do dia). O que resta de grande: o `useMemo` de
`renderedNodes` (~265 linhas), a continuação/passagem de responsabilidade e o JSX do `return` (~390 linhas).

Validação: `tsc -b` e `eslint` limpos; os 7 testes novos passam. A suíte completa roda no CI do PR (a fila de
trabalho pesado da máquina seguia ocupada).

Estado: concluído.

## 2026-10-09 — Divisão do CanvasView, parte 4: painel de notificações, rota acesa e arquivos herdados

- As quatro ações do painel de notificações (marcar como lida, marcar todas, remover, limpar as lidas) estavam
  escritas dentro do JSX; foram para o `useCanvasNotifications`, junto do estado que alteram.
- `hooks/useRouteHighlight.ts`: o estado das rotas acesas quando uma entrega chega ao terminal, com os
  temporizadores e a limpeza ao desmontar.
- `getLinkedFileNodeIds` (`services/file-terminal-links.ts`): a regra de quais arquivos um terminal de continuação
  herda virou função pura; o serviço ganhou o primeiro arquivo de teste (3 casos: duas direções da linha, só
  arquivos, sem repetir).

`CanvasView.tsx`: 2.594 → 2.520 linhas (3.392 no começo do dia). O `useMemo` de `renderedNodes` (~265 linhas) ficou
de fora de propósito: ele decide a retomada de cada agente e tem cache por bloco, e precisa de testes dedicados
antes de ser movido.

Validação: `tsc -b`, `eslint` e os testes novos verdes; suíte completa e smoke do canvas pelo CI do PR.

Estado: concluído.

## 2026-10-09 — Decisão de subida do terminal: função pura, tabela de casos e achados

O maior bloco que restava no `CanvasView.tsx`, o `useMemo` de `renderedNodes`, decide o que cada terminal faz ao
subir. As funções que ele chama já tinham teste; a combinação delas (segurar o spawn, esperar a versão da CLI,
esperar os guias do projeto, montar o texto inicial e a faixa) não tinha, e só existia dentro do componente.

**Extração (commit 1).** O cálculo foi para `services/terminal-spawn-plan.ts`: `resolveTerminalSpawnPlan` (a
decisão), `terminalSpawnData` (os campos que ela acrescenta ao bloco) e `terminalSpawnCacheDeps` (a parte dela na
chave do cache). Expressões copiadas como estavam: conferido por script que, das linhas que saíram do componente,
só diferem os imports e as duas leituras que agora chegam por parâmetro. O cache por bloco continua no componente,
com a chave na mesma ordem, e a lista de dependências do `useMemo` não mudou. `CanvasView.tsx`: 2.520 → 2.375.

**Tabela de casos (commit 2).** `terminal-spawn-plan.test.ts`, 49 testes, três tabelas no cabeçalho do arquivo: o
que cada bloco recebe ao subir; as três esperas e suas combinações (das 8, só 5 acontecem: a espera pelos guias
exige agente sem conversa, as outras duas exigem conversa gravada); e o cache (o que reconstrói e o que
reaproveita). Dois invariantes sobre uma grade de 396 cenários: guias nunca coincidem com as outras esperas, e
chave de cache igual implica dados iguais.

**Achados (fixados nos testes, NÃO corrigidos):**

1. *Gemini com o processo de pé e versões ainda carregando.* A espera pela versão vale só para o bloco sem
   processo; com o processo de pé o plano é calculado sem versão e a faixa já sai montada com o texto de versão
   desconhecida. Se ela chega a aparecer na tela depende de `visibleTerminalResumeBanner`, que não foi avaliado.
2. *Lançador opaco com conversa do Gemini.* `waitsForCliVersion` não confere se o bloco segue o plano de retomada:
   um lançador (que não recebe contexto nem retomada) com `agentSession` e comando `gemini` fica segurado até as
   versões chegarem, sem faixa. Só acontece se um bloco assim tiver `agentSession` gravado.
3. *`holdable` fora de `ids`.* A decisão não confere que os "sem processo" são um subconjunto dos restaurados. Hoje
   quem monta os dois (`terminalRunRegistry`) garante isso; é uma dependência implícita.

**Limite da validação.** O smoke do canvas no CI (`scripts/canvas-smoke.cjs`, Electron real) cria terminais novos e
confere o que recebem, mas **não reabre o app com conversas gravadas**: ele não exercita retomada. O verde do CI
prova que o app sobe e que o caminho do agente novo funciona; para a retomada, a garantia é a cópia literal
conferida por script, o `tsc` e os 49 testes. Falta uma conferência manual da retomada no app (reabrir com um
agente que tinha conversa), que não foi feita por falta de memória na máquina.

Validação local: `tsc -b` e `eslint` limpos; os 49 testes passam.

Estado: concluído (com a conferência manual da retomada pendente).

## 2026-10-10 — Achados do #117: avaliação e correções propostas (PRs abertos, sem merge)

Decisão da coordenação da noite: nenhum merge a mais na `main` até o André conferir a retomada de agente no app
instalado. Os três achados do #117 ficaram assim:

- **Achado 1 (faixa montada sem a versão da CLI): defeito pequeno, de tempo.** Com o processo de pé e sem falha a
  faixa fica guardada (`shouldShowTerminalResumeBanner`), então na maior parte do tempo ninguém vê. Ela aparecia
  montada como "versão desconhecida" quando, nos primeiros segundos depois de abrir o canvas (versões ainda
  carregando), o processo do Gemini já tinha saído ou a pessoa pedia Reiniciar; e trocava de texto quando a versão
  chegava. Correção proposta: a faixa espera a versão em qualquer bloco que siga o plano (`cliVersionPending`); o
  bloco com processo continua sem ser segurado. O valor novo entra na chave do cache do bloco.
- **Achado 2 (lançador opaco esperando a versão): defeito pequeno.** O lançador com conversa do Gemini gravada
  ficava segurado até as versões chegarem, sem faixa, por uma retomada que ele nunca faz. Correção proposta: a
  espera pela versão só vale para quem segue o plano de retomada.
- **Achado 3 (`holdable` fora de `ids`): não é defeito.** A captura do registro de execução já monta os "sem
  processo" como subconjunto dos restaurados. Um teste novo prende essa garantia na origem (720 ordens de eventos,
  com reload no meio).

PRs: correções dos achados 1 e 2 (este registro); teste do achado 3 (#118). Nenhum foi mesclado.

Sobre publicação: o Release gate olha só o último commit do push. O #117 e as partes anteriores da divisão do
CanvasView estão na `main` mas não foram publicados (o último commit de cada merge era de documentação ou teste);
o último Release é o v0.1.450. O próximo push cujo último commit mexa no app publica tudo acumulado.

Validação: `terminal-spawn-plan.test.ts` com 50 testes (os dois achados invertidos para o comportamento novo, um
caso de cache novo, e os invariantes da grade de 396 cenários); `tsc -b` e `eslint` limpos. Sem conferência no app.

Estado: aguardando decisão do André (PRs abertos).

## 2026-10-12 — Agente na nuvem: sessões do Claude Code na nuvem por um cartão do canvas

**Contexto.** Algumas contas de assinatura recebem um crédito de sessão na nuvem (valor e validade
variam por conta) que só vale para sessões na nuvem e não cobre o CLI local. O pedido foi poder
criar, pelo AI Core, um agente que use esse crédito e poupe o limite semanal do plano.

**O que foi medido antes de desenhar** (Windows 11, Claude Code 2.1.287, PTY real):

- `claude --cloud "<tarefa>"` **exige TTY**: com a saída redirecionada recusa com
  `--cloud requires an interactive terminal` e código 1.
- Num PTY ele **não abre TUI**: cria a sessão em 5 a 7 s e sai com código 0, imprimindo
  `Created cloud session: <título>`, `View: https://claude.ai/code/session_<ID>?from=cli&m=0` e
  `Resume with: claude --teleport session_<ID>`.
- Na primeira vez numa pasta aparece a tela "Is this a project you created or one you trust?"
  antes de a sessão ser criada.
- `claude -p "<texto>" --cloud <id>` funciona **sem TTY** e imprime `Sent to cloud session.`.
- `--model` e `--effort` são aceitos junto com `--cloud` sem erro; o efeito na sessão **não** foi
  verificado, por isso ficaram fora do cartão.
- O "Crédito incluído" do painel Uso diminuiu depois das sessões de teste, o que é consistente com
  o CLI gastar esse crédito. A medição é grossa: o painel mostra dólares inteiros, e o uso local
  da própria sessão de trabalho impede atribuir a barra semanal à nuvem.

**O que foi feito.** Nó novo `cloud-session` (cartão de dados, sem terminal) mais um serviço no
processo principal (`electron/services/cloud-session/`) que roda o `claude` nativo num PTY
descartável e lê a saída com um parser puro. Botão **Agente na nuvem** na seção *Criar*;
confirmação inline antes de disparar; depois de criado: Abrir, Trazer para cá (`--teleport`),
Nova sessão e follow-up. Migração `019_canvas_cloud_session_nodes.sql`. Desenho em
`docs/projeto/ESPEC-AGENTE-NUVEM.md`, plano e desvios em `PLANO-AGENTE-NUVEM.md`, roteiro manual
em `docs/validation/CHECKLIST-AGENTE-NUVEM.md`.

**Por que um nó e não um bloco de terminal.** O terminal é restaurado, reiniciado e
redescoberto pelo app, e cada um desses caminhos relançaria `--cloud` e gastaria crédito de
novo; blindar isso exigia tratar uns oito pontos do ciclo de vida do terminal. O cartão só
dispara por clique confirmado (invariantes I1 a I9 do spec, cada uma com teste).

**Achados no caminho** (registrados porque custariam caro de novo):

- `origin/main` já tinha a migração `018_system_design_sources.sql` (a branch saiu de um `main`
  local desatualizado). Renumerada para `019` e rebaseada. Ensaio da `019` numa **cópia do banco
  real**: versão 18 para 19, a mesma contagem de blocos por tipo (terminais, Tarefas Notion e
  página web), os mesmos bytes de `data_json`, `integrity_check` ok e `foreign_key_check` sem linhas.
- `tsc -p .` não verifica nada neste projeto (usa referências de projeto): o gate é
  `npm run typecheck` (`tsc -b`).
- Com Login do sistema o app mantém o ambiente da pessoa; um `ANTHROPIC_API_KEY` ali faria o CLI
  cobrar pela chave e recusar a nuvem. O serviço passa sempre por `applyProfileEnv`.
- `CanvasNodeData` é uma intersecção plana: os campos do cartão levam o prefixo `cloud` para não
  colidir com `cwd` e `accountId` do terminal.
- Ao rodar o cartão no app real apareceram três defeitos que os testes não pegam: botões de
  confirmar fora da área visível, cartão sem nome no dock e altura padrão curta (corrigidos).

**Validação.**

- `node --test` do processo principal: 2.619 testes passando. 1 arquivo falha
  (`electron/core/app-relaunch.test.cjs`) com `EPERM: symlink`: o Windows desta máquina não
  deixa o teste criar link simbólico; ambiental e anterior a esta mudança.
- `vitest`: 204 arquivos e 3.126 testes passando, 3 ignorados, **com `--testTimeout=120000`**.
  Com o timeout padrão de 5 s, 6 testes (as gravações `terminal-reading.fixtures` e um do guia do
  System Design) estouram nesta máquina: o arquivo das gravações leva cerca de 72 s e passa 63 de
  63 com o prazo maior. Não tem relação com esta mudança.
- `npm run lint` sem avisos e `npm run typecheck` sem erros.
- Mutações feitas de propósito, e os testes falharam como devia: host do link, trava por nó,
  remoção das credenciais herdadas, migração que perdia linhas e `launching` que não virava
  `interrupted`.
- **No app real** (`felixo devtools launch`, perfil isolado, a partir do código-fonte, Login do
  sistema): criar o cartão; erro de pasta não confiada (sem sessão criada); disparo real com
  "Criando a sessão na nuvem…" e depois o cartão criado; follow-up real; recarregar o app (o
  cartão volta com o mesmo ID); Trazer para cá (terminal na pasta do cartão); Nova sessão.

**O que NÃO foi validado.**

- **Linux e macOS**: o spike e a validação rodaram só no Windows.
- Duplo clique real, fechar o app no meio do disparo e importar um `.fxcanvas` em outro perfil
  só têm teste automatizado, não foram feitos na tela.
- Que a mensagem do follow-up apareceu **dentro** da sessão no claude.ai/code, e que o recarregar
  não criou sessão nova na lista de lá (só comparei o ID do cartão).
- Saídas de erro de login, limite, rede e pacote grande: os padrões vêm do classificador de
  falhas das contas, mas só a tela de confiança foi capturada de verdade.
- O crédito com precisão (o painel mostra dólares inteiros) e se `--teleport` consome o plano ou
  o crédito.
- O CI e o merge: o trabalho está na branch `feat/agente-nuvem`. **Mesclar em `main` publica uma
  release** (`release.yml`), então a decisão de mesclar fica com quem mantém o repositório.

Estado: implementado e validado localmente no Windows; CI e merge pendentes.

## 2026-10-12 — Agente na nuvem: revisão independente e ajustes de padrão de qualidade

**Contexto.** Com o cartão funcionando e o PR em rascunho, foi pedido seguir sempre o padrão de
qualidade do projeto. A branch inteira foi revisada com os guias como régua (guia mínimo, backend,
frontend §9 e §10, política de git, template do `IA.md`). A tabela completa dos achados está na
seção 13 de `docs/projeto/ESPEC-AGENTE-NUVEM.md`; aqui ficam os que custariam caro de novo.

**Achados que mudaram o desenho.**

- **Windows.** O node-pty não cita um argumento que começa e termina com aspas. Uma tarefa como
  `"abc" --settings=x "def"` virava vários argumentos e o `--settings` chegava ao `claude` como
  opção. A linha de comando agora é montada pela regra do `CommandLineToArgvW` e o teste a confere
  contra o parser real do sistema. Em **todas** as plataformas, tarefa e mensagem que começam com
  `-` são recusadas, porque o próprio `claude` as leria como opção.
- **macOS.** O escape de shell do app não cobre quebra de linha nem tabulação. Cada argumento
  viaja numa variável de ambiente (`FELIXO_ARG_n`) expandida só entre aspas duplas. A prova usa um
  `sh` de verdade e roda no CI de Linux e macOS; no Windows o teste é pulado.
- **Parser.** Um título como "Create View: component" fazia uma sessão já criada (e cobrada) virar
  erro e o cartão perdia o ID. Os rótulos `View:` e `Resume with:` só valem no começo da linha.
- **Interface.** Faltavam foco, Esc na confirmação e `prefers-reduced-motion`. O foco inicial caía
  no botão que gasta crédito; agora entra no contêiner da confirmação.
- **Backend.** Faltava log das falhas: cada operação grava um evento no QA Logger (escopo
  `cloud-session`) sem tarefa, pasta nem ID. `dispose` agora encerra o PTY também durante a
  tolerância de 3 s, e a busca do `claude.exe` continua pelo `PATH` quando um shim não tem o exe.
- **Migração.** Novo `app/scripts/ensaiar-migracoes-em-copia.cjs`: copia o banco real, aplica as
  migrações pendentes só na cópia e reprova se alguma tabela perder linhas, se o `integrity_check`
  não vier "ok" ou se houver violação de chave estrangeira. O relatório só traz nomes de tabela e
  contagens. Rodado no banco do perfil local: versão 18 para 19 e nenhuma tabela com menos linhas.
- **Repositório público.** Valores privados da conta e do banco de quem testou tinham ido para
  documentos e fixtures; foram generalizados na árvore. As versões antigas dos commits já
  publicados no PR ainda os contêm (ver o fim desta entrada).

**Armadilha de ambiente (vale para quem roda os testes nesta máquina).** O `pretest` do
`npm test` roda `npm rebuild node-pty`. Com o TypeScript 6.0.2 do `node_modules` compartilhado ele
falha (`TS5108: Option 'target=ES5' has been removed`) **depois de recompilar o `lib/` do node-pty**
por cima do que veio no pacote. O `lib/` foi restaurado a partir do tarball oficial da mesma
versão e o node-pty voltou a abrir um PTY. Para rodar os testes aqui, use
`node scripts/run-node-unit-tests.cjs` direto. Dois outros tropeços: o `tsc -p .` não verifica
nada neste projeto (o gate é `npm run typecheck`), e o shell das ferramentas de edição reduz as
barras invertidas em heredocs, o que corrompe fixtures com caminhos do Windows.

**Validação desta fase** (Windows 11, Claude Code 2.1.287):

- `node scripts/run-node-unit-tests.cjs`: 2.655 testes, 2.648 passam, 6 pulados (POSIX e link
  simbólico, que não se aplicam ao Windows) e **1 falha**: `electron/core/app-relaunch.test.cjs`
  com `EPERM: symlink`, porque o Windows desta máquina não deixa o teste criar link simbólico.
  Ambiental, anterior a esta mudança, e a branch não toca nesse arquivo.
- `vitest` com `--testTimeout=120000`: 205 arquivos passam (2 ignorados), 3.143 testes passando
  e 3 ignorados. Com o prazo padrão de 5 s, as gravações `terminal-reading.fixtures` estouram
  nesta máquina; não tem relação com esta mudança.
- `npm run typecheck`, `npm run lint` e `vite build` sem erros.
- Mutações feitas de propósito, e os testes falharam como devia: host do link, trava por nó,
  remoção das credenciais herdadas, migração que perdia linhas, `launching` que não virava
  `interrupted` e a linha de comando do Windows.
- Foco, Esc e `motion-safe` conferidos num DOM real (cartão novo foca a tarefa; a confirmação
  foca o contêiner e devolve o foco ao botão de origem ao cancelar ou com Esc; a falha leva o foco
  ao aviso).

**O que NÃO foi validado.**

- **Linux e macOS**: só os testes automáticos rodam no CI; a criação real de sessão foi vista só
  no Windows. O convite está no checklist manual.
- Na tela real, depois desta fase: o foco após o cartão ficar **criado** e após **Nova sessão**, a
  recusa do hífen no início, o evento no QA Logger e a pasta não confiada pelo caminho "Abrir
  Claude nesta pasta". Estão como etapas 13 a 16 do checklist.
- Texto difícil (aspas, `%PATH%`, quebra de linha) chegando intacto **na nuvem real**: provado
  contra o parser do Windows e com um `sh` de verdade, não numa sessão cobrada.
- O resto da lista da entrada anterior continua valendo (duplo clique real, fechar o app no meio
  do disparo, importar em outro perfil, a mensagem do follow-up dentro do claude.ai/code, saídas
  de erro de login, limite, rede e pacote grande, e se `--teleport` consome o plano ou o crédito).
- O CI e o merge. **Mesclar em `main` publica uma release** (`release.yml`): a decisão é de quem
  mantém o repositório. Os commits antigos já enviados ao PR ainda contêm os valores privados;
  reescrever a história exigiria force-push e só esconderia isso da branch, porque o GitHub
  mantém os commits acessíveis por SHA. Fica registrado para decidir.

Estado: implementado e validado localmente no Windows; push, CI e merge pendentes.

## 2026-10-12 — Alinhamento ao padrão de qualidade: gate verde, portabilidade e lacunas declaradas

**Contexto.** Pedido: colocar o repositório no padrão de qualidade do Felixo System Design.
A pasta `Padrão de qualidade - Felixo System Design/` não existia na cópia de trabalho, então a
fonte foi o repositório público (clone raso, commit `cc4aae7`). A auditoria seguiu o Guia Mínimo de
Qualidade (13 itens e checklist), a política de git, o template de `IA.md`, o guia do `start_app.py`
e o guia de README.

**Já conforme, não refazer.** `start_app.py` na raiz com menu `questionary`/`rich` e as quatro ações
mínimas; `requirements.txt` com hashes e `package-lock.json` versionado; auditoria de dependências
no CI (`dependency-policy`, `python-dependency-audit`); CI em matriz de três sistemas; política de
branch e commits já alinhada (`docs/guias/GUIA-DESENVOLVEDOR.md`); nenhum segredo versionado (só
sentinelas de teste); 102 links relativos válidos antes das mudanças.

**Gate medido antes de mexer** (árvore limpa, Windows 11): `tsc -b` e `eslint` limpos; vitest com 5
falhas (um arquivo); Python com 4 falhas; testes Node com 3 arquivos falhando. Nenhuma era defeito
de produto; cada uma tinha causa própria, achada por reprodução e não por suposição:

- **Python, 4 falhas em `tests/test_node.py`.** O `.cmd` falso imprimia a versão certa mas saía com
  código 1. Causa: `HKCU\Software\Microsoft\Command Processor\AutoRun` desta máquina chama `doskey`,
  que não existe no PATH sintético dos testes. Correção em `tests/support.py`: o PATH de teste inclui
  o `System32` no fim no Windows (`bf44a17`).
- **vitest, 5 timeouts em `terminal-reading.fixtures`.** Reproduziu isolado. `codex-cancelamento`
  (130 KB) leva cerca de 6 s para reproduzir no xterm, acima do limite padrão de 5 s. Correção:
  `describe(..., { timeout: 30_000 })`, o mesmo idioma do arquivo vizinho e do #114 (`1c02fd7`).
- **Node, `app-relaunch.test.cjs` inteiro falhando (`EPERM: symlink`).** A fixture criava o link
  simbólico ao carregar o módulo, mesmo no Windows, onde os testes que o usam já são pulados. O
  `EPERM` passa a ser tolerado só nesse caso (`85c1cdf`). Antes, 0 testes do arquivo rodavam; agora
  4 passam e 4 são pulados por SO.
- **Node, `codex-status-*` falhando (`Cannot find module '@xterm/headless'`).** Dependência declarada
  e travada no lockfile, mas ausente no `node_modules` desta cópia. Ambiente, não repositório;
  instalada com `npm install --no-save --ignore-scripts @xterm/headless@6.0.0`. O npm reconciliou
  outros pacotes (removeu 12, alterou 10); depois disso `require('node-pty')` carregou, o binário
  do `electron` continuou resolvendo e o teste de integração `pty-write-queue` passou (os outros
  dois de `test:native` não foram rodados).

**Organização e portabilidade.**

- `ai-clis/*.sh` fixavam `/home/felipe/...` e a versão do Node de quem os escreveu. Agora resolvem a
  CLI pelo PATH, com `FELIXO_CLI_PATHS` (o mesmo ajuste do app) e `$HOME/.npm-global/bin` na frente
  (`ed29ea6`). A linha 2 de cada arquivo ficou igual: o chat legado a usa para inferir o nome do
  modelo. Continuam exclusivos de Linux/KDE por usarem o Konsole, e isso agora está dito no arquivo.
- O arquivo `plan`, sem extensão na raiz, passou para
  `docs/_legado/projeto/PLANO-INTEGRACAO-CLIS-BACKEND.md` com `git mv`, histórico preservado
  (`c2c0213`). Nada o referenciava.
- A branch local `test/canvas-visual-regression-20260924` foi apagada. O remoto já tinha sido
  removido e o diff dela é idêntico ao squash `34a422c` (#85) na `main`. Recuperável por
  `git branch test/canvas-visual-regression-20260924 52008b7`.
- README: índice no topo e seção Licença e contribuições no rodapé, no estilo do projeto, sem emojis
  (`37d6083`).

**Evidência e validação (final).**

- `tsc -b`: exit 0. `eslint .`: exit 0.
- Python: `python -m unittest discover -s tests -t .`, 104 testes OK (2 pulados por SO).
- Node: `node scripts/run-node-unit-tests.cjs`, 2662 testes, 2654 passam, 0 falham, 8 pulados.
- vitest: `CI=true npx vitest run --maxWorkers=4`, 205 arquivos passam (2 ignorados), 3145 testes
  passam, 3 ignorados, 0 falhas, 90 s.
- Links: verificador próprio (fora do repo) com controle negativo; 105 links relativos e 22
  âncoras do README, 0 quebrados.

**O que foi investigado e deliberadamente NÃO alterado.**

- **Suíte vitest inteira com os 16 workers padrão não é confiável nesta máquina.** Havia só 2 GB de
  14 GB de RAM livres. Uma rodada perdeu um worker (`Worker exited unexpectedly`, 1 arquivo e 9
  testes a menos) e outra reprovou `canvas-context-e2e` num `waitFor` de 8 s. Esse arquivo passou
  3 de 3 vezes isolado (cerca de 86 s) e o CI já o roda em passo próprio; a suíte inteira com 4
  workers passou. Hipótese de causa: pressão de memória. Não foi medida a taxa de falha, então o
  teste não foi alterado.
- O `.gitignore` tem uma linha com o nome da pasta do padrão em mojibake (`Padr├úo ...`). Parece
  proposital (um sincronizador pode criar a pasta com esse nome no Windows); mantida.
- `.codex` vazio na raiz foi versionado de propósito (`2b9b9e1`); mantido.
- O menu e `runner.py` ainda falam em "branch de produção" e `FELIXO_PRODUCTION_BRANCH`. É o nome
  histórico da chave, o padrão já é a `main`; renomear mexeria em configuração salva de quem usa.

**Lacunas que ficam abertas (decisão de quem mantém).**

1. `IA.md` da raiz (8350 linhas, 556 KB) e `docs/projeto/IA.md` (6466 linhas, 660 KB) passaram do
   ponto em que a compactação sem perda do template se aplica: não têm a seção **Estado atual
   (resumo vivo)** e não existe `docs/ia-archive/`. Não foi feito porque vários agentes acrescentam
   entradas a esses arquivos em paralelo e mover centenas de milhares de bytes colidiria com eles.
   Se for feito, mover registros antigos na íntegra, sem editar, com ponteiro datado.
2. O README continua com 865 linhas. Blocos longos (limites e uso por conta, cadeia de contas,
   validação) poderiam migrar para `docs/` e deixar um resumo com link.

**Não validado.** Só rodei no Windows; Linux e macOS dependem do CI.

**Envio ao remoto.** Eu não executei `git push`, mas seis dos sete commits já estão na `origin/main`:
o reflog registra `update by push` às 03:34, 03:37 e 03:46, logo depois de cada commit, o clone não
tem hooks, e o app Felixo e o GitHub Desktop estavam abertos. A origem exata do envio não foi
verificada. Quando escrevi isto, o CI do remoto estava assim: `ed29ea6` em andamento, `c2c0213`
cancelado, `37d6083` pendente, e o Release gate de `37d6083` `skipped`. Cada um dos seis commits de
código e documentação passou por `.github/scripts/release-relevant.sh` e deu `false`: nenhum publica
instalador. O commit deste registro foi o único que ficou só local.

Aprendizado de método: `grep -c $'\r'` no Git Bash deu falso positivo (disse 6 CRs num arquivo LF);
a fonte confiável foi `git ls-files --eol` e `od -c`.

Estado: concluído e validado localmente no Windows; seis commits já no remoto, com o CI dele sem
resultado final; lacunas 1 e 2 aguardam decisão.

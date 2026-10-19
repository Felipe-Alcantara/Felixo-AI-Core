
---

## Estado atual (resumo vivo)

<!--
  EXCEÇÃO à regra append-only: esta seção é um resumo reescrevível de "onde o projeto está
  AGORA". Reescreva-a a cada mudança de estado; o histórico fica nas entradas datadas abaixo e
  nos arquivos de docs/ia-archive/.
-->

Última atualização: [2026-10-19]

- **Fase:** o canvas é o produto principal (o chat está depreciado). A divisão do `CanvasView`
  (partes 1 a 4) e o bloco Agente na nuvem estão na `main`: PRs #113 a #120 mesclados.
- **Padrão de qualidade:** auditado e alinhado em 2026-10-12 (ver a entrada daquele dia). Gate
  verde no Windows: `tsc`, `eslint`, Python 104, Node 2677, vitest 3145. No CI de `37d6083`,
  `Validate` (4 sistemas) e `Launcher` (3 sistemas, Python 3.9 e 3.13) passaram; só o job
  exploratório `Benchmarks exploratórios (windows-latest)`, que é `continue-on-error`, falhou no
  passo de responsividade do terminal e não foi investigado. Os commits seguintes (compactação dos
  `IA.md`, divisão do README e o Agente na nuvem no menu Agente) foram enviados à `main`
  (`e7b7efe..d952f5b`) e o CI de `d952f5b` passou nos 22 jobs, inclusive esse exploratório do Windows.
- **Claude por chave de API:** conta do Claude por chave abre um bloco de conversa (Claude Code sem tela, que usa o crédito promocional do Agent SDK); ver a entrada de 2026-10-19.
- **Em andamento:** nada aberto no código nesta entrega. Em toda abertura (também na execução da
  fonte), a rodada das CLIs busca a versão mais nova publicada de Claude, Codex e Gemini, inclusive
  pré-lançamento, e atualiza a cópia do app e a do npm global, mesmo com a CLI aberta (o npm troca
  o pacote com o executável antigo rodando). O rodapé avisa "CLIs atualizadas" (entradas de
  2026-10-14 "CLIs: a versão mais nova publicada" e "o Claude não atualizava"). `FELIXO_AUTO_INSTALL_CLIS=0` é o opt-out para automações isoladas. O Agente na nuvem foi movido do botão em *Criar* para uma
  opção do menu Agente (entrada de 2026-10-12 "movido para dentro do menu Agente"): validado no Windows,
  enviado, com o CI verde e publicado na `v0.1.452`. O Release gate não publicou sozinho (o último
  commit do push só mexia em `IA.md`); a release foi disparada à mão para `d952f5b`.
- **Pendente de conferência manual:** o roteiro do Agente na nuvem em
  `docs/validation/CHECKLIST-AGENTE-NUVEM.md` (cria sessão real e gasta crédito, por isso não roda
  no CI) e a retomada do terminal (entrada de 2026-10-09). A atualização do Claude no app instalado
  com a `v0.1.461` (a correção foi validada numa instância isolada da fonte; o app do dia a dia
  deste PC roda de dentro de `%TEMP%`). O "File not found: " vazio ao abrir agentes (entrada de
  2026-10-15) na máquina de quem relatou, depois que o app dela atualizar para a `v0.1.462`. A
  abertura do Codex 0.158+ sem o "timed out discarding buffered terminal input" e a tela de
  confiança nova reconhecida (as duas entradas de 2026-10-19), no Windows: validadas só no Linux,
  mesclado no PR #123 (`9748116`). O CI/CD enxugado (entrada "CI/CD: rodar só o que a mudança
  pede", 2026-10-19): o tempo novo do Windows no CI do PR e se algum job que saiu era check
  obrigatório da `main`.
- **Próximo passo sugerido:** rodar a etapa 18 do checklist do Agente na nuvem em Linux ou macOS com a
  `v0.1.452` (o CI passou, mas a interface só foi conferida no Windows).
- **Riscos abertos:** (1) a suíte vitest completa com os 16 workers padrão ficou instável numa
  máquina com 2 GB de RAM livres; use `npx vitest run --maxWorkers=4` (3151 testes passando, 90 s).
  (2) Um comentário em `app/electron/services/codex-status-screen.cjs` ainda cita a seção
  "Limites e uso por conta" do README, que agora está em `docs/guias/GUIA-CONTAS-E-LIMITES.md`; não
  foi editado porque qualquer mudança em `app/electron/` publica uma release.
  (3) Os artefatos de contexto morrem com o terminal, mas a conversa retomada do agente ainda os cita;
  a entrada de 2026-10-12 "artefato expirado deixava o agente parado" só impede que isso trave o
  agente (texto do erro de `felixo context read`) e não mudou a retenção.
  (4) Um bloco Codex com yolo marcado nasce "encerrado" por flag repetida quando algo fora do app já
  soma a flag. Há fallback e diagnóstico (entrada de 2026-10-12 "Codex: flag de yolo repetida"), mas a
  causa na máquina de quem relatou não foi confirmada; o evento `terminal-launch:early-exit` no QA Logger diz.
   (5) A suíte Node completa tinha três falhas preexistentes/de ambiente, nas descobertas de sessão e no
   terminal por conta; em 2026-10-14 ela passou sem falhas no Windows (2738 testes, 8 ignorados).
  (6) Cada atualização de uma CLI aberta deixa a pasta antiga do pacote (`.claude-code-XXXX`, do
  tamanho do pacote) no npm global até uma instalação seguinte com o processo fechado.
  (7) No Windows, `npm run test:native` completo falha de forma intermitente em "payload grande chega
  inteiro" ou "emoji não é partido" (`pty-write-queue`); isolado, passa. Derrubou o CI de `e7615c3`
  em 2026-10-14 e tem task própria no Notion.
- **Como compactar de novo:** este arquivo e `docs/projeto/IA.md` crescem com cada sessão. Quando
  passarem de uns 1000 linhas, rode `node app/scripts/archive-ia-md.cjs` (dry-run por padrão); o
  passo a passo está no Guia para Desenvolvedores.

## Registros arquivados

Registros antigos movidos, na íntegra e sem edição, para o arquivo. A linha do tempo completa
é este arquivo mais os de `docs/ia-archive/`, em ordem cronológica.

- [2026-10-12] Registros de 2026-08 (66 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-08.md](docs/ia-archive/IA-ARCHIVE-2026-08.md)
- [2026-10-12] Registros de 2026-09 (95 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-09.md](docs/ia-archive/IA-ARCHIVE-2026-09.md)

## 2026-10-13 — CLIs gerenciadas acompanham o `latest` do registry

### Contexto

As CLIs instaladas pelo aplicativo continuavam dependentes de versões fixadas no manifesto local. A inicialização precisava consultar o pacote `latest` no registry para manter a cópia gerenciada atualizada, sem substituir uma CLI externa já disponível no `PATH`.

### Decisão

- Consultar `npm view --prefer-online <pacote>@latest version dist.integrity --json` durante a preparação automática da aplicação.
- Comparar a versão detectada dentro do prefixo gerenciado com a versão retornada pelo registry; versões ausentes, inválidas ou antigas entram no plano de atualização.
- Usar a versão e o `dist.integrity` do manifesto como fallback quando a rede, o `npm` ou a resposta do registry falhar.
- Revalidar o hash SHA-512 exato antes de instalar e registrar a versão-alvo que falhou para evitar tentativas repetidas no mesmo startup.

### O que mudou

- `app/electron/services/cli-auto-install.cjs`, `app/electron/services/cli-auto-install-plan.cjs` e `app/electron/services/managed-cli-installer.cjs` agora resolvem o `latest`, planejam atualizações por versão e preservam CLIs externas.
- `app/electron/services/managed-cli-health.cjs` lê a versão real do pacote instalado; o manifesto mantém versões conhecidas para fallback.
- Testes cobrem comparação semver, atualização de cópia antiga, retry quando chega uma versão nova, fallback offline, integridade e leitura do pacote.
- `README.md`, `docs/guias/GUIA-USUARIO.md` e `docs/guias/GUIA-DESENVOLVEDOR.md` documentam o comportamento.

### Validação

- Testes direcionados: 62/62 passaram; `npm run lint` e `npm run build` passaram.
- Consulta real ao registry confirmou os metadados atuais de Codex, Claude Code e Gemini CLI.
- DevTools confirmou a interface na origem de desenvolvimento e no executável empacotado; o artefato `app/release/win-unpacked` foi gerado.
- A suíte `npm test` terminou com 2.693 sucessos, 8 skips e 3 falhas não relacionadas, nos testes de descoberta de sessão e terminal por conta.

### Limitações

- O fallback versionado é deliberadamente usado quando o registry não está acessível; a próxima abertura tenta novamente consultar o `latest`.
- As CLIs externas encontradas no `PATH` continuam fora do ciclo de instalação/atualização automática.

## 2026-10-14 — Atualização das CLIs em toda abertura do app

### Causa

A rotina que consulta o `latest` só era agendada quando `app.isPackaged` era verdadeiro. A execução a partir da fonte deixava de verificar e atualizar as cópias gerenciadas, contrariando o requisito de checar as CLIs em cada abertura.

### Correção

- `isAutoInstallEnabled` passa a habilitar a rodada por padrão, independente de empacotamento; `FELIXO_AUTO_INSTALL_CLIS=0` permanece como opt-out explícito para automações isoladas.
- O bootstrap deixa de transportar `app.isPackaged` para esse serviço. A atualização continua limitada ao prefixo privado do app, sem alterar CLIs encontradas no `PATH`.
- `README.md` e o Guia para Desenvolvedores passaram a documentar o comportamento uniforme e o opt-out.

### Validação

- `node --test electron/services/cli-auto-install-plan.test.cjs electron/services/cli-auto-install.test.cjs electron/services/managed-cli-installer.test.cjs electron/services/managed-cli-health.test.cjs`: 57 testes passaram.
- `npx eslint electron/main.cjs electron/services/cli-auto-install.cjs electron/services/cli-auto-install-plan.cjs electron/services/cli-auto-install-plan.test.cjs`: saída 0.

### Limitação

- A validação foi unitária e não abriu uma janela Electron nem instalou uma CLI real; os testes injetam o instalador e a consulta ao registry.

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

## 2026-10-12 — IA.md compactados sem perda e README dividido em guias

**Contexto.** A entrada anterior deixou duas lacunas à espera de decisão: os dois `IA.md` gigantes
e o README de 890 linhas. A pessoa decidiu, por pergunta interativa, fazer as duas: compactar tudo
e dividir o README. As duas mexem em muito texto versionado e outros agentes anexam ao `IA.md` em
paralelo; por isso o movimento foi feito por ferramenta que prova a conservação, e não à mão.

**O que foi feito.**

- **Ferramenta:** `app/scripts/archive-ia-md.cjs` com 15 testes em `archive-ia-md.test.cjs` (roda no
  CI com os demais testes Node). Separa as seções (`## ` fora de bloco de código), lê a data do
  cabeçalho em três formatos (`[AAAA-MM-DD]`, `AAAA-MM-DD —`, `DD/MM/AAAA —`), move as anteriores ao
  corte para um arquivo por mês, deixa um ponteiro datado, prova a conservação antes e depois de
  escrever, é dry-run por padrão e recusa escrever se o arquivo mudou durante a execução.
- **`IA.md` da raiz:** 8452 → 879 linhas (555 KB → 69 KB). 161 seções (66 de agosto, 95 de setembro)
  foram para `docs/ia-archive/IA-ARCHIVE-2026-08.md` e `-09.md`. Ganhou a seção **Estado atual
  (resumo vivo)** que o template exige.
- **`docs/projeto/IA.md`:** 6467 → 1307 linhas (654 KB → 127 KB). 149 seções (6 de julho, 69 de
  agosto, 74 de setembro) foram para `docs/ia-archive/IA-PROJETO-ARCHIVE-<mês>.md`. O prefixo
  próprio evita colidir com os arquivos da raiz. As seções fixas (Objetivo, Stack, Testes,
  Histórico de Evolução) e outubro ficaram.
- **Corte:** 2026-10-01, o primeiro dia do mês corrente; arquivo por mês.
- **README:** 890 → 487 linhas. Doze blocos passaram, na íntegra, para quatro guias novos em
  `docs/guias/` (`GUIA-CANVAS`, `GUIA-CONTAS-E-LIMITES`, `GUIA-SYSTEM-DESIGN`,
  `GUIA-DEPENDENCIAS-E-SBOM`). Sob "Rodar em outro PC" havia ~135 linhas de recursos do canvas e das
  CLIs e sob "Openia" ~190 de contas e limites que nada tinham a ver com esses títulos (a mensagem do
  commit `de8ce7d` diz "cerca de 400"; o certo é ~325). Os dois blocos que
  mantêm o título (sincronização e auditoria) viraram resumos curtos, preservando as âncoras.
  `docs/README.md`, a política de performance e o Guia para Desenvolvedores (como compactar de
  novo) foram atualizados.

**Por que assim / alternativas.** Mover à mão centenas de milhares de bytes é onde se perde linha sem
perceber. Para o README usei um script **descartável** (fora do repositório), porque a divisão é
única e não se repete; o padrão aceita a exceção quando o custo da ferramenta supera o ganho, e a
conservação foi provada do mesmo jeito. O `IA.md` pede uma ferramenta de verdade: vai precisar ser
repetido, então foi versionada e testada.

**Evidência: dois defeitos que a prova interna da ferramenta NÃO viu.** A prova do script compara
linhas; só uma conferência externa, com `diff` das linhas ordenadas do blob anterior contra o
resultado, e o verificador de links, pegaram:

- **Arquivo sem quebra de linha final.** Uma seção do meio sem linha em branco depois, ao virar a
  última do arquivo de um mês, deixava o arquivo sem LF e colava uma linha na seguinte ao
  concatenar. O conteúdo estava inteiro. Corrigido com teste que reprova sem a correção
  (vermelho-verde) e a saída agora sempre termina em LF.
- **6 links relativos quebrados.** Links escritos para a raiz ou `docs/projeto/` deixaram de
  funcionar em `docs/ia-archive/`. A ferramenta passou a reapontar os links de arquivo (links
  absolutos, âncoras locais e blocos de código ficam como estão) e a provar que só o destino mudou;
  os 6 já arquivados foram corrigidos com a mesma função.
- Lição: "nenhuma linha se perdeu" não é "nada quebrou". Mover texto pede também verificar EOL e
  links, e o verificador deve ser independente de quem moveu.

**Validação.** Mutações deliberadas na ferramenta (corte inclusivo, ponteiro perdido, última linha
descartada, sem EOL final, reaponte desligado) reprovaram 1, 2, 5, 1 e 1 testes. Diff independente
da raiz: 0 linhas removidas, 18 adicionadas (cabeçalhos e ponteiros); de `docs/projeto`: 0
removidas, 25 adicionadas. README: 15 linhas "removidas", exatamente os 10 títulos H3 promovidos a
H2 e as 5 linhas de link reescrito. Depois de tudo: `tsc` e `eslint` exit 0; Python 104 OK; Node
2677 testes, 0 falhas, 8 pulados; 133 links relativos e 43 âncoras, 0 quebrados. O vitest não foi
rerodado nesta etapa porque nenhum arquivo de `app/src` mudou desde a rodada verde (3145 testes).
No remoto, o CI de `37d6083` (primeiro lote: correções de teste, `ai-clis`, `plan`, README) terminou
`success`: `Validate` em windows, ubuntu, ubuntu-arm e macos, `Launcher` em três sistemas com Python
3.9 e 3.13, `Dependency policy` e `Python dependency audit`. Uma falha: `Benchmarks exploratórios
(windows-latest)`, passo "Benchmark terminal responsiveness during install". O job é
`continue-on-error` por desenho e nada deste lote toca o código desse benchmark; não foi investigado.

**Não alterado de propósito.** O comentário em `app/electron/services/codex-status-screen.cjs`
que cita a seção "Limites e uso por conta" do README continua apontando para um lugar que mudou;
qualquer mudança em `app/electron/` conta como mudança do instalador e publicaria uma release por
causa de um comentário. Fica registrado em **Estado atual**; corrigir na próxima vez que esse arquivo
mudar. A citação em `docs/projeto/PLANO-CADEIA-CONTAS.md` ("docs(readme): cadeia de contas no
README") é registro histórico de um commit e não foi tocada.

**Não validado.** Os commits desta etapa (e o `ac3107b`, da entrada anterior) estavam só locais ao
escrever isto; o CI deles (incluindo o teste novo em Linux e macOS) ainda não rodou. Os guias novos foram conferidos por links, âncoras e
diff, mas ninguém os leu inteiros na tela renderizada.

Estado: concluído e validado localmente no Windows; commits desta etapa aguardam envio e CI.

## 2026-10-12 — Agente na nuvem: movido para dentro do menu Agente

Registro de Claude — Tasks do AI Core. O trabalho começou numa sessão com Haiku 4.5 e terminou com Sonnet 5.5; o primeiro passe tinha defeitos (abaixo) e foi refeito.

**Contexto.** O #120 (`d84e579`) criou o Agente na nuvem como um botão avulso na seção *Criar*. A pessoa queria a função como mais uma opção do menu **Agente** (a configuração da setinha), configurada ali mesmo, ao lado de Claude, Codex e os outros. A spec do #120 tinha decidido o contrário (itens 3 e 8 do §12 de `ESPEC-AGENTE-NUVEM.md`); o item 9 novo registra a decisão da pessoa. Os guias do padrão de qualidade (a pasta não existe nesta cópia; lidos do repositório público, commit `cc4aae7`) e as skills de `IA.md` e de testes só foram lidos depois do primeiro passe, por cobrança da pessoa; a auditoria contra eles gerou os ajustes da segunda metade abaixo.

**Defeitos do primeiro passe (nunca commitado), achados ao revisar antes do teste.**

- Ao marcar a nuvem, o `TerminalMenu` trocava o formulário inteiro por outro sem o seletor de agente: não havia como voltar ao Claude.
- O valor `__cloud__` virava `providerId`, e o app chamava `cliAccounts.list('__cloud__')`: as contas da nuvem nunca seriam as do Claude.
- Perdeu o posicionamento do #120 (posição livre, seleção e centralização do cartão) e duplicou o `taskProblem` do cartão.
- Oferecia "Local (sem projeto)", que gera um cartão que `canLaunch` recusa (o `claude --cloud` precisa de pasta).
- O diálogo de passar responsabilidade, que reaproveita `AgentConfigFields`, ganhava a opção, e a união `NewAgentOptions` vazava por `CanvasView` e `HandoffDialog` (`'type' in options`).
- Eu tinha relatado "typecheck com 0 erros"; eram 3. O gate só ficou verde depois do refeito.

**O que foi feito (só `app/src`, nada em `app/electron`).**

- `AgentConfigFields` ganhou `allowCloud` (só o `TerminalMenu` liga). Com a nuvem marcada, a **Tarefa** (`CloudSessionConfigFields`, que agora é só esse campo) ocupa o lugar de modelo e esforço; conta e projeto são os campos de sempre.
- `providerIdOf` (puro, em `agent-launch-preferences.ts`) mapeia a nuvem para `claude`. `useAgentConfig`: `cloudTask`, `cloudProjectId` (o projeto escolhido ou o primeiro), `cloudReady` (é o `canLaunch` do cartão: o botão do menu só habilita quando o cartão aceitaria disparar) e `buildCloudOptions`. `buildOptions` voltou a devolver só `NewTerminalOptions`.
- `TerminalMenu` ganhou `onAddCloud`; `CanvasToolbar` repassa `onAddCloudSession` (o botão de *Criar* saiu); `CanvasView.addCloudSessionNode` voltou, agora com as opções do menu, e `createDraft` aceita a tarefa.
- Decisões e motivo:
  - **Cartão em rascunho, confirmação no cartão.** Disparar direto do menu pularia a confirmação que protege o crédito (invariantes I1 a I9).
  - **A nuvem nunca é gravada como último agente.** O botão compacto "Agente" abre a última configuração com um clique, e uma nuvem sem tarefa não teria o que abrir. Efeito colateral aceito: depois de usar a nuvem, o botão compacto só reabre o painel até a pessoa escolher outro agente.
  - **Sem fila (+), sem "Local (sem projeto)", sem "Automática (cadeia)"**: a fila inicia vários terminais, a nuvem exige pasta e a cadeia escolheria a conta por conta própria.
  - **Dois callbacks (`onAdd`, `onAddCloud`) em vez de união discriminada**: nenhum tipo novo vaza para quem só abre terminais.
- Inventário do canvas, `ESPEC-AGENTE-NUVEM.md` (§7 e item 9), checklist (etapas 1, 14 e 18), Guia do Usuário e README atualizados; `INVENTARIO-CANVAS.md` regenerado por `npm run docs:inventario-canvas`.

**Evidência (Windows 11).**

- `npm run typecheck` e `npm run lint`: saída 0.
- `vitest` completo (`CI=true npx vitest run --maxWorkers=4 --testTimeout=120000`): 205 arquivos, 3151 testes passando, 3 ignorados (eram 3145; 6 novos: `createDraft` com tarefa, cartão sem pasta que não dispara, preferência que ignora a nuvem e três do `providerIdOf`). O contrato do inventário reprovou ao remover o botão e passou depois de atualizar os dados.
- Mutação, uma por regra nova, todas mortas pelo teste esperado: `isAgentValue` aceitando a nuvem; `providerIdOf` sem mapear a nuvem para `claude`; `createDraft` ignorando a tarefa; `canLaunch` sem exigir a pasta (este também reprovou o teste antigo do cartão).
- **No app real isolado** (`felixo devtools launch`, da fonte, pasta registrada pelo seletor nativo de verdade): a seção *Criar* não tem mais o botão; o seletor lista a nuvem junto dos agentes; com ela marcada o seletor de agente continua visível e os campos mudam como descrito; `--settings=...` mostra o aviso e mantém o botão desabilitado; sem pasta o botão fica desabilitado; com pasta e tarefa o cartão nasce `cloud-session`, selecionado, com tarefa e pasta, e o painel fecha; o botão compacto com a nuvem sem tarefa só reabre o painel; voltar ao Claude traz o formulário completo e a fila; um shell comum ainda abre; recarregar mantém o cartão e a nuvem não fica gravada. O roteiro foi repetido do início ao fim depois da refatoração final, por um script fora do repositório (usa UI Automation do Windows para o diálogo nativo, então não serve de teste de CI).

**Não validado.**

- **Nenhuma sessão real foi disparada** (gasta crédito); o clique "Disparar na nuvem" do cartão não foi feito, só a criação do cartão.
- Que o diálogo de **Passar responsabilidade** não mostra a nuvem: garantido por código (só o `TerminalMenu` passa `allowCloud`) e pelo tipo, **não visto na tela**.
- Que `config.accounts` traz as contas do Claude com a nuvem marcada: garantido por `providerOf`; o perfil isolado não tem contas, e a ponte do app não deixa instrumentar a chamada.
- Linux e macOS. Não há teste de componente automatizado (o projeto não tem `jsdom` nem testing-library): a interface foi conferida só no app isolado, e a etapa 18 do checklist é a verificação manual objetiva (regra única de testes do guia mínimo).
- O smoke de CI não cobre a opção: a pasta só é autorizada pelo seletor nativo e o `mainEval` do smoke não tem `require` para trocá-lo. Ficou como convite no §11 da spec (item 6).
- O texto de ajuda do campo usa `text-zinc-400` pelo contraste AA do guia de frontend (§9.2); a razão foi estimada, não medida por ferramenta.
- Achado de passagem, anterior a esta mudança: `useCanvasProjects` divide o caminho por `/`, então no Windows uma pasta que não é repositório git vira projeto com o **caminho inteiro como nome**.

**Armadilhas de ambiente (valem para quem repetir).**

- `felixo devtools screenshot` atrasa um passo (janela invisível): tire duas capturas e use a segunda; o DOM (`devtools eval`) é a prova confiável. A lista do `FelixoSelect` (portal) não aparece na captura, mas está no DOM.
- O `felixo.cmd` do PATH apontava para uma instalação temporária sem `dev-runner.cjs`: rode `node electron/cli/felixo.cjs devtools …` dentro de `app/`.
- `devtools main` não tem `require` (sandbox proposital), e `devtools type` lê texto que começa com `--` como opção do CLI; para esse caso, o setter nativo do campo mais um evento `input` passa pelo mesmo `onChange`.
- A pasta de projeto só é autorizada pelo seletor nativo (concessão em memória do processo principal). Para exercitar o fluxo real no teste, o diálogo do Windows foi preenchido por mensagens ao próprio diálogo do app de teste (UI Automation para achar, `WM_SETTEXT` e `BM_CLICK` para agir), sem tocar em foco nem em outras janelas.

Estado: concluído e validado localmente no Windows. Commitado na `main` local, em três commits (código e testes; documentação pública; documentação interna), **sem push**. Mudar `app/src` conta como mudança do instalador (`release-relevant.sh`), então enviar para o remoto publica uma release: a decisão é de quem mantém o repositório. O `app/package-lock.json` que estava modificado na cópia de trabalho não é desta mudança: o npm 11 podou 13 pacotes de empacotamento do Windows (`electron-winstaller`, `electron-builder-squirrel-windows`, `@electron/windows-sign`, `rimraf`, `postject` e outros) depois de um `npm install --no-save`, e commitá-lo quebraria o instalador. Ficou guardado no `git stash` (mensagem "package-lock.json podado pelo npm 11…") e, como patch, fora do repositório; use `git stash pop` só se alguém precisar dele, e nunca o commite.

**Correção (mesma data).** Acima escrevi que enviar à `main` publica uma release. Não é bem assim: o `Release gate` (`.github/workflows/release-gate.yml`) compara só o último commit da execução do CI (`git diff --name-only HEAD^ HEAD`). Rodei `release-relevant.sh` em cada commit desta mudança: só o de código (`feat(nuvem)`) dá `true`; os três de documentação dão `false`. Logo, um push direto destes commits termina em `docs(ia)` e **não publica nada agora**; a mudança de `app/src` entra no próximo release que um commit de app disparar. Já um PR mesclado por squash vira um commit só, com `app/src`, e publica. Verificado no workflow e no script; o CI em si não foi rodado.

**Envio e CI (mesma data).** Os commits desta mudança foram enviados por push direto à `main` (`e7b7efe..d952f5b`), por decisão da pessoa; a regra de proteção foi contornada pela permissão de admin da conta. O CI de `d952f5b` terminou em `success` nos 22 jobs: `Validate` em Windows, Ubuntu, Ubuntu ARM e macOS, `Launcher` (Python 3.9 e 3.13) nos três sistemas, `Benchmarks` e `Benchmarks exploratórios` nos quatro, `Dependency policy`, `Python dependency audit` e `Release scripts`. O Release gate listou só `IA.md` como arquivo do commit, deu "Release relevante: false" e pulou a publicação, como previsto na correção acima. Não foi rodada nenhuma conferência na tela em Linux ou macOS.

## 2026-10-12 — Contexto: artefato expirado deixava o agente parado numa conversa retomada

Relato de uma pessoa usando o Codex no AI Core, no Windows (captura de tela): o agente tentou duas vezes ler `felixo context read` de três artefatos (`initial-context`, `agent-identity`, `skills-manifest`), recebeu "Artefato de contexto não encontrado" nos três, **não executou o pedido da pessoa** (subir o localhost) e pediu que ela "disponibilizasse novamente" os arquivos.

### Causa

Não é perfil trocado nem falha do shim: o `felixo.cmd` da captura é o de `%APPDATA%\felixo-ai-core\bin`, a mesma pasta de `userData` que grava `context-deliveries/` (a instância de desenvolvimento usa `-dev`), e o smoke de release lê esses arquivos no Windows. O que ocorre é uma diferença de tempo de vida:

- **Os arquivos** morrem com o processo do terminal: `finishExit` e `remove` chamam `context-file:release`; `dispose` no `before-quit` apaga todos os da sessão; e `cleanupStaleContextFiles` apaga, ao abrir o app, os de mais de 24 h (`context-files-ipc-handlers.cjs`).
- **A referência a eles** mora na conversa do agente, que o app retoma de propósito (`resumeAgentSession`: fechar e reabrir, o Codex se atualizando e saindo com código 0, reiniciar o bloco) **sem reenviar o contexto inicial**, para não repetir a instrução (`terminal-session-store.ts`, `finishExit`). A instrução original ("Leia todos os arquivos abaixo antes de agir… não substitua por outro artefato") continua no histórico.
- O leitor respondia ao arquivo ausente só com "informe este nome e o erro exato". O agente obedeceu ao pé da letra e parou. A regra de não trocar por outro artefato é legítima (um agente já leu um arquivo "equivalente" de outra sessão, ver 2026-09-08); o defeito era tratar a **expiração esperada** como uma falha a reportar, sem saída.

Os nomes da captura têm carimbo `1791213063512/17/21`, que é 2026-10-05 15:11:03 UTC, três escritas em 9 ms (o contexto inicial dividido em três por `splitInitialContext`). A captura marca 10:17. Em UTC−3 (Brasil) o artefato foi criado às 12:11, então a captura é de outro dia, o que condiz com conversa retomada; num fuso a UTC−5 ou mais a oeste caberia no mesmo dia, e o fuso da pessoa não é conhecido. **Não confirmei qual dos gatilhos aconteceu naquela máquina** (fechar o app, auto-atualização ou a limpeza de 24 h): isso exigiria o `logs\qa` dela.

### Correção

- `app/electron/cli/context-command.cjs`: `mensagemDeArtefatoAusente(name)` mantém a primeira frase de antes (nome e "não substitua") e acrescenta: os arquivos são temporários e quando o app os apaga; numa conversa retomada o conteúdo deve estar no histórico, então o agente **continua o pedido atual a partir dele**, sem esperar o arquivo reaparecer nem pedir que a pessoa o disponibilize; se o histórico não tiver o conteúdo, **não inventa** e avisa que o contexto expirou (nova conversa no bloco gera contexto novo). Código de saída continua 1.
- O texto vive no leitor, não no prompt: como o `felixo` roda o código do app instalado, uma conversa que já está travada passa a receber a orientação nova assim que o app for atualizado, sem precisar de um prompt novo. Sem o número de horas de propósito: o módulo não carrega o Electron e uma cópia de `STALE_CONTEXT_MAX_AGE_MS` divergiria em silêncio.
- Guia do Usuário (seção 5) descreve o comportamento.

### Evidência

- Teste novo `artefato expirado explica o ciclo de vida e não trava a conversa retomada` (`context-command.test.cjs`), escrito antes da correção: falhou por faltar a explicação (a mensagem recebida era exatamente a da captura) e passa depois.
- `node --test` de `context-command`, `felixo`, `context-files-ipc-handlers`, `context-delivery-log`: 61 passam. `eslint` dos dois arquivos: limpo.
- `release-smoke.test.cjs` (shim real, PTY real, nome ausente reportado): 7 passam, depois de baixar o binário do Electron nesta máquina.
- Comando real com perfil vazio (`FELIXO_USER_DATA_DIR`, `ELECTRON_RUN_AS_NODE=1`, `node electron/cli/felixo.cjs context read <nome>`): saída com as quatro frases novas e `exit=1`.

### Não validado e em aberto

- **Não rodei um Codex de verdade lendo a mensagem nova.** Que o agente siga a orientação (continuar a partir do histórico) é o efeito esperado de um texto de erro, não algo provado aqui. Também não vi o `felixo.cmd` no Windows; o que foi exercitado é o mesmo `.cjs` no Linux.
- Que o histórico retomado traga o conteúdo lido no início depende de a CLI do agente guardar as saídas das ferramentas. Se não guardar, cai no segundo caminho da mensagem (avisar e pedir nova conversa).
- **A diferença de tempo de vida continua.** Esta mudança só impede que a expiração trave o agente. Opções que não fiz, por mexerem em retenção de dados que contêm prompts e handoffs: manter os artefatos de blocos com conversa retomável até o bloco ser removido, ou o app avisar a pessoa ao retomar que o contexto antigo expirou.
- Mudar `app/electron/` publica uma release ao mesclar (regra do `Release gate`); a decisão de mesclar é de quem mantém.

Estado: concluído e validado localmente no Linux (Node 22.22). Em branch própria (`claude/keen-darwin-b2lrbc`) com PR em rascunho; sem push direto à `main`.

## 2026-10-12 — Codex: flag de yolo repetida derruba o bloco ao abrir (fallback e diagnóstico)

Fecha uma pendência do registro de "artefato expirado deixava o agente parado": o PR #121 foi mesclado (squash `de58bba`) e a release `v0.1.453` saiu; a linha "PR em rascunho" daquela entrada ficou desatualizada.

### Relato

Um bloco criado por **Criar > Agente** (Codex, conta free, `gpt-6-luna`, esforço `max`, **Yolo ligado**) nasce "encerrado" com `error: the argument '--dangerously-bypass-approvals-and-sandbox' cannot be used multiple times` e o bloco `Usage: codex [OPTIONS] [PROMPT]`. Relatado como recorrente, e "sem o yolo vai normal". Numa captura, o bloco criado com o Yolo **desmarcado** mostrava `permissions: YOLO mode` no banner do Codex (v0.149.0-alpha.4.1).

### Investigação

- **O app não duplica a flag.** Li tudo que monta argumentos de Codex (menu, presets, continuação em outra conta, reinício, retomada, spawn do PTY no cmd e no PowerShell) e rodei as combinações num teste descartável: sempre uma ocorrência, mesmo empilhando a retomada duas vezes.
- **O erro não depende de conta nem de modelo.** Com o `codex` 0.162.1 instalado numa pasta temporária, sem login: duas flags de yolo antes do subcomando dão exatamente o erro e o `Usage` das capturas; o `--yolo` é apelido da mesma opção; com `resume` o `Usage` seria o do subcomando. Modelo que a conta não aceita falha **depois**, como erro de API 400 dentro do terminal (fixture do próprio app). As hipóteses "conta free" e "modelo não permitido" não produzem este erro; o plano da conta não entra nos argumentos.
- **No app real** (Electron da fonte, Xvfb, perfil isolado): com o Yolo desmarcado, o `ps` mostra o `codex` aberto **sem argumento nenhum**. Com um `codex` na frente do PATH que sempre soma a flag e o Yolo marcado, o app manda **uma** flag (conferido no log) e o Codex responde com o mesmo erro das capturas. O mecanismo está reproduzido e explica as duas observações: desmarcado, a flag de fora dá o YOLO mode; marcado, são duas.

### Mudanças (`app/src`)

- **`dropRepeatedYoloFlags`** (`agent-launch-options.ts`): descarta flag de yolo repetida (as duas grafias contam como uma) nos argumentos do Codex antes do spawn, inclusive na retomada. Não toca em `-c`/`--model` repetidos nem no que vem depois de `--`.
- **Fallback `relaunchWithoutDuplicateYolo`** (`terminal-session-store.ts`): se o Codex recusa a repetição logo ao abrir (10 s, sem tecla da pessoa, sem texto enviado) e o app mandou exatamente uma flag, a outra vem de fora; reabre **uma vez** sem a do app (o yolo vale pela de fora) e avisa no bloco. Sem a flag do app não há o que tirar de novo, então não há laço. Mantém a retomada (`resume <id>`).
- **Diagnóstico `terminal-launch`**: quando um Codex cai logo ao abrir, o bloco mostra o código de saída e os **argumentos enviados**, e o QA Logger (`logs/qa/qa-AAAA-MM-DD.jsonl`) guarda comando, argumentos pedidos e enviados, flags descartadas, código, tempo, conta, provedor, versão da CLI, plataforma e o fim da tela. Eventos: `args-normalized`, `yolo-duplicate-retry` e `early-exit`. Só o Codex: Claude e Gemini têm avisos próprios de retomada e login.
- Guia do Usuário, em Solução de problemas, descreve o caso e onde achar o diagnóstico.

### Evidência

- `agent-launch-options.test.ts`: 21 passam; `terminal-session-store.test.ts`: 107 passam (escritos antes do código; o descarte e o fallback falharam primeiro). Área do canvas inteira: 140 arquivos, 1805 testes. `tsc -b` e `eslint` dos arquivos alterados limpos.
- **App real, com o `codex` embrulhado e o Yolo marcado:** o log mostra `yolo-duplicate-retry` com `retryArgs: []` e o segundo spawn **passou do parser de argumentos** (o erro de flag sumiu).

### Não validado e em aberto

- **Não vi a máquina de quem relatou.** O mecanismo foi reproduzido, não a causa lá: que exista um wrapper ou alias é a hipótese que melhor explica as duas observações, mas pode ser outra fonte de flag. `Get-Command codex -All` no PowerShell e o evento `terminal-launch:early-exit` confirmam. A versão do Codex dele (0.149.0-alpha) é uma alfa.
- **Não vi o Codex abrir em YOLO mode depois do fallback:** o terminal virtual daqui derruba o TUI do Codex 0.162.1 (`timed out discarding buffered terminal input`), sem relação com isto. Windows e macOS não foram testados.
- O fallback roda a cada lançamento com Yolo marcado enquanto a flag de fora existir (cerca de 1 s e o aviso). Não guardei "já sei que há yolo externo": se o wrapper sumisse, o bloco abriria sem yolo em silêncio.
- Anotado, fora do escopo: o app não tem fonte do que cada **plano** pode usar (modelos por plano nas configurações do agente); pela leitura do código, o `codex exec` sem terminal liga o acesso total por padrão (`FELIXO_CODEX_FULL_ACCESS`), sem teste.
- Mudar `app/src` publica uma release ao mesclar.

Estado: em branch própria (`claude/keen-darwin-b2lrbc`), PR em rascunho, aguardando revisão; sem merge.
**Release e medições (mesma data).** A pessoa pediu a release: o `release.yml` foi disparado à mão para `d952f5b`, que é o caminho previsto para publicar um commit já validado, e terminou em `success` nos seis jobs (`Prepare release`, `Publish` de Ubuntu, macOS e Windows, `Publish release` e `Smoke exploratório (Windows)`). A `v0.1.452` está publicada, não é pré-release, aponta para `d952f5b` e tem 28 artefatos. Com isso deixou de valer a frase acima de que a mudança só sairia no próximo commit de app. O `Release gate` não publicou sozinho porque o último commit do push era só `IA.md`; quem quiser contribuir pode fazê-lo comparar tudo o que chegou desde a última decisão, e não só o último commit.

Dois pontos que estavam como estimativa foram medidos no app isolado. Contraste (cores convertidas para sRGB e razão do WCAG): o texto de ajuda do campo Tarefa dá 6,95:1 sobre o fundo do painel, contra os 4,5:1 do AA; o rótulo dá 7,06:1, o placeholder 5,63:1 e o texto digitado 16,56:1. Trocando a classe do mesmo elemento para `text-zinc-500`, que é a dos outros textos de ajuda do formulário, a razão cai para 3,78:1: fica como convite rever esses textos. Teclado: o foco segue Agente, Conta, Tarefa e Projeto, com anel de foco visível em todos; o botão desabilitado é pulado; Esc com o foco no campo fecha o painel e devolve o foco ao botão Agente.

O que o processo não seguiu, para quem retomar: os guias do padrão de qualidade e as skills foram lidos depois do código, e a skill de projeto `rodar-app` e a de entrada em repositório só na auditoria final, então o gate não foi rodado antes da primeira alteração; a primeira versão desta entrada foi reescrita antes do primeiro commit, em vez de receber uma nota datada; os commits saíram em bloco no fim, e não a cada unidade concluída; e o roteiro ponta a ponta ficou fora do repositório por depender do Windows.

## 2026-10-13 — Nomes de contas locais não podem duplicar no mesmo provedor

**Causa.** O cadastro de perfis em `cli-account-store.cjs` aceitava qualquer nome não vazio e gerava um UUID novo a cada clique. Assim, repetir o mesmo e-mail ou rótulo criava pastas de login diferentes que apareciam como contas repetidas no configurador.

**Correção.** O processo principal agora compara o nome normalizado dentro do provedor antes de criar a pasta: espaços repetidos, espaços nas extremidades, caixa e compatibilidade Unicode não geram outro perfil. A criação é recusada com erro explícito e código `CLI_ACCOUNT_DUPLICATE`; nomes iguais em provedores diferentes continuam independentes. O teste também verifica que a rejeição não deixa uma pasta extra.

**Validação.** O teste de regressão falhou antes da correção por aceitar a segunda criação e passou depois; `node --test electron/services/cli-account-store.test.cjs` terminou com 26 testes passando no Windows. Duplicatas já existentes não são apagadas automaticamente para preservar credenciais: devem ser removidas individualmente pela interface.

## 2026-10-13 — Migração automática das contas duplicadas legadas

**Correção da anotação anterior.** A exigência mudou: a próxima atualização precisa corrigir também quem já tinha duplicatas. Na inicialização, o registro agora conserva a primeira conta de cada provedor e nome normalizado, cria aliases para os IDs antigos, reaponta preferências, cadeia e histórico de uso, transfere a chave do Openia e preserva o perfil duplicado em `cli-account-duplicates` antes de tirá-lo da lista ativa.

**Validação.** A migração foi coberta com casos de perfil Codex, chave Openia, reabertura idempotente e IDs antigos; os testes focados de Node passaram, assim como os testes de seleção/rótulo do frontend, typecheck e lint. A suíte Node completa ainda deve ser registrada após a rodada final.

## 2026-10-13 — Nomes das contas visíveis no resumo de Limites e uso

**Relato.** A tabela de resumo do painel **Limites e uso** mostrava apenas o começo dos nomes das contas em uma janela estreita, embora a identidade completa já chegasse ao renderer.

**Causa.** `AgentUsageProviderSummary.tsx` usava `table-fixed` e aplicava `truncate` à célula da conta. A coluna era a única sem largura definida e podia ser comprimida pelos indicadores de plano, janelas e status. Além disso, o `title` apontava para `account.label`, que pode ser diferente da identidade exibida.

**Correção.** A célula agora usa o identificador que realmente aparece (`identityDisplay` com fallback para `label`), permite quebra de palavras longas e usa esse mesmo valor no `title`. O backend e o contrato de contas não foram alterados.

**Evidência.** O teste de regressão foi escrito antes da correção e falhou porque não encontrava o título com o identificador completo nem a regra de quebra; depois passou. `npx vitest run --maxWorkers=4 src/features/canvas/components/tools/AgentUsageProviderSummary.test.ts`: 6 testes; suíte frontend completa: 205 arquivos, 3.176 testes aprovados e 3 ignorados; `npm run typecheck`, `npm run lint` e `npm run build`: exit 0.

**Não validado.** Não abri o Electron com contas reais nesta rodada; portanto, a conferência visual manual não foi feita. O teste de renderização estática confirma o identificador e as classes responsivas esperadas. O aviso de chunks grandes do Vite permaneceu igual ao baseline.

Estado: concluído e validado localmente no Windows; publicação externa não foi feita nesta sessão.

## 2026-10-14 — Nome da conta ganha linha própria no resumo de Limites e uso

**Relato.** Depois da correção anterior (`cc078e9`), o Felipe mandou o print do painel **Limites e uso** com o Codex: os e-mails das contas continuavam ilegíveis, agora quebrados letra por letra em pedaços de seis ou sete caracteres, e cada conta ocupava cinco ou seis linhas.

**Causa.** A correção anterior trocou `truncate` por quebra de palavra, mas não mexeu na largura da coluna. Com `table-fixed`, plano (`w-12`), uma coluna `w-[4.5rem]` por janela e status (`w-[5.25rem]`) ficavam com largura fixa; o Codex publica quatro janelas de conta, então sobravam poucos pixels para a coluna **Conta** no painel estreito. A anotação daquela rodada já registrava que a conferência visual não tinha sido feita.

**Correção.** Em `AgentUsageProviderSummary.tsx`, cada conta virou um `<tbody>`: a primeira linha é o identificador (e o aviso de bloqueio) em `th scope="rowgroup"` com `colSpan` cobrindo todas as colunas; a segunda traz plano, janelas e status. A coluna **Conta** saiu do cabeçalho e as janelas deixaram de ter largura fixa, dividindo o que sobra entre plano e status. O leitor de tela continua associando cada número à conta pelo cabeçalho do grupo. Dados, backend e contrato não mudaram.

**Evidência.** O teste de regressão foi reescrito antes da correção e falhou (sem `rowgroup`/`colSpan`, coluna **Conta** presente, um único `<tbody>`); depois passou. Gates: `npm run typecheck`, `npm run lint` e `npx vite build` com exit 0; `npx vitest run --testTimeout=120000 --maxWorkers=4`: 205 arquivos, 3.176 testes aprovados e 3 ignorados. Conferência visual: renderizei a tabela antiga e a nova com as sete contas do print e o CSS do build, num screenshot do Edge headless a 400 px e 330 px. A antiga reproduziu o print; na nova todos os e-mails cabem numa linha nas duas larguras; a 330 px os percentuais quebram em "77 % / livre", sem sobrepor colunas.

**Não validado.** Não abri o Electron com as contas reais; a prévia usou o CSS do build fora do app. Fica registrado, sem mudança nesta rodada, que o Codex publica duas janelas com o mesmo rótulo ("Últimas 5 h" e "Últimos 7 dias" aparecem duas vezes e cada conta preenche só um dos pares, deixando o outro com traços), o que confunde a leitura das colunas.

Estado: concluído e validado localmente no Windows.

## 2026-10-14 — CI vermelho desde 5c273d8: smoke L13 com a instalação automática ligada na fonte

**Relato.** Ao publicar a correção do resumo de Limites e uso, o CI da `main` já estava vermelho desde `5c273d8` (run 38506544412, e o Nightly 38556790578): `Validate` falhava nos quatro sistemas, sempre na sessão D do `canvas-smoke`, passo **L13 terminal: URL quebrada pela TUI** ("a dica do link (escolher onde abrir) não aconteceu em 15000 ms"), nas três tentativas. Com o CI vermelho, o Release gate fica `skipped` e nenhuma correção chega ao app.

**Causa provável.** Entre o último verde (`81e19ac`, run 38500389625) e o primeiro vermelho, a única mudança de comportamento foi `isAutoInstallEnabled` passar a ligar a instalação automática das CLIs também na fonte. O `canvas-smoke.cjs` roda a fonte (`Origem: fonte (dev)`) e, ao contrário do `packaged-canvas-smoke.cjs`, não tinha o opt-out `FELIXO_AUTO_INSTALL_CLIS=0`, que o próprio `5c273d8` documenta para automações isoladas. A captura da falha mostra "CLIs prontas" no rodapé, ou seja, a rodada rodou durante o smoke, e nenhum aviso cobrindo o link; o mecanismo exato (rede/CPU no meio da sessão ou o fim da instalação mexendo no terminal aberto) não foi isolado.

**Correção.** `withDevtoolsSession` passa a definir `FELIXO_AUTO_INSTALL_CLIS: '0'` em toda sessão do smoke da fonte, como o smoke empacotado já fazia; o comentário do `packaged-canvas-smoke.cjs`, que dizia que a fonte não instalava CLIs, foi atualizado. O comportamento do app não muda.

**Validação.** `eslint` e `node --check` nos dois scripts. Não rodei o smoke localmente (abriria uma janela do Electron na sessão remota do Felipe); a confirmação fica para o CI deste envio.

**Pendente.** Se o fim da instalação automática com um terminal aberto quebra a dica de link no app real, isso continua sem teste: os dois smokes agora desligam a instalação.

## 2026-10-14 — CLIs: a versão mais nova publicada (inclusive pré-lançamento), também a do sistema, em toda abertura

Registro de Claude — Tasks AI Core (Opus 5.5). Pedido da pessoa: "Toda vez que abre o AI Core ele tem que buscar as versões mais recentes possíveis da CLI e instalar automaticamente". Início às 12:55.

**Contexto e medição.** As duas entradas de CLIs no topo deste arquivo (13/10 e 14/10) já consultavam o `latest` em toda abertura. Um diagnóstico só de leitura no PC mostrou por que, mesmo assim, os agentes não abriam na versão mais nova:

- **Codex nunca atualizava.** A cópia gerenciada guarda o pacote da plataforma (`@openai/codex-win32-x64`) aninhado em `node_modules/@openai/codex/node_modules/`, mas `verifyManagedCliInstallation` só procurava no caminho achatado. A verificação dizia "ausente", a rodada tratava a CLI como externa e não a tocava.
- **Claude rodava a cópia do sistema.** No terminal do agente, o npm global vem antes da cópia gerenciada no `PATH`; a cópia do sistema nunca era atualizada pelo app.
- **Só o canal `latest` contava.** Em 14/10 havia versões mais novas fora dele: Claude `next` 2.1.300 (o `latest` era 2.1.299), Codex `alpha` 0.163.0-alpha.11 (o `latest` era 0.162.1) e Gemini `nightly`/`preview` 0.65.0 (o `latest` era 0.64.0).

**Decisões da pessoa (Trilha B, pela pergunta interativa).** (1) Atualizar também a instalação do sistema (npm global), não só a cópia do app. (2) Aviso discreto com o que foi atualizado. (3) Incluir pré-lançamento: a versão mais nova de todas, inclusive alpha, beta, next e nightly.

**O que mudou (seis commits, enviados juntos).**

- `71125a3` — `managed-cli-health.cjs`: o pacote nativo é procurado primeiro dentro do pacote principal da CLI e depois no caminho achatado. Aninhado dentro de outro pacote não conta.
- `d576282` e `6bfb911` — `managed-cli-installer.cjs`: a consulta passou a ser `npm view --prefer-online <pacote> dist-tags time --json`, com limite de saída de 4 MB (o mapa de datas do Codex passa de 300 KB). `chooseNewestPublishedVersion` pega a maior versão principal (`major.minor.patch`) entre os canais e, dentro dela, a publicada por último; sem datas, decide o semver. Versões de binário de plataforma (`-win32-x64` e afins) ficam de fora. Uma segunda consulta traz o `dist.integrity` exato da versão escolhida, e o fallback versionado do manifesto continua valendo quando o registry falha.
- `6bfb911` — `cli-auto-install-plan.cjs`: `isTargetNewer` troca a instalada sempre que ela é diferente do alvo, menos quando a versão principal dela é maior (não rebaixa). Dentro da mesma versão principal vale a ordem de publicação: a nightly de 14/10 do Gemini vem depois da preview de 13/10, embora "preview" ordene acima de "nightly" no semver.
- `e78a2b8` — `system-cli-update.cjs` (novo) e a rodada em `cli-auto-install.cjs`:
  - Acha o `npm root --global` do sistema, com `npm_config_prefix` e afins removidos do ambiente para não cair no prefixo do app, e lê a versão instalada.
  - Roda `npm install --global <pacote>@<versão>` só com alvo confirmado pelo registry e confere a versão nova no disco.
  - Uma CLI em uso fica adiada, seja a do sistema ou a cópia do app: o executável dela está na lista de processos (`Get-CimInstance Win32_Process`, só no Windows). `EBUSY`/`EPERM` na saída do npm também viram adiamento, não falha.
  - Quando algo fica adiado, a rodada tenta de novo a cada 5 minutos (`DEFERRED_RETRY_MINUTES`).
  - O estado guarda as tentativas do sistema em `sistema:<id>`, separadas das da cópia do app.
- `dd5d5d5` — `cli-setup-presentation.ts` e `vite-env.d.ts`: o rodapé mostra "CLIs atualizadas" e a descrição lista o que mudou, por exemplo "Codex CLI 0.150.1 → 0.163.0-alpha.11 · Claude Code CLI do sistema 2.1.287 → 2.1.300".
- `8f18131` — README, Guia do Usuário e Guia do Desenvolvedor.

**Evidência (Windows 11).**

- TDD: o teste de cada regra nova foi escrito antes e falhou; os dados de canal nos testes têm a forma real do registry (`CANAIS_CLAUDE`, `CANAIS_GEMINI` com as datas reais, `CANAIS_CODEX`).
- Mutações: quatro na rodada (M1 a M4), todas mortas. A da regra de data só morreu depois do teste de independência de ordem (antes, o resultado dependia da ordem dos canais na entrada).
- Os testes da rodada usam um sistema falso (`SEM_INSTALACAO_DO_SISTEMA`) que lança erro se alguém tentar instalar: nenhum teste toca no npm global real.
- Gates: `node --test` completo com 2738 testes (2730 passaram, 0 falhas, 8 ignorados) e `npm run lint` com saída 0, depois do último commit. `npm run typecheck` com saída 0 e `vitest` com 3179 testes passando foram rodados antes de `6bfb911`, que só mexeu em `app/electron`.
- **Teste real no PC (pedido da pessoa).** Instância isolada da fonte (`felixo devtools launch`), com as pastas dos perfis reais fora do `PATH`. A rodada:
  - instalou a Gemini na cópia do app, em 0.65.0-nightly.20261014;
  - atualizou o Codex do npm global de 0.160.0 para 0.163.0-alpha.11 (mudança real no PC);
  - adiou o Claude do npm global, em uso por esta sessão do Claude Code.

  No terminal do AI Core: `claude --version` 2.1.287 (npm global), `codex --version` codex-cli 0.163.0-alpha.11 (npm global) e `gemini --version` 0.65.0-nightly.20261014 (cópia do perfil isolado). O aviso "CLIs atualizadas" apareceu no rodapé.
- **Comparação com a internet** (registry do npm e releases do GitHub, 14/10). Codex: a mais nova é 0.163.0-alpha.11 (a estável é 0.162.1). Gemini: v0.65.0-nightly.20261014 (preview 0.65.0-preview.0, estável 0.64.0). Claude: `next` 2.1.300 (`latest` 2.1.299, `stable` 2.1.287). Codex e Gemini batem com a mais nova. O Claude não bate porque estava em uso.
- O teste real achou um defeito da primeira versão: ela escolhia a preview do Gemini (pelo semver) em vez da nightly, publicada depois. A regra da data de `6bfb911` corrigiu.

**Não validado e limitações.**

- **Claude com agentes abertos.** Os agentes restaurados sobem antes da rodada (que começa 4 s depois da abertura), então o Claude do sistema quase sempre está em uso e só atualiza quando todos os agentes Claude fecham; a nova tentativa a cada 5 minutos pega esse momento. Caminhos possíveis: atualizar antes de restaurar os terminais, ou instalar lado a lado.
- Instalações fora do npm global não são atualizadas: o instalador nativo do Claude, Homebrew, pnpm e Volta.
- Linux e macOS só foram cobertos pelos testes e pelo CI. Fora do Windows a lista de processos fica vazia e o adiamento depende do `EBUSY`/`EPERM` do npm.
- O app real deste PC roda de uma pasta `release-smoke` dentro da pasta temporária do sistema (v0.1.458); a cópia gerenciada da Gemini dele (0.64.0) só atualiza quando o app real abrir numa versão com esta mudança.
- Achado de passagem, fora do escopo: `felixo context read` com artefato ausente junta duas mensagens (`app/electron/cli/context-command.cjs:267`), que repetem "Artefato de contexto não encontrado" com instruções sobrepostas.

**Envio, CI e release.**

- **Envio:** os seis commits foram para a `main` por push direto às 13:36 (`676abb8..6bfb911`). A regra de proteção foi contornada pela permissão de admin, como nos envios anteriores.
- **CI** [38599315363](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38599315363): os 22 jobs passaram, inclusive `Validate` nos quatro sistemas, às 13:53.
- **Release gate** [38601808702](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38601808702): "Commit de base avaliado: 676abb8…" e "Release relevante: true". O `release-base.sh` comparou o intervalo inteiro do envio, não só o último commit.
- **Release** [38601843878](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38601843878): `v0.1.460` publicada às 14:13 como versão principal ("Latest"), com os instaladores de Windows, macOS e Ubuntu. O "Smoke exploratório (Windows)", que é `continue-on-error`, também passou às 14:15; a tag aponta para `6bfb911`.

Estado: concluído, publicado na `v0.1.460` e validado no Windows numa instância isolada da fonte. A conferência no app instalado ficou como task no Notion.

## 2026-10-14 — CLIs: o Claude não atualizava (ETARGET na cópia do app e adiamento eterno no sistema)

Registro de Claude — Tasks AI Core (Opus 5.5), continuação da entrada anterior. Depois de atualizar o app real para a `v0.1.460` (aberto às 14:32), a pessoa relatou: "o do Codex funcionou, já no claude, não conseguiu atualizar". Depois acrescentou: "mesmo sem nenhuma CLI aberta no AI Core, ele estava avisando que não conseguia atualizar pois tinha algum terminal aberto".

**Correção da entrada anterior.** Lá eu registrei que, no Windows, uma CLI aberta não pode ser trocada e por isso fica adiada. Era uma suposição que eu não tinha medido, e está errada (ver Experimentos). O adiamento criado em `e78a2b8` era a própria causa do problema relatado.

**Medição no app real** (`v0.1.460`, rodando de `%TEMP%\felixo-release-smoke-…\installed`).

- `cli-auto-install.json`: Codex `ok` (0.163.0-alpha.11) e Gemini `ok` (0.65.0-nightly.20261014.g42c518220). O Claude ficou `ok: false`, "Nao foi possivel instalar @anthropic-ai/claude-code@2.1.300. (codigo 1)", às 14:30 e às 14:31. Nenhuma chave `sistema:*`, porque o adiamento não gravava estado.
- Log de QA: `npm error code ETARGET`, "No matching version found for @anthropic-ai/claude-code@2.1.300".
- Log de depuração do npm: o `argv` tinha `--cache …\cli-cache\npm-registry-cache --prefer-offline`, e a linha `GET 200 …/@anthropic-ai%2fclaude-code 29ms (cache stale)` mostra que ele usou o cache sem revalidar.
- `npm view --offline --cache <cache do app>`: canal `next` em 2.1.299, sem a 2.1.300 entre as 539 versões. No registry, `next` estava em 2.1.300, publicada em 2026-10-14T14:27:26Z.
- Processos: `claude.exe --chrome-native-host` (PID 27540, aberto desde as 11:54). O pai é um `cmd.exe` aberto pelo `brave.exe` com `%USERPROFILE%\.claude\chrome\chrome-native-host.bat`, e o executável fica dentro do pacote do npm global. É o host nativo da extensão Claude in Chrome. Por causa dele, a rodada adiava o Claude do sistema em toda abertura, e o aviso dizia "Em uso por um agente aberto".

**Causas.**

1. **ETARGET na cópia do app.** A escolha do alvo usa `npm view --prefer-online` e enxerga a versão nova. A instalação usava o cache do app com `--prefer-offline`, que aceita a lista de versões guardada sem perguntar ao registry.
2. **Adiamento eterno no sistema.** A rodada adiava qualquer CLI com o executável aberto, e o host nativo do navegador fica aberto o dia todo.

**Experimentos** (scratchpad e prefixos temporários, sem tocar no npm global).

- `PING.EXE` copiado como `pkg\bin\claude.exe` e rodando: apagar a pasta falha; renomear a pasta funciona; mover o `.exe` funciona. O processo continua vivo, e o Windows segue informando o caminho antigo dele.
- npm do sistema (11.6.2) e npm embutido (11.19.1), atualizando um pacote local de 1.0.0 para 1.0.1 com o `.exe` dele rodando: saída 0, a 1.0.1 fica no disco e a pasta antiga sobra ao lado (`.felixo-exp-lock-XXXX`). Numa instalação seguinte, depois que o processo fecha, essa pasta some.
- Claude Code real: 2.1.299 instalado num prefixo temporário, com `claude.exe mcp serve` aberto. `npm install …@2.1.300` saiu com 0 em 14 s, `--version` passou a dar 2.1.300, o processo antigo continuou vivo e sobrou `.claude-code-Ec3GtIoV` ao lado. Uma tentativa anterior com `--chrome-native-host` não chegou a subir: o pipe já era do host real (`EADDRINUSE`), e o processo de teste saiu sem afetar o real.
- ETARGET com os dados reais: cópia do cache do app (348 MB) e o npm embutido. Com `--prefer-offline` deu `ETARGET`; com `--prefer-online`, instalou a 2.1.300.

**Correção.**

- `eb52933` — `createNpmInstallArgs` e `installManagedPackage` ganham `preferOnline`, e a rodada passa `preferOnline: latestPackage?.source === 'registry'`. O tarball continua saindo do cache pelo hash; só o alvo do manifesto de fallback segue com `--prefer-offline`. O npm do sistema também instala com `--prefer-online`.
- `9b0a5e9` — saem `listRunningExecutables`, `isInstallInUse`, `managedInUse`/`inUse` e a leitura de processos da rodada. `EBUSY`/`EPERM` na saída do npm continuam como rede de segurança (nova tentativa em 5 minutos), com um texto ("arquivos travados") que não culpa agentes. Um teste com npm de verdade, só no Windows, guarda a premissa: "no Windows, o npm do sistema atualiza o pacote com o executável dele rodando".
- `5767e8b` — README, Guia do Usuário e Guia do Desenvolvedor. O Guia do Desenvolvedor também passa a descrever a escolha do alvo como está desde `6bfb911`.

**Validação.**

- TDD: na fase vermelha, 6 falhas pelos motivos esperados; depois, verde. As mutações M1 a M5 morreram: rodada nunca ou sempre com `preferOnline`, argumentos que ignoram `preferOnline`, instalador que não repassa a opção e npm do sistema sem `--prefer-online`.
- O estado do primeiro commit (`eb52933`) foi testado sozinho, numa exportação do índice: 87 de 87.
- Suíte Node completa: 2735 testes, 2726 passaram, 8 ignorados e 1 falha de ambiente. A falha foi em "analyzeRepo detecta commits remotos pendentes de pull": `git clone` sob carga deu "fatal: unknown error occurred while reading the configuration files"; isolado, o teste passa 3 de 3. `npm run lint` com saída 0. Não houve mudança em TypeScript.
- **Teste real no PC.** Instância isolada da fonte aberta às 14:58:47, com o host nativo do Brave (PID 27540) e esta sessão (PID 12356) abertos.
  - Às 14:59:30 a rodada atualizou o Claude do npm global de 2.1.287 para 2.1.300.
  - No disco, `package.json` em 2.1.300 e `claude --version` respondendo "2.1.300 (Claude Code)"; os dois processos antigos continuaram vivos, e o npm deixou `.claude-code-tAuxFcZW`.
  - O aviso da interface dizia "Gemini CLI instalada (0.65.0-nightly.20261014.g42c518220) · Claude Code CLI do sistema 2.1.287 → 2.1.300".

**Não validado e limitações.**

- A cópia gerenciada do app real (`%APPDATA%\felixo-ai-core\clis`) segue em 2.1.299 até o app abrir numa versão com esta correção. A falha da 2.1.300 ficou registrada para a 0.1.460, e como o registro vale por versão do app, a release nova libera outra tentativa.
- A pasta antiga `.claude-code-XXXX` fica no npm global enquanto o processo antigo estiver aberto. Que o npm a remove numa instalação seguinte foi medido com o pacote de teste, não com o Claude.
- Agentes abertos continuam na versão antiga até serem reiniciados; os novos abrem na nova.
- Linux e macOS não têm a trava de executável aberto. Lá rodam só os testes de unidade; o teste com npm real é só do Windows.

**Envio, CI e release.**

- **Envio:** push direto à `main` às 15:07 (`27dc229..5767e8b`). O CI do commit de docs anterior (`27dc229`, [38605272027](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38605272027)) tinha passado às 14:32, e o gate dele não publicou ("Release relevante: false").
- **CI** [38612371019](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38612371019): os 22 jobs passaram às 15:21, inclusive `Validate (windows-latest)`, que roda o teste novo com npm real.
- **Release gate** [38614435215](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38614435215): "Commit de base avaliado: 27dc229…" e "Release relevante: true".
- **Release** [38614478105](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38614478105): `v0.1.461` publicada às 15:37 como versão principal ("Latest"), com a tag em `5767e8b` e os instaladores de Windows, macOS e Ubuntu. O "Smoke exploratório (Windows)" também passou, às 15:39.

Estado: concluído e publicado na `v0.1.461`. A conferência no app instalado ficou como task no Notion.

## 2026-10-15 — PTY: "File not found: " vazio ao abrir agentes (node-pty e a pasta atual em System32)

Registro de Claude — Tasks do AI Core (Opus 5.5). Um usuário da `v0.1.461` (Windows) mandou um
print pelo WhatsApp às 08:50, reclamando que o problema era recorrente. O bloco "Claude haiku yolo" não
abria e mostrava "Camada de inicialização do PTY: não foi possível criar a sessão: File not found:",
com o caminho **vazio** depois dos dois-pontos.

**Origem da mensagem.** O texto é montado no `catch` do `spawnPty` em
`app/electron/services/pty-process-manager.cjs` (`PtyProcessManager.spawn`), com a mensagem do
próprio node-pty. O "File not found: " sai de `node_modules/node-pty/src/win/conpty.cc`
(`PtyStartProcess`, também em `winpty.cc`), que recusa um `shellpath` vazio ou inexistente.

**Causa** (node-pty 1.1.0, `src/win/path_util.cc`, `get_shell_path`). Para um nome relativo
(`cmd.exe`), a função começa com `if (file_exists(filename)) return shellpath;`, e nesse ponto
`shellpath` ainda é a string vazia. Quando o nome existe **na pasta atual do processo**, ela devolve
vazio em vez do caminho. No Windows, todo lançamento de CLI passava `'cmd.exe'` solto
(`createPtyLaunchSpec`). Com a pasta atual do processo Electron em `C:\Windows\System32`, que é onde o
`cmd.exe` mora, todo agente falhava. O shell padrão escapava porque já saía com caminho absoluto
(`findPowerShell`).

**Medido** (scratchpad e teste novo, ConPTY real, node-pty 1.1.0 do `app/node_modules`):

- `nodePty.spawn('cmd.exe', …)` com a pasta atual em home: abre. Com a pasta atual em System32:
  lança `"File not found: "`. O resto do spawn é o mesmo nos dois casos.
- Antes da correção, o teste novo `pty-pasta-atual-system32.integration.test.cjs` falhava com
  "Camada de inicialização do PTY: não foi possível criar a sessão: File not found: ", igual ao print
  do usuário. Depois da correção, passa.

**Inferido, não medido.** Que o app do usuário estava com a pasta atual em System32. Um app aberto
pelo Windows no login (o "iniciar com o sistema" do app grava em `HKCU\…\Run` via
`app.setLoginItemSettings`) costuma nascer com essa pasta atual. Isso combina com o "recorrente" (falha
ao ligar o PC, some ao reabrir pelo atalho) e com o horário do relato, mas não foi conferido na
máquina dele.

**Correção** (`41e72a7`).

- `getCmdPath(env, exists)` no adaptador `core/platform/win32.cjs` devolve
  `%SystemRoot%\System32\cmd.exe`. O `ComSpec` vem em segundo e só vale quando o arquivo se chama
  `cmd.exe`: trocado por outro shell (TCC, Clink), ele receberia `/d /s /c call …` sem entender as
  flags. Sem nenhum dos dois no disco, fica o nome solto de antes. A escolha da ordem foi do agente.
- `createPtyLaunchSpec` e o `getDefaultShell` (o fallback sem PowerShell) usam essa função. A mesma
  função monta o lançamento do terminal dos agentes, do `/status` do Claude em Limites
  (`claude-usage-query.cjs`), da tela de status do Codex (`codex-status-screen.cjs`) e da sessão na
  nuvem (`cloud-session-service.cjs`), então os quatro ficam cobertos.
- Testes: o nativo novo entra no `test:native`. Há 4 unitários novos (adaptador e lançamento) e 2
  expectativas antigas passaram a exigir o caminho absoluto: o `.cmd/.exe` em
  `pty-process-manager.test.cjs` e o lançamento do `/status` em
  `claude-usage-query.integration.test.cjs`.

**Validação local** (Windows 11, 15/10).

- TDD: com o `getCmdPath` ainda vazio, 7 testes unitários vermelhos; depois, 92/92 nos dois
  arquivos.
- `npm test`: 2739 testes, 2731 passaram, 8 pulados, 0 falhas. `npm run lint` e `npm run build`
  com saída 0.
- `npm run test:native`: os dois testes tocados (System32 e `/status`) passam. Na rodada completa,
  falhou primeiro "emoji não é partido" (timeout de 15 s, com a suíte Node rodando em paralelo) e
  depois "payload grande chega inteiro". Para separar a causa, o `pty-write-queue` rodou isolado 3
  vezes com a correção e 3 sem ela (`git stash` dos dois arquivos de produção): 4/4 nas seis
  rodadas. É a intermitência que já tinha derrubado o CI de `e7615c3` em 14/10, antes desta mudança.

**Não validado.**

- O app empacotado aberto pelo login do Windows não foi reiniciado de verdade. A prova cobre o
  mecanismo, chamando `process.chdir` para System32 no processo de teste.
- A máquina do usuário que relatou não foi inspecionada.
- O defeito do `get_shell_path` continua no node-pty: qualquer outro nome relativo entregue a ele
  ainda cai na mesma armadilha. Hoje o app só entregava `cmd.exe` solto.

**Envio, CI e release.**

- **Envio:** push direto à `main` às 10:16 (`e7615c3..3e2e095`).
- **CI** [38741170213](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38741170213):
  os 22 jobs passaram às 10:31, inclusive `Validate (windows-latest)`, que roda o teste nativo novo
  com a pasta atual em System32.
- **Release gate** [38743454800](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38743454800):
  "Commit de base avaliado: 5767e8b…" e "Release relevante: true".
- **Release** [38743497883](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/38743497883):
  [`v0.1.462`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.462) publicada
  às 10:50 como Latest, com a tag em `3e2e095` e os instaladores de Windows, macOS e Linux, mais o
  `latest.yml` da atualização automática. O "Smoke exploratório (Windows)" também passou.

Estado: concluído e publicado na `v0.1.462`. A conferência na máquina de quem relatou e o relato ao
node-pty ficaram como tasks no Notion.

## 2026-10-15 — Codex: o "Worked for" não aparecia no fim da rodada (Codex antigo, não o app)

Registro de Claude — Tasks do AI Core (Opus 5.5). Relato com print: "Tempo de working não aparece no
codex depois que o agente termina". No print (outro PC, 13/10/2026), um bloco Codex separa as
mensagens com linhas `────` cheias, e não há "Worked for …" no fim da rodada.

**Conclusão: não é defeito do AI Core.** É o comportamento de um Codex antigo. O texto vem do próprio
Codex (`codex-rs/tui/src/history_cell/separators.rs`), e o app não escreve nem filtra esse texto. Na
aba Terminal o app também não desenha `─`, e os argumentos que ele passa ao Codex (`--model`,
`-c model_reasoning_effort`, `-c service_tier`, yolo) não mexem na tela.

**Medido no código do Codex** (cada commit conferido com `gh api …/compare/<commit>...<tag>`):

| Codex | Fim da rodada |
|---|---|
| ≤ 0.154.x | linha `────` cheia; "Worked for" só com `seconds > 60` |
| 0.155.0 a 0.158.x | rótulo só com a hora (`333c41eef`, #43558); "Worked for" ainda só acima de 60 s |
| ≥ 0.159.0 | sempre `Worked for Xs • HH:MM` (`99f7758a5`, #48807) |

O print, com traço e sem tempo, só acontece com Codex ≤ 0.154.x numa rodada de até 60 s. A
gravação `codex-resposta.json` (Codex 0.156.1) termina com `9:35 AM`, só a hora, o que confirma a
faixa do meio.

**Medido no app.** O Codex `0.163.0-alpha.10.1` rodou pelo `PtyProcessManager` real com um pedido
trivial (uma requisição mínima da conta deste PC). Nos bytes crus apareceu
`ESC[2m ESC[14;1H  Worked for 3s • 10:33 … ESC[22m`: o rótulo chega ao terminal do bloco.

**Por que aquele PC tinha um Codex antigo** (inferência, versão não medida lá). Até a `v0.1.460`
(14/10), o app tomava o Codex dele por instalação de fora e nunca o atualizava (`71125a3`), e também
não atualizava a CLI do npm global. O print é de 13/10. Com a `v0.1.461` ou mais nova, a rodada de
CLIs leva o Codex à versão mais nova publicada.

**Fora do escopo.** A aba Leitura esconde de propósito a linha de status do Codex que é só a hora
(`CODEX_TIMESTAMP` em `app/src/features/canvas/terminal/reading/reading-profiles.ts`). O rótulo novo,
`Worked for … • HH:MM`, não casa com o padrão e aparece como texto comum. Não foi relatado como
problema.

Estado: investigação concluída, sem mudança de código. A conferência do Codex no PC do print ficou
como task no Notion.

## 2026-10-15 — Limites e uso: ~31 s a cada abertura (leitor do /status do Codex e coleta refeita)

Registro de Claude — Tasks do AI Core (Opus 5.5). Relato: "Toda vez que abre os limites de uso ele
demora muito pra recarregar".

**Medido antes de mexer.** O script do scratchpad montou o serviço com as dependências reais do
`main.cjs`, cada uma cronometrada: as 9 contas Codex com login próprio deste PC (perfis lidos do
`cli-accounts.json`, sem abrir segredo), o login do sistema e um banco temporário.

- `list()`, o passo "instantâneo" da abertura: 3,1 a 3,5 s, quase tudo no catálogo (`--version` de
  cada CLI).
- `refresh()`, disparado em toda abertura: 31,4, 31,0 e 31,0 s. Cada uma das 10 consultas do Codex
  levou de 25,1 a 25,6 s; o Claude levou 9,9 s; os logins, de 0,4 a 2,8 s.
- Uma consulta do Codex sozinha: o app-server respondeu em 5,5 a 8,7 s com os números, e a tela do
  `/status` falhou em 25,2 s ("O /status do Codex não apareceu a tempo"). A consulta espera as duas
  (`Promise.all` em `codex-status-query.cjs`).

**Causa 1 — leitor da tela do `/status` do Codex.** Desde a 0.159.0 (openai/codex `819cdb726`,
"Render `/status` without borders", 27/09/2026; o `latest` hoje é 0.162.1) o `/status` não tem
moldura. `findStatusBoxes` só reconhecia `╭ │ ╰`. A gravação da saída real (0.163.0-alpha.10.1) tinha
zero caracteres de moldura e os campos `Model:`, `Account:` e `Limits:` soltos, com recuo. Toda
leitura esperava o teto de 25 s, e como desde 14/10 o app atualiza o Codex sozinho, todo mundo
passou a pagar isso. Correção (`4199363`): o quadro sem moldura vai do cabeçalho `>_ OpenAI Codex`
até o campo `›` voltar ou o próximo cabeçalho começar. O segundo fim veio de uma falha gravada com
10 leituras ao mesmo tempo: a CLI reimprime o cabeçalho da sessão entre os limites e o campo. Sem
nenhum dos dois, o quadro ainda está sendo desenhado e não conta. A forma com moldura continua lida.

**Causa 2 — a coleta inteira refeita a cada abertura.** Decisão do Felipe (pergunta interativa,
15/10): reaproveitar a coleta recente. Implementação:

- `shouldRefreshAgentUsageOnOpen` em `features/shared/agent-usage/agent-usage.ts`: com coleta
  completa de menos de 5 min (`refreshedAt`), o painel do canvas e o modal antigo do chat abrem com
  ela e não reconsultam. Sem coleta, com data ilegível ou "do futuro", reconsultam. O Atualizar sempre
  força.
- O catálogo de CLIs ganhou a mesma janela no serviço (`CATALOG_REUSE_MS`): `list()` e a releitura do
  watcher (que roda a cada gravação da statusline) reaproveitam o catálogo lido há menos de 5 min, e
  `refresh()` sempre lê de novo.

**Causa 1, segunda parte: duas formas que ainda esperavam 25 s.** Com `4199363`, rodadas de 5
coletas ainda tinham 1 em 50 e 4 em 50 telas presas nos 25 s. A medição passou a gravar a saída do
PTY de cada tela que falhava, e apareceram duas formas. Na primeira, o campo `›` já estava na tela e a
CLI, que redesenha por diferença, não o reimprimiu: depois dos limites só vieram `ESC[27;3H` e quadros
sincronizados vazios (`ESC[?2026h`/`l`), e o bloco sem moldura nunca fechava. Na segunda, a CLI
desenhou o cabeçalho, redesenhou o campo e o rodapé embaixo e só então voltou o cursor (`ESC[13;1H`)
para os campos; no texto corrido o `›` fecha o bloco antes deles. Passadas pelo xterm headless que o
leitor já mantém, as duas gravações mostram o quadro inteiro. Correção (`6732edd`): com a tela parada
(`readyQuietMs`), a leitura ao vivo conta o bloco aberto que já tem a linha dos limites e, se o texto
corrido não trouxer quadro novo, o quadro da tela renderizada. Sem a linha dos limites, o bloco
aberto continua sem encerrar a leitura. `parseCodexStatusScreen` (texto gravado) não mudou.

**Depois.** Medição final das 13:54 às 13:59, máquina ociosa: 5 coletas com o código de antes
(`1f0c1ae`) e, em seguida, 5 com o de agora, 9 contas Codex e o login do sistema. p50 / p95 pelo
posto mais próximo.

| Medida | Antes | Depois |
| --- | --- | --- |
| Tela do `/status` do Codex lida | 0 de 50 | 50 de 50 |
| Consulta do Codex por conta | 25,2 s / 25,5 s | 11,3 s / 15,2 s |
| `list()` logo depois de uma coleta (reabrir o painel) | 3,0 s | 0,0 s |
| Coleta inteira (Atualizar, ou abrir depois de 5 min) | 31,4 s / 35,5 s | 36,1 s / 36,5 s |

- A coleta inteira não melhorou nessa rodada porque quem a segura agora é o `/status` do Claude: em
  3 das 5 coletas ele estourou os 30 s, e a coleta espera a fonte mais lenta. Nas 2 em que ele falhou
  rápido, a coleta levou 17,8 e 18,6 s.
- Com o mesmo código, o Codex por conta variou de ~6 s (13:24 a 13:29) a ~12 s (13:32 em diante),
  conforme a carga da máquina: o app instalado, que roda os agentes do canvas, é o maior consumidor
  de CPU dela. O gravador de telas da medição não pesa: com e sem ele, ~11 s no mesmo horário.
- Depois da segunda correção: 80 de 80, 59 de 60 e 50 de 50 telas lidas. A que faltou foi o Codex
  fechando sozinho em 1,5 s na partida ("O Codex fechou antes de mostrar o /status"), que o código
  antigo também teve 2 vezes; ela não espera os 25 s, e os números do app-server chegam mesmo assim.
- App real pela fonte (`felixo devtools`, perfil isolado, `ipcProbe`): a reabertura ficou pronta em
  290, 227 e 246 ms, medidos no relógio do renderer, sem nenhum `agent-usage:refresh` novo (o `list`
  subiu de 2 para 5 e o `refresh` ficou em 1). O Atualizar levou o `refresh` a 2, e o selo "ao vivo"
  passou para a hora nova.
- O texto do `/status` do Codex volta a aparecer no painel, sumido desde o 0.159.

**Achado fora do escopo: o `/status` do Claude virou o gargalo da coleta (task aberta).** Em Node,
com o login do sistema e o Claude Code 2.1.300, nenhuma das 47 consultas das rodadas de hoje devolveu
os limites: 32 falharam em 4 a 8 s com "O /status do Claude não retornou os limites de uso" e 15
estouraram os 30 s ("A consulta ao /status do Claude excedeu o tempo limite"). No app real, os 35
registros `agent-usage:live-query` em `userData/logs/qa` são todos "não retornou", o último de 14/10.
O painel fica sem os números do Claude, e cada estouro segura a coleta inteira em ~36 s. Task no
Notion: `3fa91f95-497e-81fc-b87c-e65a5bdce2a5`.

**Achado no gate: o `npm test` travava em silêncio.** Duas rodadas seguidas da suíte Node pararam
por mais de meia hora em `openia-image-service.test.cjs`, sem processo filho vivo. Com o inspetor
ligado no processo preso (`process._debugProcess`), o único recurso vivo era o `setInterval(() => {},
TIMEOUT_MAX)` do harness do `node:test`: no Node 25, quando um teste espera uma promessa que nunca
resolve e nada mais segura o processo, o runner espera para sempre (antes falhava com "Promise
resolution is still pending"). Pelo escopo desse timer, a raiz dos testes mostrou o pendente: "limite
de execuções simultâneas e identificador repetido". O `generate` reserva a vaga na hora, mas só chama
o filho depois do catálogo e de um `mkdir` real; o teste esperava 30 ms fixos e liberava só quem já
tinha chegado. Sob carga, a segunda geração chegava depois e ficava sem dono. O teste "cancelar" tem a
mesma corrida: cancelado durante o `mkdir`, o falso recebe o sinal já abortado e nunca ouve o
`abort` (o `runOpeniaImageProcess` de produção trata esse caso). Reprodução: 12 cópias paralelas do
arquivo, 2 travadas. Correção: `esperarAte` espera a condição real (o filho chamado), com prazo de
5 s que falha em vez de travar. Depois: 24 de 24 cópias passaram, a mais lenta em 0,44 s. O runner
continua sem prazo por arquivo; ficou a task `3fa91f95-497e-812c-8171-ca83c4ab7c84`.

**Não validado.** O app instalado com a release nova. A janela de 5 min não foi esperada de verdade
no app; ela é coberta pelos testes, com relógio injetado.

## 2026-10-19 — Codex: o contexto digitado no compositor provisório derrubava a abertura

### Relato

Captura de uma pessoa no Windows: um bloco Codex na seção "Sem pasta de trabalho" nasce
"encerrado" e o terminal mostra `Unsent draft:` com o começo do nosso contexto ("CONTEXTO
ENTREGUE EM ARQUIVOS SOMENTE LEITURALeia todos os arquivos abaixo antes de agir…") e
`Error: timed out discarding buffered terminal input`. É o mesmo erro que a entrada de 2026-10-12
("Codex: flag de yolo repetida") viu no terminal virtual daqui com o 0.162.1 e deixou sem explicação.

### Causa

- **O Codex abre em duas etapas desde o 0.158.** Primeiro desenha um compositor provisório
  ("› Ask Codex to do anything", com o cabeçalho `>_ OpenAI Codex (vX)`) enquanto inicializa
  (`tui/src/startup_draft.rs`). Depois decide se precisa de uma tela protegida: confiança na pasta,
  login, migração de modelo, revisão de hooks. Na tela, o compositor provisório é igual ao de verdade.
- **Antes de cada tela protegida, o Codex esvazia a entrada** (`discard_pending_terminal_input`,
  `tui/src/tui/input_boundary.rs`). Se a entrada não fica quieta em 1 s, ele devolve
  `timed out discarding buffered terminal input`. Nas telas de abertura esse erro é fatal: o Codex
  restaura o terminal, imprime o rascunho não enviado (`tui/src/startup_recovery.rs`) e sai com código 1.
- **O app digitava no compositor provisório**: `readInputLineState` via o `›` e liberava o texto.
- **No Linux, por que a espera não termina:** o `crossterm` do Codex lê no máximo 1024 bytes por
  aviso do epoll (que é edge-triggered) e devolve o primeiro evento sem esvaziar o resto. O que sobra
  no tty não gera aviso novo, então o `poll` do crossterm diz "nada", enquanto o `poll(0)` do Codex
  diz "tem dado". O laço repete até 1 s. O strace mostra exatamente isso. Num PTY com o 0.163.0 e uma
  pasta git nova: até 1500 caracteres digitados no provisório abriu; de 1550 em diante caiu sempre,
  inclusive com 1875 caracteres ASCII (é o tamanho, não o conteúdo). A referência de contexto do app
  tem ~1,9 mil caracteres.
- **No Windows** o crossterm não usa epoll, então esse mecanismo exato não vale lá. O sintoma da
  captura é o mesmo, mas não reproduzi no Windows.

Medido nos binários publicados (strings e telas num PTY): o 0.150.0 e o 0.155.0 não têm o
compositor provisório; o 0.158.0, o 0.160.0, o 0.162.1 e o 0.163.0 têm. Só o 0.163.0 emite o OSC
7501. O título da janela (OSC 0) só sai quando o chat de verdade abre, no 0.158.0, no 0.162.1 e no
0.163.0, nunca no provisório. No 0.158.0 o provisório ficou 7 s na tela antes da confiança, e no
0.163.0 até 5,9 s: esperar um tempo fixo não resolve.

### Correção (`app/src`)

- `readCodexVersion` e `codexOpensProvisionalComposer` (`terminal-screen-state.ts`) leem a versão
  do cabeçalho e dizem se ela tem o compositor provisório (0.158.0 em diante).
- `CodexStartupState` (`terminal-session-store.ts`). Para Codex com o compositor provisório, o texto
  inicial espera um sinal do chat de verdade:
  - o OSC 7501 com `app=codex`, que o 0.163+ emite;
  - ou um título de janela que chega depois de o compositor aparecer. O título que o ConPTY repassa
    do `cmd.exe` antes de a CLI desenhar não conta, e a repetição do mesmo título também não.
  - Vale também o título que chega com a tela de confiança ainda desenhada, desde que o compositor
    já tenha aparecido antes, porque o ConPTY pode mandar o título antes do quadro.
- O título passa pelo ConPTY no Windows. O 7501 pode ou não passar, por isso os dois sinais.
- O prazo de emergência (60 s) continua, mas para esse Codex só digita com um compositor na tela.
  A tela de confiança nova não é reconhecida como decisão, e os dígitos do contexto ("1…", "2…")
  escolheriam uma opção do menu.
- Sem versão no cabeçalho, ou com versão anterior ao 0.158, fica o comportamento de antes.
- Guia do Usuário, seção 7: o erro, a causa e o que fazer.

### Evidência

- Gravação real do Codex 0.163.0 num PTY: compositor provisório, tela de confiança, a pessoa confia
  e o chat abre. Está em `__fixtures__/terminal-output/codex-abertura-confianca.json`, com pasta
  `/home/ana/projeto` e sem chave nem caminho do ambiente. Fica fora de `FIXTURE_NAMES` para não criar
  snapshot novo nos testes da Leitura.
- 9 testes novos no store, escritos antes da correção, com essa gravação: 4 falhavam (o contexto saía
  no provisório) e 1 do prazo de emergência na tela de confiança falhava depois da primeira versão da
  correção. 5 testes novos em `terminal-screen-state.test.ts`.
- **App real** (Electron da fonte, Xvfb, perfil isolado, Codex 0.163.0 de verdade no PATH, chave de
  API falsa, pasta git nova como pasta inicial, bloco criado por Criar > Agente > Codex):
  - sem a correção, o bloco nasce "encerrado" com o mesmo `Unsent draft` e
    `timed out discarding buffered terminal input` da captura;
  - com a correção, o Codex fica vivo na tela de confiança, e depois do Enter o chat abre com o
    contexto na entrada.
- Gate no Linux (Node 22.22): `tsc -b` e `eslint .` limpos; vitest completo com
  `--maxWorkers=4`: 205 arquivos, 3195 testes passando e 5 ignorados. A suíte Node (`npm test`)
  não foi rodada, porque nada em `electron/` mudou.

### Não validado e em aberto

- **Windows não foi testado**, e é a plataforma do relato: nem o mecanismo da espera lá, nem se o
  ConPTY repassa o OSC 7501. A correção conta com o título, que o ConPTY repassa. Também não sei a
  versão do Codex de quem relatou, nem qual tela protegida apareceu.
- Com o título desligado no Codex (`[tui].terminal_title = []`) e sem o 7501, o contexto só sai no
  prazo de 60 s.
- **Achado fora do escopo, defeito do Codex/crossterm no Linux:** depois que o chat abre, o fim de
  uma referência de contexto longa fica parado no tty até a próxima tecla (visto no app real: a linha
  do `skills-manifest` só apareceu depois de um `End`). Nada se perde, porque a próxima tecla da
  pessoa traz o resto. É o mesmo mecanismo do epoll acima e vale relatar ao projeto do Codex.
- **Achado fora do escopo:** `isCodexTrustPrompt` e `looksLikeApprovalPrompt` não reconhecem a tela
  "Trust this folder? / 1. Trust and continue" do 0.158+. Com o Yolo, o app não aceita mais a pasta
  sozinho, e o card mostra "trabalhando" nessa tela. Sugerido como tarefa separada.
- Mudar `app/src` publica uma release ao mesclar.

Estado: concluído e validado localmente no Linux, em branch própria (`claude/wizardly-shannon-7qsc91`)
com PR em rascunho; sem merge.

## 2026-10-19 — Codex: a tela de confiança do 0.158+ volta a ser reconhecida

Fecha o achado "fora do escopo" da entrada anterior, a pedido da pessoa na mesma sessão.

### Causa

Desde o 0.158 a confiança na pasta do Codex diz "Trust this folder? …" com as opções
"1. Trust and continue" e "2. Back to Agent Command Center". `isCodexTrustPrompt` só conhecia o
texto antigo ("Do you trust the contents of this directory?" e "Yes, continue"), e
`looksLikeApprovalPrompt` não pega o cursor `›` nem a pergunta nova. Conferido com a gravação real
num xterm: as duas devolviam `false`. Efeitos:
- com o Yolo, o app parou de confiar na pasta sozinho, como fazia com o texto antigo;
- o card mostrava "trabalhando"/ocioso nessa tela, em vez de "aguardando aprovação".

### Correção (`app/src`)

- `isCodexTrustPrompt` reconhece também a tela nova. Exige as duas frases juntas, "trust this
  folder" e "trust and continue", porque só uma delas pode aparecer numa resposta qualquer.
- `looksLikeApprovalPrompt` conta a confiança na pasta do Codex como decisão. Isso vale para o
  estado do card e para a espera do texto inicial.
- O aceite com o Yolo é o de antes (`handleCodexTrustPrompt`): um Enter 150 ms depois de a tela
  aparecer. A seleção já começa em "Trust and continue". Sem o Yolo, nada é respondido.
- O comentário do prazo de emergência da entrada anterior foi ajustado: a proteção continua para as
  telas de abertura que não reconhecemos (login, migração de modelo).
- Guia do Usuário: o card "aguardando aprovação" nessa tela e o aceite com o Yolo.

### Evidência

- Testes escritos antes, 5 falhando pelo motivo certo:
  - `terminal-screen-state.test.ts`: a tela nova, com ANSI e quebras; só uma das frases não
    dispara; a tela conta como decisão e não vira a entrada; o compositor não parece decisão;
  - `terminal-session-store.test.ts`, com a gravação real do 0.163.0: com o Yolo sai um Enter e o
    contexto entra quando o chat abre; sem o Yolo não sai Enter; o card fica em `waiting_approval`.
- **App real** (mesma bancada da entrada anterior, Codex 0.163.0, pastas git novas):
  - com o Yolo, o bloco abriu em YOLO mode, a confiança foi aceita sem tecla nenhuma (o Codex
    gravou `trust_level = "trusted"` para a pasta) e o contexto entrou inteiro;
  - sem o Yolo, o bloco parou na tela, nada foi gravado para a pasta e o card mostrou "aguardando
    aprovação". Logo depois de abrir a gaveta ele passa um instante por "trabalhando", porque o
    terminal muda de tamanho e a tela é redesenhada.
- Gate no Linux: ver o fim desta entrada.

### Não validado e em aberto

- Windows, como na entrada anterior.
- Se o Codex engolir o Enter (por exemplo, se ainda estiver esvaziando a entrada quando ele
  chegar), a tela fica esperando a pessoa. Não há reenvio: um segundo Enter cairia na tela seguinte.
- Outras telas de abertura do Codex (login, migração de modelo, revisão de hooks) continuam sem
  reconhecimento próprio.
- Gate no Linux (Node 22.22), com as duas mudanças do dia: `tsc -b` e `eslint .` limpos; vitest
  completo com `--maxWorkers=4`: 205 arquivos, 3204 testes passando e 5 ignorados.
- Como o Codex foi testado sem conta: `codex login --with-api-key` com uma chave inventada, num
  `CODEX_HOME` temporário. A abertura (compositor, confiança, chat) é local e funciona igual; a
  chave só é recusada quando o Codex fala com o servidor (o "1 warning" das telas é a lista de
  modelos voltando 401). Não foram testados o envio de mensagem ao modelo nem o login com conta real.

Estado: concluído e validado localmente no Linux, na mesma branch e PR em rascunho da entrada
anterior; sem merge.

## 2026-10-19 — CI/CD: rodar só o que a mudança pede e tirar as repetições

### Pedido

A pessoa notou que cada push levava quase 40 min, sobretudo pelo Windows, e pediu para cortar o que
não é necessário: nada de repetir testes nem rodar processos caros por redundância. O AI Core é open
source, roda local e não tem banco público, então não precisa de tantos gates.

### O que foi medido (runs reais do GitHub Actions)

- **Por push na `main`:** CI de 15 a 18 min (preso no `Validate (windows-latest)`, de 14,7 a 17,4
  min) mais o Release de 17 a 23 min (preso no `Publish windows-latest`, ~16 min contra ~8 nos
  outros). Dá os ~40 min.
- **`npm test` no Windows:** 4 a 5 min, contra 23 s no Ubuntu. Somando a duração de cada teste:
  844 s no Windows e 41 s no Ubuntu. Desses 844 s, **744 s** vêm dos 26 arquivos de teste que criam
  um banco SQLite (13 s no Ubuntu). Cada teste aplica as 19 migrações, uma transação cada, e no
  Windows cada COMMIT espera o disco. Testes que levam 0,05 s no Linux levavam 4 a 12 s lá.
- **Repetições:**
  - o smoke do canvas rodava no `Validate` dos quatro runners (5 a 8 min cada) e de novo no Release,
    no app empacotado dos três SOs (4 a 5 min cada);
  - as bancadas de gerenciador rodavam no `Dependency policy`, no job `Benchmarks` dos quatro SOs e
    de novo no Release;
  - a matriz do contexto inicial rodava 50 vezes por SO em todo PR, depois de já rodar uma vez no
    `test:frontend`.
- **Commits só de documentação:** 5 dos últimos 22 pushes na `main` mudavam só o `IA.md` ou o
  `README.md` e rodavam os 22 jobs.

### O que mudou

- **Escopo do CI** (`.github/scripts/ci-scope.sh`, 19 casos em `ci-scope.test.sh`):
  - o job `scope` lê os arquivos alterados do PR (ou do push) e liga só o que eles pedem;
  - documentação sozinha não roda nada, exceto o `INVENTARIO-CANVAS.md`, que é testado;
  - o launcher só roda quando muda; cada auditoria só roda quando as dependências dela mudam;
  - na dúvida roda tudo: lista ilegível, arquivo fora das regras, mudança no próprio CI ou falha do
    job `scope`, porque cada job só é pulado com `false` explícito.
  - O reaproveitamento do CI do PR na `main` continua.
- **`Validate` por sistema:**
  - `npm test` em Linux, Windows e macOS;
  - o node-pty nativo nos quatro;
  - o Vitest em Linux e Windows;
  - lint, typecheck, build e o benchmark do bundle uma vez, no Linux x64.
  - O arm64 roda só o node-pty, que é a parte que muda de arquitetura.
- **Smoke do canvas:** num job próprio, `Canvas smoke (ubuntu-latest)`, em paralelo aos testes.
  Windows e macOS rodam no `Nightly`.
- **SQLite dos testes:** `scripts/test-support/sqlite-sem-fsync.cjs`, carregado pelo
  `run-node-unit-tests.cjs` via `NODE_OPTIONS` (vale também nos processos filhos), abre todo banco
  dos testes com `PRAGMA synchronous = OFF`. O diário continua em disco, então um processo morto no
  meio da transação ainda é desfeito. O app não carrega o arquivo.
- **Defender:** no Windows, o repositório e as pastas temporárias saem da varredura antes do
  `npm ci` (passo com `continue-on-error`).
- **Saíram do CI de cada push:**
  - os jobs `Benchmarks` e `Benchmarks exploratórios`;
  - as 50 repetições do contexto;
  - as bancadas de gerenciador do `Dependency policy`;
  - o gate de regressão entre commits, que dependia do baseline por push;
  - o launcher com Python 3.9 fora do Linux.
- **Release:**
  - saíram os dois benchmarks de gerenciador, o smoke do canvas no app empacotado e o job
    `Smoke exploratório (Windows)`, que rodava depois da publicação;
  - ficaram o build, o inventário, a validação do app instalado (`release-smoke.cjs`, que instala e
    abre um PTY real), a atualização silenciosa com o app aberto no Windows (único gate que protege
    o auto-update) e o Gatekeeper do macOS;
  - o `release-relevant.sh` deixou de publicar instalador quando só esses scripts mudam.
- **`Nightly`** ganhou o job `medicoes` (benchmarks de npm-runtime, saída do PTY, scrollback e as 50
  repetições, nos quatro SOs) e o `canvas-smoke` (Windows e macOS).
- Guia do Desenvolvedor (tabela do escopo, divisão do `Validate`, smoke e benchmarks), Guia de
  dependências e README atualizados.

### Evidência local

- `npm test` com a pré-carga, no Linux: 2745 passaram, 0 falharam.
- Pré-carga conferida no processo e num processo filho (`synchronous` 0, `journal_mode` delete).
- `ci-scope.test.sh`, `release-relevant.test.sh` e os demais testes de `.github/scripts` passam.
- Os três workflows são YAML válido.
- O efeito no Windows só aparece no CI do PR.

### Não validado e em aberto

- O tempo novo do Windows sai no CI deste PR. A causa exata do SQLite lento (espera do disco ou o
  Defender) não foi isolada: as duas correções entram juntas.
- **Checks obrigatórios.** O merge foi barrado com "5 of 15 required status checks are
  expected".
  - A regra da `main` pode ser lida em `GET /repos/{owner}/{repo}/branches/main`, no campo
    `protection.required_status_checks`. Essa leitura não exige admin.
  - A regra exige:
    - `Dependency policy`, `Python dependency audit` e `Release scripts`;
    - `Validate` em ubuntu, windows e macos;
    - `Launcher` nos 3 sistemas, com Python 3.9 e 3.13;
    - `Benchmarks` em ubuntu, windows e macos.
  - O Launcher com Python 3.9 voltou no Windows e no macOS: roda teste de verdade e leva menos
    de 1 min.
  - Um job de matriz pulado aparece com o nome sem expandir, como `Validate (${{ matrix.os }})`.
    Isso foi visto na run 853 da `main`. O check exigido nunca aparece, por isso `Validate` e
    `Launcher` rodam sempre em PR.
  - Os três `Benchmarks (…)` não foram recriados. Criar um job que só tem o nome e não mede
    nada contornaria a regra. Quem é admin precisa tirá-los da regra (Settings > Branches) ou
    mesclar com bypass.
- **Cobertura que ficou só no `Nightly`:** o smoke do canvas no Windows e no macOS e as medições.
  Uma regressão de UI só nesses sistemas aparece no dia seguinte, não no PR. O smoke no app
  empacotado não roda mais em lugar nenhum, e o gate do artefato é o `release-smoke.cjs`.
- Mudar o `release.yml` publica uma release ao mesclar (é entrada de release por desenho, para
  exercitar o pipeline novo).

**Medido no CI do PR #124 (mesma data).** Todos os 13 jobs verdes. Run inteira, do escopo ao último
job: 5,1 min (antes 15 a 18). `Validate (windows-latest)`: 4,0 min (antes 14,7 a 17,4), com
`npm test` em 61 s (antes 248 a 298 s), o node-pty em 34 s e o Vitest em 66 s. `Canvas smoke
(ubuntu-latest)`: 5,0 min, em paralelo. macOS: 1,4 min; arm64: 24 s. O passo do Defender passou
(6 s). Como o `ci.yml` mudou, o escopo ligou tudo nessa run.

## 2026-10-19 — Claude por chave de API: bloco de conversa que usa o crédito do Agent SDK

**Pedido.** Abrir o Claude Code por uma conexão via API, sem conta logada, a partir das
configurações de agente.

**Contexto.** O Claude Code nativo, logado pelo Console (`/login`, "API Usage Billing"), devolvia
"Credit balance too low" mesmo com US$ 199,99 de crédito promocional. Esse crédito vale para
"Agent SDK, API, Batch API, Playground e Agentes gerenciados".

**Medido com a chave da pessoa (Claude Code 2.1.303):**

| Teste | Resultado |
|---|---|
| API direta (`/v1/messages`) | responde |
| `claude -p` com `ANTHROPIC_API_KEY` | responde |
| `stream-json` de vários turnos | responde e lembra do turno anterior |
| Claude Code interativo (num PTY) com a mesma chave | "Credit balance too low" |

Conclusão: o que decide é o modo de rodar, não o tipo de credencial. Não foi tentado mudar a forma
como o Claude Code se identifica.

**Feito.**
- **Conta do Claude `authKind: 'api-key'`** (`cli-account-profiles.cjs`, `cli-account-store.cjs`).
  - A chave fica cifrada no mesmo `cli-account-secrets.bin` do Openia.
  - `buildEnv` devolve `CLAUDE_CONFIG_DIR` + `ANTHROPIC_API_KEY`.
  - `applyProfileEnv` tira as credenciais herdadas antes e espalha o perfil por cima, então a
    chave sobrevive só nessa conta.
- **A conta fica fora de:**
  - terminal (`validatePtyAccount` em `main.cjs` recusa);
  - Agente na nuvem;
  - painel **Limites e uso** (`listProfiles` filtra);
  - cadeia de contas (`account-chain-runtime.cjs` filtra).
- **`electron/services/claude-api/`.**
  - `claude-stream-events.cjs` traduz as linhas do `stream-json`.
  - `claude-api-session-manager.cjs` mantém um `claude -p` por bloco, vivo entre turnos:
    - abre no primeiro envio;
    - `--resume` depois de cair;
    - `--permission-prompt-tool stdio` sem Yolo, `bypassPermissions` com Yolo;
    - repetir `start` com o id da sessão não reabre o processo.
  - Canais `claude-api:*` (IPC e preload).
  - Formato medido: pedido de permissão chega como `control_request` `can_use_tool` e é respondido
    com `control_response`; interrupção é `control_request` `interrupt`; chave inválida vem como
    `result.is_error` com `api_error_status: 401`.
- **Bloco `claude-api` no canvas.**
  - Arquivos: `ClaudeApiNode.tsx`, `claude-api-conversation.ts` (puro) e
    `claude-api-conversation-store.ts`.
  - A conversa fica fora do React, porque o canvas desmonta blocos fora da tela. O CanvasView grava
    a conversa no node.
  - Registro: migração 020, `NODE_TYPES`, tamanhos, ícone, inventário. A exportação leva só nome e
    modelo.
- **Menu Agente.**
  - Novas opções: "Nova conta por chave de API…" e "Abrir conversa". Esta exige projeto, porque o
    bloco precisa de pasta.
  - A conta por chave não entra na fila.
  - O contexto do canvas é o `initialText` do terminal equivalente e vai como primeira mensagem.

**Verificado.**
- Testes:
  - Node: `npm test` 2763/2763.
  - Vitest: 3215.
  - Testes novos: 12 do gerenciador e da borda IPC, 10 da conversa e do store, 4 da loja de contas,
    transferência e repositório.
- `tsc -b`, `eslint` e `vite build` limpos.
- App real no Linux, instância isolada com `gnome-keyring` para o `safeStorage`:
  1. a conta foi criada e a chave cifrada;
  2. um bloco com Haiku pediu permissão para `Write`;
  3. "Permitir" criou o arquivo, e a resposta e o gasto (US$ 0,0095) apareceram;
  4. depois de recarregar o renderer, a conversa voltou e o Claude lembrou do arquivo;
  5. o menu mostra a conta com ícone de chave e "Abrir conversa" desabilitado sem projeto.

**Não verificado.**
- Criar o bloco pelo botão do menu com um projeto (o projeto exige o seletor nativo de pasta; o
  bloco foi criado pelo `canvas.save`).
- Windows e macOS.
- Fechar e reabrir o app inteiro (só o renderer foi recarregado).
- Negar uma permissão e Parar no app real (cobertos só por teste).

A chave foi colada no chat de uma conta compartilhada: recomendado revogá-la no Console depois dos
testes.

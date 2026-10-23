
---

## Estado atual (resumo vivo)

<!--
  EXCEÇÃO à regra append-only: esta seção é um resumo reescrevível de "onde o projeto está
  AGORA". Reescreva-a a cada mudança de estado; o histórico fica nas entradas datadas abaixo e
  nos arquivos de docs/ia-archive/.
-->

Última atualização: [2026-10-23]

- **Fase:** o canvas é o produto principal (o chat está depreciado). A divisão do `CanvasView`
  (partes 1 a 4) e o bloco Agente na nuvem estão na `main`: PRs #113 a #120 mesclados.
- **Padrão de qualidade:** auditado e alinhado em 2026-10-12 e de novo em 2026-10-23 (ver as duas
  entradas). Gate verde no Windows em 23/10: `tsc`, `eslint`, Python 104, Node 2962, vitest 3256;
  `npm audit` sem crítico, sem alto e com a produção em 0 (sobram 2 moderados: o `ip-address`
  embutido no npm e o Electron 41, linha sem suporte). Publicado na `v0.1.479`; o PR #128 foi integrado na
  `v0.1.480` e o repositório ficou sem PR aberto e só com a `main`. Em 12/10, no CI de
  `37d6083`,
  `Validate` (4 sistemas) e `Launcher` (3 sistemas, Python 3.9 e 3.13) passaram; só o job
  exploratório `Benchmarks exploratórios (windows-latest)`, que é `continue-on-error`, falhou no
  passo de responsividade do terminal e não foi investigado. Os commits seguintes (compactação dos
  `IA.md`, divisão do README e o Agente na nuvem no menu Agente) foram enviados à `main`
  (`e7b7efe..d952f5b`) e o CI de `d952f5b` passou nos 22 jobs, inclusive esse exploratório do Windows.
- **Claude por chave de API:** conta do Claude por chave abre um bloco de conversa (Claude Code sem tela, que usa o crédito promocional do Agent SDK); ver a entrada de 2026-10-19.
- **Memória de longo prazo (ai-memory, 2026-10-21):** instalado na máquina (serviço no logon, MCP e hooks por usuário no Claude Code, Codex e Copilot). Este repositório tem o bloco gerenciado no `CLAUDE.md` e no `AGENTS.md` e as skills `ai-memory-*`; a captura vale para todos os projetos e a entrega dos eventos acontece nas fronteiras da sessão. Ver a entrada de 2026-10-21 "ai-memory instalado".
- **Instalador e árvore de processos (2026-10-21):** o `release-smoke.cjs` passou a cancelar e expirar a instalação de uma CLI pelo app empacotado e a provar, com uma sonda independente, que nenhum processo da árvore do npm sobra (`app/scripts/installer-kill-smoke.cjs`, nos três SOs do Release). Visto rodando fora do CI só no Windows; o macOS real segue pendente (roteiro em `docs/validation/CHECKLIST-INSTALADOR-ARVORE-DE-PROCESSOS.md`). Ver a entrada de 2026-10-21 "Instalador: cancelar e expirar pelo app empacotado".
- **Instalador, rotas Python e script (2026-10-22):** a rota do pip (`runBufferedCommand`, hoje só o Openia) passou a encerrar a árvore inteira no prazo e no cancelamento, a procurar um Python que sirva antes de instalar (`core/python-runtime.cjs`) e, junto com o npm, a repetir a falha de rede duas vezes (`core/install-retry.cjs`). Prova com processo real nas 3 rotas em `install-routes-process-tree.test.cjs` (roda no Windows, no Ubuntu e no macOS do CI). Visto rodando fora do CI só no Windows; fechar o app no meio de uma instalação ainda não a cancela. Ver a entrada de 2026-10-22 "Instalador: Python e script".
- **Ciclo de instalação das CLIs no CI (2026-10-22):** o runner que prova que a instalação automática não reinstala na 2ª abertura nem no upgrade (`app/scripts/cli-auto-install-real-repro.cjs`) roda sozinho no `windows-latest` (`ciclo-instalacao-clis.yml`: push por caminho, segunda 09:30 UTC e sob demanda), com veredito que separa regressão do Felixo de falha de infra (códigos 1 e 2) e controle negativo. Fora do PR e do Release. Ver `docs/validation/CICLO-INSTALACAO-CLIS.md` e a entrada de 2026-10-22 "CI: o ciclo de instalação das CLIs".
- **PTY no Windows (2026-10-22, `v0.1.478`):** o `node-pty` falhava no `AttachConsole` em todo `kill()` (o
  auxiliar sobe uns 45 ms depois de o pseudo-console fechar) e segurava o processo por 5 s;
  `app/electron/services/node-pty-windows-kill.cjs` responde a lista de processos localmente nos quatro
  pontos que abrem PTY. O teste `pty-kill.integration.test.cjs` está no `test:native` desde 2026-10-23
  (`v0.1.479`) e `npm run repro:pty-kill` mede o encerramento com e sem o contorno. Ver a entrada de
  2026-10-22 "PTY no Windows" e a de 2026-10-23.
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
  (7) No Windows, `npm run test:native` completo falhava de forma intermitente em "payload grande chega
  inteiro" (`pty-write-queue`); a causa era o coletor do teste (marcador de fim partido) e foi corrigida
  em `bddc016` (2026-10-22). O "emoji não é partido" não apareceu em 60 repetições no runner. O E2E de
  contexto (`contextIndex` -1) segue aberto na task própria do Notion.
- **Como compactar de novo:** este arquivo e `docs/projeto/IA.md` crescem com cada sessão. Quando
  passarem de uns 1000 linhas, rode `node app/scripts/archive-ia-md.cjs` (dry-run por padrão); o
  passo a passo está no Guia para Desenvolvedores.

## Registros arquivados

Registros antigos movidos, na íntegra e sem edição, para o arquivo. A linha do tempo completa
é este arquivo mais os de `docs/ia-archive/`, em ordem cronológica.

- [2026-10-12] Registros de 2026-08 (66 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-08.md](docs/ia-archive/IA-ARCHIVE-2026-08.md)
- [2026-10-12] Registros de 2026-09 (95 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-09.md](docs/ia-archive/IA-ARCHIVE-2026-09.md)
- [2026-10-23] Registros de 2026-10 (40 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-10.md](docs/ia-archive/IA-ARCHIVE-2026-10.md)

## 2026-10-21 — Tema claro

**Pedido.** "Whitemode: versão com tema claro": levantar onde as cores estão definidas e criar o tema
claro com um seletor que guarde a escolha.

**Decisões da pessoa (perguntadas antes de implementar).**
- Os terminais continuam escuros no tema claro: as CLIs desenham para fundo escuro.
- O seletor fica com Escuro, Claro e Alto contraste, e o padrão continua Escuro. "Seguir o sistema"
  ficou de fora.

**O que já existia.** `ThemeProvider` e `theme-storage.ts` (escuro e alto contraste) gravavam a escolha
no `localStorage` e aplicavam `data-theme` no `<html>`. O alto contraste trocava só uns 15 tokens.
O peso estava em outro lugar:
- ~2.400 classes de cor do Tailwind em 97 componentes (`text-zinc-400`, `bg-white/5`...);
- 266 cores literais no `index.css`;
- hex soltos na tela de chat, no minimapa e nas estrelas do canvas.

**Como o claro funciona.**
- **Paleta do Tailwind espelhada.** No Tailwind 4, cada classe é só `var(--color-zinc-400)`. O
  `paleta-tema-claro.css` troca cada degrau pelo oposto da mesma família (50↔950, 100↔900...), e os
  97 componentes viram claros sem ser editados. O arquivo é gerado a partir do `theme.css` do Tailwind
  instalado (`npm run tema:paleta-clara`). Um teste com `toMatchFileSnapshot` falha se ele ficar
  desatualizado.
- **Branco e preto.**
  - `--color-white` vira tinta quase-preta (`#141416`).
  - `--color-black` vira preto a 35%. Assim cada `bg-black/20` (poço) e `bg-black/55` (véu de modal)
    continua preto, mais fraco.
- **CSS próprio.**
  - 134 `rgba` brancos e pretos viraram `rgb(var(--f-ink-rgb) / a)` e
    `rgb(0 0 0 / calc(a * var(--f-shade)))`, por script e só depois dos blocos de tokens.
  - ~45 hex de componente (selects, composer, topo, laterais, trilho, switch, checkbox...) ganharam a
    versão clara numa seção no fim do `index.css`. Não viraram token porque isso mudaria o escuro
    em um ou dois tons.
- **Ilha escura.** `.felixo-paleta-escura` devolve à subárvore os tokens e a paleta do escuro. O mesmo
  bloco de tokens é declarado para `:root` e para `:root[data-theme='light'] .felixo-paleta-escura`.
  Ela vale em:
  - na tela do terminal da gaveta;
  - na prévia do bloco de terminal;
  - no painel de terminal do chat;
  - no bloco de desenho, porque o traço salvo (caneta branca) foi feito para fundo escuro.
- **Antes do React.** Um script no `<head>` do `index.html` aplica o tema salvo, e a tela de boot já
  nasce clara. A CSP recebe o hash do script novo no build. O teste da CSP passou a esperar dois
  scripts inline, e um teste confere que o script usa a mesma chave de `theme-storage.ts`.
- **Seletor.** As opções moram em `shared/theme/theme-options.ts`. Antes eram duas listas, uma no
  canvas e outra no chat.

**Medido.**
- Para provar que o escuro e o alto contraste não mudaram, coletei `getComputedStyle` (17 propriedades
  de cor, com `::before`, `::after` e `::placeholder`) de cada elemento visível em 8 estados:
  - canvas com grupo, bloco .md, nota e desenho;
  - painel de agente;
  - Configurações;
  - Ajuda;
  - chat;
  - notificações;
  - projetos;
  - canvas enquadrado.

  Isso dá 4.673 linhas por tema, coletadas antes e depois de mudar o código.
- **Ruído entre duas coletas sem mudança:** 0 (depois de esperar a tela parar de crescer).
- **Resultado:** escuro 0 diferenças e alto contraste 0 diferenças, nos 8 estados.
- **CSS do build.** Troquei no app as folhas do Vite pela `dist/assets/index-*.css` (passada pelo
  lightningcss) e repeti:
  - escuro e alto contraste: 0 diferenças contra a coleta original;
  - claro: 2 linhas, do campo "Nome" com e sem foco entre as duas coletas.
- **Tamanho:** o CSS do build foi de 189,6 KB para 222,9 KB.
- **Testes:** gate completo verde: Node 2766 aprovados e 8 pulados de 2774; vitest 3232 aprovados e
  3 pulados; lint 0; build ok.

**Achado fora do escopo.** No escuro, a nota tem fundo `rgb(12,12,14)` e texto `rgb(21,21,21)`. A regra
`.felixo-canvas-card` (sem camada) vence o `bg-[#ede9e0]` de `note-colors.ts`, então a nota nunca foi o
"papel claro" que o comentário descreve, e o texto fica ilegível. Ficou como task. No claro a nota lê
bem (cartão claro com o texto escuro de `note-colors`).

**Não validado.**
- O app instalado e o binário empacotado. Validei pela fonte (Vite) e pelo CSS do build trocado no
  app.
- O primeiro quadro da janela continua escuro: o `backgroundColor` da BrowserWindow é `#09090b`, e o
  processo principal não sabe o tema.
- Excalidraw, o modal de imagem e as telas não visitadas pelo roteiro só foram vistos em parte.
- macOS e Linux.

**Smoke do canvas (mesma data).**
- O F7 da Leitura (`canvas-smoke-leitura.cjs`) roda também no claro e exige que o fundo da Leitura
  continue escuro: é a decisão "o terminal fica escuro" testada no app real.
- A sessão F rodou local no Windows: ok em 98 s, com as capturas `f7-light-*`.
- A matriz completa da noturna ganhou o claro (44 → 66 casos). O PR fica com 16, porque o claro só
  muda cor, não posição de superfície.

## 2026-10-21 — Bloco do Claude por chave: colar e soltar imagem

**Pedido.** "Colocar imagem na versão de API: colar imagens no Claude Code rodando via API", da lista
de próximas do Felixo AI Core. A pessoa liberou fazer direto.

**Premissa medida antes de codar.** O Claude Code 2.1.306 aceita bloco de imagem no `stream-json`:
`claude -p --input-format stream-json` com
`content: [{ type: 'image', source: { type: 'base64', ... } }, { type: 'text', ... }]` respondeu
"Gato kawaii em preto e branco com circuitos" para o PNG da marca (Haiku, 3,9 s).
- O histórico `.jsonl` guarda o bloco em base64 na mensagem do usuário.
- Ele grava também uma entrada `isMeta` com o caminho da imagem salva.

**O que mudou.**
- **Limites num JSON lido pelos dois lados** (`claude-api-image-limits.json`): PNG, JPEG, GIF e WebP;
  até 10 por mensagem; 5 MB de base64 cada; até 8000 px de lado.
- **Processo principal:**
  - `claude-api-images.cjs` confere tipo, base64, assinatura dos bytes contra o tipo declarado e
    tamanho, e monta a mensagem com as imagens antes do texto;
  - `send(sessionId, text, images)` aceita mensagem só com imagem;
  - sem imagem, o `content` continua sendo a string de sempre;
  - a borda IPC só repassa `images` quando é lista.
- **`/resume`:**
  - mensagem com imagem volta com `images: n`;
  - conversa que começa só com imagem aparece na lista como "(2 imagens)".
- **Bloco (`ClaudeApiNode.tsx` e `claude-api-images.ts`):**
  - Ctrl+V com imagem e soltar arquivo de imagem no campo anexam;
  - o que a API aceita vai como está;
  - BMP, SVG e AVIF viram PNG; acima de 5 MB ou 8000 px é reduzido;
  - o SVG abre por `<img>`, porque `createImageBitmap` não abre SVG no Chromium (medido no app);
  - as miniaturas aparecem com × e "Lendo imagem…";
  - cada arquivo que falha diz o próprio motivo;
  - acima de 10, avisa quantas ficaram de fora;
  - `/model` e `/resume` com imagem avisam que ela não foi junto.
- **Conversa:**
  - a mensagem guarda só miniaturas JPEG de até 160 px, que a leitura do banco filtra (data URL de
    imagem, até 40 mil caracteres, até 10);
  - ao processo vão só `{ mediaType, data }`.

**Verificado.**
- **Gerenciador real** (`createClaudeApiSessionManager` com `cross-spawn` e o Claude Code
  instalado, login do sistema, Haiku):
  - duas imagens numa mensagem, o PNG da marca e uma captura do tema claro;
  - a resposta descreveu o logo e o "fundo cinza-claro (off-white)" da interface, em 4,9 s;
  - PNG declarado como JPEG foi recusado: "O arquivo não é uma imagem JPEG.".
- **App pela fonte** (`felixo devtools`, perfil isolado, conta por chave com chave falsa):
  - colar PNG + SVG + PNG quebrado deu duas miniaturas (o SVG convertido) e o aviso do quebrado;
  - Enviar mostrou a mensagem com as duas miniaturas;
  - `ipcProbe` contou 1 `claude-api:send`, e o Claude Code rodou até a API recusar a chave;
  - recarregar manteve as miniaturas;
  - soltar 2 imagens anexou 2; soltar mais 10 parou em 10 com "2 ficaram de fora";
  - × tirou uma;
  - `/model` com imagem avisou e mostrou o modelo;
  - uma mensagem com 9 imagens também passou pelo gerenciador;
  - no tema claro, o campo e as miniaturas ficam certos.
- **Colar de verdade pela área de transferência do Windows:**
  - uma captura PNG 1304×696 posta no clipboard do sistema e colada com
    `mainWindow.webContents.paste()`, o mesmo caminho do Ctrl+V;
  - virou a miniatura "image.png (1304×696)";
  - o conteúdo anterior do clipboard foi guardado e devolvido.
- **Testes:**
  - 26 do Claude por chave no Node, incluindo 5 novos de imagem, 1 do gerenciador e 1 do `/resume`;
  - 22 da conversa e das imagens no vitest.

**Ponto de atenção.**
- Cada imagem entra no histórico do Claude Code em base64 e volta no contexto dos turnos seguintes:
  pesa no gasto e no tamanho do `.jsonl`.
- O `/resume` ignora arquivo acima de 50 MB. Com capturas de 1 a 2 MB em base64, isso dá umas 25
  imagens numa conversa.
- **Não validado:**
  - resposta com imagem usando uma chave de API real; a parte da API foi medida com o login do sistema;
  - macOS e Linux.

## 2026-10-21 — ai-memory instalado (memória de longo prazo entre sessões e agentes)

**Pedido.** "Instala o ai-memory aqui neste repositório", depois ampliado para "todos os meus
repositórios, pelo menos os que estão na máquina". O ai-memory é o projeto
`github.com/akitaonrails/ai-memory`; o `Felixo-Notion-MCP` já o usava desde 19/10/2026 (`e16717b`),
mas o programa não existia nesta máquina.

**Premissa que mudou o plano.** O ai-memory não tem instalação por projeto: o serviço, o MCP e os
hooks são por usuário. Instalar "aqui" é instalar na máquina, e a captura vale para todo repositório.
O que dá para limitar é o que ele captura. A pessoa escolheu capturar todos.

**O que foi instalado na máquina** (versão 3.1.2, Windows nativo, marcado como experimental pelo autor):
- **Programa:** `%LOCALAPPDATA%\Programs\ai-memory`, no PATH do usuário. O instalador oficial foi
  baixado, lido e só então executado; ele confere o SHA-256 antes de extrair.
- **Dados:** `%LOCALAPPDATA%\ai-memory` (wiki em Markdown versionada em git, índices SQLite, token
  de acesso só do dono). Nada disso entra no repositório.
- **Serviço:** entrada de logon em `HKCU\...\Run\ai-memory`, sem janela, em `127.0.0.1:49374`
  com autenticação por token.
- **Agentes ligados** (`ai-memory setup`): Claude Code, Codex e Copilot CLI, os três que já existiam
  aqui. Em cada um entram MCP, hooks de captura e as seis skills, nas pastas do usuário.
- **Cópia de segurança** das configurações alteradas: o próprio programa gravou uma ao lado de cada
  arquivo, e outra foi guardada fora do repositório.

**O que mudou neste repositório.**
- `CLAUDE.md` e `AGENTS.md` novos, com o bloco gerenciado entre `<!-- ai-memory:start -->` e
  `<!-- ai-memory:end -->`. Os dois existem porque o Claude Code lê o `CLAUDE.md` e os outros agentes
  leem o `AGENTS.md`. Foi o mesmo desenho do `Felixo-Notion-MCP`.
- As seis skills `ai-memory-*` em `.claude/skills/` e `.agents/skills/`, para o repositório carregar
  a memória também em outra máquina, sem depender da instalação do usuário.
- O bloco e as skills são do programa: para atualizar, `ai-memory install-instructions` troca só o
  trecho entre os marcadores. Não editar à mão.

**O que foi medido.**
- `ai-memory setup --plan` antes de aplicar, depois `setup --yes`: `healthz: ok` e `memory_status: ok`.
- `ai-memory doctor`: o projeto é reconhecido como `felipe-alcantara-felixo-ai-core` (coordenada
  exata, pela URL do remoto) e "Every harness that ran in this project recently is captured".
- O `~/.claude.json` manteve os 41 projetos e todas as chaves; o MCP `ai-memory` entrou ao lado de
  `obs` e `whatsapp`. Os 9 eventos de hook entraram no `settings.json`.
- `install-instructions` rodado duas vezes: a segunda deu `no-op`, ou seja, é idempotente.
- **Spool na primeira subida:** o servidor gastou uns 25 s baixando o modelo local de embeddings,
  e os primeiros eventos dos hooks estouraram o tempo e foram para `hook-spool/`.
  `ai-memory hook-drain` entregou. O modelo fica em `models/`, então a próxima subida não deve repetir a espera.

**Ponto de atenção.**
- **Reiniciar os agentes.** Claude Code, Codex e Copilot só carregam o MCP e os hooks novos ao abrir
  de novo. A sessão que fez a instalação já aparece capturada no `doctor`, mas as ferramentas `memory_*` do MCP só existem depois de reabrir.
- **Codex pede duas coisas:** confiar nos hooks novos (aparece "Hooks need review") e ter a variável
  `AI_MEMORY_AUTH_TOKEN` no ambiente onde o `codex` abre. O token não foi gravado em lugar nenhum
  nem posto em variável de ambiente, para não ficar visível a todo processo.
- **A captura é global e em modo denylist.** Prompts e uso de ferramentas de todo projeto vão para a
  wiki local, com sanitização de segredos do próprio programa. Para tirar um repositório da
  captura, um `.ai-memory.toml` na raiz dele com `[capture] ignore_paths`.
- **Desinstalar:** `ai-memory uninstall --apply` para o serviço e tira a entrada de logon. O README
  não diz se isso desfaz o PATH e as configurações dos agentes; as cópias de segurança servem para isso.
- **Não validado:** as ferramentas MCP (`memory_*`) numa sessão nova, a recuperação de memória entre
  sessões, o Codex e o Copilot funcionando de fato (só foram ligados), e a instalação em macOS e Linux.

**Correção (mesmo dia).** O trecho acima sobre o spool está errado. Os eventos não foram para
`hook-spool/` por estouro de tempo na primeira subida: o hook nativo **sempre** grava o evento no
spool local, para nunca prender o agente na rede, e a entrega é feita por um `hook-drain` separado,
nas fronteiras da sessão (descrito em `docs/ARCHITECTURE.md` do ai-memory).
- **Medido depois:** os eventos desta sessão ficaram parados no spool (4 itens, só envelhecendo, por
  30 s), com o servidor saudável. `ai-memory hook-drain` entregou tudo (spool de 20 para 0) e o
  `ai-memory status` passou a mostrar a sessão e as observações.
- **Consequência:** `hook spool: N event(s) waiting` no `doctor` é normal durante a sessão.
- **Continua não validado:** a drenagem automática no fim da sessão.

## 2026-10-21 — Instalador: cancelar e expirar pelo app empacotado não deixa processo (cenário no release-smoke)

**Pedido.** Task "Instalador — smoke empacotado real nos três SOs e validar kill de árvore fora do CI",
derivada do PR #84 (`core/process-tree.cjs`): o `taskkill /T /F` e o kill de grupo POSIX só tinham
prova no runner do CI e em teste unitário, e não havia smoke do instalador contra o app empacotado.

**O que já existia.** `release-smoke.cjs` roda nos três SOs do Release: extrai o artefato real, abre o
executável em `--release-smoke` e usa o npm do pacote para instalar e atualizar uma CLI de teste. Não
havia nele nenhum cenário de cancelar ou expirar uma instalação. `process-tree.test.cjs` já tem processo
real com neto real, mas não passa pelo `app.asar`, pelo npm do pacote nem pelo atalho `node` do runtime.

**O que mudou.**
- **`app/scripts/installer-kill-smoke.cjs` (novo):** instala um pacote local cujo `postinstall` sobe um
  neto, pelo `managed-cli-installer` que está DENTRO do `app.asar` (o executável empacotado roda como
  Node e carrega o módulo do asar), e dispara os dois caminhos: `cancel` (AbortController) e `timeout`
  (prazo calculado a partir do tempo que o `cancel` mediu na máquina, de 20 a 120 s).
- **Quem prova não é o código testado:** o driver só fotografa a árvore (`ps -A -o pid=,ppid=,comm=` no
  POSIX, `Get-CimInstance Win32_Process` no Windows); o runner, depois que o driver saiu, confere pid a
  pid e pelo nome do processo (pid reaproveitado não conta) e encerra o que sobrou.
- **Controle negativo (`--control`):** mata só o npm, como o `child.kill()` de antes do PR #84, e PRECISA
  deixar órfão. É o que prova que a sonda enxerga o defeito.
- **`release-smoke.cjs` chama o cenário** depois do npm do pacote e grava `installerKill` no relatório
  (só nomes de processo, contagens e tempos; nenhum caminho). `release-relevant.sh` ganhou o arquivo:
  o `release-inputs.cjs` o deriva como entrada do Release e o teste de sincronia acusaria a falta.
- **CLI própria:** `node scripts/installer-kill-smoke.cjs --artifact <app> [--only cancel] [--control]
  [--source]`. O roteiro para máquina real está em `docs/validation/CHECKLIST-INSTALADOR-ARVORE-DE-PROCESSOS.md`.

**O que foi medido (Windows 11 real, fora do CI, `win-unpacked` do commit `85d688d`).**
- **`cancel`:** `cancelled`, 0 sobreviventes. O `postinstall` subiu em 5,8 s; árvore de 5 processos e 4
  níveis (`Felixo AI Core.exe` → `cmd.exe` → `conhost.exe` → `Felixo AI Core.exe` → `Felixo AI Core.exe`);
  tudo resolvido 182 ms depois do cancelamento.
- **`timeout`:** `timeout`, 0 sobreviventes, mesma árvore, prazo de 20 s.
- **Controle (`--control`):** matar só o npm deixou **2 sobreviventes** (o script e o neto). Falha antes,
  passa depois, no mesmo app empacotado e na mesma árvore.
- **Testes:** 21 no módulo novo (processo real nos dois sentidos: a sonda vê o órfão e não acusa onde a
  árvore morreu) e o ponta a ponta contra a fonte com npm de verdade (FELIXO_REAL_INSTALLER_KILL=1, 40 s).
  `npm test`: 2802 testes, 2793 aprovados, 0 falhas, 9 pulados, em duas rodadas completas; `npm run lint`
  limpo; `release-relevant.test.sh` passa.

**Achados que não eram desta task (viraram tasks).**
- **Defeito do produto:** o atalho `node.cmd` que o app gera grava o caminho do executável em UTF-8, e o
  `cmd.exe` o lê na página OEM do console. Com o console em cp850 (Windows pt-BR) ou cp437 e acento no
  caminho do executável, o `node` não é achado ("O sistema não pode encontrar o caminho especificado");
  com `chcp 65001` no topo do atalho funciona. Medido com o atalho real. O cenário agora recusa esse caso
  com a causa, porque ele gastou 90 s mostrando um erro de npm que não era o que se queria provar.
- **`npm run pack` no Windows:** `bundle-npm-runtime.cjs` falhou no `cpSync` logo depois do `rmSync` em 2
  de 4 execuções (as outras 2 vieram depois de eu apagar a pasta à mão); e o `electron-builder` não recompila o
  `node-pty` sem o Visual Studio (`-c.npmRebuild=false` contorna, o `node-pty` usa os binários prontos).
- **`release-smoke` local:** falha na entrega de catálogo do PTY nesta máquina, com o mesmo erro em 13/10
  e hoje, enquanto o `Publish windows-latest` do CI passou na v0.1.471. É anterior a este cenário.
- **Teste intermitente:** `analyzeRepo detecta commits remotos pendentes de pull` falhou em 1 de 3
  rodadas completas e passou 3 de 3 isolado.

**Ponto de atenção.**
- **No Windows um neto comum de um pai Node morre junto** (job object do libuv), então os testes unitários
  só discriminam com neto `detached` (que escapa do job, como um daemon de pós-instalação). Na árvore
  real do npm, que passa pelo `cmd.exe`, o controle deixa órfão de verdade, como medido acima.
- **Não validado:** macOS real e Linux real (a task pede os dois; só o CI, que não conta como "fora do
  CI", os cobre) e o cenário no Release do CI nos três SOs, que roda pela primeira vez neste push.

**Acompanhamento do deploy (mesmo dia): o cenário achou um defeito no POSIX.**
- **Release 39669539091 (primeiro com o cenário):** Windows passou. No macOS e no Ubuntu o kill FUNCIONOU
  (0 sobreviventes nos dois cenários), mas o cenário reprovou porque o resultado veio `failed`, não
  `cancelled`/`timeout`; a publicação ficou `skipped` e a v0.1.471 continuou a atual.
- **Causa (`managed-cli-installer.cjs`, `runCommand`):** no POSIX o `killProcessTree` manda SIGTERM, o npm
  morre na hora e o `close` dele chega enquanto o kill ainda espera os 2 s antes do SIGKILL. Quem resolvia
  era o `close`, com "(codigo null)", sem `cancelled` e ANTES de a árvore terminar de morrer
  (`resolvedAfterMs` de 25 ms no relatório do CI). A resolução do `finishAfterKill` era descartada. Os
  testes existentes usavam um `killTree` que resolve na hora e um filho que nunca emite `close`, por isso
  não pegavam. No Windows a ordem dos eventos não dispara a corrida.
- **Conserto:** `killing` — quem mata a árvore é quem resolve (`close` durante o kill é ignorado) e um
  `killTree` que rejeita não deixa a instalação pendurada (antes virava rejeição não tratada e a promessa
  nunca resolvia). Efeito: no POSIX cancelar e expirar agora resolvem depois do SIGKILL de escalada
  (uns 2 s), como o comentário do próprio `runCommand` já prometia.
- **Prova:** 3 testes novos que FALHAM no código antigo (✖✖✖; o do `killTree` que rejeita pendurava o
  processo de teste por 10 min, o tempo do timer de instalação) e passam no novo. No Windows, `app.asar`
  novo (com o conserto dentro) e cenário de novo contra o app empacotado: `cancel` → `cancelled` em 162 ms,
  `timeout` → `timeout`, 0 sobreviventes; controle com 2 sobreviventes.
- **Intermitência registrada:** `npm test` fez 6 rodadas completas hoje, 2 com 1 falha cada, em testes
  diferentes de `fetch-all` (`analyzeRepo ... pendentes de pull` e `executePlan faz o push ...`); cada um
  passa 3 de 3 isolado. Não tem relação com o instalador.

## 2026-10-22 — Instalador: Python e script ganham a garantia do npm (árvore de processos, runtime e retry de rede)

**Pedido.** Task "Instalador — cobrir Python e script na matriz de instalação, detecção e retry",
derivada da task "CLI — cobrir layout, scripts e reinício do instalador nos três sistemas". O PR #84
(`core/process-tree.cjs`) deu ao npm a garantia de que cancelar ou estourar o prazo encerra a árvore
inteira, e a entrada de 2026-10-21 provou isso pelo app empacotado. As outras rotas de instalação não
tinham nada disso.

**Mapa das rotas de instalação (lido no código em 22/10/2026).**
- **npm** (Codex, Claude e Gemini, `autoInstall` padrão): `managed-cli-installer.runCommand`, que já
  nascia `detached` no POSIX, matava a árvore e aceitava `signal`. Faltava repetir a falha de rede.
- **Python/pip** (só o Openia: `autoInstall: false`, `requiresConfirmation`): `installOfficialCli` →
  `runBufferedCommand`. Sem `detached`, no prazo só `childProcess.kill('SIGTERM')` no filho direto, sem
  cancelamento, sem repetir a rede e com o comando fixo (`py` no Windows, `python3` no resto).
- **Script:** nenhuma CLI do catálogo instala por script. O instalador aceita qualquer comando pelo
  mesmo `runBufferedCommand`, então a rota vale para quem chegar (as tasks de MCP que dependem da
  "matriz Python/script" são os primeiros consumidores previstos).
- `runBufferedCommand` também roda `login status`, a consulta de uso e a elegibilidade de conta (prazo
  de 30 s), então o conserto do prazo vale para elas.

**Reproduzido antes de consertar (Windows 11, Python 3.14.2, `py.exe`).** `runBufferedCommand` com `py`
rodando um Python que sobe um neto e `timeoutMs: 3000`: devolveu `timedOut`, e o neto `python.exe`
**sobreviveu** (1 sobrevivente pelo `Get-CimInstance`, pai já morto). É o mesmo defeito que o PR #84
consertou no npm.

**O que mudou.**
- **`official-cli-service.cjs`, `runBufferedCommand`:** nasce `detached` no POSIX, mata a árvore no prazo
  e no cancelamento (`signal`) com o `killProcessTree` que já existia, e quem mata é quem resolve
  (`killing`, o mesmo defeito de ordem do `close` que o npm teve no macOS e no Ubuntu). Devolve
  `timedOut` ou `cancelled`. A mensagem de erro passa a mostrar o FIM da saída (onde o pip e o npm põem o
  erro) sem as linhas `[notice]` do pip. `killTree`, `spawn` e `platformName` são injetáveis.
- **`core/install-retry.cjs` (novo):** `withNetworkRetry` repete duas vezes, esperando 3 s e depois 10 s,
  só quando `isTransientNetworkFailure` reconhece a falha como rede passageira. Padrões tirados da saída
  MEDIDA do pip 25.3 e do npm 11.6.2 (`ECONNREFUSED`, `ENOTFOUND`, `npm error network`, os avisos
  `Retrying (Retry(`, 5xx, 408, 429). Não repete 404, `EINTEGRITY`, `ETARGET`, permissão, prazo vencido
  nem executável que nem abriu. O resultado ganha `networkRetries`.
- **`core/python-runtime.cjs` (novo) e `install.runtime` no catálogo:** antes de rodar o pip, procura um
  Python que sirva (`py`, `python`, `python3` no Windows; `python3`, `python` no resto) com
  `python -m pip --version`, confere a versão mínima (`3.10`, o `requires-python` do pyproject do Openia
  no commit pinado) e explica o que falta em vez de "spawn py ENOENT": não encontrado, antigo demais ou
  sem pip (com o `apt install python3-pip` do Debian e Ubuntu). O atalho `python.exe` da Microsoft Store
  não é Python e é pulado.
- **`installOfficialCli`:** usa o runtime achado, repete a rede em cada rodada do pip (inclusive a do
  `--break-system-packages`), aceita `signal` e devolve `cancelled` sem detectar nem importar modelos.
- **`cli-auto-install.cjs`:** `installAndVerifyManagedCli` e a atualização do npm global do sistema
  repetem a rede do mesmo jeito, e o status diz "Sem resposta da rede ao instalar X; tentando de novo
  (1 de 2)". O `runCommand` do npm devolve `timedOut` e `errorCode`, sem ninguém adivinhar pelo texto.
- **Interface:** o modal de modelos avisa "a conexão falhou no meio e a instalação foi repetida sozinha",
  como já avisava do PEP 668.

**Por que a repetição é estreita, e por que só duas.** O `cli-diagnostics` também classifica falha de
instalação, mas para EXPLICAR: o padrão dele casa "proxy", "network" e certificado autoassinado, o que
ajuda a mensagem e atrapalharia aqui, porque repetir não conserta proxy nem certificado. E o npm (duas
vezes, de 10 a 60 s de espera) e o pip (cinco, com espera curta) já repetem dentro de uma execução: o que
chega ao instalador é a conexão que ficou fora o tempo de uma sequência inteira. Sem a espera maior, uma
queda de rede na abertura marcava a CLI como "já tentou nesta versão" e ela só voltava a instalar numa
atualização do app ou no "Tentar de novo" manual.

**O que foi medido.**
- **Saída real de falha** (pip 25.3 e npm 11.6.2, Windows 11): pip sem DNS e com porta fechada traz os
  avisos `Retrying (Retry(` e `NewConnectionError`/`ConnectTimeoutError`; contra um índice, o erro final é
  só "No matching distribution found" (o sinal de rede são os avisos de tentativa); pacote inexistente e
  `HTTP error 404` não trazem aviso nenhum; sem permissão vem como `PermissionError: [WinError 5] Acesso
  negado`. npm traz `ECONNREFUSED`, `ENOTFOUND` e `npm error network`; 404 é `E404`.
- **Teste de processo real** (`install-routes-process-tree.test.cjs`): 3 rotas (npm, Python, script) ×
  prazo, cancelamento e um controle que mata só o processo imediato e PRECISA deixar o neto vivo. Contra o
  código de antes: Python e script reprovam (neto órfão e processo vivo) e o npm reprova por faltar o
  `timedOut`. Com o conserto: 9 de 9.
- **Visto rodando (Windows real, `py.exe` e pip reais, sem instalar nada):** o prazo no mesmo cenário da
  reprodução deixou 0 sobreviventes; `installOfficialCli('openia')` ponta a ponta contra uma porta fechada
  fez 3 tentativas do pip com esperas de 300 e 600 ms e terminou "A rede falhou nas 3 tentativas."; cancelar
  com `py.exe` e `python.exe` vivos devolveu `cancelled` e deixou 0 sobreviventes.
- **Falha antes, passa depois no retry do npm:** 4 dos 5 testes novos de `cli-auto-install` reprovam no
  código de `f8ffe8c` (o quinto, "não repete pacote inexistente", é a trava contra repetir demais e passa
  nos dois).
- **Gate:** `npm test` 2890 testes, 2881 aprovados, 0 falhas, 9 pulados (eram 2805); `npm run lint` e
  `tsc -p tsconfig.app.json` limpos.

**Ponto de atenção.**
- **Instalação de verdade do Openia não foi rodada:** o comando é fixo (`pip --user` do Python do usuário)
  e instalaria o pacote nesta máquina. O pip, o runtime e o retry rodaram de verdade, só o alvo foi trocado.
- **Fechar o app no meio de uma instalação não a cancela** (nem a do npm nem a do pip): o `signal` existe
  nas duas rotas e nenhuma camada acima o dispara. Virou task, junto com o botão "Cancelar".
- **Rede fora por minutos:** as duas repetições cobrem segundos. Fora disso a falha continua gravada como
  "já tentou nesta versão". Reagendar, como já se faz para arquivo travado, é decisão de produto (quanto
  tentar enquanto offline) e virou task.
- **Não validado:** macOS real e Linux real (o `install-routes-process-tree.test.cjs` roda nos quatro
  sistemas do CI, mas isso não é "visto rodando" fora dele), e a rota de script contra uma CLI de verdade
  (não existe nenhuma no catálogo).

**Acompanhamento do deploy (mesmo dia): dois testes meus reprovaram no CI, nenhum defeito de produção.**
- **CI 39784321146 (`de9b2ac`, os 4 commits): reprovou no Ubuntu e no macOS** em um único teste, o da "saída
  maior que o limite" do `runBufferedCommand`. O filho de teste escrevia ~400 KB no stderr e chamava
  `process.exit(1)`: no POSIX a escrita num pipe é assíncrona e o `exit()` cortava o fim da saída, justo a
  linha conferida. No Windows a escrita é síncrona e escondeu isso na máquina de desenvolvimento. As 9 provas
  de processo real passaram nos dois sistemas, inclusive a rota Python com Python de verdade.
- **CI 39785574078 (`a3e3877`, troca por `process.exitCode`): reprovou nos TRÊS sistemas, em dois testes.**
  O executor da suíte (`scripts/run-node-unit-tests.cjs`) injeta uma pré-carga do SQLite em `NODE_OPTIONS`; no
  Node 22 do CI isso imprime `ExperimentalWarning: SQLite is an experimental feature` no stderr de todo filho
  Node, depois da saída dele (no Node 25 local, não). Com `exit()` o processo morria antes do aviso; com
  `exitCode` ele vive o bastante para o aviso aparecer e o fim da mensagem deixou de ser o erro. Reproduzido
  aqui com uma pré-carga que emite o mesmo aviso: a versão que reprovou no CI falha nos dois testes e a
  corrigida passa nos 51 do arquivo.
- **Conserto (`2e07de9`):** o filho desses dois testes roda com `NODE_OPTIONS` vazio. Só teste mudou.
- **CI 39786633256 (`2e07de9`): verde** em `Validate` no Windows (2890 testes), Ubuntu e macOS (2893) e no
  Ubuntu ARM (que só roda `test:native`, 7 testes). As 9 provas de processo real rodaram nos três primeiros,
  sem nenhuma rota pulada (a Python incluída).
- **Correção do que escrevi acima:** "roda nos quatro sistemas do CI" está errado. A matriz de processo real
  roda em **três** (Windows, Ubuntu e macOS); o job do Ubuntu ARM não roda a suíte completa.
- **Release gate 39787838820:** success (release relevante). **Release 39787884435: success** nos três
  sistemas → **v0.1.474**, Latest, alvo `2e07de9`, 20 arquivos. O smoke empacotado do Release repetiu o
  cenário de ontem com o `runCommand` alterado: `cancel` → `cancelled` e `timeout` → `timeout`, **0
  sobreviventes**, no Windows, Ubuntu, macOS e na variante de quarentena do macOS (cancelamento resolvendo em
  60 ms no Windows e em ~2 s no POSIX, a graça do SIGKILL).
- **Fora desta task, achado ao acompanhar o deploy:** o Nightly de hoje (39770466812, 08:25, sobre `f8ffe8c`)
  reprovou no `Canvas smoke (windows-latest)`: `[canvas-smoke:leitura] F3 … o xterm ficou menor que a gravação
  (100×50) {"rows":67,"cols":65}`, nas 3 tentativas. Os 5 anteriores passaram. O intervalo desde o último verde
  (`d0a2f54..f8ffe8c`) inclui o tema claro, cujo commit `b127a54` mexeu justo na sessão Leitura do smoke.
  Suspeita, não confirmada; virou task.

## 2026-10-22 — CI: o ciclo de instalação das CLIs no Windows ganha workflow, veredito e controle

**Pedido.** Task "Windows — integrar o runner de reprodução de instalação de CLIs ao CI/release", segunda
fatia da task "Windows — reproduzir instalação repetida de CLIs em app empacotado e após upgrade". O runner
`app/scripts/cli-auto-install-real-repro.cjs` (commit `eb44b3f`, 25/09) rodava só à mão e terminava com 0 ou
1. A terceira fatia (o app instalado pelo NSIS) segue em task própria.

**Verificado antes de mexer.** O runner de setembro ainda funciona no código de hoje: gemini (32 s / 3,6 s /
3,2 s / 45 s) e claude (17 s / 2,1 s / 1,8 s / 36 s), 4 rodadas, `EXIT=0`, Windows 11 de desenvolvimento.

**Decisão: onde roda.** Um workflow próprio, `ciclo-instalacao-clis.yml`, e não o CI de PR nem o Release.
- Em PR não: rede real, minutos de duração e falha por instabilidade do registry que não é culpa de quem
  abriu o PR.
- No Release não: ele publica o instalador, e uma falha de rede de terceiros ali atrasaria a publicação e
  deixaria um pré-release órfão (o `v0.1.472` ficou assim, por outro motivo).
- O `official-cli-install.yml` já roda instalação real fora do PR, mas com `npm install -g` cru: prova que o
  npm instala a CLI, não que o Felixo decide certo sobre reinstalar.
- Gatilhos: `push` na `main` só quando muda código que o ciclo executa (e o próprio workflow), toda segunda
  09:30 UTC e `workflow_dispatch`. Nada disso é release-relevante: o Release gate respondeu
  `Release relevante: false` e nenhuma versão saiu.

**O que mudou.**
- **O runner ganhou veredito e código de saída:** 0 ok, 1 regressão do ciclo, 2 infra (rede ou registry), 3
  falha de instalação sem sinal de rede, 4 erro do runner. A classificação sai do resultado CRU do instalador
  (`output`, `timedOut`, `errorCode`) pelo `isTransientNetworkFailure` do retry de rede de ontem, não do texto
  de status.
- **"Não reinstalou" tem dois sinais**, o estado (`idle`) e zero chamadas ao instalador: uma reinstalação
  adiada por arquivo travado também termina em `idle`.
- **O `latest` fica fixado entre as rodadas.** O Gemini publica um `nightly` por dia (o alvo medido hoje foi
  `0.67.0-nightly.20261022.g09d81bf11`); sem fixar, uma publicação no meio do script viraria um falso
  "reinstalou".
- **Isolamento:** o npm global do sistema nunca é tocado (`systemCli` blindado); `FELIXO_MANAGED_CLI_ROOT` e
  `FELIXO_AUTO_INSTALL_CLIS` saem do ambiente; o remendo do catálogo e do `require('electron')` não vaza mais
  para o resto do processo (antes o catálogo ficava filtrado).
- **Relatório JSON e resumo Markdown**, sem caminho da pasta temporária; a saída do npm só da falha, em um
  bloco por rodada, guardando o começo (`npm error code …`) e o fim, com redação de URL e token linha a linha.
- **Controle negativo** (`--control-regressao`): apaga o binário antes da rodada 2, e o runner PRECISA terminar
  em `regressao`.
- **O workflow** roda gemini e claude no `windows-latest` (o Codex fica fora: caso conhecido da dependência
  nativa opcional). Só o código 2 é repetido (3 tentativas, esperas de 60 s e 120 s); uma regressão NUNCA é
  repetida. Cada código vira uma anotação que diz de quem é o problema; log, relatório e resumo sobem como
  artefato sempre. `npm ci --ignore-scripts`, sem baixar o Electron.

**O que foi medido.**
- **Clone limpo (worktree descartável):** `npm ci --ignore-scripts` em 44 s, os testes passando sem o binário
  do Electron e o runner de verdade com veredito `ok` (67 s).
- **Runner de verdade, rede real:** controle → `EXIT=1`, só a rodada 2 acusada. Infra provocado apontando o
  registry do npm para `127.0.0.1:9` → `EXIT=2` em 15,5 s, com a saída REAL do npm (`ECONNREFUSED`), 3
  tentativas do app (esperas de 3 s e 10 s). Isso achou um defeito de legibilidade que o instalador falso não
  mostrava: o resumo repetia o mesmo bloco 3 vezes, e o `redactDiagnosticText` (que termina com um `slice` que
  guarda só o começo) jogava fora o fim da saída antes do meu corte.
- **Testes:** 42 offline (`cli-auto-install-real-repro.test.cjs`), com um instalador falso que grava os
  arquivos que o npm gravaria, rodando o módulo de produção de verdade. **Teste de mutação:** 6 estragos no
  runner (sem fixar o `latest`, controle que não apaga, toda falha virando rede, regressão sem contar chamadas,
  catálogo não restaurado, instalador que esquece a rede), todos reprovados. Na primeira rodada DOIS
  sobreviveram e acharam um teste que faltava (rodada `idle` que chamou o instalador) e um teste vazio (eu
  importava `listOfficialAiClis` por desestruturação e ele nunca via o catálogo remendado).
- **Passo bash do workflow, no Git Bash real:** com um runner falso, só o código 2 repete (esperas 60 e 120),
  1, 3 e 4 saem na hora, e o controle só liga a flag quando pedido.
- **Gate:** `npm test` 2932 testes (eram 2890), 0 falhas, 9 pulados; `npm run lint` limpo.

**Medido no CI (`windows-latest`, Node 22.23.3).**

| Run | claude | gemini |
| --- | --- | --- |
| push `6a3e107` (39793776727), verde | ciclo de 42 s; job de 1 min 43 s | ciclo de 237 s; job de 5 min; instalações de 131 s e 65 s |
| controle (39795135591), vermelho | 78 s, veredito `regressao`, código 1 | 375 s, veredito `regressao`, código 1 |

O registry do npm no runner é bem mais lento que numa máquina de desenvolvimento (a primeira instalação do
gemini levou 131 s contra 26 s aqui). Timeout fixado com base nisso: 30 min no job e 25 no passo, que é menor
de propósito para o resumo e a anotação ainda rodarem se ele estourar. O pior caso legítimo é o de infra, com
3 tentativas e as esperas, perto de 20 min.

**Ponto de atenção.**
- **Nunca vi o veredito `infra` num runner do GitHub**, só na máquina de desenvolvimento com o registry
  apontado para uma porta fechada, e a repetição entre tentativas do passo bash só foi exercida com runner
  falso. O primeiro `infra` de verdade vai mostrar se as esperas de 60 s e 120 s bastam.
- **A segunda-feira 09:30 UTC ainda não rodou**: a primeira execução agendada é a de 26/10.
- **Não coberto:** o app empacotado (NSIS), macOS e Linux, e o Codex. Ver `docs/validation/CICLO-INSTALACAO-CLIS.md`.
- **Custo:** o `push` por caminho dispara 2 jobs de Windows (uns 7 min no total) a cada commit que toca o
  ciclo. É raro, mas se o ritmo subir vale trocar por um gatilho só da noite.

**Acompanhamento do deploy (mesmo dia): o ciclo provou o próprio vermelho, e o Release gate disparou duas
versões sem necessidade.**
- **Os dois controles, vistos num runner de verdade.** Controle de regressão (run 39795135591): gemini e claude
  vermelhos com veredito `regressao`, código 1, só a rodada 2 acusada, anotação "REGRESSÃO do ciclo de
  instalação". Controle de infra (run 39800353973, `npm_config_registry` apontado para `127.0.0.1:9` só no
  passo do ciclo): os dois vermelhos com `infra`, código 2, 3 tentativas do script (cada uma com as 3 do app,
  15 s), avisos das esperas de 60 s e 120 s, anotação "INFRA (não é regressão do Felixo)", rodadas 2 a 4 não
  executadas; o passo do gemini levou 3 min 47 s (3 x 15 s mais 60 s e 120 s). Runs normais verdes: push
  `6a3e107` (39793776727), `f3aeded` (39797797274, já com os timeouts fixados) e `80c67ac` (39800332154).
- **O Codex achou uma falha do meu isolamento.** Medido localmente, o Codex fechava as 4 rodadas em `ok`, mas as
  rodadas 2 e 3 diziam "Faltam CLIs de IA" (gemini e claude diziam "prontas"). Causa, com a sonda de
  detecção: o `codex.cmd` do Openia, que está no `PATH` desta máquina, passava na frente da pasta gerenciada
  (a detecção resolve o PRIMEIRO caminho) e quebrava. O ciclo estava certo; a reprodução medida era a da
  máquina. Conserto (`1f7aae9`): o isolamento tira do `PATH` toda pasta que já tenha o executável da CLI
  testada; 3 testes e uma sétima mutação, reprovada. Com o `PATH` limpo o Codex diz "prontas" e fecha em `ok`
  (20 s / 0,7 s / 0,1 s / 36 s, alvo `@openai/codex@0.164.0-alpha.12`). Segue fora da matriz, que a task manda.
- **Dois Releases sem necessidade, e uma versão publicada sem mudança de app.** O Release gate de dois commits
  seguidos (alvos `f3aeded` e `80c67ac`) imprimiu "Nenhum commit de base confiável; decisão conservadora:
  publicar", com a lista de arquivos vazia. O Release de `f3aeded` (39800386126) falhou em "Prepare release" com
  "Nenhuma execução CI verde encontrada" e não consumiu versão; o de `80c67ac` (39801906973) publicou a
  **v0.1.476** (Latest). Entre a v0.1.474 e a v0.1.476 não mudou nenhuma linha de `app/electron`, `app/src`,
  `package.json` nem recurso empacotado (só script, teste, workflow, `IA.md` e docs): é o mesmo app.
- **Causa medida: a consulta de "commits já avaliados" do gate é intermitentemente vazia.** O comando exato do
  gate (`gh run list --workflow release-gate.yml --branch main --status completed --limit 1000 --json
  headSha,conclusion`) devolveu, em chamadas seguidas e todas com `exit=0` e sem erro, 129, 67, 67, 129, **0**,
  129 linhas e, mais tarde, 0, 129, 67, 0, 129. `release-gate.yml` esconde o erro (`2>/dev/null || true`) e
  `release_base` não acha ancestral numa lista vazia, então "na dúvida, publica". Havia um incidente "Actions
  Results" aberto no GitHub desde 14:18 UTC, mas a instabilidade seguiu com o status em "All Systems
  Operational", então não é só ele. Dos 5 gates que chegaram a decidir no dia (os de CI vermelho nem rodam o passo), 3 acharam a base e 2 não.
  **Não alterei o gate**: é infraestrutura de publicação, fora do escopo, e mexer nela sem testes poderia
  deixar de publicar um app que precisa sair. Virou task, com o conserto sugerido.
- **Cuidado que isso impõe:** o `concurrency` do Release cancela o que está em andamento quando outro entra, e
  um Release cancelado no meio deixa pré-release órfão. Por isso nenhum push foi feito enquanto o Release de
  `80c67ac` rodava.

## 2026-10-22 — Hotfix: o filtro das visualizações do Notion ganha "Sem <propriedade>" (tarefas sem repositório sumiam)

**Pedido.** Hotfix pedido pelo Felipe com uma captura do bloco "Tarefas Notion" (database "Tarefas — HOME
(pessoal)", editor "Editar visualização"): o filtro por Repositório só listava os repositórios existentes, e
não havia como mostrar as tarefas **sem** repositório. Várias tarefas sem repositório explícito ficavam
escondidas de qualquer visualização filtrada.

**Causa.** `taskMatchesView` (`app/src/features/canvas/services/notion-task-views.ts`) exigia que a tarefa
tivesse ao menos um dos valores escolhidos. Uma tarefa sem Repositório não tem valor nenhum, então nunca
passava em filtro por propriedade, e o editor não oferecia nenhuma escolha que a representasse. O seletor do
topo ("Todos os repositórios") e o Painel já tratavam o caso (`NO_GROUP_KEY`, cartão "Sem Repositório"); só o
editor de visualização tinha a lacuna.

**O que mudou.**
- **Marcador `NO_VALUE_FILTER` (`__sem-valor__`) dentro de `values`.** Quer dizer "a propriedade está vazia".
  É o mesmo texto do `NO_GROUP_KEY` do Painel. Sem valor na tarefa, ela entra só se o filtro pediu o marcador;
  com valor, o comportamento de sempre (qualquer valor em comum). Uma escolha combinada
  (`['Felixo-AI-Core', '__sem-valor__']`) traz os dois lados.
- **Chip "Sem <propriedade>" no editor**, primeiro da lista, só para `select` e `multi_select`. `status` não
  ganha: no Notion ele sempre tem valor. A lógica ficou em funções puras (`filterValueChoices`,
  `noValueLabel`, `describeFilterValues`) para ser testável no ambiente `node` do vitest, que não tem
  Testing Library.
- **A dica da aba** mostra "Repositório: Sem Repositório", nunca o marcador interno.
- **Compatível com o que já está salvo:** o formato da visualização não mudou (`values` continua
  `string[]`), então não houve migração; visualização antiga continua escondendo a tarefa sem valor, como
  antes, até a pessoa marcar o chip.
- **Inventário do canvas:** o localizador do botão de valor mudou de `toggleViewDraftValue(option)` para
  `toggleViewDraftValue(choice.value)`; `inventory/data/nodes.ts` e `docs/projeto/INVENTARIO-CANVAS.md`
  (gerado por snapshot) foram atualizados juntos.

**Medido.**
- `notion-task-views.test.ts`: 24 testes (eram 8). Cobrem as 6 formas de valor vazio que chegam do Notion
  (campo ausente, `null`, `undefined`, `''`, `[]`, `{}`), tarefa com repositório fora de "sem repositório",
  escolha combinada, filtro sem o marcador mantendo o comportamento antigo, filtro sem valores deixando tudo
  passar, combinação com o estado "abertas", visualização salva voltando do storage, `status` sem o chip,
  rótulo igual ao do Painel e a dica sem o marcador.
- **Mutação:** tirando a linha que devolve `filter.values.includes(NO_VALUE_FILTER)` para tarefa sem valor,
  **9 testes reprovam**; restaurada, os 24 passam.
- **Tela vista de verdade**, no app isolado (`felixo devtools`, perfil temporário, janela invisível), com uma
  conexão e 6 tarefas de mentira (3 sem repositório) servidas por handlers IPC falsos de `notion:*` registrados
  em `mainWindow.webContents.ipc`: o editor mostra "Sem Repositório", "Felixo-AI-Core" e "notion-tasks-cli"; ao
  salvar, a aba "Sem repositório" lista só as 2 tarefas abertas sem repositório e a dica diz "Repositório: Sem
  Repositório". A 3ª tarefa sem repositório estava concluída e fica de fora por causa do "mostrar
  concluídas", que já era assim.
- Gate: `npm run lint` e `tsc -p tsconfig.app.json --noEmit` com saída 0; vitest 3256 passando (209
  arquivos); `npm test` 2926 passando, 0 falhas. O primeiro vitest apontou o teste do inventário do canvas
  (localizador renomeado) e o snapshot do documento, os dois acertados acima.

**Fora do escopo / limites.**
- Visualizações já criadas não ganham o marcador sozinhas: a pessoa abre "Editar visualização" e marca o chip.
- Não mexi no Painel nem no seletor do topo, que já cobriam o caso.

## 2026-10-22 — PTY no Windows: o `AttachConsole` falhava em todo `kill()` (causa medida e corrigida)

**Pedido.** Task "Felixo AI Core/CI — corrigir causa raiz do AttachConsole no teste nativo de PTY Windows", aberta
em 09/09 depois de duas tentativas revertidas: forçar `useConptyDll: true` (`e3eea0e`, revertido em `1fa44a6`) e
trocar o `kill()` por `taskkill` (revertido em `e22dc31`/`ef8c3f8`, segundo a task). As duas pareciam resolver na
primeira execução do CI e travavam na segunda.

**A explicação antiga estava errada em três pontos.**
- Dizia-se que o `AttachConsole` falha só em runner sem sessão de console. Medido: falha em **todo** `kill()`, no
  runner (8 a 9 vezes por execução do Validate do Windows, em 5 execuções de 12/10 a 22/10) e numa máquina com
  desktop (8 de 8, no Node 22.23.4 e no 25.3.0).
- A guarda `conpty-console-list-agent-guard.cjs` (`uncaughtException`/`unhandledRejection` nos testes) nunca
  disparou: a mensagem dela não aparece em nenhum dos 6 logs do Windows consultados. O erro nasce num processo
  FILHO e chega ao teste só como texto no stderr herdado.
- O crash `0xC0000374` (heap corruption) de 09/09 não vem do `AttachConsole`. No log do run 34375523192 o processo
  que morreu foi o do arquivo de teste, o pai (`exitCode: 3221226356` aos 599 ms, nenhum subteste impresso), e um
  processo filho não corrompe a heap do pai: os dois só coincidem no tempo. Não consegui reproduzi-lo. Nas 150
  execuções do CI desde 01/10 o passo nativo do Windows falhou uma vez (14/10), por uma divergência de 9
  caracteres no teste de payload grande, que não tem relação com isto.

**Causa.** `WindowsPtyAgent.kill()` (node-pty 1.1.0, `lib/windowsPtyAgent.js`), no modo ConPTY sem DLL, chama
`_getConsoleProcessList()`, que bifurca `conpty_console_list_agent.js`, e em seguida, no mesmo instante, fecha o
pseudo-console (`_ptyNative.kill`). O auxiliar leva uns 45 ms para subir; quando chama `AttachConsole(shellPid)` o
console e o shell já não existem. Resultado, em todo kill: o auxiliar morre imprimindo `Error: AttachConsole
failed`; a promessa só resolve no timer de 5 s do próprio node-pty (`resolve([innerPid])`), que segura o loop de
eventos por 5 s depois do kill; e então `process.kill(innerPid)` roda num PID que pode ter sido reaproveitado
(possível, não observado). A 1.2.0-beta.15 tem o mesmo código, então atualizar não resolve. Chamar o mesmo auxiliar
ANTES do kill funciona (lista de 3 PIDs em 45 ms), o que confirma a ordem como causa.

**O que mudou.**
- `electron/services/node-pty-windows-kill.cjs` responde à pergunta do auxiliar localmente: `_getConsoleProcessList`
  da instância devolve `[pid do shell]` enquanto a sessão está viva e `[]` depois que ela saiu. Só no win32 e só se o
  método existir; um node-pty de outra forma devolve `false` em vez de lançar. `createNodePtySpawn` envolve o
  `spawn` e lê `nodePty.spawn` a cada chamada.
- Os quatro pontos de produção que criam PTYs passam por ele: `pty-process-manager`, `claude-usage-query`,
  `codex-status-screen` e `cloud-session-service`.
- Testes: 13 de unidade em `node-pty-windows-kill.test.cjs` (um fixa a forma interna do node-pty instalado, para um
  upgrade não desligar a correção em silêncio; outro reprova um ponto novo de produção que use o `spawn` cru) e
  `pty-kill.integration.test.cjs` (PTY real num filho: stderr sem o erro e saída em menos de 4,5 s depois do kill),
  ainda fora do `test:native` (ver Limites). Quatro mutações do módulo e do ponto de produção foram mortas.
- A guarda de `AttachConsole` foi removida dos três testes nativos e apagada.
- `scripts/repro-pty-kill.cjs` (`node scripts/repro-pty-kill.cjs --runs N`, 14 testes) e o workflow sob demanda
  `pty-kill-windows.yml`: N execuções COM e N SEM a correção (o controle), cada uma num processo novo, medindo
  ruído, tempo e travamento; mais o `npm run test:native` do CI e o teste de encerramento repetidos N vezes, com
  teto de 600 s cada.

**Medido.**
- Windows 11 local, 8 execuções por caminho, Node 25 e Node 22: sem a correção 8 de 8 com ruído e o processo sai
  ~5,9 s depois de iniciar (kill aos 0,8 s); com ela 0 de 8 e ~1,9 s. Todas com `onExit` entregue e sem travamento.
- Sob o Electron 41.10.7 (Node 24.18.0), `cmd.exe` como shell: 1 `AttachConsole failed` por kill sem a correção (2 de
  2), 0 com ela (2 de 2), `onExit` no mesmo tempo (~925 ms).
- Sobreviventes (um `node` como shell que cria um neto no mesmo console): 0 em três modos (sem mexer, sem o
  auxiliar e com a lista pedida antes do kill). Fechar o pseudo-console já encerra a árvore, e o auxiliar nunca
  devolveu lista em nenhuma das medições, então a correção não tira nada.
- `npm run test:native` local: antes 7 testes, 7 linhas de `AttachConsole` e 30 s; depois, com o teste novo
  incluído à mão (8 testes), 0 linhas e 15 s.
- No `windows-latest` (imagem `windows-2025-vs2026`, Node 22.23.x), três execuções do workflow com 10 repetições
  cada: 39831517850 (com a guarda ainda instalada), 39832831848 (guarda removida) e 39835350917 (a árvore que
  entra na `main`, sem a edição do `package.json`). Em todas: com a correção 10 de 10 sem ruído e saída entre 1005
  e 1019 ms depois do kill; controle 10 de 10 com ruído e 5006 a 5022 ms (o runner reproduz o defeito); passo
  nativo 10 de 10 verdes e 0 linhas de ruído (~15 a 18 s nas duas primeiras; na terceira, o `test:native` de 7
  testes mais o teste de encerramento, 8 `ok` e 0 `not ok` em cada repetição).

**Achado ao lado: o flake do payload grande.** Numa execução da validação repetida (run 39836260322, repetição 1
de 10) o teste `payload grande chega inteiro...` falhou com 9 caracteres a mais no índice 53817, a mesma assinatura
do CI de 14/10 e de 20/09, e sem nenhum ruído de `AttachConsole`: não é o `kill()`. Causa, reproduzida de forma
determinística com o coletor do próprio teste e o stdin por pipe: o coletor procurava o marcador de fim
(`__FELIXO_EOF__`) pedaço a pedaço, e quando o ConPTY o entregava partido o começo dele (CR + `__FELIXO`,
exatamente 9 caracteres) ficava na carga; sem Ctrl-Z e com o marcador partido o coletor nunca terminava. Conserto só
de teste: a busca passa para o buffer acumulado e a carga termina no primeiro sinal de fim; teste novo com cinco
cortes, que reprova com o coletor antigo. Não dá para provar por repetição que o flake sumiu (aparecia cerca de uma
vez em 40 repetições; no CI, uma vez em 150 execuções): a prova é a reprodução determinística. O outro flake da mesma
task de acompanhamento (o E2E de contexto) segue aberto.

**Limites.**
- Não reproduzi o crash `0xC0000374` de 09/09; se voltar, é outra causa e o teste novo não o cobre.
- O teste com neto cobre processos que ficam no console; um processo que se desanexa dele não foi testado. Antes e
  depois são iguais nesse caso, porque o auxiliar nunca devolveu lista.
- Os benchmarks de PTY em `app/scripts` (`terminal-scrollback-benchmark.cjs`, `record-terminal-fixture.cjs`) ainda
  usam o node-pty cru e não foram alterados: mudar o que o benchmark mede é decisão à parte.
- Não reportei o defeito no repositório do node-pty.
- **O `app/package.json` não foi alterado.** Qualquer mudança nele liga a política de dependências do CI
  (`.github/scripts/ci-scope.sh`), e ela reprova hoje o `npm audit` completo (18 avisos, 1 crítico em `dompurify`, 4
  altos em `brace-expansion`, `http-cache-semantics`, `undici` e `vite`), por avisos novos sem relação com este
  trabalho; apareceu no PR #130. Na `main` isso deixaria o CI vermelho e o Release gate, que exige CI verde, não
  publicaria o conserto. Por isso o teste de integração novo ainda não está na lista do `test:native`, e não há
  script `repro:pty-kill`: as duas linhas entram num commit à parte quando a política voltar ao verde. Até lá o teste
  roda à mão e o `pty-kill-windows.yml` cobre o mesmo cenário no runner.

**Complemento de 22/10/2026 (deploy e a conta final do runner).**
- **Deploy.** O CI da `main` (run 39838891380, que reaproveitou o do PR #130: mesma árvore), o Release gate
  (39838930871) e o Release (39838968874) passaram; a v0.1.478 saiu às 16:18 como Latest, apontando para `bddc016`.
  O smoke empacotado do Windows (`release-smoke-windows-latest.json`) registra `pty.ok: true`
  (`FELIXO_RELEASE_PTY_OK`, exitCode 0), `nativeErrors: []` e `result: passed`.
- **Conta das execuções do workflow no runner.** Foram 6 execuções de 10 repetições (39831517850, 39832831848,
  39833755769, 39835350917, 39836260322 e 39837855249). Em todas o controle reproduziu o defeito (10 de 10 com ruído,
  5006 a 5022 ms) e a correção saiu limpa (10 de 10 sem ruído, 1004 a 1019 ms). O passo nativo ficou verde em 59 de
  60 repetições e com 0 linhas de ruído em todas. As duas execuções vermelhas não são da correção: a 39831517850
  contou a palavra "AttachConsole" e pegou o título do próprio teste de integração (o padrão passou a ser o texto
  exato do erro), e a 39836260322 pegou o flake do payload grande descrito acima.

## 2026-10-23 — Padrão de qualidade, segunda passada: dependências sem crítico nem alto, IA.md compactado, README e teste de encerramento da PTY ligados

**Contexto.** Pedido: colocar o repositório no padrão de qualidade do Felixo System Design, dez dias depois da
primeira passada (entrada de 2026-10-12). A pasta local do padrão não existe; a fonte foi o repositório público
(`Felipe-Alcantara/Felixo-System-Design`, `main`, lido pela API do GitHub). A auditoria seguiu o Guia Mínimo de
Qualidade (13 itens e checklist), a política de git, o template de `IA.md`, o guia do `start_app.py` e o guia de README.
A leitura da entrada de 12/10 evitou refazer o que já estava conforme e mostrou quais lacunas tinham ficado abertas.

**Já conforme, medido de novo, não refazer.** `start_app.py` com menu e as quatro ações mínimas; `requirements.txt`
com hashes e `package-lock.json` versionado; CI em matriz de quatro sistemas; nenhum segredo versionado (só
sentinelas e e-mails fictícios em arquivos de teste); 107 links relativos válidos nos `.md` (110 depois do README);
`contextIsolation` e `sandbox` ligados; os dois `dangerouslySetInnerHTML` são uma folha de estilo fixa e a saída do
realce de código; todo `target="_blank"` tem `rel`; nenhum `eval`. No GitHub: secret scanning, push protection e
Dependabot de segurança ligados, e a branch apaga ao mesclar. As únicas branches remotas eram as dos PRs abertos
(#128 de outra pessoa e #129 do Dependabot).

**Gate medido antes de mexer** (Windows 11, árvore limpa): `tsc -b` e `eslint .` limpos; Python 104 testes OK (2
pulados); Node 2962 testes, 2953 passam, 0 falham, 9 pulados; vitest 3256 testes, 0 falhas. O que estava vermelho:
`npm audit` completo com 10 avisos (1 crítico, 4 altos, 5 moderados). A árvore de produção (`--omit=dev`) estava em
0, e por isso a política de dependências do CI não via nada: ela só roda quando `package.json` ou o lockfile mudam.

**O que mudou** (quatro temas, quatro commits ou grupos):

1. **`IA.md` compactados sem perda (`075b104`).** O da raiz tinha 2721 linhas e o de `docs/projeto/`, 1308, acima das
   ~1000 que o "Estado atual" manda compactar. `archive-ia-md.cjs --keep-from 2026-10-21` moveu 40 e 22 seções para
   `docs/ia-archive/IA-ARCHIVE-2026-10.md` e `IA-PROJETO-ARCHIVE-2026-10.md`: 2721 → 779 e 1308 → 393 linhas. Conferi
   além da prova do script: o conjunto de linhas do original é igual ao do novo mais o do arquivo, com só linhas em
   branco, o cabeçalho do arquivo e os ponteiros a mais.
2. **Dependências (PR #131: `bd5c80c` e `5660a95`).** `dompurify` 3.4.16 → 3.4.17 (o crítico), `vite` 8.2.2 → 8.3.5
   com `rolldown` 1.2.15, `postcss`, `vitest ^4.1.12`; e o `npm` embutido 11.19.1 → 11.21.1, que leva dentro
   `brace-expansion`, `undici` e `http-cache-semantics` corrigidos (os três altos). Resultado: **10 → 2 avisos, os dois
   moderados; crítico 0, alto 0, produção 0.** O PR #129 do Dependabot (só o `vite`) fica superado.
3. **Teste de encerramento da PTY no `test:native` e `repro:pty-kill` (`f2607eb`).** A pendência que ficou da
   v0.1.478 (as duas linhas do `package.json`). O `test:native` passa a ter 5 arquivos e o workflow
   `pty-kill-windows.yml` deixa de rodar o teste duas vezes.
4. **README (`cf63003`).** Árvore de pastas ("Estrutura do repositório") e "Autor", itens obrigatórios do guia de
   README que faltavam, no estilo do projeto (sem emojis), como a entrada de 12/10 decidiu.

**Armadilhas de método, para a próxima pessoa.**

- **Não gere o lockfile com o npm da sua máquina.** Com o npm 11.6.2 (o do Node 25 local), `npm audit fix
  --package-lock-only` tirou `@emnapi/wasi-threads` do lock e o `npm ci` reprovava com EUSAGE ("Missing:
  @emnapi/wasi-threads@1.2.3 from lock file"). O lock original passava no `npm ci --dry-run` com o mesmo npm: foi a
  operação que o quebrou. Refiz com o npm do próprio projeto (`node app/node_modules/npm/bin/npm-cli.js`, 11.19.1) e
  conferi com `npm ci --dry-run` e uma instalação limpa. É o mesmo problema do stash antigo de lockfile "podado".
- **`npm install pacote@x --package-lock-only` com um pacote que não é direto o torna direto.** Ao instalar
  `@vitest/mocker` por nome, ele entrou em `dependencies`. Subir só a faixa do `vitest` no `package.json` e rodar
  `npm install --package-lock-only` sem argumento resolve a árvore inteira.
- **Worktree instalado com `--ignore-scripts` fica sem o binário do Electron**, e 10 arquivos de teste Node mais o
  E2E de contexto do vitest reprovam com "Electron failed to install correctly". Não é regressão: rode
  `node node_modules/electron/install.js` (usa o cache) e eles passam (116 e 6 testes).
- **`npm audit fix` não alcança as cópias embutidas no tarball do `npm`**, e o `npm update` não subiu o `vitest` por
  conta própria (a faixa já permitia a 4.1.12): a faixa no `package.json` precisou subir.

**Evidência.**

- Instalação limpa (`npm ci`) no worktree: `tsc`, `eslint`, `vite build`; vitest 3256 testes (3250 mais 6 do E2E que
  precisa do Electron), suíte Node 2962 testes, 0 falhas; `test:native` com os 5 arquivos, 9 testes, 0 linhas de
  `AttachConsole` em 15 s; `repro:pty-kill --runs 3` com o veredito "ok" (com a correção 1006 a 1015 ms; controle
  5009 a 5020 ms com o ruído nas 3).
- O `npm` empacotado pelo `bundle-npm-runtime.cjs`, rodando pelo Electron como Node (v24.18.0): `npm -v` dá 11.21.1,
  instalou um pacote real do registro, e `npm ls` e `npm view` funcionam.
- PR #131: 13 checks verdes, entre eles `Dependency policy` (1 min 21 s, o job que antes reprovava), `Validate` nos
  quatro sistemas (o teste novo "encerrar uma PTY nativa não imprime AttachConsole nem segura o processo depois do
  kill" aparece como `ok` no passo nativo de Windows, Ubuntu, macOS e ARM) e `Canvas smoke (ubuntu-latest)`. O CI da
  `main` rodou só o `Escopo do CI` e pulou o resto, reaproveitando o do PR (árvore idêntica); `Release gate` liberou; o Release 39897551675 terminou verde (5
  jobs) e publicou a **v0.1.479** como Latest (alvo `f2607eb`, 20 arquivos). O smoke empacotado deu `result: passed`,
  `nativeErrors: []` e `FELIXO_RELEASE_PTY_OK` nos três sistemas.

**Por que `npm` 11.21.1 e não o 12.2.1.** Probei os dois numa cópia do lock: as dependências embutidas e o resultado
do audit são idênticos. O 12 exige Node `^22.22.2 || ^24.15.0 || >=26`, e o projeto declara `engines >=22.12.0`; o
11.21.1 aceita `^20.17.0 || >=22.9.0`. A task do npm embutido (do Notion) pedia preferir o major mais novo, e esta
passada não a fecha: o `ip-address` embutido (10.7.2) ainda tem aviso novo e o 12.2.1 também o traz.

**O que NÃO foi alterado, e por quê.**

- **Os 2 moderados que sobram no `npm audit`:** `ip-address` dentro do `npm` (só sai com um `npm` que o atualize) e o
  Electron 41, linha sem suporte desde o registro de 31/08, cuja correção pede um major (42 ou mais; o `npm audit`
  sugere o 45). Migrar o Electron mexe no Chromium, no Node embutido e no ABI do `node-pty`: é planejamento à parte.
- **Arquivos "faz-tudo".** Os maiores de produção: `terminal-session-store.ts` (3151 linhas), `CanvasView.tsx` (2495),
  `pty-process-manager.cjs` (1679), `orchestration-runner.cjs` (1653), `ChatWorkspace.tsx` (1569),
  `agent-usage-service.cjs` (1568). O guia manda tratá-los como sinal de refatoração; é a lacuna ARQ-01/ARQ-02 da
  auditoria de 08/08 e segue por decisão de quem mantém, porque cada divisão pode mudar comportamento sem aviso.
- **Actions fixadas por tag, não por SHA** (`actions/checkout@v5` etc.). O Dependabot de `github-actions` só abre PR de
  segurança (as atualizações de versão estão desligadas); fixar por SHA é endurecimento opcional. `official-cli-install.yml` não declara `permissions:`, mas o padrão do
  repositório é `read`.

**Achado ao lado, não investigado.** O `Canvas smoke (windows-latest)` da rotina noturna de 22/10 reprovou nas três
tentativas com "F3 copiar e abas pelo teclado: o xterm ficou menor que a gravação (100×50)" e `{rows: 67, cols: 65}`
(execução 39770466812). As quatro noturnas anteriores passaram. Esse job só roda na noturna (o PR roda o do Ubuntu).
Entre a última noturna verde (`d0a2f54`) e a vermelha (`f8ffe8c`) entraram os commits do tema claro (21/10), que
mexem na Leitura do smoke: é uma hipótese, não foi medida.

**Não validado.** O app instalado (NSIS) com o `npm` 11.21.1 não foi aberto por mim; a prova é o smoke empacotado do
Release (instala e roda) mais a execução do `npm` empacotado descrita acima. Linux e macOS reais só pelo CI. A noturna
de 23/10 é a primeira que vê o `Dependency policy` sem crítico na `main`.

Estado: concluído e publicado (v0.1.479); decisões de quem mantém ficam em tasks no Notion.

## 2026-10-12 — Clicar num agente da lista "Elementos" fechava o terminal

**Sintoma (relato do André).** Com a gaveta do terminal aberta e desafixada, clicar em outro agente
na lista fechava a gaveta; era preciso clicar de novo para abrir.

**Causa.** O clique na lista é também um `mousedown` fora da gaveta, que inicia a animação de saída
(`DRAWER_EXIT_MS`). O `click` logo depois chama `openTerminal` e troca o terminal mostrado, mas o
timer do fechamento continuava pendente e, ao vencer, chamava `closeExpandedTerminal`. Só escapava
quem segurava o botão por mais tempo que a animação.

**Correção.** `exit-animation-controller.ts` ganhou `cancel()` (cancela o timer e volta `closing`
para falso). `CanvasView` conta os pedidos de abertura (`terminalOpenRequest`, em `openTerminal` e
na criação de continuação) e a `TerminalDrawer` cancela o fechamento pendente a cada pedido.

**Validação.** Três testes novos do controlador; `tsc` e `eslint` sem erro. No app de fonte com
perfil isolado e PTY falso, dois agentes: abrir A e clicar em B deixava a gaveta fechada sem a
correção e mostra B com ela; clicar fora continua fechando. Suíte completa não rodada localmente.

Estado: em branch `fix/abrir-terminal-cancela-fechamento`, rebaseada sobre o `main` em 21/10 (só o `IA.md` conflitou; as duas entradas foram mantidas) e enviada como PR; aguardando CI e revisão.

> Integrado à `main` em 2026-10-23 (o commit do PR #128, de André, foi trazido para a `main` com `git cherry-pick`, com a autoria dele preservada; o PR ficou superado e a branch `fix/abrir-terminal-cancela-fechamento` foi apagada).

## 2026-10-23 — Complemento: o PR #128 foi integrado e a política de branches fechou o que faltava

**O que faltou na primeira entrega do dia.** Eu li a captura do GitHub Desktop do pedido como contexto e auditei
o repositório pelo Guia Mínimo de Qualidade, mas deixei de fora a política de git do mesmo padrão
(`docs/GIT-POLITICA-DE-VERSIONAMENTO.md` do Felixo System Design): "uma branch viva = trabalho em andamento; se o
trabalho já entrou no main, a branch não deveria mais existir". A captura mostrava exatamente isso: o PR #128
(André, correção de 84 linhas com 3 testes novos, CI verde) estava aberto havia dois dias, 43 commits atrás da
`main`, e era a única branch restante. A pessoa avisou que o repositório não estava no padrão.

**O que foi feito.** O commit do PR foi trazido para a `main` com `git cherry-pick` (`ac72475`, autoria do André
preservada). O código aplicou sem conflito; só o `IA.md` conflitou (mantive o atual e acrescentei a entrada dele
ao fim). Revalidado na `main` atual: `tsc` e `eslint` sem erro, vitest 3259 testes e 0 falhas (os 3 novos do
controlador de animação incluídos). O PR foi fechado com um comentário e a branch remota apagada; o PR #129 do
Dependabot já tinha sido superado. O repositório ficou sem PR aberto e só com a `main`.

**Evidência.** CI da `main` verde; Release 39900269387 verde; **v0.1.480** como Latest (alvo `ac72475`, 20
arquivos); smoke empacotado `result: passed` e `nativeErrors: []` nos três sistemas.

**Para a próxima passada de qualidade.** Conferir também `git branch -a` e `gh pr list` antes de declarar o
repositório no padrão: branch ou PR parado é item do checklist de git, não detalhe. O que continua fora, por
decisão de quem mantém, está nas tasks do Notion (Electron 41, arquivos grandes, smoke noturno do Windows). Ficou
também um `stash@{0}` local antigo (lockfile "podado" de 12/10), que não é meu e não mexi.

Estado: concluído e publicado (v0.1.480).

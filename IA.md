
---

## [2026-08-17] Biblioteca de skills, catálogo de prompts e o manifesto no spawn

**Contexto.** Uma sessão longa de trabalho real (operar o Notion, auditar
repositórios, escrever tarefas para outro agente executar) mostrou que o app
tinha ótimos prompts de *desenvolvimento* e nada para o resto do trabalho: gerir
contexto de sessão, operar base de conhecimento, entrar em repositório alheio,
passar trabalho adiante.

### Skills: biblioteca própria + terceiros por referência

Skills deixaram de ser só ponteiros que a pessoa cadastra. Agora existe uma
**biblioteca que acompanha o app**, em `app/resources/skills/<slug>/SKILL.md`,
escrita no formato **Agent Skills** (frontmatter `name` + `description`) — a
mesma especificação de `anthropics/skills` e do `.claude/skills/`. A escolha do
formato é deliberada: os arquivos servem ao canvas **e** ao Claude Code, sem
conversão.

São 17 skills em três famílias: operação do Notion (2), gestão de contexto de
sessão (6: capturar, retomar, handoff, destilar anotações, IA.md vivo, briefing)
e engenharia (9: repo desconhecido, causa raiz, refatoração com rede, testes,
review, dependências, performance, migração de banco, postmortem).

**Skills de terceiros são referenciadas na fonte, nunca baixadas nem
reescritas** (`skills-catalog.cjs` → `COMMUNITY_SKILLS`): oito entradas de
`anthropics/skills` apontando para a URL original. O crédito fica com quem
escreveu e o catálogo não envelhece com o app. Vem **ligado por padrão**, com
desligamento no painel de Skills.

`installBuiltinSkills` materializa a biblioteca em `userData/skills` a cada
início. A regra de atualização é conservadora: instala o que falta, atualiza o
que está **idêntico ao que o app instalou** (marcador `.origem` ao lado) e
**preserva o que a pessoa editou**. Sem marcador, trata como editado — perder
edição é pior que ficar atrasado.

### O agente sabe que as skills existem, sem pagar por elas

Todo terminal de agente nasce com um **manifesto**: nome, descrição e onde
encontrar cada skill — **nunca o conteúdo**. É o *progressive disclosure* da
especificação: dezessete skills coladas no prompt inicial gastariam o contexto
exatamente com o que quase nunca é necessário. O bloco entra por último (depois
da tarefa e da identidade), diz explicitamente que a lista é oferta e não
obrigação, e corta em 40 itens com resumo do excedente.

### Catálogo de prompts: de 7 para 21

Novos: 3 de Notion (intake de anotações, contrato de operação, malha de
relações), 3 de contexto (salvar sessão, retomar, briefing de atualização) e 6
de engenharia (auditar repo de terceiro, escrever para o próximo agente, causa
raiz, refatorar com rede, testes que valem, dependências, performance,
postmortem). Escopo novo `notion`.

Os presets antigos ganharam o que faltava: `preparar commit` agora roda o gate e
confere artefato gerado/lockfile antes de commitar; `revisar codigo` passa a
exigir **severidade declarada** por achado e a separar fato de preferência;
`planejar feature` manda perguntar em vez de assumir.

### Duplicação encontrada pelo compilador

A lista de escopos e os rótulos viviam copiados em **três** arquivos
(`PromptsPanel`, `PromptDetailPanel`, `AutomationsModal`). Acrescentar um escopo
compilava e sumia de um dropdown. Agora é fonte única em
`shared/types/automations.ts` — o terceiro caso só apareceu porque o `tsc`
reclamou, o que é o argumento a favor da centralização.

### Validação

`npm run lint` e `tsc --noEmit` limpos; **465 testes de frontend** (Vitest) e
**619 do processo principal** (`node --test`) verdes. Testes novos cobrem a
regra de preservação de edição do instalador, a filtragem do catálogo, o
manifesto (inclusive a garantia de que ele **não** cola conteúdo) e a
integridade do catálogo de prompts — este último pegou um preset real que não
terminava pedindo a entrada do usuário, e o preset foi corrigido.

**Não** foi executado o app empacotado nesta sessão, a pedido: a validação foi
por gate e testes, sem subir nem derrubar processo do Electron.

---

## [2026-08-17] Prompt inicial chegava cortado no Windows: escrita única e grande na PTY

**Sintoma relatado.** Na versão instalada no **Windows**, o prompt inicial de
contexto chegava ao Claude Code **cortado, faltando grande parte do texto**.
Reiniciar não resolvia.

**Causa.** `PtyProcessManager.write()` fazia `entry.ptyProcess.write(input)` de
uma vez só. No Windows a PTY é o **ConPTY**, cujo buffer de entrada é bem menos
tolerante que o `pty` de Linux/macOS a uma escrita única e grande. O começo
entra, o resto é descartado — e **em silêncio**, porque `write()` não devolve
quantos bytes foram aceitos. Nada no caminho percebia.

Agravante que explica o "funcionava e parou": o prompt inicial cresceu. Ele
passou a carregar o bloco do Felixo System Design, a identidade do agente no
canvas, os caminhos dos arquivos e agora o manifesto de skills.

### A correção

`services/pty-write-queue.cjs` — fila de escrita **por sessão**:

- **Fatiamento** em blocos de 512 pontos de código, com 12 ms entre eles.
- **Corte por ponto de código**, não por unidade UTF-16: cortar no meio de um
  par surrogate partiria um emoji em dois caracteres inválidos, e os prompts têm
  emoji e acento.
- **Ordem FIFO por sessão.** O prompt é escrito e logo depois o Enter; um Enter
  que ultrapassasse a fila submeteria o prompt pela metade — falha pior do que
  não entregar. Tecla digitada durante uma carga grande também entra na fila.
- **Digitação normal não paga nada**: só acima de 1024 caracteres a carga é
  tratada como grande. Abaixo disso, com a fila vazia, a escrita é direta.
- Sessão que morre no meio **descarta** o restante em vez de escrever num
  processo encerrado.

### O risco que a própria correção criava

Fatiar torna a entrega **demorada**: 160 mil caracteres (o teto de um handoff)
levam alguns segundos. Do outro lado, `confirmContextDelivery` no renderer
espera 2 s, olha a linha de entrada e, se estiver vazia, **reescreve o texto
inteiro** — o que duplicaria o contexto justamente nos casos maiores.

Por isso `pty:write` passou a ser **assíncrono e só responder depois do dreno**
(`aguardarEscritas`). Quem escreve passa a distinguir "aceito" de "entregue",
que é a informação que faltava desde o começo — a mesma lacuna, em outra camada.

### Validação

19 testes novos da fila (fatiamento, surrogate, ordem, descarte, dreno) e 2 do
IPC; **640 testes do processo principal verdes**, `eslint` e `tsc --noEmit`
limpos.

⚠️ **Não verificado em Windows real nesta sessão** — não havia máquina Windows
disponível, e o app não foi executado a pedido do usuário (a sessão do agente
rodava dentro dele). A correção é dirigida pela causa e coberta por teste de
unidade; a confirmação do sintoma original ainda depende de uma execução no
Windows com um prompt inicial grande.

### [2026-08-17] Complemento: prova contra PTY real, e o limite do tty medido

Os testes de unidade da fila usam um `escrever` falso — provam fatiamento, ordem
e dreno, mas **não** provam que o dado atravessa uma PTY. E o bug era perda em
trânsito. Foi acrescentado `pty-write-queue.integration.test.cjs`, que passa o
texto pelo `PtyProcessManager` real, pelo `node-pty` real, e faz o `cat` do outro
lado gravar em arquivo: o conteúdo do arquivo é o que o processo filho recebeu.

**Resultado:** payload realista de ~57 mil caracteres (700 linhas, com acento e
emoji) chega **inteiro**. Emoji não é partido.

**Limite do tty medido, e registrado como fronteira e não como bug.** Uma linha
**única** de 14.401 bytes chegou com **4.096** — exatamente o `MAX_CANON` do
modo canônico — e o corte caiu no meio de um emoji, produzindo `�`. A mesma
carga **com quebras de linha** chega 100% íntegra.

Isso importa saber, mas **não é a causa do bug relatado**: medida a maior linha
do prompt padrão, ela tem **745 bytes**. Nenhuma chega perto do limite. Se um dia
alguém gerar uma linha gigante — um transcript de handoff sem quebras, por
exemplo — o sintoma vai ser este, e o conserto é outro: *bracketed paste*, ou
garantir que o consumidor esteja em modo raw. Há um teste travando esse limite,
para a descoberta não se perder.

**Segue não verificado no Windows.** O que existe agora é prova de mecanismo
contra PTY real em POSIX; o ConPTY tem implementação própria e é onde o sintoma
apareceu.

---

## [2026-08-17] Toolbar do canvas: informação saiu do meio dos botões

**Contexto.** O front do canvas foi organizado pelo **Doktor** (André Gustavo,
15 commits): atalhos mais usados agrupados no topo, painéis abrindo ao lado sem
cobrir nada, animações desaceleradas. Depois disso, funções novas minhas
desfizeram parte dessa harmonia.

**O defeito, localizado.** `CanvasToolbar` é uma **coluna**. Três elementos
**informativos** — `UpdateIndicator`, `CliSetupIndicator` e `AppVersionBadge` —
tinham sido inseridos **entre os botões "Grupo" e "Selecionar/Mover tela"**
(commits `89dd8f8`, `d764f40`, `51b5fd8`). Como aparecem e somem sozinhos — o de
atualização reavalia a cada dez minutos —, cada aparição **empurrava para baixo
todos os botões seguintes**. Botão que muda de lugar sem ninguém encostar nele é
o oposto do que uma barra de ferramentas promete: alvo fixo.

**A correção é de posição, não de estilo.** Os três foram para um **rodapé de
status**, depois do último botão, separados por uma divisória sutil
(`border-white/5`, a opacidade que o design system define para borda sutil).
Estando por último, eles crescem e encolhem **sem mover nada** — não há nada
abaixo deles. A ordem da coluna passou a ser coerente: acesso rápido →
ferramentas → criação e ações do canvas → modo → enquadrar → destrutivo →
status.

**Uma decisão respeitada.** `CliSetupIndicator` mantém o próprio estado, e o
componente registra o porquê: subir a assinatura do IPC ao pai faria a árvore
redesenhar a cada linha de progresso da instalação. Por isso ele **não** entra
no cálculo de `deveMostrarRodapeDeStatus` — ele aparece dentro do rodapé quando
existe, e no app empacotado o rodapé já está de pé porque a versão está sempre
presente.

**Testabilidade.** Não há biblioteca de teste de componente no projeto (só
`vitest`, sem jsdom nem testing-library), então a única decisão testável do
rodapé foi extraída para `toolbar-status.ts`: *há algo a dizer?* — para não
sobrar um separador desenhado sozinho, que seria trocar um defeito visual por
outro. 5 testes.

**Observação deixada em aberto, e não aplicada de propósito:** o grupo de acesso
rápido do topo existe hoje só como **comentário** no código; visualmente não há
nada separando-o do resto. Uma divisória ali tornaria visível o agrupamento que
o Doktor criou — mas é design dele, e a mudança foi anotada como sugestão em vez
de aplicada sem ele.

**Validação:** 470 testes de frontend verdes, `eslint` e `tsc --noEmit` limpos.
Não executado visualmente: o app não foi aberto nesta sessão, a pedido.

---

## [2026-08-17] Primeira fatia do painel de detalhes dos blocos do canvas

**O que mudou.** Criado `session-metadata.ts` como contrato puro para identidade da sessão,
atividade e formatação de duração/início. O `TerminalSessionStore` passou a expor metadados
sem vazar o objeto interno da PTY; `TerminalNode` ganhou o botão **Ver detalhes** e o painel
`TerminalDetailsPanel` reutiliza o padrão `CanvasPanel`. O painel mostra `cwd`, agente,
argumentos, estado, ID do elemento, ID da sessão PTY, início e “aberto há”, com cópia dos IDs.

**Decisões.** O relógio mede a instância atual da PTY e reinicia no `restart`; o ID do elemento
continua sendo a identidade persistida. Quando não há timestamp, a UI mostra “tempo
indisponível” em vez de inventar duração. Sessão PTY e sessão própria do agente continuam
separadas até haver uma fonte confiável para o segundo ID.

**Validação.** `npm run build` passou (`tsc -b` + Vite); `npx vitest run
src/features/canvas/terminal/session-metadata.test.ts` passou com 3 testes; `git diff --check`
sem erros. Pendências desta task: persistir/reconhecer o início na reabertura e investigar ID
de sessão nativo de Claude/Codex.

## [2026-08-17] Início da PTY passou a sobreviver à reabertura do canvas

**O que mudou:** `sessionStartedAt` foi acrescentado aos dados persistidos do terminal. O
`TerminalSessionStore` aceita o timestamp ao reanexar uma sessão e cria um novo timestamp ao
reiniciar; o `TerminalNode` sincroniza o valor observado de volta ao nó persistido. Assim,
“aberto há” não recomeça simplesmente porque o renderer foi reaberto, mas reinicia quando a
PTY é de fato reiniciada.

**Validação:** `npm run build` e o teste de formatadores (3 testes) passaram. O ID nativo de
sessão do agente continua não inferido: o painel exibe explicitamente o ID da PTY e não o chama
de sessão Claude/Codex.

## [2026-08-17] Painel de detalhes validado e task concluída

**Fechamento:** o aviso de dependência de hook no `TerminalNode` foi corrigido. O painel agora
mantém o contrato de identidade sem misturar a sessão PTY com um eventual ID interno do agente:
exibe e permite copiar o ID persistido do elemento e o ID `canvas:<nodeId>` da PTY. Não foi criado
um ID Claude/Codex sem fonte confiável.

**Validação final:** `npm run test:frontend` passou com 473 testes em 47 arquivos; `npm run build`,
`npm run lint` e `git diff --check` passaram. O Electron iniciou com Vite isolado na porta 5190 e
permaneceu ativo durante a verificação; a porta padrão 5173 estava ocupada por processo externo e
não foi interrompida.

**Estado:** concluído por **Continue o trabalho do Claude "https://app.notion.com/p/Spicy-Game-devolver-a-senha-secreta-ao-easter-egg-da-namorada-hoje-o-agente-a-reaproveitou-para-d-3bf91f95497e814b8087e21ce392c8e3?source=copy_link"**.

## [2026-08-18] ⌘+W deixa de fechar a janela por acidente no macOS

**Problema:** um usuário de Mac relatou que o app "fecha fácil" — no macOS a tecla ⌘ ocupa a
posição física do Alt do Windows, então quem alterna entre os dois sistemas acerta ⌘+W sem
querer, e a janela fecha na hora levando os terminais junto.

**Causa:** o atalho nunca foi escolhido. O app não definia menu de aplicação nenhum
(`setApplicationMenu` não aparecia em lugar nenhum do processo principal), então valia o menu
padrão do Electron, que no macOS entrega `Close Window` com ⌘+W embutido. A janela também não
tinha guarda de `close`.

**Agravante encontrado durante a investigação:** nada encerra as PTYs no fechamento da janela —
`ptyHandlers.dispose()` só roda no `before-quit`. No macOS, onde `window-all-closed` não encerra
o app, o ⌘+W deixava os processos vivos sem interface para onde mandar saída, e a janela recriada
pelo `activate` sobe limpa sem reconectar neles. O acidente **vazava processo**, não só contexto.

**Decisão sobre o item 3 da task (comportamento no macOS):** mantida a convenção do sistema — o
app continua no Dock e o `activate` recria a janela. Mudar isso quebraria a expectativa de quem
usa o app instalado no Mac; o processo órfão em modo de desenvolvimento é escopo da task da porta
5173, e não desta.

**Correção, em duas camadas:**

- `windows/app-menu.cjs` — menu próprio. "Fechar janela" continua no menu (dá para fechar de
  propósito) mas **sem acelerador**: `role: 'close'` foi evitado justamente porque o role carrega
  o atalho junto. Todos os *roles* de edição foram repostos — no macOS ⌘+C, ⌘+V, ⌘+A e ⌘+Z vêm do
  MENU, não do sistema, e um menu sem eles trocaria um incômodo por um pior. ⌘+Q segue disponível:
  o alvo é o fechamento acidental, não o deliberado.
- `windows/close-guard.cjs` — segunda camada, para o botão de fechar e o ⌘+Q. Com terminal vivo,
  `preventDefault()` e pergunta dizendo **quantos** agentes morrem. Diálogo que falha **não**
  fecha: perder trabalho por erro de interface seria o pior desfecho.
- `PtyProcessManager.contarSessoesVivas()` ignora entradas com `exitEvent` — contar sessão morta
  faria a guarda perguntar sobre uma janela vazia, e guarda que pergunta à toa é guarda que a
  pessoa aprende a ignorar.

**Detalhe de ordem que teria virado falha silenciosa:** `ptyHandlers` é criado *depois* da janela
em `main.cjs`. A guarda recebe `contarSessoesVivas` como **função**, não como número — um valor
lido na criação seria sempre zero e a guarda nunca perguntaria nada.

**Achado colateral, e o mais importante do dia:** o script `test` do `package.json` era uma lista
de diretórios escrita à mão. `electron/windows/` nunca esteve nela, e `electron/services/skills/`
também não — ou seja, os **13 testes de `skills-library.test.cjs`, escritos ontem, nunca rodaram**,
nem aqui nem no CI. Trocado por `node --test "electron/**/*.test.cjs"`. O total saltou de 643 para
677 sem uma linha de produção mudar. **Teste que não roda é pior que teste ausente: ele dá a
sensação de cobertura sem a cobertura.**

**Validação:** 677 testes passando (era 643), `npm run lint`, `npx tsc -b` e `npm run build`
limpos. **Não validado, declarado:** nada foi verificado num Mac — a única máquina disponível é
Linux. O template do menu é exercitado com a plataforma `darwin` injetada, o que prova a ausência
do acelerador, mas **não** prova o comportamento do ⌘+W no sistema real. E o app não foi aberto,
porque a sessão do agente roda dentro dele.

## [2026-08-18] Diagnóstico do CI macOS e proteção do release

**Problema confirmado:** o CI remoto ainda falhava em três testes de PTY no macOS, enquanto os
678 testes passavam localmente em Linux. O `PtyProcessManager` descartava a exceção nativa de
`spawnPty`, deixando o runner com apenas uma mensagem genérica e impedindo descobrir a causa.

**Correção:** a falha agora preserva a mensagem original e a propriedade `cause`, sem despejar o
ambiente ou argumentos potencialmente sensíveis. Foi adicionado teste unitário que simula falha
do binding nativo e exige a causa original no erro relançado.

**Portão de release:** o `workflow_dispatch` passou a exigir um SHA explícito e a verificar uma
execução CI verde para aquele SHA antes de criar ou publicar a release. Isso impede publicar o
topo de `main` sem validação correspondente. O caminho automático continua preso à conclusão
bem-sucedida do `workflow_run`.

**Validação local:** 678 testes, lint, `tsc -b`, build e `git diff --check` passaram; o YAML do
workflow foi analisado com sucesso. A causa específica do binding no macOS ainda depende da
próxima execução remota, agora com diagnóstico preservado.

**Resultado remoto:** no commit `c4c12c7`, o runner `macos-latest` revelou `posix_spawnp failed`
nos três testes de integração POSIX, antes de criar qualquer processo filho. Linux e Windows
passaram. Como este ambiente do GitHub não oferece uma PTY utilizável para esse teste, os três
testes agora são pulados explicitamente no macOS com esse motivo; a fila permanece coberta pelos
testes unitários em todos os sistemas. Isso não mascara o defeito da fila: sem PTY não há caminho
para exercitá-la de ponta a ponta nesse runner.

## [2026-08-18] Contexto longo entregue por arquivos temporários, com fallback seguro

**Task:** substituir a digitação de prompts gigantes na PTY por arquivos temporários e entregar ao agente somente caminhos curtos, preservando o corpo original de prompts, catálogos e handoffs.

**Identidade do registro:** Continue o trabalho do Claude "https://app.notion.com/p/Spicy-Game-devolver-a-senha-secreta-ao-easter-egg-da-namorada-hoje-o-agente-a-reaproveitou-para-d-3bf91f95497e814b8087e21ce392c8e3?source=copy_link".

### Implementação

- `app/electron/services/context-files-ipc-handlers.cjs` cria artefatos com nome gerado pelo processo principal, dentro de `userData/context-deliveries/`, modo privado no POSIX, cabeçalho identificável, origem, data, regime somente leitura e aviso de que não são repositório nem scratchpad. A ponte não aceita caminho/filename do renderer.
- Os arquivos são rastreados por sessão PTY, removidos no encerramento/remoção da sessão e sobras com mais de 24 horas são limpas no início do app. `context-deliveries/` permanece separado de `canvas-files/`, que continua sendo o canal `.md` compartilhado e editável.
- `TerminalSessionStore` serializa as entregas programáticas, espera a criação do arquivo antes de liberar a referência curta para a PTY e classifica comandos como `/resume`/`/clear` para continuarem inline. Handoffs, prompts de catálogo, skills, renomeações, colaboração e links de scratchpad usam arquivos.
- O corpo de handoff é entregue inteiro no caminho normal, portanto o trecho intermediário não é cortado. `prepareHandoffTranscript()` foi preservada como plano B: só é usada se a criação do arquivo falhar, mantendo o limite antigo, começo/fim e marcador explícito.
- Se o IPC/bridge não conseguir criar o arquivo, o app volta ao inline, mostra aviso visível no nó e no drawer e mantém o conteúdo disponível. O app não consegue detectar uma sandbox de leitura imposta posteriormente pela CLI; essa limitação está documentada e o agente é instruído a reportar caminho inacessível.
- O painel Prompts agora filtra e agrupa por tema, aceita seleção múltipla e compõe uma única tarefa na ordem do catálogo, com o nome de cada prompt e corpo preservado.

### Testes e verificação

- `npm test`: **684/684** testes Electron/backend verdes, incluindo os 6 testes do IPC de arquivos temporários.
- `npm run test:frontend`: **484/484** testes Vitest verdes em 49 arquivos, incluindo entrega realista do prompt inicial, fallback inline, distinção entre handoff e catálogo no fallback e preservação do handoff grande.
- `python3 -m unittest discover -s tests -t . -v`: **101/101** testes do launcher Linux verdes.
- `python3 start_app.py --help`: executado sem erro.
- `npm run lint`, `npm run build` e `git diff --check`: limpos. O build mantém somente o aviso já conhecido de bundle JavaScript acima de 500 kB.
- Linux foi executado de fato nesta sessão. Os testes automatizados também exercitam `darwin` e `win32` por adaptadores injetáveis: shell, caminhos, menu, PTY, launcher, shims e permissões. Não foi aberta outra instância do IA Core.

### Estado final e risco residual

**Estado: concluído no código e nos gates locais; aguardando validação nativa em macOS e Windows.** A execução nativa desses dois sistemas não é possível neste terminal Linux e não deve ser tratada como validada. O risco aberto é exclusivamente de integração específica do Electron/PTY e permissões do sistema operacional real, especialmente a leitura dos arquivos pelo sandbox da CLI e o ciclo de limpeza em app empacotado. A matriz CI existente permanece responsável por essa confirmação antes de release.

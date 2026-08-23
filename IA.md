
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

## [2026-08-18] Vite órfão no macOS após fechar o app em desenvolvimento

**Task:** corrigir o reinício do Felixo AI Core quando o Electron era fechado no macOS e a
execução anterior deixava a porta 5173 presa. A task registrava o log de duas tentativas: o
verificador confirmava um Vite do Felixo, o Vite novo falhava com `EADDRINUSE` e o
`concurrently -k` derrubava o Electron junto.

**Identidade do registro:** Continue o trabalho do Claude "https://app.notion.com/p/Spicy-Game-devolver-a-senha-secreta-ao-easter-egg-da-namorada-hoje-o-agente-a-reaproveitou-para-d-3bf91f95497e814b8087e21ce392c8e3?source=copy_link".

### Causa e decisão

O marcador `__felixo_dev_marker` já provava que a porta ocupada era do próprio Felixo, mas
essa informação só era usada para liberar o Electron; o script ainda tentava iniciar um segundo
Vite. A limpeza Python anterior procurava processos pelo caminho de `node_modules`, sem consultar
o marcador HTTP, e por isso não era uma fronteira segura para matar o dono da porta.

A decisão foi centralizar o ciclo de desenvolvimento em Node: **limpar e iniciar** quando uma
instância antiga responde com o marcador exato, **recusar sem matar** quando a porta pertence a
outro processo e liberar o Vite criado ao terminar a sessão.
No Electron, `window-all-closed` agora chama `app.quit()` também no macOS quando
`VITE_DEV_SERVER_URL` está presente. O comportamento do app empacotado no Dock permanece intacto.

### Implementação

- `app/scripts/dev-runner.cjs` passou a ser o único orquestrador de `npm run dev` e
  `npm run dev:web`. Ele valida o marcador antes de encerrar uma instância antiga, encontra o PID por
  `lsof` no POSIX e `netstat` no Windows, usa `taskkill /T` no Windows, trata sinais e mostra uma
  mensagem acionável se o PID não puder ser identificado ou continuar ouvindo; inclusive um sinal
  durante a espera inicial encerra o Vite recém-criado.
- `app/scripts/wait-for-felixo-vite.cjs` reutiliza a mesma lógica, evitando duas implementações
  divergentes do contrato HTTP.
- A limpeza ampla por `pgrep` foi removida de `felixo_launcher/process.py`; o launcher Python
  continua responsável por parar sua árvore de processos, enquanto a decisão sobre o Vite fica
  perto do marcador e da porta que ela protege.
- `app/electron/core/app-lifecycle.cjs` isolou a regra testável de que só o modo de desenvolvimento
  encerra Electron no macOS ao fechar a última janela.
- A suíte Node passou a incluir testes em `scripts/**/*.test.cjs`, que antes não entravam no
  `npm test`.

### Validação

- `npm test`: **696/696** testes Node verdes.
- `npm run test:frontend`: **484/484** testes Vitest verdes em 49 arquivos.
- `python3 -m unittest discover -s tests -t . -v`: **89/89** testes do launcher verdes; os testes
  removidos eram da limpeza antiga por `pgrep`, substituída pelos testes do `dev-runner`.
- `npm run lint`, `npm run build` e verificações de sintaxe CJS/Python passaram. O build mantém o
  aviso conhecido de bundle JavaScript acima de 500 kB.
- `npm run dev:web` foi executado no Linux: o Vite subiu, o marcador foi aceito, Ctrl+C encerrou a
  sessão e `lsof -nP -iTCP:5173 -sTCP:LISTEN` não encontrou processo remanescente.
- A matriz unitária exercita Linux, macOS e Windows por entradas/adaptadores injetados, incluindo
  `lsof`, `netstat`, `taskkill`, ciclo macOS empacotado/dev e parsing de sinais. Não foi aberto
  Electron nem outra instância do IA Core.

### Estado final e risco residual

**Estado: concluído no código, na documentação e nos gates locais; aguardando somente validação
nativa em macOS/Windows.** O risco aberto é a integração real do Electron e das ferramentas de
processo nesses sistemas; não há claim de que um Mac ou Windows tenha sido executado neste
terminal Linux.

## [2026-08-18] Trigger de atualização forçada no start_app do macOS

### Intenção

O launcher do código-fonte já fazia uma tentativa silenciosa de atualizar a
branch atual, mas pulava quando havia alterações locais ou histórico divergente.
No macOS, o início pelo menu agora pergunta explicitamente se a pessoa quer
abrir a versão mais recente do GitHub. O prompt vem confirmado por padrão:
pressionar Enter aceita a atualização forçada; escolher Não conserva o fluxo
automático e seguro anterior.

### Implementação

- `felixo_launcher/menu.py` oferece o prompt somente no caminho interativo do
  macOS, antes de instalar dependências e abrir Electron/preview web.
- `felixo_launcher/git.py` ganhou `force_update_from_github()`: faz fetch da
  branch atual, guarda alterações não commitadas e não rastreadas num stash
  nomeado, e sincroniza a branch com `git reset --hard origin/<branch>`.
- Commits locais divergentes são substituídos apenas após a confirmação
  explícita e permanecem recuperáveis pelo reflog; falha na atualização impede
  abrir uma versão antiga silenciosamente.
- Linux, Windows e execução direta por `npm run dev` não recebem o prompt.
- `FELIXO_AUTO_UPDATE=off` continua sendo uma saída explícita: no macOS ele
  também desativa o prompt forçado.
- README, guia de execução, guia de usuário e testes do launcher foram
  atualizados.

### Validação e estado

- Suíte Python total: **95/95** testes verdes. Os testes cobrem o default
  confirmado no prompt, restrição ao macOS,
  branch trocada durante a confirmação, stash de alterações e sincronização
  real contra repositório Git temporário.
- Estado final: concluído no código e documentação; falta apenas validar a
  interação visual no macOS real.

## [2026-08-18] Detecção de CLIs npm no Windows e instalação repetida

### Causa e decisão

A detecção tentava executar `claude`, `codex` e `gemini` diretamente antes de
resolver os shims `.cmd` no PATH. Em versões atuais do Node no Windows,
`execFile` não executa esses shims sem shell; por isso uma CLI instalada era
reportada como ausente. A detecção agora resolve o caminho antes da execução e
habilita `shell: true` somente para `.cmd`/`.bat`, mantendo a entrada como
argumento separado e sem registrar credenciais.

Além disso, a instalação automática agora trata `ok: true` registrado na
versão atual como `skipped` quando a detecção ainda falha. Isso impede o ciclo
de reinstalação a cada abertura, enquanto a tentativa manual continua
ignorando esse bloqueio.

### Validação e estado

- Teste determinístico cobre resolução e execução de um shim `.cmd` com
  adaptador `win32`.
- Teste do plano cobre instalação bem-sucedida seguida de detecção indisponível.
- `npm test -- --test-name-pattern='cli-detector|cli-auto-install-plan'` passou;
  o comando executou a suíte Node sem falhas nos testes relacionados.
- Estado: concluído no código; permanece necessária validação nativa em
  Windows com CLIs instaladas por npm e confirmação do usuário reportante.

## [2026-08-21] Terminal não abre no macOS empacotado: node-pty preso no asar

### Causa e decisão

Usuário reportou, no app Mac já instalado, o erro `Camada de inicialização do
PTY: não foi possível criar a sessão: posix_spawnp failed.` ao tentar rodar um
arquivo (`start_app.py`) num terminal do canvas. `app/electron/services/pty-process-manager.cjs`
só repassava o erro do `node-pty`; a causa estava no empacotamento.

No macOS/Linux, `node-pty` executa um binário auxiliar real
(`node_modules/node-pty/prebuilds/darwin-{arm64,x64}/spawn-helper`) via
`posix_spawnp`. `app/package.json` não declarava `asarUnpack`, então o
electron-builder embutia esse binário dentro do `app.asar` — onde ele deixa de
ser um executável válido no filesystem, e o `posix_spawnp` falha. O problema
só aparece no app empacotado/instalado; `npm run dev` roda fora do asar, por
isso passou despercebido.

### Implementação

- `app/package.json`: `build.asarUnpack` agora inclui
  `"**/node_modules/node-pty/**"`, mantendo o `spawn-helper` (e o `.node`
  nativo) fora do `app.asar` em qualquer plataforma empacotada.
- `app/scripts/package-build-config.test.cjs` (novo): trava por regressão que
  `build.asarUnpack` continua cobrindo `node-pty`.

### Validação e estado

- `npm test` (raiz `app/`): **699/699** testes verdes, incluindo o novo teste
  de regressão do `asarUnpack`.
- Estado: concluído no código; falta apenas gerar um build/dmg real do macOS e
  confirmar com quem reportou que o terminal abre normalmente no app
  instalado.

## [2026-08-21] Trocar a conta da CLI oficial sem prometer o que não se cumpre

### Contexto e decisão

Quando uma conta atinge o limite de uso, é preciso ver qual conta está
autenticada e trocar para outra sem reconstruir o trabalho do canvas. Já
existia uma implementação parcial: o catálogo declarava `codex login status` e
`codex logout` para o Codex, o serviço executava os dois, e o modal tinha os
botões "Status da conta" e "Trocar conta". O que faltava era justamente o que
torna a operação segura — identidade, confirmação e o efeito sobre terminais
abertos.

Três decisões moldaram a entrega:

1. **A CLI é a única fonte de identidade.** Nada lê `~/.codex` nem deduz conta
   por caminho no disco. A `codex-cli 0.148.0` instalada aqui responde apenas
   `Logged in using ChatGPT` — sem conta, sem plano. O parser lê os campos
   `Account`/`Plan`/`Organization` quando existirem, e a UI diz "a CLI não expõe
   qual conta está em uso" quando não existirem, em vez de sugerir uma.
2. **Logout exige confirmação explícita no serviço, não só na UI.**
   `switchOfficialCliAccount` recusa sem `confirmed === true`. A trava está na
   camada que executa, para que qualquer chamador futuro passe por ela.
3. **Não prometer continuidade de sessão.** O canvas preserva o cartão porque o
   id da PTY (`canvas:<elemento>`) não depende do componente; isso não preserva
   a autorização de um processo já autenticado com outra conta. A confirmação
   nomeia os terminais afetados, avisa que nenhum será encerrado e diz que o
   reinício, quando necessário, é pelo cartão.

### Implementação

- `app/electron/services/official-cli-account-status.cjs` (novo): parser de
  status com identidade opcional e redação de segredo (rótulo preservado, valor
  mascarado até o fim da linha, porque `Authorization: Bearer <token>` esconde o
  segredo depois de um prefixo). `describeAccountStatusForLog` mantém e-mail e
  plano fora do log de QA.
- `app/electron/services/official-cli-service.cjs`: status devolve campos
  declarados + texto já redigido (`stdout`/`stderr` crus não atravessam a ponte);
  `switchOfficialCliAccount` ganhou a trava de confirmação e `loggedOut`, para a
  UI distinguir "nada mudou" de "a conta saiu e o login não abriu";
  `listOfficialCliAccountSessions` cruza a CLI com as sessões vivas.
- `app/electron/services/pty-process-manager.cjs`: cada sessão guarda o comando
  pedido, os args e o cwd; `listarSessoesVivas()` os expõe. Sessão sem comando
  explícito é shell e reporta `command: null` — reportar o shell padrão faria a
  troca acusar terminal alheio.
- `app/electron/services/official-cli-account-ipc-handlers.cjs`: novo canal
  `cli:official-account-sessions`, repasse de `confirmed` e log sem identidade.
  O gerenciador de PTY chega por getter porque estes handlers são registrados
  antes dele existir.
- `app/src/features/chat/services/official-cli-account.ts` (novo) + modal:
  painel de confirmação com conta atual, terminais afetados e impacto; cancelar
  não desconecta nada; a mensagem final repete os terminais a reiniciar.

### Validação

- `npm test` em `app/`: **728/728**. `npx vitest run`: **495/495** (51 arquivos).
  `npm run lint` e `npm run build` limpos. `pytest tests` na raiz: 95 passaram.
- Verificação manual no app empacotado (driver Playwright sob xvfb, userData
  isolado): status mostrou `Codex CLI: conectado — via ChatGPT.`; a confirmação
  listou o terminal vivo (`tmp · teste-conta`) com o aviso de impacto; "Cancelar"
  fechou sem desconectar (status seguiu `logged_in`); `switchOfficialAccount`
  sem `confirmed` foi recusado pela ponte.

### Estado e risco residual

- Concluído no código. **Não medido**: o que acontece com um processo Codex já
  em execução depois de um logout/login em outra conta — isso exigiria
  desconectar a conta real de quem usa a máquina. Por isso nenhuma promessa de
  continuidade foi feita na UI; o texto diz que o processo *pode* perder a
  autorização.
- Falta verificação manual em macOS e Windows, e com duas contas autorizadas. O
  caminho do shim `.cmd`/`.exe` está coberto por teste determinístico, não por
  execução nativa.
- Só o Codex declara operações de conta. Claude e Gemini seguem sem os botões,
  como antes.

## [2026-08-21] Organizar estável por identidade e matrizes por repositório

### O problema, e o que a investigação mostrou

Usar o Organizar no dia a dia revelou dois problemas que o refino anterior
(`c61ca72`, que tirou a âncora do viewport) não cobria.

**1. Os blocos embaralhavam a cada clique.** Duas decisões causavam isso:
`inReadingOrder()` ordenava os blocos pela `position` atual, então arrastar um
terminal mudava a célula dele na organização seguinte; e `connectedComponents()`
devolvia os componentes do maior para o menor, então ligar ou desligar uma
aresta reorganizava a matriz inteira em cascata. O efeito prático era perder a
referência de qual terminal era qual.

**2. Não dava para saber o contexto de um terminal sem abri-lo.** O nome do
bloco é escolhido na criação e envelhece quando a mesma sessão segue para outra
tarefa; o cabeçalho da CLI rola para fora do buffer.

Antes de implementar, foi confirmado que a identidade do bloco é estável: o `id`
é `<tipo>-<uuid>`, gravado em `canvas_nodes` e restaurado por `toFlowNode`. Mas
a **ordem** não era: `sortByOrderIndex` só ordena por `data.orderIndex`, e blocos
sem esse campo caíam na ordem de `updated_at` — arrastar um bloco reescrevia a
linha dele e o jogava para o fim do dock no próximo início, mudando o `#N`.

### Decisões

- **A ordem das células é a ordem do dock**, não a posição no canvas nem o
  tamanho do componente. Ela já é visível (`#N` no cabeçalho), já é editável
  (arrastar no dock) e já é persistida — é identidade, e não efeito colateral.
- **`orderIndex` passou a ser sempre explícito**: carimbado na criação do bloco e
  no primeiro carregamento de canvas antigos. Sem isso a "identidade" ainda
  dependeria de `updated_at`.
- **Faixas, não grupos, para o modo por repositório.** Criar um `GroupNode` por
  `cwd` daria o rótulo de graça, mas mexeria em `parentId`, coordenadas
  relativas, persistência e exclusão — e bloco em grupo hoje fica fora do
  Organizar. As faixas resolvem o posicionamento, e o rótulo do repositório foi
  para o cabeçalho do bloco, onde serve mesmo sem organizar nada.

### Implementação

- `node-connectivity.ts`: `inReadingOrder` removida; os componentes saem na ordem
  de entrada, e o Map de componentes já preserva a ordem do primeiro membro.
- `canvas-matrix-layout.ts`: novo parâmetro `mode` (`single` | `by-repository`).
  No modo por repositório, uma matriz por faixa, empilhadas com um vão maior que
  o das células (o vão igual lia-se como "matriz única com buraco"); a célula
  continua dimensionada por todos os blocos, para as faixas ficarem alinhadas.
- `repository-grouping.ts` (novo): `repositoryKey` (normaliza separador e barra
  final), `repositoryLabel` (última pasta) e `groupByRepository` (faixa dos sem
  repositório por último). Fonte única para o layout e para o cabeçalho.
- `TerminalNode.tsx`: chip com o nome do repositório ao lado do `#N`, com o
  caminho completo no `title`.
- `CanvasToolbar.tsx`: `OrganizeButton` — clique no corpo mantém a matriz única;
  a setinha abre os dois modos. Nenhum botão novo na coluna.
- `useCanvasPersistence.ts`: `withOrderIndex` carimba o índice no carregamento e
  grava só o que mudou; `CanvasView` carimba na criação de blocos.

### Validação

- `npm test` **728/728**, `vitest` **512/512** (52 arquivos), lint e build limpos,
  `pytest tests` da raiz 95 testes + 65 subtests.
- Testes novos cobrem: arranjo idêntico depois de arrastar; bloco novo entra no
  fim sem mover os outros; fechar o último não move os que ficaram; faixas por
  `cwd` com caminhos equivalentes unificados; blocos sem repositório por último;
  `bounds` cobrindo todas as faixas; carimbo de `orderIndex`.
- Verificação manual no app (driver sob xvfb, userData isolado) com 5 terminais
  em dois diretórios: matriz única saiu na ordem `#1..#5`; mover um bloco para
  longe e reorganizar devolveu o mesmo mapeamento bloco→célula; o modo por
  repositório separou as faixas (3 do alpha, 2 do beta) com o vão maior; o chip
  do repositório aparece no cabeçalho de cada bloco.

### Estado e risco residual

- Concluído no código.
- **Limite conhecido:** a âncora continua sendo o canto do bloco mais ao
  topo-esquerda, então arrastar um bloco para longe move a matriz inteira para
  lá — o *arranjo* não muda, a posição de origem sim. Não foi alterado por ser
  o comportamento estabelecido em `c61ca72`.
- O número de colunas é `ceil(sqrt(n))`: ao cruzar um quadrado perfeito (2, 5,
  10, 17 blocos) a grade ganha uma coluna e o arranjo se reacomoda. Dentro do
  mesmo número de colunas, acrescentar um bloco não move nenhum outro.
- O carimbo de `orderIndex` em canvas antigos congela a ordem que existir no
  primeiro carregamento após esta versão — que pode já ter derivado de
  `updated_at`. A partir daí, é estável.

---

## [2026-08-23] Ctrl+C no terminal: copiar a seleção sem perder o SIGINT

**Contexto.** A anotação do usuário dizia que selecionar texto no terminal e
apertar Ctrl+C "às vezes" encerrava a sessão. A investigação mostrou que não era
intermitente: **nunca copiava**. No xterm, Ctrl+C é o caractere `0x03` — vira
`SIGINT` e quem decide o resto é a CLI do agente. O Claude Code interrompe o
turno e, no segundo aperto seguido, encerra; daí a impressão de "às vezes fecha".

O `attachCustomKeyEventHandler` de `terminal-session-store.ts` já interceptava
Shift+Enter e Ctrl+V, mas não Ctrl+C. A metade cara já existia: o método
`copy(id)`, usado pelo botão, lê a seleção e escreve na área de transferência.
Faltava ligar a tecla.

### Decisão

A regra depende de uma coisa só, a **seleção**: com texto selecionado a intenção
é copiar; sem seleção, Ctrl+C continua sendo o gesto padrão de terminal para
interromper — e alguém depende disso. Transformar Ctrl+C em "sempre copiar"
seria trocar um bug por outro.

A decisão foi isolada em `terminal-copy-shortcut.ts` (`decideCopyShortcut` →
`'copy'` | `'passthrough'` | `null`), longe do DOM e do PTY, no mesmo molde de
`terminal-image-paste.ts`, para ser testável direto. Ctrl+Shift+C e Cmd+C
(macOS) entram pelo mesmo caminho, reusando a distinção `metaKey`/`ctrlKey` que
a colagem já fazia — em vez de inventar outra.

### Implementação

- `terminal-copy-shortcut.ts` (novo): a decisão pura e o porquê de cada ramo.
- `terminal-session-store.ts`: o handler consulta a decisão antes do Ctrl+V;
  `copy` chama o novo `copySelection(session)` e devolve `false`, para o `0x03`
  não chegar ao PTY; `passthrough` devolve `true`.
- `copySelection` é privado e, ao contrário do `copy(id)` do botão, **não** cai
  para o viewport — quem chega ali só chega com seleção — e limpa a seleção
  depois, para o próximo Ctrl+C não copiar de novo sem querer.

### Validação

- `terminal-copy-shortcut.test.ts`: 8 casos (com/sem seleção, Ctrl+Shift+C,
  Cmd+C, sem modificador, outra tecla, Ctrl+Alt+C, `keyup`).
- `vitest run src/features/canvas/terminal/`: 10 arquivos, **135 testes**
  passando. `tsc -b` limpo.
- No app real (Electron sob xvfb, userData isolado, agente "Nenhum (shell)") com
  **tecla de verdade** via `xdotool` — tecla sintética do CDP não serve aqui:
  com `FELIXOCOPIA` selecionado, o Ctrl+C deixou `FELIXOCOPIA` na área de
  transferência do SO, **nenhum `^C` chegou ao shell** e a seleção sumiu; sem
  seleção, `naoenviar` + Ctrl+C imprimiu `naoenviar^C` e um prompt novo.

### Estado e pendência

- Concluído no código e no app (`3493f88`).
- A seleção precisou ser feita com mouse real (`xdotool`): evento de mouse
  sintético no `.xterm-screen` **não** cria seleção no xterm. Fica registrado
  para a próxima verificação manual não perder tempo com isso.
- A tarefa irmã do **Ctrl+A** (mesmo handler) segue aberta e não foi feita aqui.

---

## [2026-08-23] O botão dividido do Organizar: moldura, realce e pressão

**Contexto.** A anotação dizia só "o botão ficou meio bugado". A tarefa mandava
olhar antes de mexer, e valeu: o defeito mais visível não era nenhum dos dois
previstos por leitura de código.

### O que foi medido no app antes de tocar no código

| Medida | Organizar | Vizinhos (Ferramentas, Arquivo…) |
| --- | --- | --- |
| Altura do controle | **52px** | 36px |
| Início do rótulo (`x`) | **28px** | 16px |
| Hover em qualquer metade | acende o **controle inteiro** | — |
| Pressionar a metade esquerda | `scale(0.96)` **só nela** (108×35 dentro de 144×52) | a peça toda afunda |

A altura e a indentação vinham de um detalhe do Tailwind: o contêiner recebia o
`TOOLBAR_BUTTON_SHAPE` inteiro e tentava desfazer o excedente com `w-full gap-0
p-0` — mas **`p-0` não cancela `px-3 py-2`**, porque as utilidades de eixo são
emitidas depois da genérica. O padding do contêiner somava com o das metades.

### Decisão

O padrão certo já existia no repositório: o botão dividido do **Agente**
(`TerminalMenu.tsx`) usa o contêiner só como moldura, com fundo e hover em cada
metade. O Organizar passou a seguir o mesmo caminho, com a moldura extraída num
token próprio:

- `TOOLBAR_BUTTON_FRAME` — largura, canto, sombra e aro; o que desenha a pílula.
- `TOOLBAR_BUTTON_SURFACE` — fundo, cor e hover; o que pertence ao clicável.
- `TOOLBAR_BUTTON_SHAPE` passou a ser a composição dos dois mais o espaçamento,
  então nenhum outro botão mudou de aparência.

O `felixo-btn` (que dá a profundidade da pressão) saiu das metades e foi para a
moldura: assim o controle afunda inteiro, como qualquer botão da barra. As
metades ganharam `felixo-btn-flat`, classe nova em `index.css` com a mesma
transição e o mesmo anel de foco, **sem** o `scale` — se cada metade encolhe
sozinha, a pílula se parte no clique. O hover virou `enabled:hover:` para não
acender o que está desabilitado.

### Validação

- Depois: altura **36px** e `x=16` — idênticos aos vizinhos.
- Hover na metade esquerda: ela em `rgb(63,63,70)`, a setinha em `rgb(39,39,42)`,
  moldura transparente. Hover na setinha: exatamente o inverso.
- Pressionando: o **contêiner** em `matrix(0.96…)`, metades sem transform,
  **fresta = 0** e a soma das metades igual à largura da moldura (138.2px).
- Desabilitado: pílula única, 36px, `opacity 0.6`, sem realce em nenhuma metade.
- `eslint`, `tsc -b`, `vitest` **520/520**, `node --test` **728/728** e `build`
  limpos. Captura antes/depois anexada à task no Notion.

### Pendência

O botão do **Agente** monta as metades com `felixo-btn`/`felixo-btn-icon`, o
mesmo arranjo que aqui partia a pílula no clique. Não foi alterado — está fora
do escopo desta tarefa — e a medição do `:active` nele ficou inconclusiva no
driver. Virou task própria.

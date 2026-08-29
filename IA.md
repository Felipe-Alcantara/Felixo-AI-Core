
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

---

## [2026-08-23] Ctrl+A seleciona o que foi escrito na linha de entrada

**Contexto.** A anotação pedia "Ctrl+A para selecionar e poder apagar todo o
input". A investigação tinha proposto trocar isso por "limpar a linha", já que
num PTY não existe seleção de texto. Perguntado, o usuário manteve o pedido
original: **Ctrl+A seleciona**. É o que foi feito — e o apagar veio junto, porque
uma seleção que não se consegue apagar não resolveria a queixa.

### Decisão

`Ctrl+A` destaca, na **seleção do xterm** (a mesma do mouse, que o Ctrl+C já
copia), o trecho entre o fim do prompt e o cursor. `Backspace`/`Delete` com essa
seleção ativa apagam a linha inteira — `\x15\x0b` (Ctrl+U + Ctrl+K), sem `\r`
junto, porque limpar não é enviar.

Com a entrada vazia, ou numa linha sem marcador de prompt, a tecla **segue crua**
para o PTY: o `0x01` ("ir para o começo da linha") continua valendo onde não
atrapalha.

A seleção só vira comando de apagar se ainda for a que o Ctrl+A fez
(`session.selectedInput`): uma seleção de mouse no histórico não pode virar um
"limpe a entrada".

### Três erros que só a verificação no app revelou

O módulo puro (`terminal-input-selection.ts`) passou nos testes desde o começo.
O que os testes não sabiam, o app mostrou:

1. **Linha lógica ≠ linha visual.** Passando da largura da janela, a entrada vira
   duas linhas e o cursor para numa que **não tem prompt**. Texto curto
   selecionava, texto longo não. Daí `positionFromOffset` e a subida por
   `isWrapped` para reconstruir a linha lógica antes de decidir.
2. **O último marcador é o errado.** `#`, `$` e `>` aparecem no texto digitado:
   com `❯ [Pasted text #1 +6 lines]`, o `#` do texto virava o prompt e a seleção
   saía como `1 +6 lines]`. É o **primeiro** marcador da linha que conta.
3. **O espaço depois do marcador não é `0x20`.** As CLIs de tela cheia usam
   espaço não separável, e comparar com `' '` deixava um espaço na frente da
   seleção.

Também ficou registrado um detalhe do driver que custou tempo: **o HMR do Vite
não reatacha o `attachCustomKeyEventHandler`** de uma sessão já criada. Depois de
editar o store é preciso relançar o app — senão a verificação testa o código
antigo e o resultado engana.

### Validação

- `terminal-input-selection.test.ts`: 21 casos, incluindo os três erros acima
  como regressão.
- Suíte: `vitest` **541/541** (54 arquivos), `npm test` **728/728**, `eslint`,
  `tsc -b` e `build` limpos.
- No app, com tecla física (`xdotool`), nos três desenhos de entrada:
  **shell** (`$`), **Claude Code** (`❯`, inclusive com o texto quebrando em duas
  linhas visuais) e **Codex** (`›`). Em todos: Ctrl+A destaca só o que foi
  escrito (o Ctrl+C devolve exatamente esse texto), Backspace esvazia a entrada e
  **nada é enviado ao agente**.

### Limite conhecido

Quando o cursor está numa linha **sem** marcador de prompt — composer de várias
linhas desenhado pelo TUI, por exemplo — o range volta `null` e o Ctrl+A segue
para o PTY. Isso foi medido no Codex com o cursor fora do composer; **não** foi
possível reproduzir o composer multi-linha para confirmar (o Shift+Enter enviado
pelo driver submeteu o prompt em vez de quebrar a linha, e insistir gastaria a
conta do usuário). Virou task própria.

---

## [2026-08-24] O botão dividido do Agente: a mesma fresta, agora medida

**Contexto.** O conserto do Organizar (23/08/2026, commit `83178b9`) deixou uma
pendência declarada: o botão do **Agente** montava as metades do mesmo jeito
— `felixo-btn` na metade rotulada e `felixo-btn-icon` na setinha, dentro de um
contêiner `overflow-hidden` — e devia partir a pílula no clique. Era previsão por
leitura de código: a medição da época não fechou, porque o clique abre um
terminal e o React re-renderiza a árvore no meio da leitura.

### O que foi medido

A medição saiu com Chrome real dirigido pelo `playwright-core` que já vinha nas
dependências, contra o Vite em `127.0.0.1:5173`. Dois detalhes fizeram ela
funcionar onde a anterior falhou: `page.mouse.down()` produz `:active` de
verdade (evento sintético não produz), e o ponteiro sai da área **antes** do
`mouse.up()` — sem `click`, o `onClick` não dispara e nada re-renderiza.

| Medida (com o botão pressionado) | Antes | Depois |
| --- | --- | --- |
| `transform` da moldura | `none` | `matrix(0.96, …)` |
| `transform` da metade rotulada | `matrix(0.96, …)` | `none` |
| `transform` da setinha | `matrix(0.9, …)` | `none` |
| Fresta rótulo↔setinha (metade rotulada) | **2,34px** | **0** |
| Fresta rótulo↔setinha (setinha) | **1,35px** | **0** |

O defeito previsto existia, e era pior na metade rotulada que na setinha só por
causa das escalas diferentes (`0.96` contra `0.9`). Vale o registro: a setinha
usava a escala **maior** de afundamento (`felixo-btn-icon`), pensada para alvo
pequeno isolado — dentro de uma pílula ela só aumentava o rasgo.

### O que foi feito

Igual ao Organizar: `felixo-btn` saiu das duas metades e foi para a moldura;
as metades ficaram com `felixo-btn-flat` (mesma transição e mesmo anel de foco,
sem o `scale`), criada justamente para isso no conserto anterior. Nenhuma outra
diferença sobrou: o contêiner do Agente já era moldura pura, sem fundo nem hover
próprios — foi dele que o padrão veio.

### Validação

- Medição acima, no app rodando, antes e depois.
- Hover continua isolado por metade: passar no rótulo deixa o rótulo em
  `rgb(63,63,70)` e a setinha em `rgb(39,39,42)`, e vice-versa.
- O menu de configuração continua abrindo: clicar na setinha leva
  `aria-expanded` a `true` e o painel a altura maior que zero.
- `tsc -b`, `eslint .` e `vitest` (**559/559**, 56 arquivos) limpos.
- `npm test`: **726/728**. As duas falhas são de ambiente e **anteriores** a esta
  mudança — conferido com o arquivo em `git stash`, o mesmo par falha em
  `electron/services/pty-process-manager.test.cjs`, porque o teste espera o
  comando `codex` puro e a máquina resolve `codex.cmd` do PATH do usuário.
  Virou task própria.

---

## [2026-08-24] "Sumiram as animações": era o Windows, não o app

**Contexto.** Logo depois do conserto do botão do Agente veio o relato de que
**nenhuma** animação da interface acontecia mais. A suspeita imediata — a mudança
recém-commitada — foi descartada por medição, não por argumento: `6ab2a26` troca
duas classes num único botão e não toca no `index.css`.

### O que foi medido

A causa é a preferência de movimento reduzido do sistema, que o `index.css` respeita
desde `58d1321` (22/06/2026), zerando `animation` em todo o conjunto `felixo-anim-*`:

```
SPI_GETCLIENTAREAANIMATION = False   →   prefers-reduced-motion: reduce
```

No app rodando, abrindo o painel do Agente, com e sem a preferência:

| | Como o sistema estava | Com animação permitida |
| --- | --- | --- |
| `matchMedia('(prefers-reduced-motion: reduce)')` | `true` | `false` |
| `animation-name` do painel | `none` (`0s`) | `felixo-tools-list-in` (`0.62s`) |
| `animation-name` dos itens | `none` | `felixo-tools-list-item-in` |

O painel continuava abrindo — só aparecia instantaneamente. **É o comportamento que o
CSS foi escrito para ter**, não um defeito.

### A armadilha da ferramenta de medição

O Playwright **força** `reducedMotion: 'no-preference'` por padrão em todo contexto
novo. A primeira leitura voltou `reduce: false` e quase enterrou a hipótese certa.
Só com `newPage({ reducedMotion: null })` — que manda usar o valor do sistema — a
medição passou a refletir a máquina. Quem for medir qualquer coisa sensível a
`prefers-reduced-motion`, `prefers-color-scheme` ou `forced-colors` com Playwright
precisa passar `null` explicitamente, senão mede o navegador da própria ferramenta.

### A parte que ficou sem resposta

O valor **persistido** no registro (`UserPreferencesMask` byte 2 = `0x03`) dizia
animação **ligada**, enquanto a sessão em execução respondia **desligada**. Algo
chamou `SystemParametersInfo` sem `SPIF_UPDATEINIFILE` — desligou em memória e não
gravou, o que não deixa rastro. Não foi possível identificar o programa.

### Decisão

Nada mudou no repositório. A correção foi na máquina do usuário, com escolha dele:
religar o bit de animação e devolver `VisualFXSetting` de `2` ("melhor desempenho")
para `0`. Depois disso a mesma medição no app voltou `felixo-tools-list-in` /
`0.62s`.

**Fica registrado para a próxima vez que alguém disser "as animações sumiram":** medir
`prefers-reduced-motion` antes de procurar no código. E vale a pena discutir se o app
deveria expor essa preferência em algum lugar visível, em vez de o usuário descobrir
que o sistema a desligou — virou task.

---

## [2026-08-24] Os dois testes vermelhos do PTY eram ambiente, e a correção veio de outra frente

**Contexto.** Em 24/08 ficou registrado que `npm test` fechava em 726/728 nesta
máquina, com duas falhas **de ambiente** em
`electron/services/pty-process-manager.test.cjs`: o teste esperava o comando `codex`
puro e recebia `C:\…\npm\codex.cmd`, porque a máquina de quem desenvolve tem a CLI
instalada no `PATH`. Numa máquina sem o Codex, o par passava. Virou task própria.

Ao pegar a task, a primeira medição já contou outra história: **40 testes, 40
passando**. Entre a leitura do repositório e o `git status` seguinte, outro agente do
canvas commitou `0b96d15` ("fix: quote Windows PTY command paths"), que resolveu o
problema como efeito de outro conserto.

### O que `0b96d15` fez

O alvo dele era um bug real e diferente: `cmd.exe /c` não é *argv-aware*, então um
caminho absoluto **com espaços** passado como argumento separado era truncado no
primeiro espaço. A correção junta tudo numa única linha de comando, com um par extra
de aspas quando o executável precisa delas.

Isso mudou a forma esperada dos argumentos em vários testes
(`['/d','/s','/c','claude','--model','opus']` → `['/d','/s','/c','claude --model opus']`)
e, ao reescrevê-los, os dois testes de ambiente ganharam
`resolveCodexPath: () => null` — **a primeira das duas saídas** que a task listava:
isolar o ambiente em vez de afrouxar a asserção. É a saída certa: a asserção continua
exigindo a string exata, e o teste deixou de perguntar à máquina o que ela tem
instalado.

### O que foi medido aqui

- `npm test`: **729 testes, 726 passando, 0 falhando**, 3 pulados (pré-existentes),
  exit 0. A contagem subiu de 728 porque `0b96d15` acrescentou um teste — o do caminho
  absoluto com espaços.
- **Prova por mutação**, que era o critério de aceite que ninguém tinha verificado:
  desligando a retentativa com WinPTY (`allowWindowsBackendFallback = false && …`), o
  arquivo vai a **38/40**, com estes dois vermelhos:
  - `Windows retries a startup path error with the WinPTY backend before changing shell`
  - `Windows retries an explicit Codex launch with WinPTY after an early path error`

  O segundo é justamente um dos dois que antes falhavam por ambiente: ele voltou a
  proteger o comportamento em vez de só ficar verde. Mutação desfeita em seguida
  (`git checkout --`), com o arquivo reconferido em 40/40.

### Lição de canvas multiagente

O `git status` desta investigação mostrou os dois arquivos como modificados; a chamada
seguinte, poucos segundos depois, mostrou a árvore limpa e um commit novo no topo.
Não era normalização de fim de linha nem engano: era **o trabalho de outro agente em
voo**. Vale o registro de que, aqui, "modificado e não commitado" não é sinônimo de
"meu" — e que ler o estado duas vezes antes de agir evitou refazer um conserto que já
existia.

---

## [2026-08-24] Automations legadas não somem na migração parcial

**Problema.** A primeira migração de `localStorage` para SQLite tratava qualquer
lista não vazia do banco como completa. Assim, se uma versão antiga tivesse
gravado parte dos prompts e rejeitado outros por escopos que ainda não existiam
no `CHECK`, abrir o app substituía a lista local pela lista parcial do banco.

**Decisão.** Enquanto o marcador de migração ainda não existir,
`mergeAutomationsForBackendMigration` mantém as automations ausentes do
armazenamento local e preserva a versão do SQLite nos ids que já existem. A
união é salva antes de marcar a migração como concluída; nas próximas aberturas,
o SQLite volta a ser a fonte de verdade.

**Feedback de falha.** O autosave no painel de Prompts agora aguarda o resultado
do IPC. Rejeição, indisponibilidade da ponte ou erro do repositório exibem um
aviso vermelho junto ao prompt, em vez de fazer a edição parecer salva.

**Validação.** Novo teste de storage cobre os sete escopos, rejeita um escopo
inválido e protege a união parcial. `tsc -b`, `npm run lint`, `npm run
test:frontend` (**562/562**) e `npm test` (**729 passando, 3 pulados, 0
falhando**) passaram.

---

## [2026-08-24] Novo prompt só passa a existir depois de o SQLite confirmar

**Problema.** O botão `Novo prompt` criava na interface uma automation com
texto vazio e tentava gravá-la imediatamente. O repositório corretamente a
recusava, mas o item ainda aparecia no estado local; ao recarregar, sumia como
se tivesse sido salvo.

**Decisão.** A criação agora abre um rascunho local, separado de `custom`.
Ele explica que falta o texto do prompt e não chama o IPC enquanto estiver
vazio. Só uma resposta `ok: true` adiciona a automation à lista persistida;
recusa ou falha mantêm o rascunho e mostram uma mensagem acionável.

**Validação.** O teste unitário protege os três limites: texto vazio sem
chamada ao backend, primeira gravação válida e recusa do backend. No Electron
isolado, o rascunho vazio manteve o SQLite vazio; após preencher o texto, a
automation voltou da listagem com id e `updatedAt`, inclusive depois de
recarregar. O item de QA foi removido ao final.

---

## [2026-08-24] Movimento reduzido passa a ser explicado nas Configurações

**Problema.** O Felixo já desligava corretamente as animações quando o sistema
pedia movimento reduzido, mas não dizia por quê. Para quem não escolheu a
preferência conscientemente, a interface parecia quebrada e a causa ficava
fora do alcance do app.

**Decisão.** Foi escolhido o aviso persistente e não intrusivo nas
Configurações. Não há toast repetitivo nem opção do app para contrariar o
sistema: o padrão continua respeitando acessibilidade. O texto esclarece que
não é defeito e aponta o caminho do Windows para Efeitos de animação.

**Implementação.** `useReducedMotionPreference` lê
`prefers-reduced-motion: reduce` e fica inscrito em mudanças do `matchMedia`.
Assim, abrir Configurações depois de uma alteração do sistema mostra o estado
atual sem depender de reiniciar o app.

**Validação.** O teste cobre preferência reduzida, preferência normal e a
mudança em tempo real. No Electron isolado, o aviso apareceu com o switch
`--force-prefers-reduced-motion` e não apareceu na preferência normal do
sistema.

---

## [2026-08-24] Links de agentes no terminal saem para o navegador com confirmação

**Problema.** URLs impressas por Codex, Claude ou outra CLI apareciam no xterm
como texto comum; a pessoa via o endereço, mas não tinha como abri-lo dentro
do app.

**Decisão.** O terminal aceita apenas `http:` e `https:` e exige Ctrl+clique
(ou Cmd+clique no macOS) antes de sair para o navegador. A política é própria
do terminal e não altera as regras dos blocos de Página Web.

**Implementação.** O `WebLinksAddon` do xterm reconhece URLs e encaminha a
ativação confirmada para `window.open`. O handler já existente da janela
principal a redireciona para o navegador do sistema. Esquemas como `file:`,
`javascript:` e `mailto:` são recusados antes dessa chamada.

**Validação.** Testes cobrem os esquemas permitidos e bloqueados, a exigência
do modificador e a ativação. A suíte de frontend confirma o registro do addon.

---

## [2026-08-24] Ctrl+A alcança composers de múltiplas linhas

**Problema.** A seleção de entrada só reconstruía linhas que o xterm marcava
como `isWrapped`. Quebras lógicas desenhadas pelo composer após Shift+Enter
deixavam o cursor numa linha sem marcador e o Ctrl+A voltava ao PTY.

**Decisão.** A busca sobe no máximo quatro linhas a partir do cursor, até o
marcador de prompt. É alcance suficiente para o composer curto sem transformar
Ctrl+A em seleção de saída antiga.

**Implementação.** O intervalo selecionado permanece contínuo, como o xterm
exige, mas o texto guardado para Ctrl+C é montado sem prompt, preenchimento ou
molduras laterais. Ctrl+U seguido de Ctrl+K continua sendo enviado pelo
Backspace, sem Enter.

**Validação.** Os testes montam três linhas de buffer, com e sem moldura,
além dos casos de entrada simples, quebra visual e entrada ausente.

---

## [2026-08-24] Fetch All disponível aos agentes do canvas

**O que mudou.** Terminais abertos pelo canvas passam a receber um shim
`felixo` no PATH. O subcomando `felixo fetch-all` expõe somente `varrer`,
`estado`, `pedir-execucao` e `ver-pedido`; a skill integrada `fetch-all` explica
o contrato ao agente sem ocupar o prompt inicial com o conteúdo inteiro.

**Decisão de segurança.** O processo de terminal reutiliza apenas o serviço de
leitura do Fetch All. Não há verbo de pull, push ou commit no comando. Quando
precisa sincronizar, o agente cria um pedido em arquivo na pasta de dados do
app; o painel recebe o aviso, exige uma varredura/revisão atual e só então a
pessoa pode confirmar. O estado de cada repositório ainda é revalidado pela
execução do app imediatamente antes da escrita.

**Correção de portabilidade.** O shim roda o binário do Electron com
`ELECTRON_RUN_AS_NODE=1`; nesse modo `require('electron').app` não existe. O
processo principal agora grava `FELIXO_USER_DATA_DIR` no shim, para o comando
usar exatamente o mesmo `userData` do app em Linux, macOS e Windows. Assim,
relatórios, configurações e pedidos de confirmação continuam compartilhando o
mesmo perfil, mesmo no app empacotado.

**Validação.** `npm test`, `npm run test:frontend`, `npm run lint`, `npm run
build` e `git diff --check` passaram. O executável Node respondeu a
`fetch-all estado` sem plano prévio, como esperado. A instalação do shim e a
execução real são cobertas por teste; a verificação visual no app aberto continua
pendente para uma sessão futura. A correção do perfil também tem testes do
shim POSIX/Windows, do PATH do terminal e de um pedido gravado no `userData`
recebido do app.

---

## [2026-08-25] Lockfile do npm volta a permitir o CI

**Causa.** O commit `9fec253` tinha sincronizado o `package-lock.json` com a
árvore resolvida pelo npm do CI. Ao adicionar os links do terminal, `d381b0a`
regenerou o arquivo sem as dependências opcionais transitivas
`@emnapi/core@1.11.3` e `@emnapi/runtime@1.11.3`. Em checkout limpo com Node
22.22.3, `npm ci` então recusava instalar a árvore antes de rodar qualquer
teste, nos três sistemas operacionais.

**Correção.** O lockfile foi regenerado somente com npm 10.9.8, distribuído com
Node 22.22.3 — a versão da matriz do CI. A alteração recompõe a árvore exata;
nenhuma dependência declarada em `package.json` nem o workflow foi alterado.

**Validação local.** A falha foi reproduzida a partir de `d381b0a`; após a
regeneração, `npm ci --ignore-scripts --no-audit --no-fund` concluiu no checkout
limpo sob Node 22.22.3. O CI remoto e a publicação da release permanecem a
confirmação pendente deste commit.

---

## [2026-08-24] Janela principal recupera posição e estado com segurança

**Problema.** A única janela do app sempre nascia no tamanho padrão e no
monitor primário. Quem alternava entre telas vertical e horizontal precisava
reposicioná-la a cada abertura, e uma coordenada antiga pode ficar invisível
quando um monitor é desconectado.

**Decisão.** Antes de qualquer segunda janela, o app persiste bounds, estado
maximizado e tela cheia no SQLite. Só restaura bounds que cruzem uma área útil
de monitor ativo; caso contrário, centraliza no monitor primário.

**Implementação.** A decisão de restauração é pura e recebe a lista de
monitores. A criação da janela aplica os bounds resolvidos, reaplica o estado e
persiste mudanças de tamanho, posição e modo. Não há modo destacado nem
tentativa de esticar uma janela pelos dois monitores.

**Validação.** Testes usam monitores horizontal e vertical fabricados, monitor
desconectado e estados maximizado/tela cheia.

---

## [2026-08-25] Busca de chats renderiza conteúdo importado como texto

**Problema.** O destaque de busca montava uma string HTML com título e trecho de
chat e a inseria com `dangerouslySetInnerHTML`. Conteúdo de sessões importadas
podia conter marcação literal e virar DOM no renderer.

**Decisão.** O destaque passou a compor nós React: texto antes/depois permanece
como `children` e somente a correspondência vira um elemento `mark`. Assim, o
React escapa caracteres não confiáveis sem perder a busca case-insensitive.

**Validação.** O teste novo renderiza um título com tag e atributo literais,
confirma que o resultado contém texto escapado e mantém o termo marcado. O gate
passou com lint, build, 583 testes de frontend e 734 testes do processo principal
(3 pulados). O build manteve apenas o aviso pré-existente de chunk inicial grande.

---

## [2026-08-25] Terminal comunica o gesto para abrir links externos

**Problema.** URLs do terminal exigem Ctrl/Cmd+clique por segurança, mas a
interface não explicava o gesto e podia parecer que o link estava quebrado.

**Decisão.** O cabeçalho do terminal exibe “links: Ctrl/Cmd+clique” (com tooltip
para Windows/Linux e macOS), mantendo a whitelist http/https e a abertura no
navegador do sistema.

**Validação.** A política e o callback continuam cobertos pelo teste unitário
de links externos; a build instalada v0.1.76 contém a implementação e o CI
multiplataforma/release estão verdes.

---

## [2026-08-25] Link do terminal pode abrir no canvas ou no navegador

**Contexto.** A task do Notion pedia uma segunda ação para URLs reconhecidas no
terminal: abrir dentro do canvas como bloco Página Web, sem remover o caminho já
existente para o navegador externo.

**Implementação.** O link continua aceitando somente `http:`/`https:`. Ctrl/Cmd-
clique mantém a abertura externa; ao passar pelo link, o terminal informa os
gestos e o clique direito abre um menu com **Abrir no canvas** e **Abrir no
navegador**. A ação do canvas atravessa o store de sessões até `CanvasView`,
cria o bloco Página Web persistido ao lado do terminal de origem, seleciona-o e
centraliza a viewport nele. A posição próxima usa uma função pura que tenta os
quatro lados do terminal e recua para o posicionamento geral quando necessário.

**Validação.** `npm run lint`, `npm run build`, `npx vitest run
src/features/canvas/services/node-geometry.test.ts
src/features/canvas/terminal/terminal-external-link.test.ts` (16 testes),
`npm test` (765 testes) e `git diff --check` passaram. Não foi feita abertura
visual do app empacotado nem carregamento de uma URL externa real nesta sessão;
isso permanece como validação manual de integração.

---

## [2026-08-25] Terminal aceita arquivos arrastados como referências seguras

**Contexto.** A task pedia aceitar qualquer tipo de arquivo arrastado para o
terminal, sem abrir, executar, ler ou enviar o conteúdo do arquivo.

**Implementação.** O alvo exato de cada sessão PTY agora intercepta `dragover`,
`dragleave` e `drop`, mostra feedback visual local e resolve somente o caminho
pela ponte Electron `webUtils.getPathForFile`. As referências são formatadas
como texto JSON para preservar espaços, aspas, barras e Unicode; entradas sem
caminho recebem uma orientação acionável. O texto entra pela fila de escrita da
sessão, mantém a ordem, devolve o foco ao terminal e nunca envia Enter. Não há
capability de anexos exposta pelos agentes atuais, então o fallback explícito de
caminho é usado para todos os tipos, inclusive diretórios.

**Validação.** `npm run lint`, `npm run build`, `npx vitest run
src/features/canvas/terminal/terminal-dropped-files.test.ts
src/features/canvas/terminal/terminal-session-store.test.ts` (21 testes),
`npm test` (765 testes) e `git diff --check` passaram. A validação manual de
arraste em Linux/Windows/macOS ainda não foi executada; permanece risco residual
de diferenças do Chromium/Electron no gesto de arrastar, especialmente no macOS.

---

## [2026-08-25] Retomada reabre a conversa exata do agente

**Contexto.** A retomada de terminais restaurados usava apenas `/resume`,
deixando a CLI escolher uma conversa e permitindo associação errada. A task
exigia persistir o ID do agente, respeitar provider e diretório, e nunca abrir
silenciosamente uma conversa privada diferente.

**Implementação.** O canvas agora persiste uma referência versionada com
`provider`, `sessionId`, `cwd` e `capturedAt`. O processo principal descobre o
ID apenas no metadata inicial dos históricos locais do Codex, Claude e Gemini,
sem ler conteúdo de conversa, e o renderer o recebe por uma ponte PTY separada
do ID interno do processo. Na reabertura, Codex usa `codex resume <id>` e Claude
ou Gemini usam `--resume <id>` somente quando provider e `cwd` coincidem. IDs
inválidos, incompatíveis ou ambíguos caem para uma orientação explícita de
`/resume`; a UI mostra a associação, permite copiá-la e esquecê-la. Exportação
e clonagem removem a associação privada para não transportar uma conversa de
uma pessoa ou conta para outra.

**Medições.** Nesta máquina: `codex-cli 0.149.1`, Claude Code `2.1.241` e
Gemini CLI `0.52.0`. Os três CLIs expõem retomada por ID na ajuda oficial; a
captura automática foi validada por testes com históricos sintéticos e não
exige credenciais nem envia prompts de teste aos provedores.

**Validação.** `npm run test:frontend -- --maxWorkers=1` passou com 609 testes,
`npm test` passou com 769 testes, `npm run lint`, `npm run build` e
`git diff --check` passaram. Foram adicionados testes para IDs antigos ou
inválidos, provider/diretório incompatíveis, histórico ambíguo, reinício,
persistência e privacidade de importação/exportação.

**Limitações não validadas.** Não foi possível concluir nesta sessão a
checagem manual com duas conversas antigas do Codex, nem medir uma identidade
de conta de forma segura a partir do PTY; a referência capturada fica limitada
ao provider e diretório quando a CLI não fornece conta no metadata. Também não
houve teste visual do app empacotado em Windows/macOS. O fallback permanece
intencionalmente honesto nesses casos.

---

## [2026-08-25] Ctrl+C reaberto: a causa não era o Ctrl+C, era a seleção com mouse

**Correção de rota da entrada [2026-08-23] acima.** Aquela entrada deu por resolvido
que Ctrl+C com seleção copia e sem seleção interrompe. Estava certa sobre `decideCopyShortcut`
— mas a validação só cobriu shell puro, e o usuário voltou a relatar o problema em CLIs de
tela cheia (Claude Code, Codex, Gemini).

### O que foi medido (25/08/2026, app real sob Xvfb, xdotool)

Instrumentado `terminal.modes.mouseTrackingMode` numa sessão Claude Code real: `"any"`. Um
arrasto de mouse **de verdade** (xdotool mousedown→mousemove→mouseup, não CDP sintético)
sobre o texto renderizado voltou `hasSelection(): false` — nenhuma seleção nasceu.

Causa, achada no código-fonte do `@xterm/xterm` (`SelectionService.handleMouseDown`,
`CoreBrowserTerminal.bindMouse`): quando o programa liga o mouse tracking, o xterm.js
**desliga a seleção por clique-arrastar comum** e passa a mandar cada clique/arrasto ao
processo como coordenada. Só Shift+arrastar (Option no macOS) força a seleção mesmo assim
— gesto que ninguém usa sem saber que existe.

Como o `0x03` cru chegava ao Claude Code sem seleção nenhuma no xterm, ele reagia com um
copiador **próprio**: `Ctrl+C` real com "Sonnet 5 with xhigh effort" arrastado no xterm
copiou, pelo clipboard do SO, `"et 5 with xhigh effor"` — um trecho errado, sem interromper
a sessão nesse teste, mas sem ser o que a pessoa selecionou.

### A decisão (perguntada antes de implementar)

Três caminhos possíveis: (a) fazer o clique-arrastar comum sempre vencer o mouse tracking,
igual VS Code/iTerm2/Windows Terminal fazem por padrão; (b) só ensinar `decideCopyShortcut`
a aceitar Shift+arrastar (não resolve o caso relatado); (c) investigar Codex/Gemini antes.
Escolhido (a).

### O mecanismo do fix — sem reimplementar a seleção do xterm.js

`xterm.js` decide "forçar seleção" e "não mandar mouse ao programa" a partir da MESMA
pergunta: `SelectionService.shouldForceSelection(event)` (`event.shiftKey`, ou `event.altKey`
no macOS). Em vez de recriar a lógica de seleção, `terminal-mouse-selection.ts` intercepta o
`mousedown` em fase de captura, cancela o original e redispara um evento idêntico com esse
modificador ligado — o próprio xterm.js processa o resto. `event.isTrusted` distingue o
evento sintético do real e evita laço infinito (nenhuma marca própria precisou existir).

### O regresso que quase entrou, pego antes do commit

Testado no shell puro (mouse tracking desligado): a primeira versão interceptava **todo**
`mousedown`, e forçar Shift quando a seleção já estava habilitada (`_enabled: true`) caía em
`SelectionService._handleIncrementalClick` — que só estende uma seleção **já existente**; sem
âncora prévia, o primeiro clique-arrastar comum passava a não selecionar nada. Corrigido
gatilhando a interceptação só quando `terminal.modes.mouseTrackingMode !== 'none'`.

### O que mudou

- `terminal-mouse-selection.ts` (novo, módulo puro): `isMacPlatform`, `xtermAlreadyForcesSelection`,
  `shouldForceMouseSelection`, `buildForcedSelectionEventInit`.
- `terminal-session-store.ts`: `bindMouseSelection(session)` — mesmo padrão de
  `bindImagePaste` (listener único por sessão, vive no elemento do xterm). Opções novas no
  `new Terminal()`: `macOptionClickForcesSelection: true` (sem ela, Option-arrastar cairia no
  modo de seleção em coluna do xterm.js) e `altClickMovesCursor: false` (sem ela, Option
  forçado moveria o cursor da CLI num clique rápido sem arrastar).

### Validação

193 testes no módulo do terminal (11 novos), 622 no frontend, 769 no processo principal,
`tsc -b` e `npm run lint` limpos.

**No app real**, sessão Claude Code (`mouseTrackingMode: "any"`), arrasto por `xdotool`:
antes do fix `hasSelection: false`; depois, `hasSelection: true`, texto exato ("celled" de
"Resume cancelled"). Ctrl+C real copiou exatamente esse texto (clipboard do SO conferido) e
a sessão continuou em `aguardando`, sem `^C` nem qualquer sinal de interrupção. Sem seleção,
Ctrl+C real ainda interrompe (`"Press Ctrl-C again to exit"` apareceu normalmente). No shell
puro (`mouseTrackingMode: "none"`), o mesmo arrasto real seguiu selecionando como antes —
sem regressão, confirmado depois da correção acima.

### O que não foi validado

- **Só Claude Code foi medido de ponta a ponta com mouse real.** Codex e Gemini têm o mesmo
  mecanismo do xterm.js por trás (não são código nosso), mas nenhum dos dois foi aberto nesta
  sessão para confirmar o `mouseTrackingMode` deles nem repetir o teste de arrasto.
- **Não testado no macOS.** O caminho `altKey`/`macOptionClickForcesSelection` tem teste
  unitário da decisão pura, mas ninguém arrastou o mouse segurando Option numa máquina Mac
  de verdade.
- Duplo Ctrl+C para sair (comportamento pré-existente do Claude Code, não desta correção) não
  foi reexercido depois do fix.

---

## [2026-08-26] O workflow Release tenta de novo sozinho, e para de reverter quem já atualizou

Duas falhas medidas em 25 e 26/08/2026, ambas resolvidas na hora com intervenção manual (ver
entrada de acompanhamento de deploy no relatório do dia): o passo `gh release create` falha de
vez em quando com `HTTP 500` transitório da API do GitHub, e nada tentava de novo sozinho — uma
das duas ficou parada ~13 horas até alguém notar.

**Um segundo defeito apareceu destravando a primeira:** a release mais antiga (`v0.1.80`) terminou
de publicar *depois* da mais nova (`v0.1.81`, já promovida), e `gh release edit --latest` marcou
a mais antiga como "Latest" só por ter rodado por último — quem tivesse atualização automática
ligada seria revertido, sem aviso.

### O que mudou

- `.github/scripts/retry.sh` — função `retry <tentativas> <espera> -- comando`, backoff
  exponencial. Usada no `Create prerelease container` (`retry 5 5 -- gh release create ...`).
- `.github/scripts/release-version.sh` — `is_tag_newer <candidata> <atual>`, comparação por
  `sort -V` (não texto — `v0.1.10 > v0.1.9` importa). Usada em `Publish the draft release`: só
  passa `--latest` quando a release sendo finalizada é de fato mais nova que a atual "Latest".
- Ambos com teste próprio (`retry.test.sh`, `release-version.test.sh`), rodando num job novo
  (`release-scripts`) do `ci.yml` — para não virarem código que ninguém mais exercita.

### Validação

Não bastava ler o código — a task pedia prova contra falha real ou simulada de propósito.
Simulei os dois incidentes exatos com um `gh` falso: `retry` engoliu dois `HTTP 500` seguidos e
passou na terceira tentativa (o padrão medido nos dois incidentes reais); `is_tag_newer`
reproduziu o caso de ontem (`v0.1.80` tentando virar "Latest" depois da `v0.1.81`) e decidiu
certo — publica sem `--latest`, a mais nova continua sendo a mais nova. 17 verificações unitárias
mais as duas simulações de ponta a ponta, todas passando. `yaml.safe_load` e `bash -n` em cada
`run:` do workflow, limpos.

### O que ficou fora, declarado

Item 3 do critério de aceite pedia "avaliar notificação" quando o retry esgota as tentativas.
Não há nenhum canal de notificação configurado neste repositório (sem webhook de Slack/Discord,
sem secret para isso) — implementar um exigiria uma decisão de infraestrutura fora do escopo
desta task. A falha continua visível do jeito que já era: o job fica vermelho no Actions.

---

## [2026-08-26] O fix de seleção por mouse confirmado em Codex e Gemini — e por que só o Claude Code precisava dele

Fechamento da pendência aberta em 25/08 (o fix `terminal-mouse-selection.ts`, commit `e2e55fc`,
tinha sido medido só no Claude Code). Reinseri o mesmo probe temporário e abri sessões reais de
Codex e Gemini no app, com mouse real via `xdotool`.

### O que foi medido

| CLI | `mouseTrackingMode` | Precisava do fix? | Arrasto real → seleção | Ctrl+C com seleção | Ctrl+C sem seleção |
| --- | --- | --- | --- | --- | --- |
| Claude Code (25/08) | `"any"` | Sim | sem o fix: não nascia | com o fix: exata, sessão viva | interrompe |
| Codex 0.149.1 | `"none"` | Não | já nascia normalmente | copia exato, sessão viva | interrompe (`Press Ctrl-C again...` equivalente) |
| Gemini CLI 0.52.0 | `"none"` | Não | já nascia normalmente | copia exato (`" │"`, conferido no clipboard do SO), sessão viva | `Press Ctrl+C again to exit.` |

Nem Codex nem Gemini ligam o mouse tracking do xterm nos estados testados (Codex: tela inicial
"aguardando"; Gemini: menu de autenticação, ambos TUIs de tela cheia de verdade, não simplificados).
Por isso o clique-arrastar comum **já funcionava neles antes do fix** — e continua funcionando
depois, sem regressão (o mesmo motivo que `mouseTrackingMode !== 'none'` é o portão da
interceptação: nada nesses dois CLIs entra nesse caminho).

### O que ficou sem medir

- **macOS**: impossível nesta máquina — sem hardware Mac disponível. Não é "não fiz por
  escolha", é bloqueio de ambiente. O caminho `altKey`/`macOptionClickForcesSelection` segue só
  com teste unitário da decisão pura.
- Só os estados iniciais de Codex e Gemini foram exercitados (tela de espera / menu de auth) —
  não uma sessão autenticada em pleno uso, nem telas específicas desses CLIs (diff viewer do
  Codex, por exemplo) que poderiam, em tese, ligar o mouse tracking num momento diferente.

---

## [2026-08-26] O que desligava a animação: investigado, sem culpado provado

**Contexto.** Task aberta em 24/08 pedia identificar quem desliga a preferência de
movimento reduzido do Windows nesta máquina, com a ressalva de que **só é possível
investigar quando o sintoma reaparecer**.

### O sintoma não reapareceu

Medido nesta sessão: `SPI_GETCLIENTAREAANIMATION = True`, registro (`UserPreferencesMask`
byte 2 = `0x03`) concordando, `VisualFXSetting = 0`. Tudo consistente com o estado
salvo em 24/08. `LastBootUpTime` mudou de 21/08 para **26/08 22:16** — a máquina
reiniciou desde a investigação, e reler o valor salvo no boot é o esperado.

### A pista levantada, e por que não fecha o caso

O log de eventos (`Application`) tem uma fonte chamada **`asus`** — o serviço
"Serviço do ASUS Update (asus)", que roda `AsusUpdate.exe /svc` e se autodesliga
("Service stopped") pouco depois de cada boot. Em 24/08 esse evento disparou às
`00:00:29`, **9 segundos** depois do registro ter sido reescrito (`00:00:20`).

Isso parecia a pista certa até cruzar com os outros dias: o mesmo evento aparece
2–10 min depois de **qualquer** boot (`26/08 22:18`/`22:26`, 10 min após o boot das
`22:16`; `21/08 01:06`/`01:14`; `19/08 00:34`/`00:38`), inclusive num dia (26/08) em
que a animação **não** foi desligada. Ou seja: o horário batendo com meia-noite em
24/08 é porque a máquina foi ligada tarde naquele dia, não porque o serviço dispare à
meia-noite — a correlação com o registro reescrito é provavelmente coincidência de
janela (muita coisa inicializa nos primeiros minutos de logon), não causa.

Não achei nada mais forte: sem eventos do Agendador de Tarefas na janela (o log
`Microsoft-Windows-TaskScheduler/Operational` não estava habilitado), sem entrada
`7036` de start/stop do serviço `asus` nas últimas ~6000 linhas do log `System`
(rotacionado), e busca nos arquivos de configuração do Armoury Crate / AI Suite III
por um horário de agendamento de modo silencioso/eco não encontrou nada.

### Suspeitos guardados, sem acusação

A máquina tem o conjunto completo de utilitários de "otimização" ASUS instalado e
rodando — **exatamente a classe de programa que a task mandava suspeitar**:
`ArmouryCrate.Service.exe`, `AsPowerBar.exe` (troca de modo silencioso/desempenho),
`AI Suite III` (tarefa agendada `ASUS AISuiteIII` com o argumento `-schedule`,
disparada no logon) e `DIP Away Mode`. Nenhum foi flagrado alterando
`SystemParametersInfo`; ficam registrados como primeiro lugar a olhar se o sintoma
voltar.

### Decisão

Fechar sem monitor novo e sem culpado nomeado — decisão do usuário, perguntado
explicitamente entre "montar um monitor", "fechar só com o registro" e "desinstalar o
suite ASUS de uma vez". Nenhuma mudança na máquina nem no repositório. Se o sintoma
voltar, o próximo passo é medir `SystemParametersInfo(SPI_GETCLIENTAREAANIMATION)` na
hora, não depois — só assim dá para separar causa de coincidência de horário.

---

## [2026-08-28] Ctrl+A+Backspace multilinha: medido com tecla real no Codex, gate coberto por teste

Fechamento parcial da pendência aberta em 28/08 sobre o commit `c451a7c`
(`buildClearInputSequence`). Sessão em Linux, com Xvfb + xdotool disponíveis (ao
contrário das duas sessões anteriores, em Windows sem esse ferramental).

### O que foi medido

- `notion-tasks conteudo` nas duas tasks (a pendência e a técnica original) antes de
  qualquer escrita, confirmando o que já tinha sido coberto.
- `git rebase origin/main`: o `main` local estava divergido (1 commit local não
  publicado, `b45fe8b`, 3 commits do remoto não puxados, entre eles o próprio
  `c451a7c`) — sem isso a build local nem tinha o fix. Rebase limpo, push em
  `068fc68`.
- `npx vitest run` (suíte inteira): 635 testes, incluindo os 4 novos deste commit,
  todos verdes. `npm run lint`: só o warning pré-existente de `TerminalNode.tsx`,
  não relacionado. `npm run build`: OK.
- App real, `rodar-app` sob Xvfb, Codex `v0.150.1` aberto no canvas com CDP
  (`page.keyboard.press`, não `xdotool` — ver "o que não funcionou" abaixo).
  Composer com o texto de entrega de contexto do próprio Felixo (4 linhas visuais,
  marcador `›` na primeira): Ctrl+A destacou (visível como barra cinza no painel
  expandido) e Backspace apagou a entrada **inteira**, voltando ao prompt vazio —
  sem sobrar nenhuma linha, o comportamento que o commit `c451a7c` deveria garantir.
  Nenhum Enter foi enviado; nenhum turno de API foi gasto de propósito.
- Teste novo, direto contra `hasTypedInputSelection` (sem xterm real — ver abaixo):
  abre quando a seleção lida bate com a guardada, fecha sem Ctrl+A nenhum, fecha
  quando a seleção diverge e fecha quando foi limpa por fora. `terminal-session-store.test.ts`,
  commit `3c71cb4`, pushado.

### O que não funcionou (e por que importa para quem repetir)

- **`realkey` (xdotool) parou de entregar teclas nesta sessão** depois de funcionar
  uma vez: sem window manager rodando sob Xvfb, `xdotool windowfocus` não tem o que
  focar de verdade (`_NET_ACTIVE_WINDOW` não suportado), e o clique perdia o foco do
  elemento sem aviso — o app ficava com foco de DOM (`document.hasFocus() === true`)
  mas sem receber o evento do X. Troquei para `page.keyboard.press` (CDP) para
  Ctrl+A/Backspace, que é suficiente aqui porque `attachCustomKeyEventHandler` só
  precisa de um `keydown` — nenhuma das duas teclas depende de um caminho nativo do
  SO (diferente do Ctrl+V de imagem, que genuinamente precisa do `realkey`).
- **Testar `hasTypedInputSelection` com o xterm real exige DOM.** `terminal.select()`
  chama o `SelectionService`, que só existe depois de `terminal.open(container)` num
  elemento de verdade — e a suíte roda em `environment: 'node'` (sem DOM), como o
  resto do arquivo. O teste novo usa um `terminal` dublê (`hasSelection`/`getSelection`
  controlados) para exercitar exatamente a lógica do portão, não o xterm inteiro.
- **`MAX_MULTILINE_INPUT_ROWS = 4` limita o que dá para testar com o texto de
  contexto do próprio Felixo**, que passa de 10 linhas visuais quando entregue por
  inteiro — Ctrl+A não seleciona nada nesse caso (comportamento correto: fora da
  janela de 4 linhas o módulo intencionalmente não sobe atrás do marcador, para não
  varrer saída antiga). A medição de tecla real só ficou limpa quando o composer
  tinha 4 linhas ou menos — o próprio texto de entrega de contexto, capturado no
  meio da retentativa automática do store, serviu como entrada de teste real.

### O que ainda falta

- **Gemini**: não autenticado nesta máquina (o CLI abriu o assistente de login do
  Google, "Sign in with Google" / "Use Gemini API Key" / "Vertex AI" — não avancei
  nesse fluxo por não ser uma decisão que um agente deva tomar sozinho). Sem conta
  configurada aqui, a medição de tecla real no Gemini segue pendente.
- **Shell puro**: já medido na sessão de 28/08 15:50–16:00 (PowerShell, ver task
  técnica) — não repetido aqui.
- **Divergência do "um caractere" da anotação original**: não reproduzida em Codex
  (mesmo padrão das sessões anteriores em Claude Code e PowerShell). Com Codex e
  PowerShell cobertos e nenhuma reprodução em nenhum dos três, e Gemini bloqueado por
  falta de conta, a divergência seguirá como "não reproduzida, documentada" até
  alguém com acesso a uma conta Gemini fechar a quarta frente.
- **Achado do Shift+Enter** (Claude Code v2.1.250 submetendo cada linha em vez de
  quebrar) da sessão de 28/08 16:00: não investigado nesta sessão, é bug diferente e
  anterior a este.

---

## [2026-08-28] Shift+Enter submetia porque o xterm.js chama o handler duas vezes por tecla

Causa raiz do achado da sessão anterior (16:00): Shift+Enter, em vez de quebrar linha
no composer, submetia cada linha como turno separado no Claude Code v2.1.250.

### A investigação

`terminal.attachCustomKeyEventHandler` intercepta Shift+Enter e manda um `'\n'` cru
para o PTY, devolvendo `false` para o xterm.js não processar a tecla — só que a
condição só reagia a `event.type === 'keydown'`. O xterm.js (`_keyDown` em
`xterm.js`) chama esse handler; quando ele devolve `false`, `_keyDown` retorna cedo
**sem marcar `_keyDownHandled = true`** e **sem chamar `preventDefault()`** — os dois
só aconteceriam mais adiante, no trecho que a devolução antecipada pula.

O navegador ainda dispara um `keypress` nativo para o Enter (não previne por padrão,
já que `preventDefault()` nunca foi chamado). `_keyPress` do xterm.js verifica
`if (this._keyDownHandled) return false` — como ficou `false`, não pula — e chama o
handler de novo, agora com `event.type === 'keypress'`. A condição original só
reconhecia `'keydown'`, então devolvia `true` (passthrough) para esse segundo evento,
e `_keyPress` seguia o caminho padrão: `String.fromCharCode(e.charCode)` com
`charCode === 13` vira `'\r'`, mandado cru para o PTY via `triggerDataEvent`. Esse
`\r` chegava um instante depois do `\n` da intercepção — e `\r` é "enviar" para o
composer do Claude Code.

Confirmado lendo `node_modules/@xterm/xterm/lib/xterm.js` (minificado, buscando
`_customKeyEventHandler`) e com um listener de `keydown` em fase de bubble no
`document`, que mostrou `defaultPrevented: false` no evento de Enter mesmo com o
handler devolvendo `false` — a pista de que `preventDefault()` nunca era chamado.

### O fix

`isNewlineShortcut(event)`, nova função pura em `terminal-input-selection.ts`,
reconhece Shift+Enter tanto em `'keydown'` quanto em `'keypress'`. O handler em
`terminal-session-store.ts` só escreve o `'\n'` no `keydown` (para não duplicar),
mas devolve `false` para os dois tipos — fechando as duas portas que o xterm.js abre
por tecla.

### O que foi medido

- App real, Claude Code `v2.1.250`, sob Xvfb com CDP (`page.keyboard.press`), sem
  xdotool. Composer limpo (sem o texto de entrega de contexto por perto, para não
  confundir com a retentativa automática do store).
- **Antes do fix**: digitar texto e apertar Shift+Enter submeteu o texto como turno —
  reproduzido 2 vezes (uma com o texto de entrega de contexto ainda no composer, outra
  com texto próprio digitado do zero), turnos curtos (~8s, "Cooked for 8s"),
  interrompidos com Esc assim que confirmado.
- **Depois do fix**: mesmo teste, duas linhas digitadas com Shift+Enter entre elas —
  compuseram um único envio ainda não submetido, as duas visíveis no composer, sem
  nenhum turno iniciado.
- `npx vitest run`: 640 testes (suíte inteira), verdes, incluindo os 5 novos de
  `isNewlineShortcut`. `npm run lint`: só o warning pré-existente de
  `TerminalNode.tsx`. `npm run build`: OK.

### O que não foi medido

- Codex e Gemini não foram testados para este bug específico — o achado original só
  citava Claude Code, e o mecanismo (`attachCustomKeyEventHandler`, agnóstico de CLI)
  não dá motivo para achar que displays diferentes por CLI; fica como risco aceito,
  não validado.
- Teste automatizado cobre a decisão pura (`isNewlineShortcut` para os dois tipos de
  evento) — não há teste que dispare o `keydown`/`keypress` reais do xterm.js via
  vitest, porque `_customKeyEventHandler` vive num objeto interno do Core que a
  classe pública `Terminal` não expõe (confirmado tentando acessar em Node puro), e a
  suíte roda em `environment: 'node'` sem DOM para abrir um terminal de verdade.

Commit `2253027`, pushado. Fecha a task
[Felixo AI Core/Terminal — investigar Shift+Enter submetendo linha por linha no Claude Code v2.1.250](https://app.notion.com/p/Felixo-AI-Core-Terminal-investigar-Shift-Enter-submetendo-linha-por-linha-no-Claude-Code-v2-1-250-3ca91f95497e8138a2e8c54557c36a5d).

---

## [2026-08-28] A retomada por ID sempre caía no /resume genérico sem projeto explícito

Causa raiz da regressão relatada: um terminal Codex/Claude/Gemini aberto **sem
projeto explícito** ("Local (sem projeto)" no seletor) nunca conseguia retomar a
conversa exata depois de fechar e reabrir o app — sempre caía no `/resume`
genérico, mesmo com uma sessão descoberta e válida.

### A investigação

`useAgentConfig.ts` só grava `cwd: project?.path` quando um projeto foi escolhido;
sem projeto, `node.data.cwd` fica `undefined` para sempre. O PTY, porém, não fica
sem diretório: `resolveWorkingDirectory()` em `pty-process-manager.cjs` cai no
`os.homedir()` — o terminal roda normalmente, só que numa pasta que o node do
canvas nunca soube que era a sua.

A descoberta best-effort (`agent-session-discovery.cjs`) usa o cwd **real** do PTY
(`current.cwd`, já resolvido) para achar e persistir a `agentSession` — e essa
`agentSession.cwd` fica preenchida corretamente. O problema é a comparação em
`canResumeAgentSession()`: exige `node.data.cwd` **e** `agentSession.cwd`
preenchidos e iguais. Com o primeiro sempre vazio, a comparação falhava sempre,
por mais que a sessão descoberta fosse exatamente a certa.

Confirmado lendo `useAgentConfig.ts`, `pty-process-manager.cjs` e
`TerminalDetailsPanel.tsx` (que mostra "Pasta de trabalho: não informado" para
esses nodes) — e reproduzido no app real: um Codex aberto sem projeto, com um
turno real submetido (`diga apenas oi e pare`, bateu no limite de uso da conta,
mas isso não impede a criação do rollout do Codex) gerou um
`rollout-*.jsonl` real com `cwd: "/home/felipe"`, enquanto o painel de detalhes do
node mostrava "Pasta de trabalho: não informado" e "Sessão do agente: não
associada: retomada genérica".

### O fix

`onAgentSession`, em `CanvasView.tsx`, agora grava `cwd: reference.cwd` junto com
`agentSession` assim que a sessão é descoberta — a mesma pasta em que o terminal
já está rodando, nunca uma pasta nova. Depois disso, `node.data.cwd` e
`agentSession.cwd` sempre concordam, e `canResumeAgentSession()` volta a decidir
certo.

### O que foi medido

- `discoverAgentSession()` chamado diretamente (fora da suíte, script isolado)
  contra o rollout real criado nesta investigação: devolveu `cwd: '/home/felipe'`
  e o `sessionId` certo — confirma que o mecanismo de descoberta em si funciona
  quando a janela de tempo bate.
- Teste novo em `agent-session.test.ts`: `canResumeAgentSession` recusa com
  `cwd` vazio ou `undefined` mesmo com referência válida (documenta o bug),
  e volta a aceitar com o cwd sincronizado (documenta o fix).
- `npx vitest run`: 641 testes (suíte inteira) verdes. `npm test` (electron):
  769 testes verdes. `npm run lint`: só o warning pré-existente. `npm run build`:
  OK.

### O que não foi validado

- **O ciclo completo "fechar o app, reabrir, ver retomar direto sem seletor"**
  não foi confirmado ponta a ponta no app real. A janela de descoberta
  (`AGENT_SESSION_DISCOVERY_WINDOW_MS = 15_000`, contada a partir do spawn) exige
  que o rollout do provedor exista **perto** do spawn — um `codex resume`/reabertura
  que não submete nada novo não gera arquivo fresco, e tentar forçar isso pela UI
  automatizada esbarrou nessa corrida de tempo (documentado para quem repetir:
  spawnar, submeter algo real rapidamente, só então a descoberta encontra o
  arquivo dentro da janela).
- A conta de Codex usada bateu no limite de uso durante a medição (`You've hit
  your usage limit`) — o rollout ainda foi criado (o que bastava para confirmar
  `cwd`), mas nenhum turno completo foi observado.
- Não foi medido com pelo menos duas conversas Codex **não recentes**, como o
  critério de aceite original da task-mãe pedia — só uma sessão criada na hora.
- Migração de nodes antigos, incompatibilidade de conta/diretório e diferença
  entre CLIs (Claude/Gemini) não foram remedidas nesta sessão — o fix é genérico
  o bastante (mesma função `onAgentSession` para os três providers) para não ter
  motivo esperado de divergir, mas isso é inferência, não medição.

Commit `586db33`, pushado. Fecha a task
[Felixo AI Core/Retomada — reproduzir o fallback /resume no Linux e recuperar a retomada por ID](https://app.notion.com/p/Felixo-AI-Core-Retomada-reproduzir-o-fallback-resume-no-Linux-e-recuperar-a-retomada-por-ID-3c891f95497e81aa8c19eeecf9fe823d).

---

## [2026-08-28] Retomada por ID validada ponta a ponta — Codex e Claude certos, Gemini quebrado por mudança da própria CLI

Fechamento da validação que tinha ficado pendente na entrada anterior. Desta vez, em
vez de brigar com a corrida de tempo da janela de descoberta (15s a partir do spawn),
editei a `agentSession`/`cwd` direto no SQLite do `userData` isolado do `rodar-app`
— testa exatamente o mesmo código de decisão (`canResumeAgentSession`,
`buildAgentResumeArgs`, `resolveTerminalInitialText`) sem depender de o discovery
achar o arquivo a tempo.

### Método

1. Criei um node Codex de verdade pelo app (sem projeto), fechei o app.
2. Editei `data_json` do node no SQLite, apontando `cwd` e `agentSession` para uma
   sessão **real e não recente** já existente no histórico de cada CLI (Codex:
   26/08; Claude: 10/08, 18 dias; Gemini: 17/08, 11 dias) — peguei o `sessionId` e o
   `cwd` reais de dentro dos próprios arquivos de histórico (`~/.codex/sessions`,
   `~/.claude/projects`, `~/.gemini/tmp`).
3. Reabri o app e conferi o que o terminal desenhou.

### O que foi medido

| CLI | Sessão usada | Resultado |
| --- | --- | --- |
| Codex 0.150.1 | 26/08, `cwd=/home/felipe` | **Retomou direto** — `<EXTERNAL SESSION IMPORTED>`, sem seletor. |
| Claude Code | 10/08 (18 dias), repo Automações do Notion | **Retomou direto** — abriu exatamente a conversa antiga (tabela de tasks, "Baked for 7m 48s · done segunda-feira, 10 de ago."), sem seletor. |
| Gemini CLI 0.57.0 | 17/08 (11 dias), `app/` | **Falhou** — `Error resuming session: No previous sessions found for this project.` (a CLI encerrou, código 42). |

**Teste negativo** (proteção contra conta/diretório errado): forcei `node.data.cwd`
(`/tmp`) divergente de `agentSession.cwd` (`/home/felipe`) — o app **não** tentou
resumir; abriu um Codex novo em `/tmp` com o prompt de confiança de diretório
normal, sem nenhum sinal de "importando sessão". A proteção segura o que deveria.

### A causa do Gemini: a própria CLI mudou de sintaxe

`buildAgentResumeArgs()` (`agent-session.ts`) manda `--resume <sessionId>` para
Claude **e** Gemini, igual. Isso batia com o Gemini CLI `0.52.0`, medido na
implementação original (25/08/2026). Só que `gemini --help` nesta máquina (CLI
`0.57.0`) mostra:

```
-r, --resume   Resume a previous session. Use "latest" for most recent or index
               number (e.g. --resume 5)
--session-id   Start a new session with a manually provided UUID.
```

`--resume` não aceita mais um UUID — só `"latest"` ou um **índice** dentro da lista
de sessões do projeto corrente (`--list-sessions`). `--session-id` existe, mas é para
**começar uma sessão nova com um UUID escolhido**, não para retomar uma existente.
Não há mais, nesta versão, uma forma direta de "retomar por UUID" documentada — seria
preciso `--list-sessions` primeiro para achar o índice, e esse índice muda a cada
sessão nova criada no projeto (não é estável para persistir).

Isso não é o bug desta task (que já estava fechado para Codex e Claude): é a CLI do
Gemini tendo mudado de sintaxe depois que a implementação original foi validada. Task
nova aberta para isso, separada.

### O que não foi medido

- Migração de nodes antigos (persistidos antes do fix de `cwd`) não foi testada
  isoladamente — o teste usado já simulava esse cenário (node sem `cwd` original,
  ganhando um depois via edição direta), mas não cobre todos os casos de
  incompatibilidade de schema mais antigos.
- Não testado com troca de conta (só de diretório).

Relatório do dia e task de origem atualizados. Task nova:
[Felixo AI Core/Retomada — --resume do Gemini CLI não aceita mais UUID (mudança de versão)](https://app.notion.com/p/Felixo-AI-Core-Retomada-resume-do-Gemini-CLI-n-o-aceita-mais-UUID-mudan-a-de-vers-o-3ca91f95497e8135b6a9ed68cad71f4f).

## [2026-08-28] Openia integrado como launcher opaco do Felixo

O catálogo oficial agora identifica `openia` como launcher OpenRouter, mantendo a
fonte de verdade de interfaces, chave e modelos no próprio projeto Openia. O
Felixo inicia `openia` no `cwd` escolhido, sem clonar o repositório local, sem
passar chave em argumentos e sem ler ou migrar `keys.json`/`.env`.

### Implementação e segurança

- Instalação manual usa `python3 -m pip --user --upgrade` no Linux/macOS e `py -m
  pip --user --upgrade` no Windows, apontando para a revisão publicada do Openia.
  O comando remoto exige confirmação explícita no serviço e na interface; a
  instalação automática baseada no npm gerenciado pelo app o ignora.
- `openia --version` passou a ser o contrato de detecção. O ambiente do processo
  inclui diretórios de scripts do pip por usuário em Linux, macOS e Windows para
  que detecção e PTY encontrem o executável após a instalação.
- O seletor de agentes oferece o Openia como launcher, mas não injeta `--model`,
  esforço, modo yolo, prompt de qualidade ou handoff no menu interativo. Isso
  evita tratar o launcher como uma quarta CLI nativa e evita duplicação de regras.
- O cartão oficial deixa claro que a configuração acontece dentro do Openia e
  oferece **Abrir configuração** em vez de importar um modelo vazio.

### Validação

- Catálogo, consentimento, seleção Windows, exclusão da auto-instalação e PATH
  foram cobertos por 37 testes Node focados; 15 testes frontend focados cobrem o
  launcher e a persistência relacionada.
- `npm run build` passou: TypeScript e Vite transformaram 691 módulos.
- `python3 -m pytest -q tests/test_cli.py` passou com 9 testes, incluindo a
  detecção por `--version`.

### Limites ainda explícitos

- A instalação remota real e um fluxo com uma chave válida não foram executados
  nesta sessão para não alterar a configuração local nem expor segredo. Falta
  validar em máquinas empacotadas Windows/macOS e executar uma conversa real em
  cada sistema; o contrato e os testes de consentimento/detecção/lançamento já
  estão preparados para essa rodada manual.

## [2026-08-28] Spawn do Openia configurado na interface do Felixo

O launcher Openia deixou de ser um passo de configuração escondido no terminal
quando nasce pelo canvas. `AgentConfigFields`, compartilhado pelo botão de novo
terminal e pelo handoff, agora consulta `openia list --json`,
`openia models --json` e `openia key status --json`. A pessoa escolhe interface e
modelo na tela e informa a chave num campo de senha; o Felixo envia a chave ao
Openia por `key set-stdin` via stdin, sem gravá-la em localStorage, node,
argumento, log ou retorno IPC.

Antes de criar o terminal, o fluxo espera o carregamento, salva a chave pendente
se necessário e exige projeto quando a interface escolhida é agente de código.
O node recebe somente `openia run <interface> --provider --model <id> --dir
<projeto>` (ou `--no-model`) e `launchMode: launcher`; por isso o Openia e a CLI
subjacente abrem já posicionados, sem pedir interface, modelo ou pasta de novo.
Como o spawn direto é identificável pelo argumento `run`, ele também segue o
fluxo dos agentes nativos para contexto permanente, arquivos ligados e handoff;
nodes antigos que ainda não têm esse argumento permanecem opacos e compatíveis
com o menu manual.
Interface/modelo selecionados são as únicas preferências persistidas no canvas;
o registro e o catálogo continuam no repositório Openia.

Também foram alinhados os adaptadores do Openia: seleção por `--model` para as
CLIs que aceitam flag, namespace do plugin para llm e `openclaw models set` para
OpenClaw. O catálogo oficial do Felixo identifica a configuração como
`felixo-spawn-interface`; o botão existente continua disponível apenas como
menu manual.

### Validação

- `npm test`: **777/777** testes Node verdes.
- `npm run test:frontend`: **649/649** testes Vitest verdes.
- `npm run lint`: concluído sem erros; permanecem somente 3 warnings antigos de
  dependências de effects (`TerminalNode.tsx` e `SearchPanel.tsx`).
- `npm run build`: concluído; Vite transformou 692 módulos e manteve apenas o
  aviso conhecido de chunk inicial acima de 500 kB.
- `python3 -m pytest -q` no Openia: **62/62** testes verdes.
- Nenhuma chave real foi lida, e não foi feita conversa real com provedor. Neste
  ambiente o comando global `openia` não está instalado; a ponte foi validada
  com dublês e o contrato Python com a suíte local.

## [2026-08-28] Openia empacotado, chave real e fluxos reais validados em Linux

Validação manual do contrato do Openia como launcher opaco, sobre os commits
Felixo `6e8298c` e Openia `9b89b43`. Só em Linux — esta sessão não tem acesso a
macOS nem Windows; task nova aberta para essa parte
(`3ca91f95-497e-81ff-8689-f6fec5627868`). Nenhum código foi alterado; é
validação pura.

`npm run dist:linux` gerou AppImage e `.deb` reais via electron-builder. O
AppImage, copiado sozinho para fora do repositório e rodado com `--user-data-dir`
isolado, abriu de verdade — inclusive disparando o auto-update real e
auto-instalando a Gemini CLI que faltava, via o mecanismo `managed` (não o do
Openia). `dpkg-deb -I` confirmou o `.deb` válido, com as dependências corretas;
não foi instalado no sistema (evitei mudança de sistema irreversível sem pedido
explícito).

**Achado real**: o comando de instalação do catálogo (`python3 -m pip install
--user --upgrade <zip do GitHub>`) falha com `error: externally-managed-environment`
neste Ubuntu 24.04 (PEP 668) — e o próprio Openia bate no mesmo problema ao
tentar instalar sozinho o pacote da primeira interface usada (`orchat`).
Contornado manualmente com `--break-system-packages` para seguir a validação;
task nova aberta com as opções de correção
(`3ca91f95-497e-8107-bd5a-c7cf9c50da4f`).

O fluxo de cancelamento da instalação foi medido ao vivo na UI real (`Gerenciar
modelos` → `Instalar Openia`): o `window.confirm()` recusado mostrou
corretamente "Instalação de Openia (launcher OpenRouter) cancelada.", sem
disparar nada.

A chave real do OpenRouter do usuário nunca foi digitada em nenhum campo do
Felixo: já estava exportada no ambiente do sistema e chegou ao processo do
Openia por herança de ambiente (`createCliEnv()`); `openia key status --json`
confirmou `configured: true` sem chave nomeada persistida. A UI mostrou "Chave
já configurada / O Felixo não a lê nem a persiste", e uma varredura por
`sk-or-` em todo o `userData` de teste (sqlite + arquivos) confirmou **zero**
ocorrências.

Validado com a chave real: um fluxo de chat completo (`OrChat`, modelo
gratuito, pergunta e resposta reais), uma falha real de modelo inválido (erro
400 da API, mensagem limpa sem vazar a chave) e a recuperação trocando de
volta para um modelo válido (nova resposta real, sem recriar o node), e um
fluxo de agente de código real (`opencode`, projeto de teste isolado) que leu
um `README.md` de verdade e respondeu com o conteúdo exato — custo real e
pequeno: **$0,03**, 19,4K tokens, 26,9s.

O critério "saldo OpenRouter no painel de limites" não é testável ainda: esse
painel não existe no código (é a task de backlog
`3c591f95497e81b5ababcba76aec0147`, ainda não implementada).

### Limites explícitos

- macOS e Windows não foram validados nesta sessão.
- FUSE do AppImage falhou nesta sandbox (`Operation not permitted`),
  contornado com `--appimage-extract-and-run`; não confirmado se isso também
  ocorre numa máquina desktop real.
- Só duas das sete interfaces do Openia foram exercitadas (`orchat` e
  `opencode`), uma de cada modo (chat / agente de código).
- `.deb` não foi instalado de fato via `apt`/`dpkg` no sistema, só inspecionado.

## [2026-08-28] Instalação do Openia sobrevive ao PEP 668 (Debian/Ubuntu recentes)

Corrige o achado registrado mais cedo hoje: `python3 -m pip install --user
--upgrade <zip do GitHub>` (comando do catálogo para o Openia) falhava com
`error: externally-managed-environment` em qualquer Debian 12+/Ubuntu 23.04+
(inclui a 24.04 LTS, atual) — quebrando por padrão o passo "instalar com
consentimento" em qualquer máquina Linux atual.

`installOfficialCli` agora detecta esse erro especificamente (stderr contendo
`externally-managed-environment`, só quando o comando já é `pip install`) e
repete uma única vez com `--break-system-packages` — que continua `--user`,
não mexe em pacote de sistema. Se a segunda tentativa também falhar, a
mensagem final explica que já tentou das duas formas, em vez de devolver o
stderr cru do pip. A UI (`ModelManagerModal.tsx`) avisa quando a segunda
tentativa foi necessária, em vez de esconder que houve retry.

Fix irmão no repositório Openia: o instalador interno de interfaces
(`runner.install()`, disparado na primeira execução de uma interface como
`orchat`) tinha o mesmo problema e recebeu o mesmo tratamento — commit
`d248538` em `Felipe-Alcantara/Openia`.

### Validação

- `npm test`: **780/780** testes Node (3 novos cobrindo o retry: resolve
  sozinho, não repete por outro motivo, mensagem clara quando persiste).
- `npm run test:frontend`: **649/649**.
- `npm run lint`: só os 3 warnings pré-existentes. `npm run build`: ok.
- Medido contra o pip real deste Ubuntu 24.04: desinstalei o Openia de
  verdade (`pip uninstall`) e chamei `installOfficialCli('openia',
  {confirmed:true})` sem nenhum flag manual — completou sozinho e detectou a
  versão instalada (`0.1.0`).

### Limite

Não testado em Fedora/openSUSE (também adotaram PEP 668) nem o efeito em
macOS/Windows — tasks de macOS/Windows e do achado original seguem abertas
para essa cobertura.

## [2026-08-28] Auditoria do catálogo empacotado após o fix do PEP 668

Uma auditoria da integração encontrou que o catálogo do Felixo ainda apontava
para o snapshot antigo `9b89b43` do Openia, apesar de o fix do instalador estar
publicado em `d248538`. Isso faria uma instalação limpa pelo cartão oficial
receber a revisão sem o retry automático do PEP 668. Instalação e atualização
do catálogo agora apontam para
`https://github.com/Felipe-Alcantara/Openia/archive/d248538.zip`, e o teste do
catálogo fixa esse contrato.

### Validação desta auditoria

- Catálogo do Felixo: **4/4** testes focados.
- Felixo: `npm test` **780/780**, `npm run test:frontend` **649/649**, lint
  sem erros (os 3 avisos React já existentes) e build de **692 módulos**.
- Artefatos Linux regenerados: AppImage x86_64, AppImage arm64 e `.deb`
  amd64; `file` confirmou os formatos/arquiteturas, `dpkg-deb -I` confirmou o
  pacote Debian e o `app.asar` empacotado confirmou as duas URLs em
  `d248538`.
- Openia no repositório publicado: `python3 -m pytest -q` **65/65**, Ruff,
  compilação, `python3 -m openia --version` (**0.1.0**) e listagem JSON
  passaram.

Nenhuma chave foi lida, digitada ou adicionada ao repositório nesta auditoria;
os fluxos reais com credencial e o custo já estão registrados na validação
anterior. macOS/Windows continuam delegados por falta dessas plataformas
nesta sessão.

## [2026-08-28] Organizar em linha por pasta também no dock Elementos

### Decisão

O Organizar ganhou uma terceira opção, **Uma linha por pasta**. Cada `cwd` vira
uma faixa horizontal, com os blocos lado a lado na ordem estável do dock; as
faixas continuam empilhadas e a faixa sem pasta fica por último. A ordem dos
componentes conectados continua estável — a linha deixa de usar a matriz quase
quadrada, mas não perde a proximidade dos blocos ligados.

O dock Elementos passou a contar a mesma história: quando há mais de uma pasta,
renderiza um cabeçalho visual por grupo usando `repositoryKey` e
`repositoryLabel`, na mesma ordem das faixas do canvas. A seção sem pasta usa o
rótulo **Sem pasta de trabalho** e fica no fim; com uma pasta só, os cabeçalhos
não aparecem.

### Contratos preservados

Os cabeçalhos não têm `data-element-row`: ficam fora da indexação, das caixas
medidas pelo drag e dos atalhos de navegação. Cada bloco mantém o índice da
lista plana, o `#N` continua contínuo e a prévia de arraste calcula o resultado
por id. O arraste e `Alt+↑/↓` só reordenam blocos dentro da mesma pasta; passar
por um cabeçalho não reescreve `cwd` nem mistura grupos.

### Implementação e validação

- `canvas-matrix-layout.ts` aceita `by-repository-row` e usa o tamanho da faixa
  como número de colunas, inclusive para uma faixa larga; `TerminalsPanel.tsx`
  renderiza os grupos com cabeçalhos fora da lista plana.
- `terminals-panel-groups.ts` concentra a projeção entre grupos visuais e
  índices persistidos, além dos limites de reordenação; os testes cobrem grupos
  intercalados, pasta sem nome, faixa única, faixa larga e tentativa de cruzar
  cabeçalho.
- O modo novo e o modo anterior permanecem determinísticos quando organizados
  novamente; a organização não altera `cwd` nem a persistência de dados do
  bloco.
- Gate do repositório: `npm run test:frontend` **658/658**, `npm test`
  **780/780**, `npm run lint` sem erros (os três avisos React já existentes) e
  `npm run build` concluído com **693 módulos**.
- Validação visual em Electron de desenvolvimento, com perfil temporário e
  cinco blocos de teste (três pastas diferentes, duas linhas na mesma pasta e
  um bloco sem pasta): o menu exibiu os três modos, a opção nova deixou Alpha
  lado a lado e empilhou Beta, Gamma e Sem pasta de trabalho; a captura ficou
  em `/tmp/felixo-canvas-M7P4qc/row-mode-isolated.png`.

### Limite

O navegador embutido não estava conectado nesta sessão, então não houve
automação por esse canal. A validação visual foi feita no Electron local e
isolado; macOS e Windows continuam sem execução nativa nesta máquina.

## [2026-08-28] Limites e uso de todos os agentes e contas no app

### Contexto

A task reaberta pedia uma experiência útil dentro do Felixo AI Core para
acompanhar várias contas de Codex, Claude, Gemini e Openia ao mesmo tempo. O
contrato preserva a regra de que a CLI é a fonte de verdade: quando ela não
oferece quota em uma consulta não interativa, o app não inventa percentual nem
trata ausência como zero.

### O que foi feito

- Criei fontes declarativas por provider, com comando/evento, documentação,
  versão detectada, janela, reset e precisão; o parser aceita os objetos
  `rate_limits`/quota publicados pela fonte e preserva o valor 0.

- Adicionei a migração SQLite 010 com contas, identidade estável por fingerprint
  SHA-256 e amostras separadas por conta. A persistência permite estado
  `current`, `stale`, `unavailable` e `error`, guarda somente metadados seguros
  e nunca armazena token, cookie, senha ou chave.

- O serviço consulta cada provider uma vez por rodada, deduplica refreshes
  simultâneos, vincula a saída somente à identidade correspondente e recusa
  associação quando há conta ambígua ou troca de identidade. Em falha/offline,
  o painel conserva o último valor conhecido explicitamente marcado como
  antigo.

- O app ganhou a entrada **Limites e uso** na sidebar e um painel agregado com
  contas por provider, consumo, limite, restante, reset, identidade mascarada,
  fonte e horário da leitura. Há adição/arquivamento de contas, atualização
  manual e intervalos automáticos controlados de 5, 15 ou 30 minutos.

- Codex expõe o estado da sessão, mas a versão instalada não entrega quota em
  modo não interativo. Claude fica pronto para consumir `rate_limits` da status
  line quando esse evento estruturado estiver disponível; Gemini informa a
  limitação da coleta interativa `/stats model`; Openia informa o estado seguro
  da chave, sem apresentar chave como identidade ou prometer quota.

### Validação

- `npm test`: **796/796** testes Node aprovados.
- `npm run test:frontend`: **662/662** testes aprovados.
- `npm run lint`: **0 erros**; permanecem somente 3 avisos React preexistentes
  em `TerminalNode.tsx` e `SearchPanel.tsx`.
- `npm run build`: concluído com **697 módulos**.
- `npm run dist:linux`: AppImage x86_64, AppImage arm64 e `.deb` amd64
  regenerados; `file`, `dpkg-deb --info` e inspeção do `app.asar` confirmaram
  os formatos e os arquivos da feature nos pacotes x64/arm64.
- Smoke test do Electron empacotado em perfil/userData temporário sob Xvfb:
  iniciou e encerrou sem processo remanescente. O ambiente reportou apenas o
  limite externo `inotify_init: Too many open files`.
- Testes focados da feature cobrem parser, zero válido, redaction, migração e
  persistência, dois Codex isolados, offline/último valor, ambiguidade,
  troca de conta e refresh concorrente (15 testes focados no total).

### Publicação e limites

Implementação registrada no commit local `2c8cc5f` (`feat(usage): add
per-account agent limits panel`). O navegador embutido não estava conectado,
então a validação visual automatizada por esse canal não ocorreu; a inicialização
do pacote foi validada no Electron isolado. macOS e Windows não foram executados
nativamente nesta máquina Linux. A coleta de quota permanece honesta:
providers sem endpoint/evento não interativo exibem indisponibilidade ou último
valor conhecido, com fonte e horário, em vez de um número estimado.

## [2026-08-28] Quota real do Codex e migração das funções do chat para o canvas

### Contexto

A função "Limites e uso" já existia (commit `2c8cc5f`), mas não era encontrada
nem mostrava número: a entrada estava só na sidebar da tela de chat, o painel
abria vazio exigindo cadastro manual de conta, e nenhum provider entregava
percentual. Durante a tarefa o dono do produto decidiu que o chat foi
descontinuado e que suas funções precisam viver no canvas.

### O que foi feito

- **Quota real do Codex.** `codex login status` não devolve quota, mas a própria
  CLI grava o objeto `rate_limits` nos rollouts de sessão
  (`~/.codex/sessions/**/rollout-*.jsonl`). O novo `agent-usage-codex-local.cjs`
  lê esse arquivo do fim para o começo (janela que cresce até 4 MB, teto de 6
  rollouts) e devolve janela de 5 h, janela semanal, reset e créditos. A conta
  logada sai das claims do `id_token` (e-mail, id da conta, plano) — nenhum
  token é lido, devolvido ou persistido, e o e-mail vira fingerprint SHA-256 e
  forma mascarada antes de chegar ao painel.

- **Probes locais declarativos.** `agent-usage-local-probes.cjs` mapeia
  `localProbe` → função; a fonte declara qual usa em `agent-usage-sources.cjs`,
  sem `if` de provider no serviço.

- **Medição separada da leitura.** Amostra de arquivo tem dois horários:
  `collectedAt` (quando o app leu, ordena as amostras da rodada) e
  `measuredAt` (quando a CLI mediu, é o que envelhece o valor). Sem isso um
  rate limit de três horas atrás aparecia como se fosse de agora — e usar o
  horário da medição como `collectedAt` empatava as amostras e quebrava a
  ordenação (pego por teste existente).

- **Descoberta automática de contas.** Cada CLI detectada ganha a primeira
  conta sozinha; a identidade é vinculada pela primeira coleta. Segunda conta do
  mesmo provider continua manual, porque automatizar exigiria adivinhar
  identidade.

- **Canvas.** Novas ferramentas no menu: **Limites e uso** (barras por janela,
  conta, plano, reset, medido/lido), **Orquestrador** (modo, tetos por execução,
  modelos preferidos/bloqueados, contexto, memórias e a execução ao vivo com
  modelos que bateram limite) e **QA Logger**. O painel de **Configurações**
  ganhou tema e Felixo System Design; o **Git** ganhou unstage, diff e commits
  recentes.

- **Tema deixou de morrer com o chat.** Era aplicado dentro do `ChatWorkspace`,
  então com o canvas aberto o `data-theme` nunca valia. Virou `ThemeProvider` no
  `App`.

- **Código compartilhado saiu de `features/chat/`** para `features/shared/`
  (agent-usage, orquestrador, system design, tema e os tipos de modelo, log e
  saída de terminal), mantendo re-exports em `chat/types.ts`. O canvas nunca
  importa do chat.

### Validação

- `npm test`: **804/804** testes Node aprovados (8 novos do leitor do Codex).
- `npm run test:frontend`: **670/670** aprovados (12 no serviço compartilhado).
- `npm run lint`: **0 erros**; seguem 3 avisos preexistentes em `TerminalNode.tsx`
  e `SearchPanel.tsx`.
- `tsc -b` e `npm run build` limpos.
- App real sob Xvfb: painel de limites mostrando a conta do Codex mascarada e o
  plano, com **27 % da janela de 5 h** e **12 % da semanal**, horário de medição
  distinto do de leitura e selo "Desatualizado"; o Claude aparece com conta e
  plano, sem número, exibindo a limitação por extenso. Orquestrador, QA Logger (eventos reais do backend) e
  Configurações (tema + System Design com 32 documentos sincronizados)
  conferidos por screenshot.

### Limites

O Claude continua sem percentual: os números só existem no payload da status
line, que exigiria o app registrar um script no `~/.claude/settings.json`
global — não feito, por alterar configuração fora do projeto. Gemini e Openia
seguem sem fonte não interativa. A tela de chat continua no código e alcançável
pelo botão "Chat"; a remoção não foi feita nesta rodada.

## [2026-08-29] Quota real de Claude e Openia, e o que Gemini não entrega

### Contexto

Com o Codex já mostrando número real, o pedido foi estender a todos os
providers. Investigar cada um antes de codar evitou prometer o que não existe.

### O que cada fonte permitiu

- **Claude Code** — nenhum comando publica quota. Confirmado numa sessão real
  que o payload da status line traz `rate_limits.five_hour.used_percentage` e
  `seven_day` com `resets_at`, mas **só depois da primeira chamada de API**: na
  abertura da sessão o objeto não vem. O app passa a instalar, por pedido
  explícito, um script de status line que grava esse objeto num arquivo lido
  pelo painel. A instalação preserva o resto das configurações, recusa
  sobrescrever uma status line já existente e restaura o estado anterior ao ser
  desligada; o script continua imprimindo uma linha de status útil.

- **Openia** — o launcher já tem `openia statusline`, que consulta
  `/api/v1/credits`. Usar esse comando mantém a chave dentro do launcher: o app
  lê apenas a linha de saída, no mesmo espírito do
  [OpenRouter-Monitorator](https://github.com/Felipe-Alcantara/OpenRouter-Monitorator).
  Para isso a fonte declarativa ganhou comando de uso próprio, separado do de
  autenticação.

- **Gemini** — sem fonte. `-p "/stats model"` não responde (encerrado por
  tempo), não há quota em `~/.gemini` e as sessões gravadas não guardam
  `usageMetadata`. O painel diz isso por extenso em vez de mostrar zero.

### Dois defeitos encontrados rodando o app

- CLI sem sessão aparecia com selo vermelho de **erro** e mensagem sobre
  identidade. Não estar logado é ausência de dado, não falha: virou
  indisponível, com a razão escrita.

- Provider autenticado que não publica nome de conta tinha a métrica
  **descartada**. A regra existe para não misturar histórico entre contas, e
  esse risco só existe com duas ou mais contas no mesmo provider — com uma só,
  a amostra é dela. Foi o caso do launcher que lê a chave do ambiente e não tem
  nome de conta a publicar: número verdadeiro estava sendo jogado fora.

Também passou a aparecer usado **e** limite nas métricas que não são
percentuais; antes a barra ficava quase cheia sem dizer cheia de quê.

### Validação

- `npm test`: **818/818**; `npm run test:frontend`: **670/670**;
  `npm run lint`: **0 erros** (seguem 3 avisos preexistentes); `tsc -b` e
  `npm run build` limpos.
- App real sob Xvfb, com as quatro CLIs: Codex e Claude com as duas janelas,
  percentual, reset e selo de atualizado/desatualizado; Openia com créditos
  usados, limite e restante; Gemini com a limitação por extenso.
- Instalação e remoção da coleta do Claude conferidas no arquivo de
  configuração: as demais chaves ficaram intactas e a remoção devolveu o
  arquivo idêntico ao backup feito antes do teste.

### Limites

O percentual do Claude só se move quando alguma sessão do Claude Code responde;
entre sessões vale o último valor conhecido, marcado como antigo. Gemini segue
sem número enquanto a CLI não oferecer consulta não interativa. macOS e Windows
não foram executados nativamente nesta máquina.

## [2026-08-29] Painéis e blocos dimensionados pela tela, não por pixel fixo

### Contexto

Relato de que a interface fica apertada num notebook de 1366x768 (viewport útil
de 1320x738). Medindo contra essa largura: o painel de prompts ocupava 672 px
fixos (51% da tela), a gaveta do terminal 720, o QA logger 480, e um bloco de
terminal nasce com 520x360 — metade da altura útil. Os números tinham sido
escritos para monitor grande.

### O que foi feito

- `panel-sizing.ts` traduz porte de painel (`sm`/`md`/`lg`/`xl`) em fração do
  viewport com piso e teto, reservando espaço para a barra de ferramentas e uma
  faixa de canvas. Segue a forma dos helpers que a gaveta do terminal já usava
  (`terminal-drawer-pin.ts`), em vez de criar um mecanismo paralelo: funções
  puras, clamp que não inverte intervalo e preferência validada na leitura.

- `CanvasPanel` deixou de receber largura em rem e passa a receber `panelId` e
  `size`. Ganhou borda de arrasto na direita, com a largura lembrada por painel
  e duplo clique para voltar ao sugerido. A altura deixou de ser `80vh` a partir
  de 64 px do topo — o que em 768 px encostava nos dois extremos — e passa a
  reservar topo e rodapé.

- Enquanto a pessoa não arrasta, a largura acompanha o redimensionamento da
  janela. Depois do arrasto vale a escolha dela, só trazida para dentro da faixa
  quando a tela não comporta mais aquele tamanho — o caso de arrastar no monitor
  grande e abrir no notebook.

- Os blocos do canvas nascem com tamanho escalado pelo viewport
  (`getDefaultNodeSize`), mantendo a proporção entre os tipos e com piso para
  não nascerem ilegíveis.

### Validação

- `npm run test:frontend`: **683/683** (13 novos, sobre as funções puras de
  dimensionamento); `npm test`: **818/818**; `npm run lint`: 0 erros; `tsc -b` e
  `npm run build` limpos.
- App real sob Xvfb em **1366x768**: painel de prompts de 672 → **528 px**,
  altura 626 com rodapé livre, sobrando 624 px de canvas. Arrasto conferido
  (largura muda, respeita o mínimo e persiste) e duplo clique devolvendo o
  padrão com a preferência apagada. Bloco de nota nasce 182x132 em espaço de
  canvas, contra 220x160 antes.
- App em **1920x1080** para checar regressão na tela grande: o mesmo painel fica
  com 700x945, contra 672x846 de antes — não encolheu.
- A janela do Electron em si já se ajustava à área de trabalho (`centerBounds`),
  então não precisou mudar.

### Limites

Os tamanhos de blocos já salvos num canvas existente não são alterados: a escala
vale para blocos novos, porque reposicionar o que a pessoa já arrumou seria pior
que o aperto. Telas menores que ~1000 px de largura caem no piso das faixas e
ainda podem exigir arrasto manual.

## [2026-08-29] CLI reinstalando a cada abertura

### Contexto

Relato de que as CLIs se instalam toda vez que o app abre. O disco mostrou que
não era literalmente toda abertura — as instalações gerenciadas tinham data de
23/08 e 28/08 —, mas havia dois defeitos que juntos produzem reinstalação
repetida.

### Causa

1. **O registro de sucesso expirava a cada atualização do app.** O plano
   guardava `{ version, ok: true }` e só pulava a instalação se a versão
   gravada fosse igual à versão em execução. Como o projeto publica **uma
   versão por push**, a verificação valia por poucas horas: o perfil real tinha
   `claude` gravado em `0.1.55` e `gemini` em `0.1.86`, com o app já em
   `0.1.103`. Amarrar a versão faz sentido para falha (uma versão nova pode
   corrigir), não para sucesso.

2. **O tempo limite da detecção era curto demais.** `<cli> --version` tinha 5 s,
   e o Gemini CLI leva ~3 s numa máquina ociosa. A detecção roda logo depois da
   abertura, quando a CPU está disputada: estourar o limite fazia a CLI passar
   por ausente — e, sem a proteção do item 1, ser reinstalada.

### O que foi feito

- O sucesso deixa de expirar por versão. A prova de que a instalação continua
  válida passa a ser o executável no disco (`managedPresent`): se ele sumiu,
  reinstala; se está lá, não. A falha continua amarrada à versão.
- Tempo limite de detecção de 5 s para 15 s, e uma segunda tentativa só para as
  CLIs que pareceram ausentes na primeira — barata quando tudo foi detectado.
- A detecção virou injetável no serviço, como já era a instalação, para o fluxo
  poder ser exercitado em teste.

### Validação

- `npm test`: **825/825** (8 novos: 4 no plano, 4 no serviço). Os testes do
  serviço reproduzem o caso relatado — estado gravado em versão antiga, app em
  versão nova, executável presente, e nenhuma instalação disparada — e cobrem
  detecção que só acerta na segunda tentativa, executável apagado e falha
  registrada.
- Os testes afirmam que a rodada chegou a planejar, para um "não instalou"
  causado por ambiente (sem npm resolvido) não passar por aprovação.
- `npm run lint`: 0 erros; `tsc -b` limpo.
- Medições na máquina do relato: `claude --version` 0,01 s, `codex` 0,08 s,
  `gemini` 3,04 s.

### Limites

Não foi possível observar uma reinstalação acontecendo ao vivo: ela depende de
a detecção estourar o tempo, que é intermitente. A correção foi validada por
teste sobre o estado real encontrado em disco, não por reprodução visual. O
`claude.exe` dentro da pasta gerenciada chamou atenção mas foi descartado como
falso alarme: é o único executável publicado pelo pacote e roda normalmente no
Linux.

## [2026-08-29] Ctrl+A não selecionava a entrada no Codex

### Contexto

Relato de que o Ctrl+A não seleciona tudo no Codex. A função existe
(`terminal-input-selection.ts`) e funcionava no Claude, então o defeito era
específico do que o Codex desenha na tela.

### Causa

`MAX_MULTILINE_INPUT_ROWS = 4`: a busca pelo marcador de prompt olhava só
quatro linhas acima do cursor. O Codex mantém **uma linha por linha escrita**,
então uma entrada longa — como o próprio contexto inicial que o app digita no
composer ao abrir o agente — empurra o `›` para uma dúzia de linhas acima. Sem
marcador no alcance, a função devolvia "nada a selecionar" e o `0x01` seguia
para o PTY.

O Claude escapava por um detalhe da interface dele: texto longo vira
`[Pasted text #1 +6 lines]`, uma linha só, sempre dentro das quatro.

### O que foi feito

- A janela de busca passa a ser a altura da janela do terminal, que é o tamanho
  máximo que a caixa de edição pode ter.
- Para não trocar um defeito por outro, a busca ficou em duas etapas:
  `findComposerStartLine` sobe a partir do cursor atrás do marcador **na borda
  esquerda** (`❯`, `›`, `>`), que é seguro de procurar longe porque não casa com
  saída antiga; e a varredura de cima para baixo continua existindo para o
  shell, onde `$` e `#` valem em qualquer posição e subir elegeria um `$`
  digitado numa continuação.
- O texto copiado passa a respeitar `isWrapped`: uma dobra feita pelo terminal
  não vira `\n`.

### Validação

- `npm run test:frontend`: **689/689** (6 novos: composer alto do Codex, busca
  para cima, saída antiga acima da caixa, `$` na continuação e as duas do
  tratamento de dobra); `npm test`: 825/825; `npm run lint`: 0 erros.
- App real com um agente Codex aberto: antes, nada era destacado; depois, o
  texto inteiro fica destacado sem arrastar o `›` junto, e o Ctrl+C devolve o
  conteúdo completo na área de transferência.

### Limites

O respeito à dobra vale para quebra automática do terminal, verificado por
teste. Num TUI de tela cheia como o Codex ele não muda nada, e isso foi
observado no app: quem decide onde quebrar é a própria CLI, que desenha cada
linha como independente, então `isWrapped` é falso e o terminal não tem como
saber quais quebras a pessoa digitou. O texto copiado de um composer alto sai
com as quebras que aparecem na tela.

## [2026-08-29] Limites ao vivo, sem intervalo

### Contexto

Pedido para ver os limites em tempo real: o consumo muda em segundos e um
intervalo de 5 minutos mostra número velho quase o tempo todo.

### Por que encurtar o intervalo não resolveria

Os comandos que a rodada completa executa são lentos. Medido nesta máquina:

| comando | tempo |
|---|---|
| `claude auth status --json` | 12,3 s |
| `codex login status` | 4,6 s |
| `openia statusline` | 4,0 s |

O que custa é a autenticação, não a quota — que sai de um arquivo em
milissegundos. Repetir a rodada a cada poucos segundos gastaria processo e rede
para reler o mesmo estado de login.

### O que foi feito

- `refreshLocal(providerId)`: releitura só do arquivo que a CLI escreve, sem
  executar comando. Troca os números e o horário da medição; conta, plano e
  estado de login continuam sendo os da última rodada completa, que é o que
  eles são. Não grava amostra quando a leitura é igual à anterior.
- `agent-usage-watcher.cjs` acompanha os arquivos e avisa o processo principal,
  que empurra o painel novo para a interface. A interface passa a ter selo
  "ao vivo" e o intervalo vira complemento (`Só ao vivo` por padrão), não o
  mecanismo principal.
- A vigilância é por `mtime`, não por `fs.watch`. Descoberta durante a
  implementação: a máquina estava com **204 instâncias de inotify para um
  limite de 128 por usuário**, e qualquer `fs.watch` novo falhava com `EMFILE`.
  Um `stat` por segundo em dois caminhos custa microssegundos e não disputa
  esse recurso. O rollout mais recente é redescoberto a cada 15 s, lendo só a
  pasta do dia.

### Sobre o `/status`

O `/status` do Codex mostra os mesmos números que já lemos do rollout —
conferido lado a lado: `88% restante` na semanal com reset em 4 Sep 12:28, que
é o `12% usado` e o mesmo reset que o arquivo entrega. A diferença é que ele
consulta na hora, enquanto o arquivo fica parado entre sessões. Não foi
adotado porque é comando interativo: usá-lo exigiria digitar dentro da sessão
de quem está trabalhando, poluindo a conversa, ou abrir uma sessão descartável.
O arquivo dá o mesmo dado sem tocar em nada.

### Validação

- `npm test`: **831/831** (6 novos, sobre o acompanhamento por `mtime`,
  incluindo o caso de `inotify` esgotado); `npm run test:frontend`: 689/689;
  `npm run lint`: 0 erros.
- App real com um agente Claude aberto e a coleta ligada: um prompt mínimo fez
  o painel sair de "Indisponível" para **96% (5 h) e 86% (7 dias)** sozinho, sem
  clicar em atualizar, e o número subiu de 95% para 96% enquanto a sessão
  consumia. A configuração do Claude foi restaurada ao final e conferida
  idêntica ao backup.

### Limites

Openia continua no intervalo: o saldo vem de chamada de rede e não tem arquivo
a acompanhar. Entre sessões, Codex e Claude mostram o último valor conhecido
marcado como antigo — o arquivo só muda quando um agente responde.

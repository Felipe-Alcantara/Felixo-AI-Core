
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

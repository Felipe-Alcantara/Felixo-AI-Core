# Arquitetura vigente — Felixo AI Core

Status: concluido.
Última revisão: 2026-09-29.

## Princípio do produto

O Felixo AI Core é **canvas-first**. O canvas organiza agentes, terminais,
arquivos, notas, grupos e páginas web; as conexões e os arquivos compartilhados
formam o contexto de trabalho.

O modo de chat foi depreciado. A implementação continua no repositório para
abrir sessões e exportar dados legados, mas é uma fronteira de compatibilidade:
novas capacidades, documentação de uso e decisões de arquitetura devem apontar
para o canvas.

## Mapa de camadas

```text
Electron main
├── core/                 descoberta de CLI, paths, shell e ciclo de vida
├── services/             IPC, PTY, adapters, contas, uso, Git e persistência
├── orchestration/        execuções multi-agente e continuidade
├── orchestrator/         planejamento, disponibilidade e políticas de spawn
├── mcp/                  catálogo de ferramentas do Felixo
└── windows/              janela principal e estado da janela
        │ preload tipado / contextIsolation
        ▼
React renderer
├── features/canvas/      superfície principal e sessões PTY reais
├── features/shared/      tipos, componentes e serviços compartilhados
└── features/chat/        superfície legada para compatibilidade
```

O processo principal continua responsável por processos, arquivos, Git,
contas, banco e IPC. O renderer compõe a interface e não recebe acesso direto
ao Node. O preload expõe somente os contratos necessários em `window.felixo`.

### Tarefas do Notion no Canvas

O painel `Tarefas Notion` usa uma integração nativa no processo principal; ele
não abre o `notion-workspace-app` nem reutiliza o conector `notion-tasks`. Cada
pessoa cadastra a própria conexão e escolhe uma `data_source` compartilhada
com ela. O token fica somente em `config/notion-connection-secrets.bin`,
cifrado pelo `safeStorage`; o JSON público ao lado guarda apenas rótulo,
perfil, timestamps e o indicador `hasToken`.

O cliente REST usa a versão oficial `2026-03-11`, descobre data sources pelo
endpoint de busca, consulta schema/páginas com paginação limitada e executa
criar, editar, concluir/reabrir e enviar para a lixeira. Timeouts, 429 e erros
transitórios têm retry limitado; mensagens de erro nunca devolvem token ou
corpo cru ao renderer. O cache SQLite (`notion_task_cache` e
`notion_sync_state`) é isolado por conexão + data source: uma falha de rede
devolve o último snapshot como `stale`, sem anunciar uma alteração como salva
antes da confirmação do Notion.

O preload expõe somente dados normalizados e a ferramenta é carregada sob
demanda, junto com as outras ferramentas do canvas. O painel mostra a origem
da sincronização, filtros por texto/estado, seleção de tabelas compartilhadas,
formulário guiado pelo schema reconhecido e confirmação antes de arquivar.

**Ordenação e filtros seguem a ordem visual do schema, não a alfabética.**
`notion-task-sort.ts` usa `schemaOptionOrder` pra ler a ordem real de
`select`/`status`: `select` é a ordem do array `options`; `status` tem grupo
("A fazer"/"Em andamento"/"Concluído") e a ordem certa vem de percorrer
`groups[].option_ids` nessa ordem — o array `options` do topo é só a lista
completa, sem garantia de bater com a ordem visual. `notion-task-views.ts`
reaproveita a mesma função pra montar a lista de opções de um filtro. A chave
de ordenação de cada tarefa é calculada **uma vez por tarefa** antes do
`.sort()` (nunca dentro do comparador, que roda O(n log n) vezes) — em 792
linhas isso é a diferença entre ~792 e ~15.000 chamadas de formatação.

**Database maior que a carga.** `queryTasks` para em `MAX_QUERY_PAGES × MAX_PAGE_SIZE`
(2.000 linhas) mesmo com mais dado disponível; `listTasks` já calculava
`hasMore` a partir disso, mas o painel não mostrava — agora um aviso aparece
quando a tabela carregada está truncada, deixando claro que ordenação/filtro
valem só pro que já chegou.

## DevTools isolado

`felixo devtools` é a superfície de automação de UI para qualquer agente. O
subcomando inicia Electron destacado com `userData` temporário, janela invisível
e CDP em porta local aleatória; cada ação conecta, executa e desconecta. A ponte
de captura e avaliação do processo principal só existe nessa instância, nunca no
app normal. `--real-profile` é uma exceção explícita e recusa iniciar quando os
arquivos de singleton indicam que o perfil já está em uso.

Nessa instância o main também instala uma sonda de invocações IPC
(`core/ipc-invoke-probe.cjs`) antes de qualquer canal ser registrado. Ela conta
as invocações por canal sem mudar retorno nem erro e chega ao
`devtools:main-eval` só como `ipcProbe.snapshot()`. O smoke do tutorial compara
duas fotos para provar que o percurso não acionou PTY, CLI, rede nem crédito.

`felixo devtools heap-snapshot <arquivo>` e `felixo devtools metrics` expõem os
domínios CDP `HeapProfiler`/`Performance` pela mesma conexão Playwright — um
`.heapsnapshot` real (o mesmo formato que o DevTools do Chrome abre) e as
métricas de heap/DOM/listeners, sem precisar de display para abrir a UI do
DevTools. `scripts/heap-snapshot-analysis.cjs` resume e compara dois snapshots
por construtor (self_size agregado, contagem de nós `detachedness=2` — o mesmo
sinal do filtro "Detached" do DevTools, já pronto no arquivo). Juntos, esses
dois pontos sustentam `scripts/canvas-long-session-heap-capture.cjs`: uma
sessão real do Canvas (terminais shell, webviews e blocos numa fixture local,
sempre em perfil descartável) com checkpoints de heap/RSS em cada fase —
baseline, fixture criada, carga estabilizada, depois de remover nós e depois de
"Limpar canvas" — para separar carga esperada de retenção indevida.

## Typecheck e fronteiras de build

O renderer é validado por dois projetos TypeScript referenciados: o projeto
`app` inclui `src` com os tipos DOM/Vite, e o projeto `node` inclui somente
`vite.config.ts` com os tipos Node. Ambos usam `noEmit`, `skipLibCheck` e as
regras de uso seguro de tipos, e gravam o diagnóstico incremental em
`node_modules/.tmp/tsconfig.*.tsbuildinfo`.

O comando de build continua chamando `tsc -b` antes do Vite. A opção
`incremental` explícita permite ao build mode reconhecer o `.tsbuildinfo` como
saída observável mesmo sem emitir JavaScript; uma execução sem mudança salta
os projetos e libera o heap do compilador. `npm run typecheck:full` usa
`--force` para reproduzir uma verificação limpa quando necessário. Nenhuma
fonte é excluída e o caminho incremental não usa `noCheck`.

Desde 25/09/2026 o toolchain TypeScript tem duas versões com papéis
separados, instaladas lado a lado por alias npm:

| Consumidor | Pacote instalado | Versão |
|---|---|---|
| `tsc -b` de `npm run typecheck`/`build` e a bancada de typecheck | `@typescript/native` → `typescript@^7` (bin `tsc`) | 7.0.x |
| `require('typescript')`: typescript-eslint no `npm run lint` | `typescript` → `@typescript/typescript6` (API via `@typescript/old`) | 6.0.x |
| Vite e Vitest | nenhum: transpilam com oxc e não importam o pacote `typescript` | — |

O 7.0 não publica API programática e o typescript-eslint ainda exige
`typescript` < 6.1, por isso a API do 6 continua disponível só para o lint.
A fiação (qual pacote é dono do bin `tsc` em cada SO) fica em
`app/scripts/typescript-toolchain.cjs` e é provada pelo `npm test`. O motivo e a
forma oficial estão no [README](../../README.md#typescript-7-lado-a-lado-com-a-api-do-6).

## Tailwind 4 e a cascata do CSS próprio

Desde 25/09/2026 o renderer usa o Tailwind 4 pelo plugin `@tailwindcss/vite`;
a configuração (`@import 'tailwindcss' source('.')`, `@theme`, `@utility`) mora
em `app/src/index.css`. A decisão que importa para quem escreve CSS é a da
cascata.

**Como era no v3.** Sem camadas nativas e sem `@tailwind variants` no
`index.css`, a folha saía nesta ordem, e a disputa era só especificidade +
ordem:

1. xterm.css (importado antes do `index.css` no `main.tsx`);
2. Preflight e o `@layer components` do app (`.markdown-content`);
3. utilities **sem** variante e os tokens de `@layer utilities`;
4. todo o CSS próprio do `index.css` (`.felixo-*`, regras de elemento,
   overrides de `.react-flow__*`);
5. utilities **com** variante (`hover:`, `focus:`, `disabled:`, `sm:`,
   `[@media…]:`), que o v3 anexava no fim da folha;
6. CSS do React Flow e do Excalidraw (chunks carregados sob demanda).

**Como ficou no v4.** O Tailwind emite `theme`, `base`, `components` e
`utilities` em `@layer`, e CSS fora de camada vence qualquer camada.

| CSS | Onde ficou | Por quê |
|---|---|---|
| Regras de elemento e variáveis globais (`:root`, `*`, `body`, `button`, `select`, `textarea`, scrollbars, `::selection`) | `@layer base` | No v3 qualquer classe as vencia por especificidade; fora de camada, `button, select, textarea { font: inherit }` apagaria `text-xs`/`font-mono` de todo botão e campo. |
| `.markdown-content` (CSS do highlight.js) | `@layer components` | Já era `@layer components` no v3. |
| Tokens de tema (`text-theme-error`, `rounded-theme`...) | `@utility` | Forma do v4 para utility própria; aceita variantes. |
| Classes próprias e overrides de biblioteca | sem camada | Mantém o v3 em empate com utility sem variante (a classe própria vence) e mantém a disputa só por especificidade com o CSS do React Flow/Excalidraw/xterm, que também é sem camada. |

O guia oficial sugere `@layer components` para CSS próprio. Aqui isso foi
medido e descartado: com a análise estática da cascata (design system do
próprio v4 para as utilities, regras do `index.css` e as expressões
`className` do código), 607 pares utility × regra própria na mesma
propriedade trocariam de vencedor — por exemplo, a borda de nó selecionado
(`.react-flow__node.selected .felixo-canvas-card`) perderia para
`border-white/10` —, e todo override do CSS das bibliotecas perderia para o
CSS delas, que é sem camada.

**O que muda de propósito e como foi tratado.** Nenhuma disposição de camadas
do v4 reproduz a ordem acima (as utilities sem e com variante saem juntas na
mesma camada), então restam dois casos, conferidos na interface real:

- utility **com variante** que empatava ou vencia uma regra própria (vinha
  depois) agora perde para ela. Os casos encontrados recebem `!` na utility,
  que devolve o resultado do v3 só nesse ponto:
  `hover:bg-(--f-core-structural)!` nas linhas de ação das sidebars do canvas e
  do chat (senão o realce virava o de `.felixo-sidebar-action:hover`);
  `focus-visible:outline-sky-400!` no fechar dos painéis;
  `[@media(max-height:620px)]:hidden!` nas sugestões e dicas do composer;
  `focus:outline-hidden!` no Salvar de quatro modais do chat;
  `disabled:bg-zinc-700!` no "enviar rascunhos" do painel de terminais; e
  `disabled:hover:bg-white/16!` no inserir do detalhe de prompt;
- utility `!important` contra regra própria `!important`: no v3 a regra
  própria vencia (mesma especificidade ou maior e vinha depois); no v4
  importante em camada vence importante sem camada. As classes `!` dos
  handles e redimensionadores do React Flow (`h-2.5! w-2.5! bg-...!`,
  `lineClassName`, `handleClassName`) nunca tiveram efeito — o estilo
  computado no v3 era o das regras `!important` do `index.css` — e foram
  removidas; mantê-las faria os pontos e linhas brancos aparecerem nos nós.

Diferença residual aceita: passar o mouse sobre um `.felixo-primary-action`
**desabilitado** que também tem `hover:bg-white/16` (17 botões de painéis)
mantém o cinza de desabilitado do design system, em vez do branco a 16% que o
v3 pintava por cima.

**Como foi conferido.** Além da análise estática, os estilos computados de
todos os elementos foram capturados com o app real (`felixo devtools`, perfil
isolado, fixture do `canvas-smoke`) em 19 estados — canvas nos dois temas,
13 painéis, menu, gaveta, modal e chat — com `:hover` e `:focus-visible`
forçados via CDP em cada elemento interativo, no v3 (`main`) e no v4, e
comparados elemento a elemento. As diferenças que sobram são os padrões novos
do v4 listados no registro de 25/09/2026 do [IA.md](IA.md).

O v4 exige Chromium 111+ (`color-mix()`, `@property`); o Electron 41 traz o
Chromium 146.

## Autorizacao de caminhos locais

Uma pasta de projeto so entra no banco depois de ser escolhida no seletor nativo
ou alcancada por uma concessao nativa equivalente. O processo principal resolve
o caminho por `realpath`, confirma que ele existe e e um diretorio, e recusa
raizes do sistema e caminhos inventados pelo renderer.

`projects:list-directory` e `projects:build-docs-index` aceitam apenas a raiz
exata de um projeto registrado. Cada subcaminho e novamente resolvido e
comparado com a raiz real, portanto `..` e links simbolicos que apontem para
fora nao atravessam a fronteira. Os IPCs de texto usam a mesma lista de raizes;
um arquivo externo so entra por uma escolha explicita no seletor nativo, com
concessao mantida em memoria durante a sessao.

## Agente le outros elementos do canvas

`agent-canvas-read-ipc-handlers.cjs` reaproveita a mesma fila de
`userData/agent-requests` do Fetch All e do navegador, mas com uma diferenca
deliberada: as acoes `canvas-listar` e `canvas-ler` (registradas em
`agent-requests.cjs`) sao **auto-resolvidas sem confirmacao humana**, porque a
task que motivou esta fatia marca a escrita — nao a leitura — como o maior
risco de seguranca (prompt injection vindo de um terminal ou pagina lido por
outro agente mandando escrever em outro lugar).

`canvas-agent-read.cjs` e a logica pura: `listarElementos` devolve id, tipo e
um rotulo por bloco (lido de `canvas-repository.cjs`, o snapshot SQLite do
canvas — pode ficar levemente atrasado em relacao ao estado vivo do
renderer). `lerElemento` suporta `terminal` (ultimas linhas do
`terminalLogStore`, cujo `sessionId` e o mesmo id do no no canvas), `note`
(o Markdown do bloco) e `file` (conteudo lido do caminho resolvido a partir
de `fileName`/`filePath`); outros tipos devolvem uma mensagem explicita de
"ainda nao tem leitura nesta fatia" em vez de falhar sem explicacao. Todo
conteudo passa por `redactSensitiveText` antes de sair.

A CLI expoe `felixo canvas listar` e `felixo canvas ler <id>`, com o mesmo
padrao de espera curta (poll ate ~4s) e "ver-pedido" para conferir depois que
o Fetch All e o navegador ja usam.

### Fatia 2: escrita numa nota, sempre com confirmacao humana

`agent-canvas-write-ipc-handlers.cjs` cuida da acao `canvas-escrever` na
mesma fila. Ao contrario da leitura, ela **nunca** e auto-resolvida: fica
pendente ate `canvas:resolve-write-request` ser chamado por um clique real
no painel "Pedidos de escrita" (`AgentCanvasWriteRequestsPanel.tsx`) — o
mesmo padrao que o Fetch All ja usa para `executar-plano`. Nesta fatia so o
tipo `note` aceita escrita (`canvas-agent-write.cjs`); qualquer outro tipo
devolve `ok:false` sem tentar escrever.

Persistir no SQLite nao move nada na tela sozinho — o renderer e dono do
estado vivo (`useCanvasPersistence.ts`) e so le do banco no boot. Por isso,
depois de `canvasRepository.save`, o processo principal empurra o novo
`data` pro renderer pelo evento `canvas:agent-node-updated`; o hook aplica o
patch no no vivo e cancela qualquer save pendente daquele no (uma posicao
arrastada, por exemplo), pra uma escrita antiga em memoria nao sobrescrever
a escrita do agente na proxima autosave.

Nao existe um log de auditoria separado: cada pedido ja fica persistido como
arquivo em `userData/agent-requests`, com pedidoEm/resolvidoEm/estado/
resultado — o mesmo arquivo que serve de fila e o registro do que foi
pedido, quando, e o que a pessoa decidiu.

A CLI expoe `felixo canvas escrever <id> <conteudo>`. Ao contrario de
listar/ler, este comando NAO espera resposta — o pedido pode ficar minutos
esperando um clique — so registra e devolve na hora, apontando pra
`felixo canvas ver-pedido <id>`.

## Perguntas com opcoes de um agente (felixo perguntar)

Decisao registrada (task "perguntas interativas com opcoes para o Codex").
Verificado no protocolo real do Codex 0.154.0 (`codex app-server
generate-json-schema --experimental`): o app-server tem
`item/tool/requestUserInput` (perguntas + opcoes, resposta por id), mas o
app-server so serve o chat/orquestrador — os terminais do canvas rodam o TUI
do Codex por PTY, entao esse caminho nao alcancaria o agente do canvas. A flag
nativa `default_mode_request_user_input` esta "under development" (desligada)
e a pergunta so aparece dentro do TUI, por teclado. Escolhido: comando
`felixo perguntar "<pergunta>" "<opcao>" ...` na mesma fila `agent-requests`,
que serve Codex, Claude e Gemini.

`agent-question-ipc-handlers.cjs` guarda a pergunta como pedido pendente e so
a resolve quando a pessoa clica no `AgentQuestionDialog` (global no
CanvasView: quem perguntou esta bloqueado, entao o dialogo nao pode depender
de um painel aberto). O renderer manda apenas o INDICE da opcao; o texto
devolvido ao agente vem do pedido gravado, nunca do que chega do renderer.
De 2 a 4 opcoes, limites de tamanho em `agent-requests.cjs`. A CLI ao
contrario de `canvas escrever`, BLOQUEIA ate responderem (5 min): codigo 0 =
escolha no stdout, 3 = dispensada, 1 = sem resposta no prazo.

## Modo fast do Codex ao criar agente

Contrato confirmado no proprio Codex 0.154.0, nao por documentacao: cada
modelo do `~/.codex/models_cache.json` (e `Model.serviceTiers` do protocolo
do app-server) declara `serviceTiers: [{ id: "priority", name: "Fast" }]`
com "1.5x/2x speed, increased usage"; `codex features list` mostra
`fast_mode` estavel e ligado. A chave e `service_tier = "priority"`; um
`codex app-server --config service_tier="priority"` mais `config/read`
devolve `priority` como valor efetivo (sem o override, `default`).

No canvas, `AgentDefinition.fastModels` (agent-launch-options.ts) lista os
modelos compativeis e `supportsFastMode` decide se o campo "Modo fast"
aparece; o modelo vazio (padrao) conta como compativel. `buildAgentArgs` so
envia `-c service_tier=priority` para Codex e modelo compativel, e
`describeLaunch` poe "⚡ fast" no rotulo — que e o cabecalho do terminal.
O estado vive em `useAgentConfig` (mesmo padrao do yolo), e a preferencia
salva so vale para agente/modelo que suporta, para um `fast` antigo nao
ligar o tier escondido. `model-options.cjs` faz o mesmo nos dois caminhos
(exec e app-server) quando `model.fastMode === true`. Sem o pedido, nada e
enviado: vale o `service_tier` do `~/.codex/config.toml` da pessoa.

No modelo de chat, `Model.fastMode` (so o booleano `true`; ausente = sem fast)
e uma coluna propria (`fast_mode`, migration 014, default 0) em
`models-repository.cjs`. `modelSupportsFastMode`/`resolveFastMode`
(`chat/services/model-fast-mode.ts`) reusam `supportsFastMode` do canvas e
so guardam `true` onde o modelo suporta — trocar para um modelo sem o tier
limpa o campo em vez de deixa-lo ligado escondido. Tres pontos do caminho
renderer -> spawn precisaram conhecer o campo: `normalizeAvailableModel`
(`cli-request-policy.cjs`, que descarta campos desconhecidos) e
`createModelSessionKey` (o processo persistente do Codex e reaproveitado por
essa chave; sem o fast nela, alternar o campo reusaria o processo aberto com
o tier antigo). UI: checkbox no `ModelConfigModal` e botao "⚡ Fast" no
`Composer`.

## Presets de agente (fatia 1)

"Pre-treinado" nao e treinar modelo: e uma receita salva (`AgentPreset` em
`agent-preset.ts`): CLI, modelo, esforco, fast, yolo, contexto inicial,
skills, cor e pasta. O modulo e so o formato — validar, normalizar e
(de)serializar — para o formato salvo e o de troca terem teste. Valor que a
versao atual nao conhece (modelo removido, esforco que o modelo recusa, fast em
modelo sem o tier) vira o padrao em vez de um argumento que a CLI recusaria.
O arquivo de troca (`felixo-agent-preset`, `version: 1`) omite id, pasta e a
marca de nativo, e a importacao recusa versao maior que a que conhece.

Nativos (Tasks do Notion, Revisor de PR, Depurador) moram no codigo: atualizam
com o app e nao se editam — duplica-se. Os da pessoa ficam no SQLite (migration
015, `agent-presets-repository.cjs`, soft-delete; nativo e recusado no banco).
O repositorio guarda o objeto como veio; quem repara valores antigos e o
renderer, ao ler.

Escolher um preset no formulario de novo agente so PREENCHE a configuracao
(`useAgentConfig.applyPreset`); o agente nasce pelo botao de sempre. O contexto
e as skills do preset entram no `initialText` do terminal
(`buildPresetInstruction`), que o session-store ja entrega por ARQUIVO — um
contexto grande de preset nunca e digitado inteiro no PTY. A cor do preset vira
a moldura (`frameColor`) do terminal.

### Gerenciar presets (fatia 2)

`AgentPresetsPanel` (ferramenta "Presets de agente") edita todos os campos de
um preset da pessoa, escolhe as skills no catalogo (`listAvailableSkills`),
duplica, exclui e troca arquivos `.fxpreset`. As regras de edicao ficam em
`agent-preset-editor.ts` (puro): trocar de CLI zera modelo/esforco/fast; trocar
de modelo so mantem esforco e fast que o novo modelo aceita. Exportar usa o
mesmo `files.saveTextFile` do `.fxcanvas`; importar le o arquivo no renderer,
valida formato e versao (`parsePresetFile`), da outro id e, se o nome ja
existe, numera como copia — nunca sobrescreve um preset. A pasta padrao e do
preset mas nao vai no arquivo. Skill citada que o catalogo nao tem mais e
avisada na edicao e ignorada ao abrir o agente. Como o formulario de spawn e a
tela usam instancias separadas de `useAgentPresets`, a lista muda por um
evento de janela (`felixo:agent-presets-changed`).

## Perfis do navegador interno

Cada bloco Pagina Web tem um perfil, e cada perfil e uma particao propria do
Electron (`persist:felixo-webview-<id>`): logins de perfis diferentes nao se
misturam. O perfil "Padrao" e a particao que JA existia (`persist:felixo-webview`)
e e virtual (nao mora no banco); bloco sem `profileId` continua nela, entao
ninguem e deslogado na atualizacao. Os perfis da pessoa ficam no SQLite
(migration 016, `webview-profiles-repository.cjs`; nome unico sem diferenciar
maiuscula) e uma store externa (`webview-profiles-store.ts`) os compartilha entre
todos os blocos e o seletor de criacao.

Decisoes com motivo: (1) a particao do webview sai DIRETO do `profileId` do
bloco, nunca da lista de perfis — a lista carrega de forma assincrona e um
bloco de "Trabalho" abriria primeiro na sessao Padrao, carregando a pagina
logado como outra pessoa; (2) bloco de perfil excluido mantem a particao (agora
vazia) e aparece como "Perfil removido", nunca e empurrado em silencio para a
sessao Padrao; (3) excluir um perfil limpa a sessao (`clearStorageData` +
`clearCache`) ANTES de tira-lo da lista, e o handler recusa o id `default` — o
Padrao e a sessao de todos os blocos antigos; (4) o id do perfil entra num nome
de particao, entao renderer e processo principal validam com a mesma regra
(teste de paridade). Trocar de perfil recria o webview na mesma pagina.

`felixo browser open --embedded --profile=Nome` leva o NOME no pedido; o
processo principal o resolve (Padrao/default sem consultar o banco) e um nome
inexistente FALHA em vez de cair no Padrao. `interpretarArgumentos` passou a
aceitar `--chave=valor`; as flags booleanas continuam como eram.

## Ditado por voz

Decisao tomada sem medicao: a task pedia escolher o motor medindo latencia,
qualidade em portugues e custo, mas nao havia microfone funcional e o ambiente
nao sobe o Electron (`/dev/shm` bloqueado) — entao nem a Web Speech API foi
testada. Escolhido (pelo Felipe, entre nuvem, so-base e adiar): transcricao na
nuvem por uma API compativel com a da OpenAI (`POST {baseUrl}/audio/transcriptions`),
igual nos 3 SOs e sem binarios, com o motor atras de uma fronteira estreita
(`speech-transcription.cjs`) para trocar por whisper local depois.

Fluxo: o renderer grava (`voice-recorder.ts`, getUserMedia + MediaRecorder) e
manda o audio ao processo principal (`speech:transcribe`), que le a chave
cifrada e chama a API; so o texto volta. A chave fica em arquivo proprio,
cifrada pelo `safeStorage` (`speech-settings-store.cjs`), e o renderer so sabe
SE ela existe. Sem cifra disponivel (Linux sem keyring) a chave NAO e gravada
em texto puro. O endereco so aceita https (ou http em loopback), e vem da
config guardada no processo principal — o renderer nao escolhe para onde a
chave vai. Mensagens de erro da API passam pela redacao (elas costumam ecoar
parte da chave).

O texto transcrito vem de uma API externa e vai para um shell/agente, entao:
`sanitizeDictatedText` troca quebras por espaco e remove todo controle
(inclusive ESC/CSI) e o que disfarca texto (marcas de direcao, largura zero),
e `TerminalSessionStore.typeText` RECUSA qualquer controle por conta propria —
duas camadas para que um chamador futuro nao consiga enviar/executar sem
querer. `typeText` digita como o teclado (sem arquivo de contexto e sem Enter);
o alvo e o terminal aberto (`expandedTerminalId`) e, sem terminal, o texto e
copiado — mesmo recurso dos prompts do catalogo.

Permissao: `speech:microphone-status` (macOS/Windows respondem; Linux devolve
`unknown`) e `speech:request-microphone` (so o macOS pede pelo processo
principal). Negado vira mensagem com o caminho das configuracoes de cada SO.
No macOS empacotado o `NSMicrophoneUsageDescription` e obrigatorio e agora
esta em `package.json` (`mac.extendInfo`, com teste-guarda). Ainda falta, SE as
builds do macOS passarem a ser assinadas (hoje nao sao, ver release.yml), o
entitlement `com.apple.security.device.audio-input` com hardened runtime — nao
foi adicionado porque hoje seria letra morta e a pipeline nao e testavel aqui.

### Servidor local de transcricao (motor offline)

Nao ha motor local embutido. O caminho local e um servidor de transcricao
rodando na propria maquina, apontado pelo campo "Endereco da API" (ou pelo
motor "Servidor local" nas configuracoes). Quando o endereco e de loopback
(`localhost`, `127.0.0.1`, `[::1]`; `isLoopbackBaseUrl`, com paridade testada
contra `isLoopbackEndpoint` do renderer), a chave NAO e exigida e nenhum
cabecalho `Authorization` e enviado — o audio nao sai da maquina. Fora do
loopback a chave continua obrigatoria e a requisicao nunca sai sem credencial.
Com chave configurada, ela e usada mesmo no local.

Contrato que o servidor precisa cumprir (o que o cliente faz de fato, coberto
por teste contra um servidor HTTP real em loopback): `POST {baseUrl}/audio/
transcriptions`, corpo `multipart/form-data` com `file` (audio; nome
`ditado.<ext>`; tipo `audio/webm` — o que o Chromium grava, sem parametros),
`model`, `language` (2 letras) e `response_format=json`; resposta JSON
`{ "text": "..." }`. Erros HTTP viram mensagem (401/403 chave, 404 modelo ou
endereco, 413 tamanho, 429 limite, demais com a mensagem da API redigida).
Servidor desligado diz para conferir se ele esta rodando.

Verificado em 05/10/2026 (Linux): o servidor de exemplo
`app/scripts/servidor-transcricao-local.py` (faster-whisper, so 127.0.0.1)
aceita o webm/opus do Chromium sem conversao. O app instalado ditou sem
internet (rede isolada com `bwrap --unshare-net`, so loopback), e o texto
caiu na linha do terminal sem Enter.

Decisao (Felipe, 05/10/2026, com medicao): NAO embutir motor no app. O
caminho local continua sendo o servidor a parte, documentado no guia do
usuario, com o modelo `small` como padrao. Motivo medido: o unico motor
embutivel sem Python, o whisper.cpp, tem a mesma qualidade do faster-whisper
(mesmos pesos), mas e de 2,3 a 2,8x mais lento nesta CPU (i5-6200U, 4
threads, decodificacao gulosa nos dois). No `small`, levou 18 s contra 7,3 s
por frase de voz humana. O que pesou para a pessoa foi nao pagar API, e isso
o servidor local ja resolve. O instalador fica do mesmo tamanho.

Numeros e roteiro no IA.md (entrada de 05/10/2026, "Motor local").

Se a decisao for revista: o whisper.cpp seria baixado sob demanda (a pessoa
nao aceita crescer o instalador). Antes disso, vale medir o backend Vulkan
na GPU integrada; so a CPU foi medida.

## Layout: altura dos paineis

Os paineis de ferramenta redimensionam a LARGURA (arrasto, `useResizablePanelWidth`,
que passa por `reportPanelWidth` no coordenador de superficies) e, desde a fatia
1 da task de layout, tambem a ALTURA (`useResizablePanelHeight`, alca na borda
de baixo, setas e `Home`). A altura nao fala com o coordenador: o painel ancora
no topo, so concorre com as outras superficies pela largura, e a altura tem o
mesmo teto que ele ja respeitava (`getPanelMaxHeight`, topo 64 + rodape 48) —
esticar na vertical nao cria uma posicao nova e, por isso, nao reabre o loop de
painel x gaveta de 12/09 (leitura circular entre superficies, ver
`splitHorizontalSpace`). Inventario completo, com o que ainda nao redimensiona:
`docs/projeto/LAYOUT-SUPERFICIES.md`. Estados, botões, persistência, IPC, testes e
lacunas de cada elemento: `docs/projeto/INVENTARIO-CANVAS.md`, gerado de
`app/src/features/canvas/inventory/` e conferido por `canvas-inventory.test.ts`.

## Cor de moldura dos blocos do canvas

Todo tipo de bloco aceita `data.frameColor` (`FrameColor` em `types.ts`), um
token de paleta curta (`frame-colors.ts`), nunca hex livre. E separado de
`NoteNodeData.color`, que segue sendo o papel da nota: notas antigas mantem a
cor que tinham sem migracao, porque nenhum campo existente muda de nome ou
significado. O CanvasView transforma o token em classe (`felixo-frame-*`) no
wrapper do no do React Flow; o CSS pinta so o contorno e um halo no primeiro
filho (o card), entao o conteudo — inclusive o terminal — nao e colorido. Um
valor desconhecido vindo de disco (`readFrameColor`) vira "sem cor". A escolha
e feita por um menu de clique direito unico (`NodeColorMenu.tsx`) e persiste
pelo mesmo `updateNodeData` das outras edicoes. Prioridade com notificacao:
o realce de notificacao, quando existir, deve ser declarado depois do bloco
`.felixo-frame` no CSS — a cor dela vence.

## Fetch All e inventario multiplataforma

O scanner em `services/fetch-all/repo-scanner.cjs` separa a descoberta de
raizes, montagens e poda da varredura de diretorios. No Windows ele testa as
letras de todas as unidades e conserva as que respondem como diretorio,
incluindo discos removiveis, mas nao unidades de rede. No Linux e no macOS ele
le `/proc/mounts` ou a saida BSD de `mount`, descarta sistemas virtuais/de rede
e, no macOS, nao repete `/System/Volumes` nem `Library/CloudStorage`.

Uma configuracao vazia nao e mais um alias silencioso para `/`: `resolveScanRoots`
devolve vazio por padrao e so inventaria os discos quando recebe a autorizacao
explicita da passada. O servico expoe `describeScanScope` com raizes configuradas,
raizes efetivas, discos candidatos, motivo, custo esperado e uma chave do escopo;
o painel so envia a confirmacao ampla para a chave que a pessoa viu. Se a lista
de montagens mudar antes do inicio, a chave deixa de coincidir e a confirmacao
precisa ser refeita.

O cache da varredura usa uma chave de ambiente composta por raizes, exclusoes,
caminhos ignorados, montagens podadas e discos locais detectados. Uma lista
obtida sob outro escopo nao pode virar uma varredura rapida por engano.

As funcoes aceitam plataforma, semantica de caminhos e IO injetaveis. Assim, a
suíte cobre letras de unidade, comparacao case-insensitive, montagens,
CloudStorage e exclusoes sem depender dos discos da maquina que executa os
testes; a API de producao continua usando os adaptadores nativos por padrao.

No canvas, `canvas-connection-index.ts` constrói uma vez os mapas de nós,
terminais ligados a arquivos e nomes de arquivos ligados a terminais, dentro de
um `useMemo` dependente de `nodes` e `edges`. O mesmo índice é usado pelo
`renderedNodes` e pelo efeito que resolve os caminhos dos arquivos, eliminando
buscas completas por aresta e `nodes.find()` repetidos em cada terminal. O
fixture de desempenho é opt-in com
`$env:FELIXO_CONNECTION_BENCHMARK='1'; npx vitest run src/features/canvas/services/canvas-connection-index-benchmark.test.ts`.

Para medir o renderer, a bancada `npm run benchmark:canvas-connections --
--check --out=arquivo.json` abre uma rota controlada no Electron com ReactFlow
real, React Profiler (`actualDuration`) e heap antes/depois de GC. Ela compara
baseline e índice em 100, 500 e 1.000 nós, nos cinco cenários de render, drag,
resize, criação/remoção de aresta e mudança de dados. O modo usa Vite de
desenvolvimento para que o callback do Profiler exista; o resultado é uma
tabela p50/p95 e um JSON com host, viewport, repetições, GC e limitações.
`CanvasView` também possui uma fronteira opt-in em `?canvas-profiler=1`, que
registra commits em `window.__felixoCanvasProfiler` sem adicionar overhead ao
uso normal. A bancada não inicia PTYs nem acessa arquivos persistidos; por isso
seus nós leves e a equivalência da projeção não substituem a validação visual
manual de links, labels, prompts, retomada e remoção no Canvas real.

## Canvas e terminais

- `CanvasView` compõe o quadro e persiste nós e conexões.
- Terminais de agentes usam PTY real (`node-pty`), com `xterm.js` no renderer;
  continuam executando em background quando o bloco é recolhido.
- `TerminalSessionStore` mantém a sessão fora da árvore React para que mover o
  terminal entre o bloco e a gaveta não reinicie o processo.
- O scrollback visual é adaptativo por sessão: 20.000 linhas até 9 terminais e
  5.000 a partir de 10. `CanvasView` passa apenas o total renderizado; o dado
  não é persistido e uma sessão viva não é redimensionada depois. O processo
  principal mantém até 200.000 caracteres de replay para reanexar o renderer,
  enquanto o snapshot expõe o rollover para a UI.
- Arquivos `.md` do canvas vivem na área de dados do usuário e podem ser
  ligados a vários agentes. Eles são a memória compartilhada recomendada.
- O manifesto `.fxcanvas` transporta layout, conexões e conteúdo dos arquivos
  referenciados, mas não leva comandos ou caminhos dependentes da máquina.

### Retomada de conversa: plano com motivo

Um bloco de agente restaurado (o app reabriu com ele) ou reiniciado com uma
conversa associada passa por `explainAgentResume`
(`features/canvas/services/agent-session.ts`). A função é a fonte única da
retomada: recebe o comando, a pasta e a conta do bloco, a referência gravada
(`agentSession`), a falha registrada (`resumeFailure`) e a escolha da pessoa
(`resumeChoice`), e devolve `{ outcome, reason, reasons }`.
`canResumeAgentSession` e `buildAgentResumeArgs` (mesmo arquivo),
`resolveTerminalInitialText` (`quality-standard-prompt.ts`), a faixa do cartão
(`terminal-resume-banner.ts`) e a tabela do
[Guia do Usuário](../guias/GUIA-USUARIO.md#retomar-conversas-de-agentes)
derivam desse plano. Nenhum deles decide de novo, para o que a pessoa lê e o que
o spawn faz não divergirem.

| `outcome` | Quando | O que o spawn faz |
| --- | --- | --- |
| `exact` | Referência válida, mesmo provider, pasta e conta, nenhuma falha registrada para aquela `sessionId`, e a versão instalada da CLI retoma pelo ID (`capability.method === 'exact-id'`) | Sobe com `--resume <id>` (Claude e Gemini) ou `resume … <id>` (Codex), sem texto inicial |
| `picker` | Sem referência (motivo `fallback`), ou escolha `picker` | Digita `/resume` com Enter (`RESUME_INITIAL_TEXT`), e a CLI mostra a lista |
| `new` | Escolha `new` | Conversa nova; `buildResumeFallbackNotice` entra como contexto, sem Enter |
| `pending` | Referência presente, mas não exata, e sem escolha | Não sobe: `resolveTerminalInitialText` devolve `undefined` e a faixa pede a escolha |

Sem referência, a lista da CLI continua automática: não há conversa a
confirmar. Antes, uma referência não exata virava em silêncio o aviso de
conversa nova; agora o spawn espera a escolha, e a pessoa sabe se está voltando
à conversa ou começando outra.

| `reason` | Título (`REASON_TITLES`) | Quando |
| --- | --- | --- |
| `exact` | Retomando a conversa anterior | Tudo coincide |
| `fallback` | Sem conversa associada | Bloco sem referência |
| `invalid-reference` | Registro da conversa ilegível | `isAgentSessionReference` recusa a referência; nada mais é comparado |
| `provider-mismatch` | A conversa é de outro agente | O comando do bloco não é o provider da referência |
| `expired` | A CLI não encontrou a conversa | `resumeFailure` com a mesma `sessionId` da referência |
| `auth` | A CLI pediu login ao retomar | Idem |
| `unsupported` | Retomada pelo ID indisponível nesta versão do <agente> | A versão instalada da CLI do bloco não retoma pelo ID (Gemini anterior à 0.57, ou versão que não respondeu). Só com o mesmo provider: a conversa de outro agente já tem `provider-mismatch` |
| `missing-cwd` | Bloco sem pasta de trabalho | A pasta do bloco está vazia |
| `cwd-mismatch` | A conversa nasceu em outra pasta | A pasta do bloco difere de `reference.cwd` |
| `account-mismatch` | A conversa é de outra conta | A conta difere; vazia e ausente valem como login do sistema |

A ordem da segunda tabela, a partir de `invalid-reference`, é a de prioridade.
`reasons` acumula todos os motivos que se aplicam nessa ordem, `reason` é o
primeiro (vira o título), e o detalhe de `describeAgentResumeForPerson` explica
todos, para pasta e conta divergentes aparecerem juntas. `missing-cwd` e
`cwd-mismatch` se excluem.

**Pasta e conta antes do spawn.** O Claude e o Codex imprimem o mesmo texto para
uma conversa de outra conta e para uma que não existe (as conversas ficam por
`CLAUDE_CONFIG_DIR` e por `CODEX_HOME`), então a saída não separa os dois casos.
Quem separa é a referência: `agent-session-discovery.cjs` a grava com o `cwd`
real do PTY e procura só nas pastas de histórico do ambiente da conta
(`selectDiscoveryContext`), e o processo principal carimba o `accountId`. Assim,
`cwd-mismatch`, `missing-cwd` e `account-mismatch` são decididos sem gastar um
spawn.

**Capacidade pela versão instalada.** O método de retomada sai de
`resolveAgentResumeCapability` (`agent-resume-capability.ts`), por provider,
versão, modo (hoje só o terminal interativo do canvas) e sistema (nenhuma regra
difere por sistema hoje). Os métodos são `exact-id`, `numeric-index`,
`latest-only`, `interactive-only` e `unsupported`, e o app só retoma sozinho
pelo `exact-id`:

| Provider | Regra | Base | Sem versão |
| --- | --- | --- | --- |
| Claude Code | `exact-id` em qualquer versão | `documented`: `--help` da 2.1.285 | `exact-id` |
| Codex | `exact-id` em qualquer versão | `documented`: `codex resume --help` da 0.156.1 | `exact-id` |
| Gemini CLI | `exact-id` da 0.57.0 em diante; antes, `numeric-index` (`below-proven`) | `measured`: 0.57.0 e 0.62.0, no TTY com HOME isolada | `numeric-index` (`unknown-version`) |

O `--help` do Gemini só cita `latest` e o índice, mas a própria mensagem de erro
dele ensina `--resume {uuid}`, e a retomada pelo ID foi medida. Cada regra tem
as saídas medidas em `electron/__fixtures__/agent-resume-versions.json`
(`--version`, recusas e código de saída), que os testes dos dois processos
percorrem. Ao medir uma versão nova, acrescenta-se uma linha ali.

A versão vem do processo principal: `agent-cli-versions.cjs` reaproveita a
detecção da abertura (`detectAllClis`, que já roda `<cli> --version` com
tempo-limite) e responde ao canal `pty:cli-versions`. Uma leitura com versão
vale 10 min; sem versão, 1 min, e a da abertura nem isso, porque o `--version`
do Gemini (uns 7 s ocioso na 0.62) pode estourar o prazo disputando a CPU com
o boot do app. O canvas pede as versões ao montar (`loadAgentCliVersions`). Só
um bloco restaurado cuja regra depende de versão (o Gemini,
`resumeDependsOnVersion`) espera por elas antes de subir; Claude e Codex sobem na
hora. A versão usada no plano segue para o store (`resumeCliVersion` no dado de
render, `cliVersion` nas `SessionOptions`), que confere de novo em
`buildAgentResumeArgs`. Na instância roteirizada (`FELIXO_DEVTOOLS_FAKE_CLI_PTY`),
nenhuma versão é lida.

**Versão gravada e invalidação.** O processo principal carimba `cliVersion` na
referência, tanto na descoberta quanto na retomada por ID
(`PtyProcessManager.withCliVersion`, com a mesma regra de formato do renderer),
e o canvas acrescenta `resumeMethod` ao gravá-la (`withResumeMethod`, em
`agentSessionPatch`). O método gravado é registro, não decisão:
`explainAgentResume` sempre recalcula pela versão instalada agora e, quando ela
difere da gravada, devolve `versionChange = { from, to }`, que Detalhes do
terminal mostra ("Gemini CLI 0.62.0: pelo ID da conversa (gravada na 0.56.2)").
A referência nunca é apagada por mudança de versão, e a próxima retomada regrava
`cliVersion` com a versão nova.

**`expired` e `auth` vêm de depois do spawn.** São os únicos motivos que
dependem do que a CLI respondeu. `resume-outcome-detector.ts` lê a saída inicial
de um spawn que subiu com argumentos de retomada e a compara com as frases de
falha medidas, só as da CLI do spawn (`providers` de cada frase). Para
`expired` vale só a frase do Claude ("No conversation found with session ID:
<id>") ou do Codex ("No saved session found with ID <id>") com o ID TENTADO na
mesma linha: numa retomada que dá certo, a CLI redesenha a conversa anterior, e
uma linha antiga citando outra conversa não pode virar falha. O Gemini recusa
antes de abrir a interface, depois de "Error resuming session:", e sai com 42:
`Invalid session identifier "<id>".` (com o ID entre aspas) ou "No previous
sessions found for this project." (sem ID). As duas frases têm `exitCode: 42` e
só contam quando o processo sai com esse código dentro da janela
(`ResumeOutcomeDetector.exit`, chamado no começo de `finishExit`); a saída faz o
papel do ID que a segunda frase não traz, e uma conversa redesenhada que cite a
frase não termina assim. `auth` usa as frases de login da vigia de contas. Nos dois casos, linhas
da conversa redesenhada (com ⎿ ou ⏺, ou a continuação recuada delas) não contam
— uma falha de login desenhada como saída de ferramenta não é detectada, o lado
seguro. O `TerminalSessionStore` chama `onResumeFailure(reason)`, opção de
`SessionOptions`, no máximo uma vez por spawn desses, e o bloco grava
`resumeFailure = { sessionId, reason, at }`, persistido. `explainAgentResume` só
a considera se `isAgentResumeFailure` a aceitar e se a `sessionId` for a da
referência atual: uma conversa nova não herda a falha da anterior. Com a falha
gravada, `canResumeAgentSession` é `false`, e nem o **Reiniciar terminal** nem a
reabertura do app repetem o mesmo `--resume`. O plano vira `pending`, e a faixa
oferece "Tentar retomar de novo". Se uma versão nova da CLI mudar o texto, nada
é detectado e vale o comportamento anterior: a mensagem fica no terminal e o
próximo spawn tenta a mesma conversa.

**Spawn segurado.** Em `pending`, o bloco não abre PTY. A faixa mostra o alvo
(`describeAgentResumeTarget`) e o motivo (`describeAgentResumeForPerson`), com
"Escolher na lista (/resume)" e "Abrir conversa nova" e, com falha registrada,
"Tentar retomar de novo". A escolha vira `resumeChoice`, que nunca vai para o
disco, e só então o spawn acontece. Sem escolha, o bloco fica parado e o resto
do canvas não muda. Com a faixa de falha sobre um agente de pé (login feito no
próprio terminal, por exemplo), "Dispensar aviso" limpa a `resumeFailure` sem
reiniciar.

Só o primeiro spawn de um bloco que veio do disco é segurado. O registro da
execução (`terminal-run-registry.ts`, na chave `felixo:canvas-terminal-run` do
`sessionStorage`, com cópia em memória se o storage falhar) guarda os blocos que
já subiram, os restaurados, a escolha da faixa e as conversas esquecidas. Ele
sobrevive a ir ao chat e voltar e a recarregar só a interface (os PTYs continuam
vivos no processo principal), e zera quando a janela fecha, como os PTYs. Um bloco
com processo vivo reanexa em vez de voltar para "aguardando escolha". O Reiniciar
do cartão, o da gaveta e os botões da faixa passam pelo mesmo caminho
(`relaunchTerminal`) e pelo mesmo plano.

**Relançamento automático do Codex.** Depois de o Codex se atualizar, o store
relança o processo. Ele usa `canResumeAgentSession` com a falha vista neste
spawn (ou a gravada). A pasta de um bloco "Local (sem projeto)" vem da referência
que o próprio processo reportou (`liveAgentSession`). Se não puder retomar
exato, relança numa conversa nova sem digitar nada e mostra o motivo no cartão
(`contextWarning`, com o texto de `describeAgentResumeForPerson`). Não segura
o bloco: ele estava rodando um instante antes, e ninguém pediu para pará-lo.

**Retomada por ID já nasce com a referência.** Um PTY que sobe com
`resume … <id>` (Codex) ou `--resume <id>` (Claude e Gemini) recebe a referência no
spawn (`resolveResumeTarget` em `pty-process-manager.cjs`, `source:
'resume-args'`) e não passa pela descoberta: a CLI grava a retomada no arquivo
antigo da conversa, que a busca por "arquivo mais novo" nunca acharia, e a
descoberta acabaria adotando a conversa de outro terminal da mesma pasta. No
Windows, uma retomada recusada que sai cedo não cai no reenvio sem argumentos
nem no shell de emergência: o processo encerra e a faixa espera a escolha.

**Captura tardia.** O Claude e o Codex só criam o arquivo da conversa na
primeira mensagem. Por isso a descoberta (`agent-session-discovery.cjs`) é
reaberta quando um Enter (`\r`) chega a um PTY ainda sem referência, até três
vezes (`AGENT_SESSION_DISCOVERY_MAX_REARMS` em `pty-process-manager.cjs`).
Shift+Enter e colagem (bracketed paste) não contam. O reanexo só reemite a
referência que já existe; não reabre a janela do spawn. Depois da janela do
spawn, a busca prefere o arquivo nascido depois dessa mensagem (a folga de 1 s
para trás só vale quando nenhum nasceu depois), e as conversas já associadas a
outro terminal do app ficam fora da disputa. Os arquivos de subagente do Claude (`isSidechain`) são ignorados, e a
mesma `sessionId` em dois arquivos conta uma vez. No Gemini, o
`.project_root` é comparado como o próprio Gemini normaliza (`path.resolve`, e
minúsculas no win32); antes, a descoberta do Gemini nunca casava no Windows.

**Nada é apagado.** Nem a falha nem a escolha apagam `agentSession`. Quando o
bloco passa a outra conversa, a referência anterior vai para
`previousAgentSession = { reference, replacedAt }`, persistido, e aparece em
Detalhes do terminal. Só "Esquecer associação da conversa" (em Detalhes, com
confirmação) remove a associação: leva `agentSession` e a `resumeFailure` dela, e
mantém `previousAgentSession` como histórico. O export `.fxcanvas`
(`canvas-transfer.cjs`) não leva `agentSession`, `previousAgentSession` nem
`resumeFailure`, que carregam ID de conversa, pasta e conta.

**Textos sem ID.** `describeAgentResumeForPerson` (título e detalhe da faixa),
`describeAgentResumeTarget` (`Codex · /repo · conversa de 28/09 21:40 · conta
própria`) e `buildResumeFallbackNotice` (texto para o agente no desfecho `new`)
não levam o ID da conversa nem o da conta. Para decidir, bastam provider, pasta,
data e se é a conta certa. O ID completo fica em Detalhes do terminal, com o
botão de copiar.

Os limites medidos de cada CLI (retomar por ID, retomar a última, listar,
resposta para conversa inexistente, pasta e conta), com as versões, estão em
[Retomar conversas de agentes](../guias/GUIA-USUARIO.md#retomar-conversas-de-agentes).
A cobertura fica em `agent-session.test.ts`, `quality-standard-prompt.test.ts`,
`terminal-resume-banner.test.ts`, `terminal-run-registry.test.ts`, `resume-outcome-detector.test.ts`,
`terminal-session-store.test.ts`, `canvas-context-e2e.test.ts`,
`agent-session-discovery.test.cjs`, `pty-process-manager.test.cjs` e
`canvas-transfer.test.cjs`.

### Leitura do terminal: o Markdown da tela

A aba **Leitura** da gaveta mostra a conversa de um terminal de agente como
Markdown renderizado. A fonte é só a tela do xterm — o buffer que o terminal
já interpretou (cursor, cor, tela alternativa, redesenho) —, não o arquivo de
conversa do agente nem o fluxo de bytes. As CLIs desenham o Markdown com estilo
de célula (título em negrito, código com cor de sintaxe, tabela com traços), e
é desse estilo que a estrutura é reconstruída.

Módulos, em `src/features/canvas/terminal/reading/`:

- `reading-lines.ts`: lê o buffer (`IBuffer`) em linhas lógicas com segmentos
  de estilo; junta as linhas que o xterm quebrou por largura. O leitor é
  incremental (o histórico acima de `baseY` não muda; o cache cai quando o
  buffer troca, encolhe, muda de largura ou desloca) e guarda no máximo 2.000
  linhas (`droppedLines` diz quantas ficaram só no terminal).
- `reading-profiles.ts`: como cada CLI marca as falas e o status. Só ganha
  perfil a CLI gravada em `__fixtures__/terminal-output` (Claude Code 2.1.286,
  nas telas clássica e cheia, e Codex 0.156.1); o resto usa o perfil `texto`.
- `reading-blocks.ts`: divide a tela em falas (pessoa, agente, aviso; o que vem
  antes da primeira marca e a caixa de digitação ficam de fora) e a fala do
  agente em blocos. `sameReadingContent` confere se os blocos têm o mesmo texto
  das linhas; se não, a fala sai como texto puro.
- `reading-markdown.ts`: blocos → Markdown. Todo texto do terminal é escapado
  (cada pontuação ASCII ganha `\`); só URL `http(s)` vira autolink, que passa
  pela política central de links. Ênfase só quando os delimitadores fecham
  pelas regras de flanco do CommonMark.
- `terminal-reading.ts`: monta a Leitura e guarda as falas por chave de texto e
  estilo (no stream, só a fala que mudou é remontada).

O store expõe `getReadingSource` (buffer e largura) e `subscribeOutput` (no
máximo uma vez por quadro, via `onWriteParsed`; o snapshot continua mudando só
na troca de atividade). `useTerminalReading` relê com intervalo mínimo (250 ms
na gaveta, 1 s no cartão) e só enquanto a Leitura aparece. O painel
(`TerminalReadingPanel`) fica por cima do xterm, do mesmo tamanho: o PTY não é
redimensionado; o xterm fica `inert` e `aria-hidden` enquanto a Leitura
aparece. A prévia do cartão (`TerminalReadingPreview`) desenha os blocos como
texto com estilo, sem `MarkdownContent`, porque fica dentro do botão do cartão.
A escolha é do bloco (`readingMode`, persistido; ausente é o Terminal).

Testes: snapshot do Markdown e do HTML de cada gravação; o texto renderizado
igual ao da tela em todo ponto do stream; leitor incremental igual ao novo;
fuzz de bytes quaisquer; propriedades do escape; sessão F do smoke, com o PTY
roteirizado tocando as gravações (`__felixo_smoke_gravacao_<nome>__`). As
gravações saem de `scripts/record-terminal-fixture.cjs`, que roda a CLI real
num PTY com a conta de quem grava, anonimiza e se recusa a salvar segredo,
plano da conta ou regra de configuração. O Claude é gravado sem as
configurações do usuário (`--setting-sources project,local`): ao abrir, ele
imprime avisos sobre as regras de permissão delas.

Medido num i5-6200U (2 núcleos), com a máquina em carga alta: num histórico de
2.000 linhas, a releitura incremental e a montagem custam ~14 ms por redesenho
(eram ~52 ms antes do cache das falas). `FELIXO_READING_PERF=1` roda a medição
(`terminal-reading.perf.test.ts`); ela não é portão de CI.

### Geometria segura e acessibilidade das superfícies

`CanvasView` mantém o React Flow em uma área full-bleed para preservar pan e
zoom, mas todas as ações que escolhem uma posição usam
`canvas-interaction-geometry.ts`. O módulo traduz a ocupação publicada por
`CanvasSurfacesProvider` em um retângulo de tela que desconta topbar, sidebar,
painel, inspector e statusbar. A gaveta do terminal é irmã flex do container,
portanto seu espaço já saiu do `getBoundingClientRect` e não é descontado de
novo. Criação, foco, abertura de página/tarefa e `fitView`/organização aplicam
essa mesma geometria; o deslocamento do viewport mantém o resultado visível
quando o chrome muda de tamanho.

Os gatilhos de terminal permanecem montados depois que a gaveta foi aberta uma
vez. Isso evita que o culling de nós remova o elemento antes da animação de
fechamento devolver o foco. A auditoria E2E verifica landmarks, nomes
acessíveis, hit testing, arrasto curto, handles de conexão, `Tab`/`Escape`,
foco do terminal e reidratação sem duplicar nós, edges ou sessões. O cenário
usa `MockTerminalSessionStore`, ativado só no DevTools isolado por
`FELIXO_DEVTOOLS_MOCK_PTY=1`; nenhum shell ou CLI de fornecedor é iniciado.

Os tipos `drawing` e `excalidrawDrawing`, já expostos pelo renderer, também
fazem parte do contrato persistido. A migration 013 amplia o `CHECK` de
`canvas_nodes` e o teste de reabertura do banco prova que esses nós sobrevivem
ao restart.

A remoção de um nó é também uma fronteira de ciclo de vida. `CanvasView` passa
as mudanças do React Flow por `releaseRemovedCanvasNodes`: ids de terminal são
liberados no `TerminalSessionStore` e todos os ids removidos seguem para a
persistência, com deduplicação para operações em lote. Isso cobre seleção,
teclado e `deleteElements`, além do botão próprio do terminal, sem carregar o
runtime lazy para nós que não possuem PTY. O `DeferredTerminalSessionStore`
invalida `ensure` enfileirado durante um `clear`, para que um mount atrasado não
recrie uma sessão depois de o canvas ter sido limpo.

A investigação de degradação no Linux reproduziu o custo esperado de muitos
buffers xterm e encontrou esse caminho de remoção que podia deixar PTY, xterm,
listeners e timers vivos. A matriz e os limites de interpretação estão
registrados em [`app/benchmarks/README.md`](../../app/benchmarks/README.md); a
bancada de xterm usa `performance.memory` antes/depois de GC e não substitui
snapshot DevTools de uma sessão real com webviews e providers.

### Bundle e carregamento sob demanda

O renderer de produção é carregado em camadas para que a tela inicial do
canvas não pague pelo chat legado, pelas ferramentas raras ou pelos runtimes
que ainda não podem ser usados:

- `App` mantém `CanvasView` e `ChatWorkspace` como fronteiras `React.lazy`; o
  canvas é o primeiro caminho e o chat só é carregado quando escolhido.
- `CanvasToolPanels` usa um loader por ferramenta. Busca, projetos, notas,
  modelos, prompts, skills, Git, Fetch All, Tarefas Notion, Limites e uso,
  Orquestrador, QA e Configurações ficam em chunks sob demanda, cada um com
  estado de loading e erro recuperável. Foco ou ponteiro preaquece somente a
  opção apontada.
- `DeferredTerminalSessionStore` mantém o contrato síncrono usado pelos nós,
  mas importa `TerminalSessionStore` apenas quando existe uma sessão PTY para
  iniciar/anexar. O runtime xterm/node-pty não entra no canvas vazio.
- `DeferredMarkdownContent` deixa `MarkdownContent` (incluindo os realces de
  sintaxe) para o primeiro preview de nota, arquivo ou mensagem. A
  sanitização e as regras de URL permanecem no módulo original; a divisão não
  altera a fronteira de segurança.

O Vite usa `base: './'`, requisito para o Electron carregar `dist/index.html`
por `file://`. O benchmark `npm run benchmark:bundle:check` abre o artefato
real em novas janelas com `userData` temporário, mede startup/menu, registra
bytes crus e gzip, confirma o `import()` do Fetch All e verifica todas as
referências relativas de JS/CSS. O mesmo check roda depois do build no CI dos
três sistemas. A compilação de 01/09/2026 gerou entry de 191,73 KiB cru
(60,37 KiB gzip), 41 assets JavaScript e nenhum aviso de chunk acima de
500 kB; os chunks grandes de PTY e Markdown permanecem isolados até serem
necessários.

### Instalador NSIS do Windows: ganchos próprios

`build.nsis.include` aponta para `app/installer/instalador.nsh`. O arquivo entra
no cabeçalho do instalador e do desinstalador, antes dos templates do
electron-builder. Existe por um defeito medido em 07/10/2026: a instalação
silenciosa (`/S`) por cima de uma instalação registrada em pasta 8.3
(`C:\Users\RUNNER~1\...`), com o app aberto e o chamador sem elevação, travava
para sempre.

- **Causa.** A checagem padrão de app aberto compara `Win32_Process.Path`, que
  vem com caminho longo, com `$INSTDIR`, que é curto, e não vê o app. O
  desinstalador antigo falha com os arquivos em uso. O `handleUninstallResult`
  padrão então mostra um `MessageBox` sem `/SD`, invisível em `/S`, num processo
  elevado que o chamador não consegue matar.
- **`customCheckAppRunning`.** Roda a MESMA `_CHECK_APP_RUNNING` do
  electron-builder, uma vez só, num laço por três pastas: o destino e o
  `InstallLocation` de HKCU e de HKLM. Cada uma é convertida para o caminho longo
  (`GetLongPathNameW`). Com `/D=` para outra pasta, só assim o app que roda da
  pasta antiga é fechado antes do desinstalador antigo, que já foi distribuído e
  não muda. O desinstalador novo só olha a própria pasta.
- **`customUnInstallCheck`/`customUnInstallCheckCurrentUser`.** São iguais ao
  padrão, com `/SD IDOK` no `MessageBox`: em `/S`, a falha vira código de saída 2.
- **Armadilhas do build.** O electron-builder compila com `-WX`. Definir
  `customCheckAppRunning` desliga o `!include "getProcessInfo.nsh"` e o `Var pid`
  dos templates (o arquivo os repõe). Inserir a checagem padrão duas vezes na
  mesma seção duplica os rótulos dela, daí o laço.
- **Prova e gate.** `app/scripts/windows/reproduzir-nsis-app-aberto.ps1`
  reproduz os cenários num runner descartável. O I usa `/D=` e o L não; nos dois,
  a instalação é para todos, em 8.3, com o app aberto e o chamador limitado por
  uma tarefa agendada `RunLevel Limited`. Antes da correção os dois ficavam
  presos 180 s (runs 37591182111 e 37624204763). Depois, terminaram com exit 0
  em 38 s e 43 s (run 37625032022). O `release.yml` roda I e L com `-Verificar`
  no Windows, depois do smoke do canvas no pacote. O workflow manual
  `reproduzir-nsis-app-aberto.yml` constrói o instalador de um commit e roda os
  mesmos cenários.
- **Fora do escopo, documentado.** Um usuário sem admin rodando `/S` sobre uma
  instalação para todos para no pedido de elevação do Windows (UAC). Isso é do
  sistema; o guia do usuário orienta a rodar elevado ou instalar por usuário.

### npm-runtime do instalador

Como o app instalado precisa instalar CLIs sem depender de Node/npm do usuário,
o `beforePack` copia `app/node_modules/npm` para o recurso externo
`resources/npm-runtime/npm`. A cópia preserva `bin/npm-cli.js`, `lib`,
`package.json`, dependências de produção e os arquivos Python/auxiliares do
`node-gyp`; comandos npm são carregados dinamicamente e não permitem uma lista
manual frágil de módulos.

A política remove somente documentação, source maps e diretórios reconhecidos
como não runtime (`test`, `tests`, `__tests__`, `example(s)`, `fixture(s)`,
`benchmark(s)`, `coverage`, `.github`, snapshots e `.nyc_output`). O benchmark
`npm run benchmark:npm-runtime:check` compara essa política à cópia anterior,
mede tamanho descompactado e `tar.gz`, startup, primeira instalação e
atualização, e exercita a mesma árvore com Electron em um prefixo/cache
descartáveis offline. O smoke instala uma fixture com lifecycle, verifica
PATH, shims, permissões e persistência; o release smoke também registra o
tamanho do runtime que realmente entrou no artefato e seus tempos de npm.

O check roda nos três SOs no CI. A poda só é aceita quando reduz o artefato e
mantém instalação/atualização, comportamento offline, permissões e prefixo;
não há remoção baseada em adivinhar quais módulos JavaScript o npm poderá
carregar futuramente. Depois do empacotamento, `package-inventory.cjs` registra
o hash e os pacotes do `app.asar`, mede os recursos desempacotados e comprova a
presença do `resources/npm-runtime/npm` com seu manifesto e tamanho.

### Avaliação de gerenciadores alternativos

O launcher instala CLIs em `userData/clis` sem exigir Node/npm do usuário. Por
isso, substituir npm não é uma troca de dependência isolada: o novo gerenciador
teria de reproduzir prefixo privado, binários no PATH, shims `node`, atualização,
permissões, isolamento por perfil, modo offline e comportamento de CLIs com
dependências nativas em Linux, Windows e macOS.

`scripts/package-manager-alternatives-performance.cjs` deixa essa hipótese
reproduzível sem mudar a produção. Ele reaproveita o smoke do npm-runtime e
mede pnpm, Yarn Classic e Yarn moderno após bootstrap controlado por Corepack.
pnpm é exercitado com `global-dir` + `PNPM_HOME/bin`; Yarn Classic com
`global-folder` + `prefix/bin`; Yarn moderno somente prova a ausência do
comando global npm-style. O fixture é local e offline, e as alternativas usam
`--ignore-scripts`; CLIs oficiais reais e scripts nativos são um gate separado.

O resultado Linux de 03/09/2026 foi: npm 11.19.1 com 8,41 MiB descompactado,
startup p50 de 2.093 ms e primeira CLI p50 de 2.857 ms; pnpm 11.25.0 com
19,36 MiB, startup de 4.317 ms e primeira CLI de 11.678 ms; Yarn Classic
1.22.22 com 5,09 MiB, startup de 1.464 ms e primeira CLI de 5.283 ms. Yarn
moderno 4.10.3 não ofereceu global install; Corepack 0.34.6 precisou de
bootstrap frio de até 8.203 ms e cache/versionamento próprio. A recomendação
é manter o npm-runtime até que versões/hash, cache offline, scripts nativos,
matriz dos três SOs e smoke no instalador real sejam validados. O CI publica
um JSON da comparação por runner.

### Renderização segura de Markdown

`MarkdownContent` recebe texto de agentes, arquivos, histórico e saídas com
formato de terminal como conteúdo não confiável. Antes do parser, o módulo
remove sequências ANSI, normaliza quebras e limita o texto a 200.000
caracteres. O pipeline mantém `remark-gfm` e os elementos visuais necessários,
mas executa `rehypeRaw` seguido de um schema explícito do `rehype-sanitize`:
HTML ativo, embeds, SVG, mídia, CSS remoto e atributos de evento não chegam ao
DOM. A transformação final de URLs repete a decisão no boundary do React:
links ficam em `http:`, `https:`, `mailto:` ou âncoras; imagens remotas são
bloqueadas e viram texto alternativo; `data:` só aceita imagens raster base64
de até 2 MiB.

Uma referência relativa de imagem só é convertida em `file://` quando o
componente recebeu o `baseDir` derivado de um arquivo já autorizado pelo
processo principal. Caminhos absolutos e esquemas `file:`, `javascript:` ou
desconhecidos são recusados. A suíte testa o renderer estaticamente; a
validação de execução em Electron deve ser registrada separadamente quando
houver uma sessão gráfica disponível.

### Links externos: uma política e um portão

Todo link que pode sair do app passa pela mesma decisão, `classifyExternalUrl`.
Isso vale para:

- texto que parece URL e hyperlink OSC 8 no terminal;
- Markdown de agente ou de arquivo;
- links dos painéis;
- popup de página no bloco "Página Web";
- pedido `abrir-pagina` de agente.

A allowlist vive num único JSON de fronteira,
`electron/services/external-url-policy.json`, com `http:`, `https:` e
`mailto:`, cada um com justificativa escrita. Página web (`http:`/`https:`) é o
subconjunto aceito pelo terminal, pelo bloco "Página Web" e pelos pedidos de
agente. O `mailto:` só leva `to`, `cc`, `bcc`, `subject` e `body`, porque
clientes de e-mail já anexaram arquivo local por `attach=`. Um teste falha se
a lista ganhar um esquema sem justificativa.

A decisão existe duas vezes, de propósito:

- `src/features/shared/external-url-policy.ts` decide, no renderer, o que vira
  link clicável;
- `electron/services/external-url-policy.cjs` decide, no processo principal, o
  que abre.

O renderer não é o portão: qualquer conteúdo que chegue a ele consegue pedir um
`window.open`. As duas implementações rodam a mesma tabela de casos
(`external-url-policy.cases.json`). Um teste diferencial compara as duas em
20.000 entradas aleatórias com controles, invisíveis, entidades e esquemas
disfarçados.

A política recusa:

- controles C0/C1 e separadores de linha;
- caracteres invisíveis e de direção, por propriedade Unicode
  (`Default_Ignorable_Code_Point` e `Cf`), crus ou percent-codificados no
  host: o IDNA apagaria um `U+200B` e abriria outro domínio. No Markdown, que
  codifica a URL antes da política, um plugin remark recusa o link ainda cru;
- espaço interno;
- falta de esquema, ou esquema fora da lista;
- URL que o parser não aceita;
- falta de host (web) ou de destinatário (mailto);
- usuário ou senha no endereço: `https://google.com@evil.example` diz um
  domínio e abre outro, e uma senha iria em texto claro para o histórico do
  navegador;
- `mailto:` com fragmento: `#&attach=…` ficaria fora da checagem de campos;
- mais de 8.192 caracteres, na entrada ou no `href` serializado (cada
  ideograma vira `%XX%XX%XX`).

O que é aprovado sai na serialização do parser (`URL.href`), então o opener
recebe exatamente o que foi validado: IP decimal vira o IP canônico e IDN vira
punycode.

Portões do processo principal:

- `external-links.cjs` é o único caminho até `shell.openExternal`. A recusa
  registra só esquema e host (`describeExternalUrlForLog`), porque caminho,
  query e userinfo podem carregar token; a falha do sistema ao entregar o
  endereço segue a mesma regra no log. O handler de `window.open` da janela
  (`createExternalWindowOpenHandler`) responde `deny` na hora e, se a
  abertura rejeitar, avisa a própria janela (`external-links:open-failed`)
  para ela mostrar o aviso com "Copiar link".
  - No Linux, o `shell.openExternal` do Electron chama o `xdg-open` e resolve
    sem esperar a saída dele (`platform_util_linux.cc`: "Don't wait for exit").
    Medido no Electron 41.10.7: com o `xdg-open` saindo com 3 (sem navegador)
    ou ausente, a promessa resolve em milissegundos. Por isso, no Linux, o app
    roda o `xdg-open` ele mesmo (`linux-xdg-open.cjs`), como o Electron: o
    endereço vai como argumento único, sem shell, com `MM_NOTTTY=1`. A
    diferença é esperar 3 s: saída com erro (ou `xdg-open` inexistente) é
    falha; saída 0 ou processo vivo (o navegador em primeiro plano, no modo
    genérico) é sucesso. O processo nasce destacado e solto do app. No macOS
    e no Windows, o shell do Electron já rejeita, e fica como está.
  - Só na instância de automação que pediu (`FELIXO_DEVTOOLS_SHELL_OPEN=falha`,
    mesma guarda da CLI roteirizada), `devtools-shell-open-guard.cjs` troca o
    shell por um que sempre falha: o da janela (menu, botão da Página Web,
    navegação) e o do cartão de pedido de agente. A sessão D do smoke prova o
    aviso assim, sem abrir navegador nenhum.
  - O caminho inteiro no **app empacotado** (gesto, menu, main, `shell`,
    sistema e navegador) tem uma validação à parte,
    `scripts/packaged-links-check.cjs`. Ela instala o artefato, dirige o
    binário por `felixo devtools launch --packaged` e conta, num servidor em
    127.0.0.1, os pedidos que o navegador faz: cada endereço tem de chegar uma
    vez e inteiro (porta, consulta, Unicode, pontuação em volta, pedaços de
    shell que não podem executar). O recusado não pode chegar, e o terminal
    tem de seguir respondendo. Não roda no release: é para repetir à mão ou num
    workflow temporário. No Linux, `--navegador curl` troca o `xdg-open` por um
    que faz o pedido com `curl`, e `--navegador ausente` por um que falha.
- `navigation-guard.cjs`:
  - a janela principal nega `will-navigate`/`will-redirect` para fora do
    próprio documento, porque o preload exporia a API do app a qualquer página
    carregada ali;
  - todo `<webview>` anexado perde preload e Node e só nasce em página web
    (`will-attach-webview`), não importa o que o atributo `webpreferences`
    peça.
- `webview-lifecycle.cjs`: popup e `target=_blank` dentro do bloco só abrem
  página web. O `loadURL` feito pelo main não passa pelo filtro que o Chromium
  aplica à navegação do próprio site.
- `session-security.cjs`: o Chromium pede a permissão `openExternal` quando uma
  página navega para `vscode:`, `ms-msdt:` e afins. Em toda sessão, inclusive
  nas partições dos perfis, essa permissão passa pela mesma política. As outras
  permissões mantêm o padrão do Electron.

#### Escolha de destino: nenhum link abre direto

Todo link que vem de conteúdo pergunta antes de abrir. Vale para a saída do
terminal, o Markdown (notas, arquivos, chat, painel do Notion) e os links
dentro de uma "Página Web". O gesto abre um menu único, que mostra o destino e
oferece três escolhas: **Abrir no navegador**, **Abrir como Página Web** e
**Copiar link**. O gesto varia por superfície:

- Ctrl/Cmd+clique, toque, clique direito ou tecla de menu no terminal;
- clique, Enter ou clique direito no Markdown;
- clique direito num link da "Página Web".

Nenhuma preferência de destino fica guardada.

Peças, quase todas em `src/features/shared/links/`:

- `link-destination.ts` (puro) traduz a decisão da política:
  - para onde o link vai: host em punycode, ou os destinatários do e-mail,
    incluindo to/cc/bcc da query, lidos à mão porque `URLSearchParams` troca
    `+` por espaço;
  - quais escolhas cabem;
  - na recusa, o motivo em português comum.

  O título é encurtado **no meio** (`shortenAddress`): num host como
  `login.banco.com.aaa….evil.example`, o fim é o domínio de verdade. O texto
  recusado aparece com os invisíveis à mostra (`⟨U+200B⟩`). `runLinkChoice`
  classifica de novo antes de agir, e "Copiar" só conhece a área de
  transferência.
- `link-chooser-store.ts` guarda o pedido fora do React, porque o terminal é
  um store imperativo. O pedido é uma cópia do link no instante do gesto: se a
  saída rolar ou uma resposta em streaming reescrever o texto, o menu continua
  mostrando e abrindo o mesmo endereço. O canvas registra ali o criador de
  bloco Página Web, que devolve `{ id, cameraSettled }`. Sem canvas montado
  (tela do chat), o menu não oferece essa escolha.
- `LinkChooserHost.tsx`, montado uma vez no `App`, desenha o menu:
  - `role=menu` (com `aria-describedby` no resumo do destino), setas,
    Home/End, Enter/Espaço, Esc e Tab. Enter ou Espaço repetidos pela tecla
    segurada não escolhem nada. O container tem `tabIndex=-1`, então clicar no
    resumo não solta o teclado para o que está atrás;
  - fecha com clique fora, roda, redimensionamento, perda de foco da janela ou
    foco levado a outro elemento (um diálogo que abre por cima). Na roda e no
    redimensionamento, o foco volta a quem abriu;
  - a escolha devolve o foco a quem abriu (a entrada do xterm, o link, o
    webview), com `preventScroll`: focar um elemento só em parte visível
    rolava o container do React Flow e tirava o canvas inteiro do lugar. Com "Abrir como Página Web", o foco só vai ao bloco novo depois
    que a câmera chega (`afterCamera`). O React Flow desenha o nó ainda sem
    medida e o desmonta quando o mede fora da tela, então focar antes jogaria
    o foco no `body`;
  - a região `status` anuncia "Link copiado" a cada cópia;
  - o aviso de link que não abriu (`role=alert`, com "Copiar link" e fechar).
    O processo principal manda `{ url, kind, reason? }` pelo canal
    `external-links:open-failed` quando o `openExternalUrl` rejeita: `falhou`
    é o sistema (sem navegador padrão, handler quebrado) e `recusado` é a
    política do main. O texto sai de `link-open-failure.ts` (puro), e o motivo
    da recusa vem da política do renderer. O aviso não pega o foco, leva as
    duas marcas de `floating-layer.ts` e fica até copiar, fechar ou um aviso
    novo tomar o lugar.
- `shared/focus/floating-layer.ts` define duas marcas.
  - `data-felixo-floating-layer` está no menu e no cartão de pedido. Clicar
    ali não é "clicar fora" da gaveta do terminal: sem ela, "Copiar link" ou
    "Recusar" fechavam a gaveta com o agente.
  - `data-felixo-focus-transient` está só no menu. O `useFocusRestore` não
    troca o dono do foco por um item que some no blur da janela.

  Um teste estático trava as duas marcas no JSX.

Esquemas aceitos por origem: o terminal só aceita página web. O Markdown e os
links de dentro da "Página Web" aceitam também `mailto:`, que abre como "Abrir
no app de e-mail". Na página, o clique simples num `mailto:` já abre o app de
e-mail pela permissão `openExternal` da partição, e o menu diz o mesmo.

Um link recusado nunca some: o menu diz o motivo e oferece só "Copiar link".
No Markdown, o rótulo vira texto com o motivo na dica, e um botão pequeno ao
lado abre o menu. Um botão que embrulhasse os filhos poria o "copiar" de um
bloco de código dentro de outro botão.

A exceção é o destino com caracteres invisíveis, que vira só texto, sem botão:
o plugin remark o recusa ainda cru, e mostrar o endereço seria o disfarce.

Um destino escrito que a política aprova, mas que o `rehype-sanitize` apagou
(ele diferencia caixa: `HTTPS://`), volta a ser link pela forma serializada da
política. No `<a>` aprovado, o clique num controle de dentro do link (o
"copiar" de um bloco de código) é do controle, não pede o menu.

Os botões do app que já dizem o destino ("Abrir no Notion", "Abrir esta página
no navegador" no bloco) não perguntam. A escolha já está no rótulo.

No terminal, os dois caminhos de link (WebLinksAddon e OSC 8) usam o mesmo
`linkHandler`. Um clique simples de mouse continua sendo do terminal (foco,
seleção, mouse das CLIs de tela cheia). Ctrl/Cmd+arrastar é seleção, não
pedido. As regras de gesto e plataforma:

- **Toque.** Vale como gesto porque um dedo não tem Ctrl: o Chromium marca o
  evento de mouse que vem de toque em `sourceCapabilities.firesTouchEvents`.
  Com o mouse tracking ligado (Claude Code, Codex), o replay do mousedown
  retido copia essa marca.
- **Ctrl no macOS.** Só Cmd é modificador de link. O Ctrl+clique é o clique
  secundário do sistema: chega como `contextmenu` já no mousedown, e contá-lo
  de novo no mouseup pedia o menu duas vezes. Por isso, com o mouse tracking,
  o Ctrl+clique do macOS também não é retido.
- **Dica.** Mostra o destino real (num OSC 8, o texto exibido pode dizer outra
  coisa) e, na recusa, o motivo.
- **Shift+F10.** Não abre o menu no terminal: o xterm entrega o F10 à CLI.

Na "Página Web", o menu nasce do evento `context-menu` do `<webview>`. Os
`params.x/y` já chegam no espaço da janela do app, em DIP: o Electron soma a
posição do webview, o iframe e a escala do canvas. A âncora é o ponto
dividido pelo zoom da janela (`window.felixo.windowZoom.getFactor()`, via
`webFrame`); isso foi medido num experimento isolado no Electron 41.10.7 e é
conferido pelo smoke. Um link `javascript:` chega como `about:blank#blocked` e
não abre o menu. "Abrir como Página Web" a partir de uma Página Web herda o
perfil do bloco de origem.

A barra de endereço da "Página Web" e o formulário "Criar Página Web" usam
`explainUrlInput`, com o mesmo motivo do menu. Antes, um `file:///…` na barra
não fazia nada, e o formulário só dizia "endereço inválido". Na recusa, o foco
fica na barra, para um Backspace apagar texto e não o bloco selecionado
(`deleteKeyCode` do React Flow). O aviso some quando a página navega.

#### Pedido de agente para abrir página

`felixo browser open` não abre nada sozinho. O pedido válido fica pendente na
fila `agent-requests`, e o cartão `AgentBrowserRequestCard` mostra à pessoa:

- de onde o pedido veio;
- o endereço inteiro, numa caixa com rolagem;
- a sugestão do agente (`--embedded`, `--profile`);
- três botões: navegador, Página Web ou recusar.

Pelo `felixo browser open`, um agente enganado por uma página que leu não abre
nada sozinho: quem abre é a pessoa, no cartão. O cartão não é barreira contra o
shell do agente. A CLI roda como a pessoa, no ambiente gráfico dela, e pode
chamar o abridor do sistema (`xdg-open`, `open`, `start`) diretamente. Isso
segue as permissões da própria CLI.

O renderer manda só o que a pessoa viu: `{ id, destino, url, perfil }`
(`agent-browser:decide`). O main relê o pedido gravado e só executa se ele
ainda for esse:

- mesmo id no nome e no conteúdo do arquivo (`ler` recusa id inseguro e
  conteúdo com outro id, e `lerTodos` descarta arquivo fora do padrão; isso
  vale para todas as intenções da fila);
- a mesma URL serializada;
- o mesmo perfil;
- dentro da validade.

Um arquivo reescrito depois de o cartão aparecer não abre, e o cartão recebe a
lista atual. Outras garantias:

- **Concorrência.** Duas decisões do mesmo pedido ao mesmo tempo abrem uma vez
  só (reserva em memória antes do primeiro `await`).
- **Falha ao abrir.** Se o navegador falha, ou se o perfil sumiu, o pedido não
  é resolvido: o cartão mostra o motivo, e a pessoa escolhe de novo.
- **Quem recusou.** Toda recusa grava `recusadoPor: 'pessoa' | 'app'`.
- **Robustez.** Pedido malformado (url, modo, perfil ou pedidoEm que não são
  texto, ou perfil com modo externo) é recusado pelo app na chegada. Ele nunca
  derruba o registro do main nem o render do cartão, e o log de recusa não
  leva a URL.
- **Custo.** Eventos da pasta viram uma rodada agrupada, com uma varredura, e
  o IPC só sai quando a lista muda.
- **Validade.** Um timer resolve cada pedido vencido (1 h) como expirado, pelo
  app, e o cartão o tira da tela.

O cartão não rouba o foco nem responde a teclas globais, para um Enter
digitado no terminal não confirmar nada. Os botões esperam 600 ms depois que o
pedido mostrado muda, e cliques repetidos (`detail > 1`) são ignorados: um
duplo clique não decide o pedido seguinte. O cartão é montado no `CanvasView`,
porque a Página Web precisa do canvas. Com a tela do chat aberta, o pedido fica
na fila até a pessoa voltar.

O resultado gravado diz o destino sugerido (`modoPedido`) e o escolhido
(`modo`). `felixo browser status` mostra quem recusou, o motivo ou a
expiração.

#### CSP do renderer

O build injeta uma `<meta http-equiv="Content-Security-Policy">` no
`dist/index.html`, pelo plugin `felixo-renderer-csp` do `vite.config.ts`. A
política e os `sha256` dos scripts inline vêm de `scripts/renderer-csp.cjs`,
calculados sobre o HTML final. O `generateBundle` confere o arquivo que vai
para o disco, e o build falha se algum script inline ficar sem hash. Sem essa
conferência, o botão "Recarregar interface" do fallback de boot seria
bloqueado em silêncio.

- `script-src 'self'` com hashes, sem `'unsafe-inline'` e sem `'unsafe-eval'`.
- `object-src`, `base-uri`, `form-action` e `frame-src` como `'none'`.
- `connect-src 'self'`: o renderer não fala com a rede, tudo que é remoto
  passa por IPC.
- `style-src` precisa de `'unsafe-inline'` por causa do xterm, do Excalidraw e
  do `<style>` do boot.
- A única origem de rede é `https://esm.sh`, e só em `font-src`: são as fontes
  dos desenhos do Excalidraw. Fonte não executa código, e servi-las pelo build
  é uma task aberta.
- `frame-src 'none'` também vale para os embeds do Excalidraw (YouTube,
  Figma…). Por isso o bloco de desenho passa `validateEmbeddable={false}`: o
  Excalidraw diz que o embed não é permitido, em vez de mostrar um frame
  quebrado. Um teste trava as duas decisões juntas. Religar embeds exige
  escolher os hosts no `frame-src` e no `validateEmbeddable`.

O dev server fica sem CSP. Ele usa scripts inline do React Refresh e o
WebSocket do HMR, e uma política afrouxada para caber nele não provaria nada
sobre o instalador. Sob `file://`, `'self'` casa com qualquer URL `file:`. Esse
limite é da origem, não da política, e fechá-lo exigiria um protocolo próprio.
`frame-src` não controla `<webview>`, então o isolamento do webview continua
sendo do processo principal.

### Sincronização segura do Felixo System Design

`system-design-service.cjs` executa `git` com `execFile` e argumentos
separados, sem shell. Antes de persistir ou usar a configuração, o processo
principal remove userinfo, parâmetros sensíveis e fragmentos de URLs de
repositório. A autenticação de repositórios privados fica a cargo do
credential helper do Git ou do gerenciador de credenciais do sistema; segredo
embutido na URL não é um mecanismo suportado.

Erros do Git passam por `git-secret-redaction.cjs` antes de qualquer `lastError`,
evento do QA Logger ou resposta IPC. O diagnóstico mantém etapa, código,
branch e destino seguro, usa stderr apenas depois da redação e elimina a linha
de comando completa. A migração de configuração também regrava URLs e erros
legados já sanitizados no SQLite.

### Fonte do System Design: contrato e precedência

`electron/core/system-design-source.cjs` é a única definição do padrão da fonte e
da migração da configuração (`schemaVersion` 2). Só a escolha explícita é gravada
(`sourceMode: custom` + `customSource`); no modo `default` a fonte é resolvida na
leitura, então um novo padrão do app alcança quem o segue e nunca uma fonte
escolhida. A precedência é **escolha do usuário > padrão do app**; o fallback
offline não é uma terceira fonte, é o último conteúdo entregue (`delivered`), que
segue valendo enquanto a sincronização falha.

A migração do v1 (que gravava `repoUrl`/`branch` sempre) trata como "segue o
padrão" o que for igual ao padrão atual ou a um padrão histórico
(`LEGACY_DEFAULT_SOURCES` — ao trocar o padrão do app, acrescente o que está
saindo), e como escolha explícita o restante, preservando `enabled`, sha, data e
erro.

`system-design:save-config` aceita só `enabled`, `sourceMode: 'default'`, `repoUrl`
e `branch` (lista branca); sha, data, erro e fonte entregue só o processo principal
escreve, e URL inválida é recusada sem gravar. O serviço descarta um clone em cache
cujo `origin` não é a fonte pedida (antes o `fetch` rodava no `origin` antigo e o
conteúdo da fonte anterior era gravado como da nova). O renderer não tem cópia do
padrão; recebe a configuração já resolvida com `syncState` (`disabled`,
`never-synced`, `synced`, `offline-fallback`, `pending-source-change`) e `delivered`.

## Tutorial do canvas, Ajuda e novidades

O tutorial é uma camada de explicação por cima do canvas: destaca controles reais
e nunca os aciona. O plano completo, com as decisões e as alternativas
descartadas, está em [`PLANO-TUTORIAL-CANVAS.md`](PLANO-TUTORIAL-CANVAS.md).

**Camadas do renderer (`app/src/features/onboarding/`).**

| Módulo | Papel | Chunk |
| --- | --- | --- |
| `onboarding-boot-signals.ts` | Foto das chaves `felixo*` do localStorage e marcador de primeiro boot, tirada em `main.tsx` antes do `createRoot` (o tema e o Modo Performance gravam no mount) | entrada |
| `onboarding-store-proxy.ts` | O `onboardingStore` da janela e os hooks (`useSyncExternalStore`): procurador que baixa o chunk da store quando o canvas monta, antecipa a leitura pelo IPC no `canvasReady`, guarda as chamadas feitas antes e as repassa na ordem, e espelha o snapshot da store (o badge da Ajuda lê daqui) | canvas |
| `onboarding-canvas-triggers.ts` | Tipos de bloco que podem anunciar novidade pelo canvas (o catálogo só aceita gatilho com tipo da lista) e o formato da chave de tipos | canvas |
| `OnboardingMount.tsx`, `OnboardingErrorBoundary.tsx` | Host na árvore, logo depois da sidebar (Tab: sidebar → tour → canvas), região live sempre montada e o boundary que isola falhas | canvas |
| `onboarding-catalog.ts` | Tours, passos, âncoras, novidades e o livro de versões (`CATALOG_HISTORY`); só chaves de texto | preguiçoso, da store |
| `onboarding-state.ts` | Schema v1, `normalize` (nunca lança), migrações, decisão automática, Ajuda e eventos puros | preguiçoso, da store |
| `onboarding-store.ts` | A store de verdade (a autoridade): leitura, decisão automática, compare-and-set com até 3 tentativas, sessão por janela e anúncios | preguiçoso, da store |
| `onboarding-ui-entry.ts` e o que ele exporta | Textos (`onboarding-messages.ts`), posicionamento (`onboarding-layout.ts`), camada, card, anel, aviso e menu Ajuda | preguiçoso, da interface |

São dois chunks preguiçosos (o catálogo, usado pelos dois, sai num terceiro, de
2,5 kB). O da store começa a baixar quando o canvas monta, depois do primeiro
desenho e durante a hidratação; a leitura do estado continua começando quando o
canvas hidrata, e a store recebe essa mesma leitura. O da interface só é baixado com tour ou aviso na tela ou com o menu Ajuda
aberto, e sempre depois de a store estar ligada (`loadOnboardingUi`). Um teste
estático (`onboarding-boundaries.test.ts`) confere essas fronteiras e proíbe no
módulo imports de criação de nó, PTY, terminal, chat, rede e ponte fora de
`onboarding`, `qaLogger` e `devtools`.

**Persistência.** O main é a única autoridade: linha `onboarding.state` da tabela
`settings` do SQLite, no envelope `{ "revision": n, "value": {…} }`.
`onboarding-state-repository.cjs` faz o compare-and-set dentro de um
`BEGIN IMMEDIATE` (um SELECT e um UPSERT); uma linha corrompida vira
`corrupted: true` com revisão 0 e pode ser regravada. Não há espelho no
localStorage. Só a retomada do passo fica em `sessionStorage`
(`felixo:onboarding:sessao`, por janela).

**Canais IPC** (`onboarding-ipc-handlers.cjs`, expostos em
`window.felixo.onboarding`):
- `onboarding:read` → `{ ok, revision, value, corrupted, appVersion, automation }`;
- `onboarding:write({ expectedRevision, value })` → aplicado com a revisão nova, ou
  conflito com o valor atual. O main recusa `value` que não seja objeto simples com
  `schemaVersion` inteiro ≥ 1 e acima de 64 KiB.

A versão do app chega na leitura só como contexto gravado; nenhuma decisão
depende dela. A detecção de novidade é por identidade (id do catálogo fora de
`knownFeatures`), nunca por versão, hash ou arquivo. Um schema mais novo que o
build (downgrade) fica em somente leitura: nada abre sozinho e nada é gravado.

**Política de automação** (`core/onboarding-automation.cjs`, decidida no main e
devolvida em `onboarding:read`): o app normal abre e grava sozinho; toda instância
com porta de depuração (`felixo devtools`, `canvas-smoke`, `ui-render-performance`,
`hardware-check`) não abre nem grava nada sozinha, salvo `FELIXO_DEVTOOLS_ONBOARDING=1`;
sem ponte (`dev:web`, bancada de bundle) nada é gravado. A decisão fica exposta em
`data-felixo-onboarding-decisao` na região live (por exemplo,
`suprimido:abriria-inicial`).

**Convivência.** O card é `position: fixed` em z 55, o anel em z 54: acima dos
toasts (z 50) e abaixo dos diálogos que bloqueiam agente (z 60). Nenhum ancestral
do host pode criar containing block ou stacking context (o smoke confere). O
posicionamento desvia de `[data-felixo-tour-avoid]` (toast das CLIs e
`NoticeToast` dos HardwareNotices) e nunca usa `scrollIntoView`. O teste de alvo
(`elementFromPoint`) olha através do próprio card e do aviso, para a escolha do
alvo não depender de onde o card está. O recálculo acontece em resize, mudança de
tamanho dos alvos e do card, estrutura da sidebar, atributos dos alvos, fim de
transição da sidebar e do inspector e em qualquer rolagem que mova um alvo (abrir
a gaveta do terminal rola o shell de lado por um instante), sempre com no máximo
um quadro por vez e só com o tour ou o aviso na tela. Enquanto o tour aponta uma
alternativa ao alvo preferido (o menu do canvas com a sidebar recolhida, por
exemplo), a posição também é conferida a cada 500 ms: o que cobriu ou deslocou o
alvo pode sumir sem disparar evento nenhum.

**Rolagem da sidebar.** Para mostrar um alvo abaixo da dobra, o tour rola só o
`.felixo-sidebar-scroll`, de forma instantânea, e só até a pessoa rolar: da
primeira rolagem dela naquele passo (roda do mouse, barra, teclado ou o foco levado
por `Tab`) em diante, o tour não mexe mais na rolagem até o passo seguinte
(`SidebarScrollGate`, em `onboarding-layout.ts`). O eco da rolagem do próprio tour
é reconhecido pelo valor escrito. O alvo pode então ficar recortado ou fora de
vista, e o anel mostra só a parte dele que aparece na sidebar (some quando nada
aparece). Sem essa regra, cada rolagem da pessoa disparava um recálculo que
devolvia a sidebar para o alvo, e o `Tab` focava controles que o tour tirava de
vista.

## Providers e contas

Os providers entram por adapters e pelo registry de Terminal Adapters. A
execução de agentes pode usar Claude, Codex, Gemini, Codex App Server, Gemini
ACP e o launcher Openia, conforme a instalação e a configuração local.

Cada conta pode ter um perfil isolado por terminal. O perfil escolhido é
persistido no nó e nas preferências reutilizáveis; credenciais continuam sob o
controle da CLI/provider. O painel **Limites e uso** consulta as fontes que cada
provider realmente publica, separa contas por fingerprint seguro e nunca
transforma ausência de informação em zero.

O Openia tem duas fontes de chave deliberadamente distintas: sem `accountId`, o
login do sistema é consultado por `openia key status` e atualizado por
`openia key set-stdin`; com `accountId`, a chave é lida da loja cifrada da
conta e injetada apenas como `OPENROUTER_API_KEY` no processo filho. O renderer
recebe somente `secretConfigured`, um booleano que indica presença, nunca o
segredo. Não existe fallback implícito da conta para a chave global.

Ao preparar o lançamento, `useAgentConfig` relê a lista da conta e confere essa
fonte de verdade antes de liberar o spawn. A barreira do processo principal
repete a mesma regra em `validateAccount`, de modo que uma conta Openia sem
chave seja recusada antes de compor o ambiente ou criar o PTY.

O `providerId` acompanha a configuração do renderer até o spawn. O IPC e o
`PtyProcessManager` conferem a combinação `accountId`/provedor/comando antes de
chamar `buildAccountEnv`; a loja repete a validação antes de devolver as
variáveis do perfil. Nodes antigos sem `providerId` inferem o provedor somente
para comandos oficiais conhecidos. Uma resposta assíncrona de contas que já
não corresponde ao agente visível é descartada por token, e a troca limpa a
seleção anterior antes de iniciar nova consulta.

O drawer lateral não cria um contrato paralelo de autenticação: ao reiniciar
uma sessão expandida, `CanvasView` copia `accountId` e `providerId` do node para
as opções do drawer, e o drawer repassa as mesmas opções ao
`TerminalSessionStore.restart`. Sem `accountId`, o campo permanece ausente e o
PTY segue o login do sistema.

Quando a fonte responde, a coleta é marcada como atual e mostra o horário da
medição. O Claude é consultado em uma sessão PTY descartável por conta/perfil e
expõe os dados completos e redigidos do `/status`; Codex e Openia usam suas
fontes locais/oficiais disponíveis; providers sem cota consultável são
apresentados como indisponíveis ou sem informação.

### Cadeia de contas

A regra (decisões do dono, classes de falha, elegibilidade, estratégias, espera,
confirmação e privacidade) está em [`POLITICA-CONTAS.md`](POLITICA-CONTAS.md). O
plano, com o mapa de arquivos, a sequência de commits e o mapa de testes, está em
[`PLANO-CADEIA-CONTAS.md`](PLANO-CADEIA-CONTAS.md). Esta seção mostra como as
peças se encaixam.

A cadeia nasce **desligada** ao instalar e ao atualizar. Desligada, nenhum bloco
troca de conta: uma falha detectada só gera aviso e, numa conta própria, a
espera dela. Ligada, a cadeia **só propõe**; toda troca passa por uma confirmação
da pessoa, e quem cria a proposta, confere a confirmação e emite o ticket é o
processo principal.

**Camadas no processo principal (`app/electron/services/`).**

| Módulo | Tipo | Papel |
| --- | --- | --- |
| `accounts/account-chain-constants.cjs` | dados | Números e vocabulário num lugar só (tetos, prazos, estados, estratégias). As listas espelham os `CHECK`s da migração 017 |
| `accounts/cli-failure-patterns.cjs` | dados | Frases de falha por provedor e exclusões, escritas como cada CLI imprime |
| `accounts/failure-taxonomy.cjs` | puro | Texto ou sinal → `{failureClass, scope, ambiguous, evidence, evidenceHash}`. A evidência é redigida antes do corte (≤ 200 caracteres) |
| `accounts/reset-time.cjs` | puro | Leitor único do horário de reset: fuso impresso, formatos do Claude e do Codex, "try again in N", epoch e a retomada automática do Claude |
| `accounts/account-chain-policy.cjs` | puro | Elegibilidade (primeira razão que bloqueia), as quatro estratégias, capacidade, fim da espera e classe de cobrança |
| `accounts/account-output-watcher.cjs` | caminho quente | Vigia por sessão: marca no `onData` e lê depois a cauda do buffer de replay |
| `accounts/account-eligibility.cjs` | efeito | Checagem de login por conta, com o mesmo ambiente do spawn daquela conta |
| `accounts/account-chain-service.cjs` | efeito | Detecção → espera → proposta → ticket → registro, e a recuperação no início do app |
| `storage/account-chain-repository.cjs` e `storage/migrations/017_account_chain.sql` | persistência | Compare-and-set por revisão, índice parcial único e retenção |
| `account-chain-ipc-handlers.cjs` | IPC fino | Valida só o formato (string, enum, uuid, faixa), chama o serviço e devolve `{ok, …}` |

O vocabulário das CLIs tem um oráculo versionado:
`app/electron/__fixtures__/cli-failure-vocabulary.json` guarda, por provedor e
versão, cada frase com classe, escopo e uma linha de exemplo.
`app/scripts/extract-cli-failure-vocabulary.cjs` confere a fixture de novo nos
pacotes instalados, só lendo arquivos (sem executar CLI nem tocar credencial). O
CI não tem as CLIs, então os testes rodam sobre a fixture.

No renderer ficam o contrato tipado (`shared/types/account-chain.ts`), os
formatadores e o modelo de visão puros (`canvas/services/account-chain-view.ts`
e `account-switch-dialog.ts`), os hooks `useAccountChain` e
`useAccountContinuation`, o `AccountSwitchDialog`, as abas **Cadeia** e
**Trocas** do painel **Limites e uso** e, no chat, o card
`ProviderSwitchRequest`. O renderer só consome: não classifica falha, não
escolhe conta e não emite ticket.

**Um classificador só, com duas origens.** A taxonomia fecha as classes em
`limit | billing | auth | network | provider | timeout | cancelled | unknown`,
mais a marca `ambiguous` e o escopo (`account` ou `model`). A precedência é
`cancelled > auth > billing > limit > provider > network > timeout > unknown`.

- **Origem `pty`** (saída do terminal): valem só as frases inteiras do provedor
  da sessão, com as exclusões conferidas antes. Um agente pode imprimir
  "401 Unauthorized" ou "rate limit" como parte do trabalho, e isso não é falha
  da conta.
- **Origem `fluxo`** (erro de execução one-shot do orquestrador e do chat):
  valem também os códigos e as frases genéricas. Um código HTTP só conta colado
  a `status`, `error`, `http` ou `code`, então "line 429" não é limite.

O orquestrador e o chat já consomem essa taxonomia: `detectAvailabilityIssue`
(`orchestrator/model-availability.cjs`) e `account-limit-detector.cjs` mantêm a
assinatura e delegam a ela, e `sendCliEvent` (`ipc-handlers.cjs`) anexa
`failure: {failureClass, availabilityStatus}` aos eventos `error`. O chat lê esse
campo e não adivinha mais a classe por palavra solta. O motivo que vai para o
log QA e para o log de terminal sai redigido na origem (`createTextPreview`).

**Fluxo de uma detecção no terminal.**

```
ptyProcess.onData ─► entry.outputBuffer.append(data)                  (como antes)
                  ├► entry.onData?.(data)  → renderer                 (vai primeiro)
                  └► entry.watcher?.push()                            (flag + horário; 1 timer por sessão, unref)
watcher.scan()  (debounce de 400 ms, espera máxima de 2 s)
   └─ outputBuffer.tail(4096) → normaliza → pré-filtro do provedor
        └─ failure-taxonomy (origem 'pty') → dedupe pela impressão digital da evidência
             └─ onOutputFailure({sessionId, accountId|null, providerId, accountMode, lineageId, failure})
accountChainService
   ├─ limit/auth/billing numa conta própria → espera da conta (SQLite)
   ├─ registro: 'noticed' (bloco fixo, Login do sistema ou cadeia desligada),
   │            'proposed' ou 'no_candidate'
   ├─ bloco 'chain' com a cadeia ligada → política + checagem de login preguiçosa → proposta
   └─ push account-chain:detection / account-chain:proposal → faixa no bloco + item nas notificações
pessoa → "Ver opções" → AccountSwitchDialog → accountChain.confirm
   └─ o main revalida → proposed→confirmed (CAS) → ticket
renderer (useAccountContinuation) → redige o histórico no main → cria o bloco novo
   └─ pty:spawn {accountId: destino, accountMode: 'chain', chainTicket}
        └─ o main confere o ticket → confirmed→spawning→spawned (CAS)
```

A vigia só existe em terminal de agente cujo provedor tem frases (Claude, Codex e
Gemini). Shell e Openia não pagam nada além de um `if`. Rede, servidor, tempo
esgotado e cancelamento nunca põem conta em espera nem geram proposta. O limite
de um **modelo** do Codex ("usage limit for ‹modelo›") também não: trocar de
modelo resolve.

**Máquina de estados da troca** (`account_switch_events`, tipos `continuation`,
`launch` e `manual`).

```
detecção em bloco 'chain' com a cadeia ligada
  ├─ teto de saltos da linhagem ou nenhum candidato apto ──► no_candidate
  ▼
proposed ──confirm──► confirmed ──pty:spawn com ticket──► spawning ──► spawned
  │                      │                                    └──────► spawn_failed (sem nova tentativa)
  ├─ Agora não ──────► declined    (a mesma evidência fica silenciada)
  ├─ Não era limite ─► dismissed   (libera a espera da origem)
  ├─ destino mudou ──► superseded  (nasce outra proposta; nada troca sozinho)
  └─ 30 min, origem encerrada, cadeia desligada, bloco fixado ou espera liberada ──► expired
confirmed ── ticket sem uso em 2 min ou reinício ──► expired
spawning  ── reinício do app ──► spawn_failed
bloco fixo, Login do sistema ou cadeia desligada: detecção ──► noticed (registro + aviso)
```

- Toda transição é `UPDATE … WHERE id = ? AND state = ? AND revision = ?` e só
  vale com uma linha alterada. Um índice parcial único garante no próprio banco
  no máximo **uma** proposta aberta (`proposed`, `confirmed` ou `spawning`) por
  sessão de origem, inclusive com dois Felixo no mesmo perfil.
- O `confirm` revalida tudo no main: prazo, destino entre os aptos, login ainda
  dentro do prazo, destino fora de espera, cadeia ligada, bloco ainda `chain`,
  teto de saltos e conta não visitada na linhagem. Se a origem produziu saída há
  menos de 5 s, o resultado é `SOURCE_ACTIVE` e a interface pede um segundo
  "abrir mesmo assim", que fica gravado. Confirmar duas vezes devolve o mesmo
  ticket.
- No `pty:spawn`, um ticket inexistente, vencido, de outro tipo ou para outra
  conta é recusado. Um ticket já `spawned` só é aceito de novo para a mesma
  sessão (recarga e reinício). Sem ticket, o spawn é o comum de sempre.
- No início do app, `recoverOnStartup` passa `proposed` e `confirmed` para
  `expired` e `spawning` para `spawn_failed` (o PTY morre com o app). Nada
  pendente é executado depois de um reinício. Esperas vencidas saem, e linhas de
  conta removida saem das tabelas de membros, espera e checagem; o registro de
  trocas fica.

**IPC (`account-chain-ipc-handlers.cjs`, namespace `accountChain` no preload).**

| Canal | O que faz |
| --- | --- |
| `account-chain:get-state` | Configuração, revisão, membros (rótulo, provedor, aptidão e motivo, login, espera, capacidade, cobrança e multiplicador com fonte), propostas pendentes, esperas e os **nomes** das variáveis de credencial presentes no ambiente. Nada de caminho, env ou segredo |
| `account-chain:update-settings` e `:update-members` | Ligar/desligar, estratégia, teto de saltos e a lista ordenada, sempre com `expectedRevision`. Conflito devolve `REVISION_CONFLICT` e o estado atual |
| `account-chain:check-login` | Confere o login de até 5 contas |
| `account-chain:preview-launch` | Proposta `launch` para um bloco "Automática (cadeia)", ou os motivos de não haver conta apta |
| `account-chain:confirm`, `:decline`, `:resolve-ambiguous` | Decisão da pessoa sobre uma proposta ou uma detecção ambígua |
| `account-chain:set-session-mode` | Fixa o bloco na conta atual ou devolve à cadeia; fixar expira as propostas abertas |
| `account-chain:release-cooldown` | "Não era limite", "Já recarreguei" ou liberação manual (login e cobrança exigem nova checagem) |
| `account-chain:redact-transcript` | Redige o histórico que vai para o bloco novo, no main |
| `account-chain:record-manual` | Registra uma "Passar responsabilidade" feita por causa de uma detecção |
| `account-chain:history` | Página do registro de trocas (até 50) |
| push `account-chain:changed`, `:proposal`, `:detection` | Avisos ao renderer, já redigidos |

**Dados.** A migração `017_account_chain.sql` só acrescenta tabelas, então uma
versão antiga do app as ignora e voltar de versão é seguro. O
`cli-accounts.json` não muda de formato.

| Tabela | Guarda |
| --- | --- |
| `account_chain_settings` | Uma linha: ligada, estratégia, teto de saltos e revisão. Sem a linha, a cadeia está desligada |
| `account_chain_members` | A lista global ordenada, que pode cruzar provedores: habilitada, cobrança e multiplicador declarados. Sem índice único na posição: a lista é regravada inteira sob a revisão |
| `account_cooldowns` | A espera atual de cada conta, com classe, fim, fonte do fim e evidência redigida. Uma espera nova nunca encurta uma ativa |
| `account_login_checks` | A última checagem de login por conta: status, horário, fonte, plano e impressão digital da identidade (nunca e-mail ou token) |
| `account_switch_events` | O registro de trocas, avisos e decisões do orquestrador, com motivo redigido e os horários de detecção, proposta, decisão e spawn. Nunca guarda histórico do terminal, ambiente, caminho de perfil ou segredo. Ficam as 1.000 linhas mais recentes, e a poda nunca apaga linha aberta |

No canvas, `TerminalNodeData` ganha `accountMode` (`pinned` ou `chain`; ausente
vale `pinned`), `chainOrigin` e `chainSuccessorNodeId`, persistidos. O
`chainTicket` é transitório e nunca é salvo. `AgentSessionReference` ganha
`accountId`.

**Sessão, isolamento e retomada.**

- A entrada de sessão do `PtyProcessManager` guarda `accountId`, `providerId` e
  `accountMode`, e `listarSessoesVivas` os expõe. Reanexar um bloco a uma sessão
  viva de outra conta lança `PTY_SESSION_ACCOUNT_MISMATCH` ("A sessão viva deste
  bloco está em outra conta…"), sem matar a sessão viva. O card oferece
  reiniciar na conta do bloco, e nenhum ambiente antigo é reaproveitado.
- Um spawn com conta própria monta o ambiente por `applyProfileEnv`
  (`cli-account-profiles.cjs`). A função devolve um objeto novo **sem** as
  credenciais herdadas do provedor (`CREDENCIAIS_HERDADAS`: `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY` e as demais da política) e com as variáveis
  do perfil. O filtro fica nessa junção, e não no `buildEnv` da loja, porque o
  `node-pty` serializa um valor `undefined` como o texto `"undefined"`. No
  Windows o nome não diferencia maiúsculas. O Login do sistema não muda.
- A descoberta de conversa recebe só as pastas de histórico do ambiente da conta
  (`selectDiscoveryContext`: `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `GEMINI_HOME` e a
  HOME do perfil). O Claude procura em `${CLAUDE_CONFIG_DIR || ~/.claude}/projects`.
  A referência achada sai com o `accountId` do processo, e `canResumeAgentSession`
  só retoma na mesma conta. Em outra conta, o motivo é `account-mismatch` e o
  bloco pede uma escolha (ver
  [Retomada de conversa: plano com motivo](#retomada-de-conversa-plano-com-motivo)).
- O `cli-accounts.json` é gravado num temporário e entra com `rename`. Arquivo
  ausente é lista vazia. Arquivo ilegível lança `CLI_ACCOUNTS_STORE_UNREADABLE`
  e nunca é sobrescrito.
- O configurador de agente não cai no Login do sistema em silêncio:
  `selectAccountFromList` devolve `ok`, `saved-missing` ou `list-failed`, a
  seleção é mantida, e a abertura fica bloqueada até uma escolha explícita.
- O relançamento automático do Codex, depois de ele se atualizar, não reenvia o
  texto de uma passagem de responsabilidade (`initialTextIsHandoff`, transitório):
  reenviar faria o agente recomeçar a tarefa e cobrar de novo.
- A troca do login do sistema pelo gerenciador de CLIs não lista mais, entre os
  afetados, os terminais com conta própria.

**Orquestrador do chat.** `getProviderFamily(cliType)` (`claude` → Anthropic;
`codex` e `codex-app-server` → OpenAI; `gemini` e `gemini-acp` → Google) e
`requiresProviderSwitchConfirmation(from, to)` ficam puros em
`spawn-model-selector.cjs`. Quando a família muda (fallback entre provedores,
último recurso para outra família ou novo spawn no meio da tarefa), o runner não
chama `spawnAgent`: registra uma decisão pendente, emite
`provider_switch_request` e segue sem bloquear. O job fica `pending` até a
resposta por `cli:provider-switch:respond`. As pendentes são recuperadas por
`cli:provider-switch:list`. Sem resposta em 10 minutos, a varredura de 60 s que já
existia trata a decisão como recusa. O store do orquestrador é em memória, então
um reinício apaga a decisão sem executá-la. Cada decisão vai para o registro de
trocas como `provider_switch`, com `accepted` ou `refused`. Codex → Codex App
Server é só troca de transporte e não pergunta.

**Custo no caminho quente.** Por pedaço de saída, a vigia só marca uma flag,
guarda o horário e agenda um timer quando ainda não há um: sem regex, cópia ou
alocação. A varredura lê no máximo 4 KiB, no máximo uma vez a cada 400 ms por
sessão. Os tetos foram definidos antes de medir, e o `--check` da bancada
`benchmark:pty-output` reprova acima deles: custo extra por pedaço ≤ 10% (p50),
varredura no pior caso ≤ 1 ms (p95) e ≤ 5% de um núcleo com 20 sessões. Os
números medidos ficam no `IA.md`. O Modo Performance é do renderer e **não**
desliga a vigia, que tem orçamento fixo no processo principal.

## Cache offline do gerenciador de CLIs

Decisão registrada em 12/09/2026, fatia 1/5 de "Arquitetura — Desenhar e
implementar cache offline por perfil para o gerenciador de CLIs": **o cache
é compartilhado entre perfis da mesma CLI**, não isolado por perfil. Só
login/credencial é isolado (seção acima, `cli-account-profiles.cjs`); o
binário instalado não carrega segredo nenhum, então isolar o cache por
perfil só multiplicaria espaço em disco e tempo de instalação para N
contas do mesmo provider, sem ganho de segurança real. `getManagedCliLayout`
continua sem `profileId` por isso — decisão deliberada, não lacuna.

`getOfflineCacheLayout` (`managed-cli-paths.cjs`) separa o cache por
`provider/plataforma-arquitetura/versão`
(`userData/cli-cache/<provider>/<platform>-<arch>/<version>/`) — o
suficiente pra nunca servir um binário incompatível ou de outra CLI/versão,
e pouco o bastante pra caber uma vez só por versão instalada. A pasta
`cli-cache` nunca cruza com `cli-profiles` (onde vive a credencial):
são árvores irmãs dentro do `userData`, sem sobreposição de caminho —
coberto por teste (`managed-cli-paths.test.cjs`).

**Atualizado em 12/09/2026, fatias 2/5 e 4/5.** Em vez de reimplementar
leitura/escrita/verificação de hash do cache do zero, `installManagedPackage`
(`managed-cli-installer.cjs`) passa `--cache <dir> --prefer-offline` pro
`npm install`, apontando pra `getNpmRegistryCacheDir` (`managed-cli-paths.cjs`)
— uma pasta persistente e compartilhada dentro do `userData`, diferente de
`getOfflineCacheLayout` (que separa por versão e continua disponível pra uso
futuro, mas não é o que está em produção hoje). O cache do npm já é
endereçado por conteúdo e verificado por SRI internamente havia anos — reusar
esse mecanismo testado é melhor engenharia do que reinventar um motor
próprio, e resolve de graça os quatro estados que a fatia 2 pedia pra
decidir:

- **Vazio:** baixa normal da rede, popula sozinho.
- **Incompleto:** o `cacache` interno do npm escreve atomicamente; uma
  entrada nunca aparece parcial pra quem lê.
- **Corrompido:** falha de hash SRI descarta a entrada; com rede disponível
  (`--prefer-offline`), busca de novo sozinho — verificado ao vivo em
  12/09/2026 (cache corrompido manualmente, reinstalação com rede recuperou
  sem intervenção); sem rede (`--offline`), falha limpo com `EINTEGRITY`, sem
  instalar nada pela metade.
- **Incompatível:** a chave do cache do npm já inclui nome/versão/plataforma
  do pacote — uma entrada nunca "parece" servir outro alvo.

Os três cenários da fatia 5/5 (instalação offline com cache válido, cache
corrompido com rede bloqueada, recuperação quando a rede volta) foram
verificados manualmente ao vivo com esse mecanismo, com os comandos e saídas
reais documentados na task — não é comportamento hipotético.

**Expurgo (o resto da fatia 2/5):** `managed-cli-cache-maintenance.cjs`
mede o tamanho real da pasta de cache e roda `npm cache clean --force`
quando passa de um orçamento (200 MB por padrão — CLIs oficiais são
pequenas, isso comporta várias versões de várias CLIs sem crescer sem
limite). Zera o cache inteiro em vez de um LRU por entrada: pra um cache
desse tamanho, "zerar e deixar repopular" é mais simples de manter para um
ganho marginal que não compensa a complexidade de um LRU sob medida. Rodado
de forma oportunista, só depois de uma instalação de verdade acontecer — não
em toda checagem sem trabalho.

**Fatia 3/5 (garantia de segredo):** o cache do npm guarda só tarballs de
pacotes públicos — nunca é o lugar onde login/credencial (`cli-profiles`)
poderiam vazar por engano de path, já confirmado por teste na fatia 1/5.

**Fatia 4/5 (hash):** o manifesto (`managed-cli-manifest.cjs`) já confere o
hash contra o registry **antes** de instalar (implementado em 06/09/2026,
commit `16dc4bc`); o SRI do cache do npm é uma segunda camada, sobre o
artefato realmente baixado/servido, não uma duplicata da primeira.

## Persistência e comunicação

| Área | Responsabilidade |
|------|------------------|
| SQLite | projetos, canvas, notas, modelos, automações, contas, uso e configurações |
| `canvas-files` | arquivos Markdown compartilhados pelos blocos do canvas |
| `.fxcanvas` | importação/exportação portátil do canvas |
| `context-deliveries` | artefatos temporários somente leitura para prompts longos |
| `logs` e QA Logger | diagnóstico local da sessão e das execuções |

### Entrega de contexto entre sistemas operacionais

O processo principal ainda grava cada artefato dentro do `userData` nativo e
mantém a retenção por sessão/24 horas. A diferença importante está no contrato
da referência enviada à PTY: ela leva o nome gerado (`felixo-context-...txt`),
nunca o caminho absoluto da máquina que criou o arquivo. O agente lê o conteúdo
com `felixo context read "<nome>"` (ou `felixo contexto ler "<nome>"`); o shim
instalado pelo próprio app resolve o `userData` ativo no Linux, macOS ou
Windows. Nome inválido, traversal, arquivo ausente e erro de permissão são
falhas explícitas; o agente não deve escolher outro artefato silenciosamente.

Os caminhos são resolvidos pelo `app.getPath('userData')`, não ficam dentro do
repositório do usuário e não devem ser documentados com caminhos privados ou
credenciais reais.

### Identidade das inserções de prompt

O renderer usa `PromptInsertion` como envelope de rastreabilidade ao inserir
texto no terminal. O envelope tem `id`, `name` opcional, `source`, `content`,
`combinedNames`, `autoSubmit` e `timestamp`; ele não altera o contrato textual
de `sendText(id, text)` nem o objeto `{ sessionId, data }` enviado a `pty.write`.

O catálogo usa o ID estável da definição resolvida (inclusive overrides
editados), skills usam seu próprio ID, e o texto digitado pelo usuário fica em
`source: manual`, sem nome presumido. A composição mantém os headings legados,
a ordem da seleção e nomes repetidos em `combinedNames`.

`TerminalSessionStore` expõe a última inserção no snapshot e em
`SessionMetadata`. O node persistido recebe apenas `PromptInsertionMetadata`,
sem `content`; o mesmo registro seguro acompanha a escrita de um artefato
temporário e o fallback inline. O cabeçalho do artefato e o QA Logger podem
mostrar ID, nome, origem, composição, intenção de envio e timestamp, nunca o
corpo da instrução como metadata.

**O que a pessoa vê de cada origem.** O cartão do bloco mostra
`resolvePromptDisplayLabel(lastPrompt, insertion)`: o nome (ou os nomes
combinados, na ordem) quando existe; sem nome, a origem (`Prompt do catálogo`,
`Skill`, `Arquivo do canvas`, `Contexto do app`…), porque o `lastPrompt` dessas
origens é a referência do arquivo de contexto ou o aviso do fallback inline e
não diz o que foi enviado. Só o texto `manual` usa o próprio `lastPrompt` como
rótulo. O `sendText` devolve `{ delivered: true, inline: true }` quando o
arquivo de contexto falhou e o texto foi direto (fallback), e
`toActivationResult` transforma isso em `sent-inline`, que os painéis de
prompts e de skills mostram com texto próprio, diferente do envio normal.

**Os painéis só digitam.** Catálogo, combinação e skill chegam ao PTY sem
Enter (`autoSubmit: false`, `terminalTextForInsertion`): o texto fica na linha
de entrada, e quem envia é a pessoa (decisão de 30/09/2026, depois de um relato
de prompts enviados sozinhos no Claude Code). A inserção fica em
`pendingPromptInsertions` até o Enter da pessoa: tecla comum e Shift+Enter a
mantêm (a pessoa está completando o pedido), e o envio sai com o nome dela;
Backspace, Ctrl+C e Ctrl+U a descartam, e o pedido seguinte é `manual`. Continuam
indo sozinhos `/resume`, a passagem de responsabilidade e as instruções que o app
manda ao ligar um `.md`, conectar agentes ou renomear um bloco.

**Caminhos entre aspas.** Todo caminho absoluto num texto para o agente passa
por `quotePromptPath` (`prompt-paths.ts`): a skill ativada, o manifesto de
skills, as skills do preset, os `.md` ligados, o arquivo de planejamento, a
pasta de trabalho da identidade e da passagem, e o comando `felixo` da
referência (`quoteContextFileName` delega a ela). Os modelos editáveis do link
de scratchpad usam `fillPathPlaceholder`, que põe aspas em `{{path}}` e não as
dobra quando o modelo já cercou o marcador. Com caminho de Windows
(`isWindowsCommandPath`), a referência ganha a linha `No PowerShell: & "<caminho>"
context read "<nome>"`: no PowerShell, um caminho entre aspas seguido de
argumentos é uma string, e a linha comum falha.

**Como isso é provado.** `prompt-origins-e2e.test.ts` passa cada origem
(catálogo, combinação, skill, arquivo do canvas e texto digitado) pelo store,
com PTY falso e xterm real: corpo byte a byte no arquivo, uma entrega e um
Enter por envio, rótulo do cartão, snapshot da metadata, fallback, repetição,
desistência, nova tentativa, reinício e o que `toPersistedNode` grava.
`context-file-delivery.shell.test.ts` roda a linha de leitura gerada no shell
de verdade, numa pasta com espaço e acento: `sh` no Linux e no macOS; `cmd.exe`,
PowerShell (com `&`, e a prova de que sem ele falha) e Git Bash no Windows. A
sessão E do smoke do canvas (`scripts/canvas-smoke-prompts.cjs`) clica nos
painéis do app real com a CLI roteirizada: o retorno de cada envio, o nome no
cartão, o fallback de verdade (a pasta `context-deliveries` trocada por um
arquivo), a área de transferência e o que o canvas gravou.

### Observabilidade: erros com causa, persistidos e reportáveis

O QA Logger guardava só até 400 entradas em memória — reiniciar o app (o
contorno mais comum quando algo trava) apagava o histórico. Agora:

- `qa-log-disk-store.cjs` persiste cada entrada em `logs/qa/qa-AAAA-MM-DD.jsonl`
  (um arquivo por dia), com rotação por idade (`maxDays`, padrão 14) e por
  orçamento de tamanho (`maxTotalBytes`, padrão 5 MiB — os arquivos mais
  antigos saem primeiro). No boot, `qa-logger.initQaDiskStore` hidrata o
  buffer em memória com o que sobreviveu ao restart anterior.
- Toda entrada passa por `redactValue` antes de gravar — reaproveita
  `redactSensitiveText` de `git-secret-redaction.cjs` (rótulo dentro do
  texto, ex. `token=...`) e soma `isSensitiveKeyName` (nome da propriedade
  já indica segredo, ex. `{"password": "..."}`, onde o rótulo não está no
  valor). As duas fontes são necessárias: nenhuma cobre sozinha o outro caso.
- `global-error-handlers.cjs` cobre `uncaughtException`, `unhandledRejection`,
  `render-process-gone` e `child-process-gone` no processo principal, e
  envolve `ipcMain.handle` uma única vez (`wrapIpcHandleWithLogging`) pra
  logar canal + `error.cause` de qualquer handler que lançar, sem precisar
  tocar cada `ipcMain.handle` do projeto individualmente. Nenhum handler
  decide encerrar o processo — só registra.
Eventos de entrega de contexto usam o mesmo arquivo QA e o escopo
`context-delivery`. O IPC registra `written` quando o artefato é fechado no
disco; o renderer registra `path-typed` somente depois que a referência foi
aceita pela PTY; e o comando standalone `felixo context read` registra `read`
ou `failed`. Cada transição leva o id do artefato e a associação segura de
terminal/agente, sem copiar o corpo do prompt. Isso permite conferir a cadeia
depois de restart e localizar uma falha sem depender do buffer em memória.

- No renderer, `renderer-error-reporting.ts` cobre `window.onerror` e
  `unhandledrejection`; `RendererRecoveryBoundary` (o último resort quando o
  React para de renderizar) também manda a entrada pro QA Logger antes de
  oferecer o botão de recarregar.
- Botão "Reportar problema" (painel QA Logger) monta um pacote —
  `qa-report-builder.cjs` — com versão do app, SO/arquitetura, as últimas N
  entradas do log e o estado de detecção de cada CLI, tudo redigido de novo
  (defesa em profundidade) antes de gravar em `reports/problema-<hora>.json`.

## Fluxo legado de chat

O código em `features/chat/` e o armazenamento de histórico continuam sendo
carregados para preservar sessões antigas e exportações. Esse caminho não é o
local para novos componentes do produto. Uma mudança que precise atravessar a
compatibilidade deve manter o canvas como fonte da experiência e registrar o
impacto no `IA.md`.

### Retenção dos Logs da CLI

O painel de logs do chat separa retenção visual de retenção para diagnóstico e
exportação. `useTerminalOutput` agrupa os eventos recebidos por frame antes de
atualizar o React e usa `terminal-output-store.ts` para manter, por sessão, até
240 chunks lógicos e 240.000 caracteres; um chunk individual fica limitado a
32.000 caracteres. A visão de orquestração aplica ainda uma janela global de
720 chunks, evitando que múltiplas sessões produzam milhares de nós DOM. A UI
exibe quantos chunks permanecem visíveis e quando há dados anteriores fora da
janela.

O processo principal recebe o mesmo evento antes de encaminhá-lo ao renderer e
o grava em JSONL em `app.getPath('userData')/logs/terminal-output`. O arquivo é
somente da execução atual do app: `clear` troca a geração e ignora eventos
tardios das sessões limpas; a inicialização remove arquivos de sessão antigos;
o encerramento remove o arquivo corrente. A exportação de análise consulta o
arquivo completo, portanto a janela React não causa perda de conteúdo. Se a
ponte Electron não existir ou falhar, a sessão informa que só a janela visual
está disponível.

O benchmark `npm run benchmark:terminal-output -- --check` monta o
`TerminalPanel` real no Electron e compara baseline sem limite com a política
atual nos fixtures curto, longo, de alta frequência e múltiplas sessões. Ele
registra React Profiler p50/p95, latência de commit, DOM, heap pós-GC e RSS do
renderer. O benchmark conserva a mesma cadência de entrada nos dois modos para
isolar o ganho de retenção/render, usa uma nova janela por modo e declara essa
isolação no relatório; o agrupamento por `requestAnimationFrame` é o caminho de
produção e tem cobertura própria de unidade.

## Documentos relacionados

- [`README.md`](../../README.md): entrada pública e capacidades observáveis.
- [`IA.md`](IA.md): decisões e evolução operacional, em ordem cronológica.
- [`ROADMAP.md`](ROADMAP.md): direção e ideias de contribuição.
- [`RODAR-VIA-CODIGO-FONTE.md`](RODAR-VIA-CODIGO-FONTE.md): execução local e
  atualização do checkout.
- [`GUIA-USUARIO.md`](../guias/GUIA-USUARIO.md): instalação e operação do
  canvas.


## Layout: modais redimensionáveis

Os 12 modais (exceto o `AgentQuestionDialog`, bloqueante) redimensionam nos dois
eixos com `useResizableDialog` e `DialogResizeHandles` (`features/shared/dialog/`).
A regra vive em `dialog-sizing.ts` (puro): clamp em [320x240, janela - 16 px],
crescimento `2*dx` por o modal ser centralizado, persistencia por modal e
`swallowNextClick`, que impede o clique gerado ao soltar o mouse fora da moldura
de fechar o modal pelo fundo. O hook devolve `frameProps` (ref por funcao + estilo)
para espalhar na moldura; um objeto com `ref` nomeado disparava `react-hooks/refs`.

## Terminal: rolagem do Claude Code

`terminal-scroll-preference.ts` guarda a opção (padrão desligada). No spawn, o store envia
`classicScreen` (booleano) e `PtyProcessManager` o traduz em
`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` só para o executável `claude` (`isClaudeCommandName`).
O renderer não escolhe nome nem valor de variável de ambiente.

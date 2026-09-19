# Arquitetura vigente — Felixo AI Core

Status: concluido.
Última revisão: 2026-09-02.

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

NAO verificado: nenhum servidor real foi rodado (nada instalado aqui e sem
microfone). O contrato acima e o do CLIENTE; que um servidor especifico o aceite
— inclusive o formato webm/opus, que alguns exigem converter — e justamente o
experimento pendente. Nenhum servidor e recomendado antes de medido.

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
`docs/projeto/LAYOUT-SUPERFICIES.md`.

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

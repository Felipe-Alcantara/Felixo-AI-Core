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

## DevTools isolado

`felixo devtools` é a superfície de automação de UI para qualquer agente. O
subcomando inicia Electron destacado com `userData` temporário, janela invisível
e CDP em porta local aleatória; cada ação conecta, executa e desconecta. A ponte
de captura e avaliação do processo principal só existe nessa instância, nunca no
app normal. `--real-profile` é uma exceção explícita e recusa iniciar quando os
arquivos de singleton indicam que o perfil já está em uso.

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
  modelos, prompts, skills, Git, Fetch All, Limites e uso, Orquestrador, QA e
  Configurações ficam em chunks sob demanda, cada um com estado de loading e
  erro recuperável. Foco ou ponteiro preaquece somente a opção apontada.
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

### Renderização segura de Markdown

`MarkdownContent` recebe texto de agentes, arquivos e histórico como conteúdo
não confiável. O pipeline mantém `remark-gfm` e os elementos visuais
necessários, mas executa `rehypeRaw` seguido de um schema explícito do
`rehype-sanitize`: HTML ativo, embeds, SVG, mídia e atributos de evento não
chegam ao DOM. A transformação final de URLs repete a decisão no boundary do
React: links ficam em `http:`, `https:`, `mailto:` ou âncoras; imagens remotas
ficam em `http:`/`https:`; `data:` só aceita imagens raster base64 de até 2 MiB.

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

## Persistência e comunicação

| Área | Responsabilidade |
|------|------------------|
| SQLite | projetos, canvas, notas, modelos, automações, contas, uso e configurações |
| `canvas-files` | arquivos Markdown compartilhados pelos blocos do canvas |
| `.fxcanvas` | importação/exportação portátil do canvas |
| `context-deliveries` | artefatos temporários somente leitura para prompts longos |
| `logs` e QA Logger | diagnóstico local da sessão e das execuções |

Os caminhos são resolvidos pelo `app.getPath('userData')`, não ficam dentro do
repositório do usuário e não devem ser documentados com caminhos privados ou
credenciais reais.

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

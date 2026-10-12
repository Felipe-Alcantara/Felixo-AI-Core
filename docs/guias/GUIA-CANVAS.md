# Guia do canvas

Como o canvas se organiza, enquadra e se comporta no dia a dia: arrumar os blocos, a área útil, remover a seleção, a identidade das inserções de prompt e o que muda em máquinas com poucas CPUs ou mais de uma placa de vídeo.

## Organizar os blocos do canvas

O botão **Organizar** reposiciona os blocos de topo numa matriz quase quadrada, mantendo em células vizinhas os que estão ligados por uma aresta. Duas coisas definem o resultado, e nenhuma delas é a tela:

- **A ordem das células é a ordem do dock "Elementos"** — a mesma numeração `#N` que aparece no cabeçalho de cada terminal, e que você reordena arrastando as linhas do dock. Arrastar um bloco pelo canvas não muda mais para qual célula ele vai: dois cliques seguidos produzem o mesmo arranjo, e um bloco novo entra numa célula no fim, sem deslocar os que já estavam.
- **A âncora é o canto do bloco mais ao topo-esquerda**, não o canto visível da tela, então pan, zoom e tamanho de janela não alteram o destino.

A setinha ao lado do botão abre os três modos:

| Modo | O que faz |
| --- | --- |
| **Matriz única** | Todos os blocos numa grade só (o clique direto no botão faz isso). |
| **Uma matriz por repositório** | Uma faixa por diretório de trabalho (`cwd`), empilhadas. Blocos sem diretório — notas, arquivos, páginas — ficam na última faixa. |
| **Uma linha por pasta** | Uma linha horizontal por diretório de trabalho (`cwd`), com os blocos lado a lado na ordem do dock. Blocos sem diretório ficam na última linha. |

O dock **Elementos** conta a mesma história quando há mais de uma pasta: as
linhas são separadas por cabeçalhos visuais com o nome da última pasta do
`cwd`, e a seção sem pasta fica por último. Com apenas uma pasta, os cabeçalhos
somem para não acrescentar ruído. A numeração continua sendo a lista plana do
canvas; portanto, os cabeçalhos não ocupam posição nem mudam o `#N`. Arrastar
um bloco pode reordená-lo dentro da própria pasta, mas nunca muda o seu `cwd`.

Para saber a que repositório um terminal pertence **sem abri-lo**, o cabeçalho do bloco mostra o nome da última pasta do `cwd` ao lado do `#N` (o caminho completo fica no *tooltip*). É a informação que não envelhece: o nome do bloco é escolhido na criação e costuma ficar desatualizado quando a mesma sessão segue para outra tarefa.

## Área útil e foco do canvas

O enquadramento do canvas reserva a área ocupada pela barra superior, sidebar,
painel de ferramenta, inspector **Elementos** e barra de status. Nós novos,
**Ver tudo**, busca e abertura de uma página ou tarefa usam esse mesmo retângulo;
assim o alvo aparece no espaço livre, e não atrás do chrome fixo. A gaveta do
terminal já reduz a largura do canvas pelo layout e não é descontada duas vezes.

Os controles de terminal, painéis e notificações têm nomes acessíveis. Abrir a
gaveta leva o foco para o terminal; fechá-la devolve o foco ao botão que a abriu.
`Escape` fecha notificações e diálogos e restaura o foco ao gatilho. O canvas
mantém os gatilhos montados depois da primeira abertura da gaveta para que esse
retorno continue funcionando mesmo quando o culling tira um nó da área visível.
Esses fluxos são exercitados pelo smoke do Canvas com um PTY fake, sem iniciar
uma CLI ou shell real.

A gaveta do terminal se redimensiona pela borda esquerda, onde fica o mesmo grip
visível da sidebar e dos painéis. Dois cliques nesse grip (ou **Home**, com o foco
nele) devolvem a gaveta à largura padrão: 45% da janela, entre 440 e 720 px,
encolhendo em janela estreita. As setas ajustam a largura pelo teclado, e com Shift
o passo é maior.

## Remover o que está selecionado

Além das teclas Delete e Backspace, a barra de status do canvas oferece um botão
para remover a seleção. Com algo selecionado, ela diz o quê ("1 conexão
selecionada", "N blocos selecionados" ou "N itens selecionados") e mostra
**Remover [Delete]**. Para selecionar vários, use Shift+clique ou a caixa de
seleção. O botão faz o mesmo que a tecla: remover blocos leva junto as conexões
ligadas a eles, um terminal removido encerra a sessão, e não há confirmação nem
desfazer. Com o canvas travado (cadeado na pílula de zoom), o botão fica
desativado.

Conexões com blocos que têm um único ponto de ligação (nota, desenho, Excalidraw,
Página Web e Tarefas Notion) também aparecem no canvas e podem ser clicadas para
remover. Antes elas ficavam gravadas, mas não eram desenhadas.

## Placa de vídeo e máquinas com poucas CPUs

Com duas placas de vídeo ou mais, **Configurações → Renderização e recuperação →
Opções avançadas: placa de vídeo** oferece Automático (o padrão, sem mudança),
Integrada ou Dedicada (experimental). Com uma escolha salva que não é Automático,
o campo aparece mesmo sem duas placas nesta abertura (modo compatível, eGPU
desconectada), só com Automático habilitado, para dar para desfazer. A escolha
fica em `gpu-preference.json`, no perfil, e é aplicada antes do
`app.whenReady()` do próximo início:

- **Linux**: Dedicada liga o ANGLE sobre Vulkan (`--use-angle=vulkan` e as
  features `Vulkan`, `VulkanFromANGLE` e `DefaultANGLEVulkan`, conferidas no
  Chromium 146). O offload da NVIDIA pelo GLX derruba o GL do Chromium, e
  variáveis gravadas no processo principal não chegam ao processo de GPU (ele
  nasce de um zygote criado antes do `main.cjs`). Integrada é o GL padrão; com
  variáveis herdadas que forçam a dedicada (como as do `prime-run`), o app limpa o
  ambiente e relança uma vez. No AppImage o `app.relaunch()` não traz o app de
  volta (o binário está na montagem que some quando ele sai), então o app abre de
  novo o próprio `.AppImage` (`electron/core/app-relaunch.cjs`), reconhecido pelos
  caminhos reais do `APPDIR` e do executável (TMPDIR atrás de link simbólico
  também vale). O relançado sai sem os caminhos da montagem antiga no `PATH`,
  `LD_LIBRARY_PATH`, `XDG_DATA_DIRS` e `GSETTINGS_SCHEMA_DIR`, e, se o app rodava
  extraído (`--appimage-extract-and-run`), recebe `APPIMAGE_EXTRACT_AND_RUN=1`
  para também não depender de FUSE. Antes de sair ele
  grava um pedido de relançamento (com o pid do relançado, quando há), que o
  processo relançado apaga. Uma abertura que ainda o encontra com o relançado
  nascendo (pedido com menos de 30 s ou pid vivo) fica no Automático sem mexer em
  nada; passado isso, volta para Automático, com aviso, em vez de relançar em
  laço.
- **Windows e macOS**: `force_high_performance_gpu` / `force_low_power_gpu`,
  documentados pelo Electron 41 e usados pelo Chromium só nesses sistemas. Eles só
  têm efeito quando o Chromium marca uma placa de baixo consumo e outra de alto
  desempenho (`gpuPreference` no `app.getGPUInfo('basic')`), e é só aí que a opção
  aparece. No macOS com placa NVIDIA a Dedicada aparece desligada, com o motivo: a
  lista de bugs de driver do Chromium 146 (`gpu_driver_bug_list.json`, entrada 326)
  liga `force_low_power_gpu` nessas máquinas, e ele vence o pedido da Dedicada.
- **Quais placas contam** (`electron/core/gpu-devices.cjs`): saem os
  renderizadores por software, pelo critério do próprio Chromium, inclusive o
  "Microsoft Basic Render Driver" (WARP) que o Windows 8+ sempre lista; as NPUs
  que o Windows põe na mesma lista nunca recebem a marca de consumo.
- **Rede de segurança**: todo início que troca a GPU grava um marcador pendente,
  apagado quando a janela carrega e a GPU responde ligada (`gpu-info-update` +
  `gpu_compositing`, e Vulkan na Dedicada do Linux). Início anterior não
  confirmado, GPU desligada ou processo de GPU caído voltam para Automático, com
  aviso na tela.

Em máquina com até 4 CPUs lógicas o app sugere, uma vez, ligar o Modo
Performance; nunca liga sozinho e lembra a resposta. Sem valor salvo, as
análises simultâneas do Fetch All passam a ser 2 por CPU lógica (de 2 a 8).
Números, limiar e o mapa dos limites internos estão em
[`docs/projeto/POLITICA-PERFORMANCE.md`](../projeto/POLITICA-PERFORMANCE.md).

## Identidade das inserções de prompt

Toda entrada programática ou digitada pode carregar um `PromptInsertion` com
`id`, `name` opcional, `source`, `content`, `combinedNames`, `autoSubmit` e
`timestamp`. O rótulo serve para explicar a origem no canvas; o agente continua
recebendo o corpo de prompt no formato antigo, sem prefixo de metadata.

Prompts do catálogo usam o ID estável da definição atual, inclusive depois de
uma edição; skills usam o ID e o nome da skill. Uma seleção combinada conserva
os nomes na ordem enviada, inclusive nomes repetidos, e mantém os headings que
já faziam parte do payload. Texto digitado manualmente tem origem `manual`,
`combinedNames` vazio e nenhum nome presumido.

O snapshot da sessão guarda o registro completo para a interface. Ao salvar o
node do canvas, `content` é removido; a persistência, os cabeçalhos dos artefatos
e o log QA carregam somente a identidade, origem, composição, intenção de
envio e timestamp. A mesma metadata acompanha a entrega por arquivo e o
fallback inline, sem virar opção ou campo adicional de `pty.write`.

---

Voltar ao [README](../../README.md).

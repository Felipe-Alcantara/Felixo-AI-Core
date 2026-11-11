# Política de Performance — orçamento e modos

Define o orçamento numérico e a política de ativação dos modos de performance
do Felixo AI Core. Não é uma proposta: é a leitura do baseline já medido (task
"Performance — reproduzir e perfilar a degradação do canvas no Linux",
concluída em 03/09/2026) traduzida em metas e regras que o código pode
implementar e os testes podem proteger.

Escopo desta política: canvas com múltiplos terminais/agentes, no app
desempacotado, Linux/macOS/Windows. Não cobre o processo principal isolado
(instalador, fetch-all) nem o chat legado.

## Baseline medido (referência, não meta)

Linux x64, kernel 7.0, 4 CPUs, 11,6 GiB RAM, Node 24.18.0, Electron 41.10.7,
xterm 6.0.0 — 20 sessões de terminal, 8.000 linhas de saída por terminal,
medido em `origin/main` `5cfc40a` (ver task de origem para o método completo).

| Cenário | Heap delta (stream) | RSS p95 renderer | RSS p95 app | Frame p95 | Long task p95 | Resume |
|---|---|---|---|---|---|---|
| Scrollback fixo (20.000 linhas) | 264,2 MiB | 706,0 MiB | 1.054,2 MiB | 150,0 ms | 401 ms | 8,09 s |
| Scrollback adaptativo (5.000 linhas) | 180,1 MiB | 565,4 MiB | 914,7 MiB | 158,4 ms | 266,5 ms | 4,59 s |

Heap pós-GC volta a 33,26 MiB (fixo) e 6,96 MiB (adaptativo) — o delta acima é
carga retida durante o stream, não vazamento; a investigação de origem já
separou os dois e corrigiu a única retenção indevida encontrada (remoção de
nó de terminal não liberava a sessão).

Este número não é meta: é o ponto de partida que a política abaixo usa para
decidir quando cada modo deveria entrar, e o que cada modo entrega de volta.

## Cenários e orçamento (metas)

Orçamento por sessão de trabalho — combinação de agentes/terminais abertos,
nós no canvas e duração — abaixo da qual o app deve se manter fluido sem
qualquer modo reduzido:

| Cenário | Terminais | Nós no canvas | Duração | Meta de frame | Meta de long task | Meta de resume |
|---|---|---|---|---|---|---|
| Leve (padrão) | até 9 | até 300 | sessão de trabalho normal | p95 ≤ 120 ms | p95 ≤ 250 ms | ≤ 5 s |
| Carregado | 10–20 | 300–1.000 | sessão longa (horas) | p95 ≤ 160 ms | p95 ≤ 420 ms | ≤ 9 s |
| Acima do orçamento | 20+ | 1.000+ | — | sem meta — Modo Performance é a recomendação ativa, não best-effort no modo normal |

"Carregado" usa o número medido em Scrollback fixo como teto (150/401/8,09
arredondados para cima) — é o pior caso já comprovado sustentável sem
travar. Acima disso o app deve orientar para o Modo Performance em vez de
tentar manter decoração completa.

Metas de CPU/RAM absolutas ficam de fora desta tabela de propósito: RSS
depende muito mais do hardware de quem usa do que de um teto único
cross-machine; o sinal acionável é frame time e long
task, que já refletem a UI travando, e são o que os benchmarks existentes
(`npm run benchmark:terminal`, `npm run benchmark:canvas-connections`)
sabem medir hoje. `npm run benchmark:many-agents` mede o cenário inteiro desta
tabela num renderer só (agentes falsos transmitindo, blocos, conexões, painéis
e refresh) e o `--check` dele usa estas metas; em 04/11/2026, no Windows, Leve
(9 agentes, 309 blocos) e Carregado (20 agentes, 320 blocos) ficaram dentro
delas. Números em `app/benchmarks/README.md`, seção "Muitos agentes no mesmo
renderer".

## Os quatro modos

### Normal
Estado padrão. Scrollback adaptativo já entra sozinho a partir de 10
terminais (`TERMINAL_ADAPTIVE_THRESHOLD`, `terminal-scrollback.ts`) — é o
único corte automático por carga que já existe. Toda a decoração (céu
animado, minimapa, transições de painel/dock/toolbar) fica ligada.

### Performance (existe, manual)
Toggle do usuário em Configurações (`PerformanceModeProvider`,
`data-performance-mode` no `<html>`). Hoje desliga, tudo de uma vez:

A preferência é persistida em `localStorage` pela chave versionada
`felixo-ai-core.performance-mode.v1`. Na primeira leitura, o app migra o valor
`on` ou `off` da chave anterior `felixo-ai-core.performance-mode`; se nenhuma
das duas tiver um valor válido, o padrão continua Normal.

- Céu animado do canvas (`CanvasAmbientLayer`) — não renderiza, não é só
  pausa de animação.
- Minimapa do React Flow (o `<MiniMap>` do `CanvasView` só monta com
  `miniMap && !reduceMotion`, e `reduceMotion` vem de
  `shouldReduceMotion(performanceMode, prefersReducedMotion)`).
- Transições CSS de painel/dock/toolbar/controles (`index.css`).
- Animações de saída de painel e da gaveta (`useExitAnimation` lê
  `data-performance-mode` e fecha sem esperar a animação) e o enquadramento
  depois de **Organizar** (`useMatrixArrange` recebe `performanceMode` e
  enquadra sem animação). Os botões de zoom e de enquadrar da pílula de zoom
  (`CanvasZoomPill`, 180 e 240 ms) **não** olham o modo — conferido em
  11/11/2026.
- Scrollback do terminal força 5.000 linhas mesmo abaixo do limiar de 10
  (`terminalScrollbackForSessionCount(..., performanceMode)`).
- A atualização automática do painel **Limites e uso** passa de 30 segundos
  para 5 minutos; o painel continua visível e o botão **Atualizar** continua
  disponível.

Nada disso mexe em processo, PTY ou prompt: é corte de decoração e de
buffer visual, nunca de estado. Ativar/desativar não reabre terminal nem
perde handoff — confirmado pelo próprio design (scrollback só se aplica a
sessões novas; sessões vivas mantêm o contrato que tinham ao nascer).

#### Ganho medido (26/09/2026)

Medido com `npm run benchmark:ui-render` (`app/scripts/ui-render-performance.cjs`) no notebook de
referência do projeto: Intel Core i5-6200U (2 núcleos/4 threads), 11,6 GiB, Intel HD 520 e GeForce 920MX,
Linux X11. O app real rodou com o `dist` de produção e o canvas com 48 blocos (notas, arquivos, grupos e
conexões), repetindo a mesma interação (zoom, pan, grupos da sidebar e hover) por 6 s. Cada combinação teve
6 rodadas, com o modo alternado dentro da execução e uma rodada de aquecimento descartada. A tabela mostra
as medianas.

| GPU | Modo | FPS | Quadro p95 | Quadros > 25 ms | Estilo por quadro | Paint por quadro |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Intel HD 520 (ANGLE/GL) | normal | 39,5 | 66,6 ms | 79 | 2,80 ms | 2,95 ms |
| Intel HD 520 (ANGLE/GL) | Performance | **48,5** (+23%) | **50,0 ms** | 53 | **0,66 ms** | 2,64 ms |
| GeForce 920MX (ANGLE/Vulkan) | normal | 45,5 | 50,0 ms | 66 | 2,37 ms | 2,69 ms |
| GeForce 920MX (ANGLE/Vulkan) | Performance | **52,8** (+16%) | **33,4 ms** | 40,5 | **0,63 ms** | 2,38 ms |

O ganho vem quase todo do estilo: sem céu animado, sem minimapa e sem transições, o recálculo de estilo por
quadro cai cerca de 76%.

No cenário **acima do orçamento** (1.000 blocos), o Modo Performance dobra o FPS, mas o app continua
travado: de ~2 para ~4,3 FPS, com quadros p95 de 1,5 a 2,4 s nas duas GPUs, porque o custo dominante passa
a ser a composição (9 a 18 s de composição numa janela de 6 s). Isso confirma que acima de 1.000 blocos o
modo é necessário mas não suficiente; o próximo ganho precisa vir de virtualização ou de menos camadas por
nó, não de decoração.

#### Tutorial do canvas aberto (26/09/2026)

Medido com `npm run benchmark:ui-render -- --gpu=integrada --onboarding`, que abre o tutorial pela Ajuda antes
de cada rodada e o mantém aberto durante toda a interação (anel, card e os observadores de posição ligados),
comparado com a mesma execução sem a flag. Mesmo notebook de referência (Intel HD 520, ANGLE/GL), 48 blocos,
6 s de interação, Modo Performance alternado dentro de cada execução e aquecimento descartado. As execuções
foram intercaladas em dois pares (sem, com, sem, com; 4 rodadas cada) para a carga da máquina não favorecer um
lado. A tabela mostra a média das medianas dos dois pares.

| Tutorial | Modo | FPS | Quadro p95 | Estilo por quadro | Paint por quadro |
| --- | --- | ---: | ---: | ---: | ---: |
| fechado | normal | 16,2 | 192,7 ms | 5,00 ms | 8,14 ms |
| aberto | normal | 15,8 | 195,8 ms | 6,11 ms | 8,28 ms |
| fechado | Performance | 21,4 | 142,1 ms | 1,24 ms | 6,67 ms |
| aberto | Performance | 22,1 | 144,3 ms | 1,35 ms | 6,35 ms |

- **O tour aberto não tem custo mensurável.** As diferenças de FPS (−0,4 no normal, +0,75 no Performance) são
  menores que a variação entre os dois pares de uma mesma condição (de 1,4 a 3,1 FPS). O estilo por quadro com
  o tour aberto no modo normal subiu 1,1 ms na média, mas só num dos pares (+2,3 ms; no outro, −0,1 ms): está no
  ruído.
- **O Modo Performance continua valendo com o tour aberto:** +40% de FPS e estilo por quadro 78% menor (sem o
  tour, +32% e 75%). O card, o anel e o aviso não têm animação nem transição em nenhum modo.
- **Os números absolutos não são comparáveis com a tabela anterior:** a máquina estava carregada durante esta
  medição (load average entre 8 e 11, com outras sessões e o app real abertos), por isso o FPS ficou abaixo dos
  39,5/48,5 medidos de manhã. A comparação válida é "tour fechado × aberto" na mesma condição. Repetir com a
  máquina ociosa daria os números absolutos; fica como convite para quem quiser atualizar esta tabela.
- A primeira medição com a flag foi descartada: o card do passo 1 cobre parte da sidebar, os cliques reais nos
  grupos cobertos caíam no card, e a rodada com o tour fazia menos trabalho (e parecia mais rápida). Com a flag,
  um grupo coberto é acionado pelo DOM, como o teclado faria; sem a flag, a interação é a mesma de antes.

#### Placa de vídeo (26/09/2026)

Com a GPU dedicada (ANGLE sobre Vulkan), a mesma bancada mediu +15% de FPS no
modo normal e +9% no Performance, com quadro p95 25–33% menor a 48 blocos, e
nenhuma diferença a 1.000 blocos (o gargalo passa a ser CPU e composição). O
ganho é real mas moderado e custa bateria, então a escolha é uma **opção
avançada** nas Configurações (Automático, Integrada ou Dedicada experimental),
nunca um padrão: Automático continua sendo o comportamento de antes. Todo início
que troca a GPU é conferido, e uma falha volta sozinha para Automático (ver
[Guia do canvas](../guias/GUIA-CANVAS.md), "Placa de vídeo e máquinas com poucas CPUs").

#### Sugestão em máquina com poucas CPUs (26/09/2026)

Em máquina com **até 4 CPUs lógicas** o app mostra, uma vez, a sugestão
**Ligar o Modo Performance?**, com o número de CPUs da máquina e o ganho medido.
O limiar é a própria máquina de referência (2 núcleos/4 threads), a única onde o
ganho foi medido (+16% a +23% de FPS, tabela acima); acima de 4 não há medição,
e o app não sugere.

- **Nunca liga sozinho.** Só o botão **Ligar Modo Performance** (ou o toggle
  nas Configurações) liga o modo.
- **A resposta fica lembrada** (`localStorage`, chave
  `felixo-ai-core.performance-suggestion`): depois de **Ligar** ou **Agora não**,
  a sugestão não volta, nem se a pessoa desligar o modo mais tarde.
- **Automação**: na instância com porta CDP (`felixo devtools`, smoke e matriz
  visual) a sugestão fica desligada, porque os runners de CI têm 4 vCPUs e ela
  cobriria botões e entraria nas capturas. `FELIXO_DEVTOOLS_HARDWARE_NOTICES=1`
  a liga para testes.
- Código: `electron/core/hardware-profile.cjs` (contagem por
  `os.availableParallelism()` e limiar), IPC `hardware:get-profile`,
  `src/features/shared/performance/performance-suggestion.ts` e
  `src/features/shared/hardware/HardwareNotices.tsx`.

#### Sugestão por carga do canvas (03/11/2026)

Após carregar o canvas, 10 sessões de terminal ativas (incluindo inicialização e
espera) ou 300 blocos acionam uma sugestão do Modo Performance. Sessões que
terminaram ou falharam não contam. A pessoa escolhe ligar ou dispensar; o modo
não é ativado sozinho e pode ser desligado em Configurações. A resposta fica em
`localStorage` sob `felixo-ai-core.performance-load-suggestion`, separada da
sugestão por hardware; sem armazenamento, vale durante a sessão da interface.
O aviso usa o classificador de `performance-budget.ts` e não mede CPU ou FPS.

#### Limites internos e o número de CPUs (26/09/2026)

Mapa dos limites que rodam trabalho em paralelo e o que muda com as CPUs. Só é
derivado o que disputa CPU com a interface; o que espera disco ou rede fica
como está. Um valor que a pessoa salvou nunca é trocado.

| Limite | Onde | Antes | Agora |
| --- | --- | --- | --- |
| Análises simultâneas do Fetch All (`analyzeWorkers`) | `fetch-all/fetch-all-settings.cjs`, `sync-planner.cjs` | 8 fixo | Sem valor salvo: 2 por CPU lógica, de 2 a 8 (`defaultAnalyzeWorkers`). Cada análise roda `git fetch` e `git status` num processo próprio. Com 4 CPUs ou mais continua 8; com 1 a 3 cai para 2 a 6. Um número salvo vale sempre, inclusive o 8 que versões anteriores gravavam sozinhas (não dá para distingui-lo de uma escolha). |
| Listagens simultâneas da varredura do Fetch All | `fetch-all/repo-scanner.cjs` | 16 | Mantido: é I/O de disco, atendido pelo pool de threads do libuv, não pelas CPUs. |
| Gerações de imagem simultâneas | `openia-image-service.cjs` | 2 | Mantido: espera de rede/API. |
| Instalação de CLIs | `cli-auto-install.cjs` | uma por vez | Mantido. |
| Detecção de CLIs na abertura | `cli-auto-install.cjs` (`detectWithSecondChance`) | todas juntas, com segunda chance | Mantido: processos curtos (`--version`), e a segunda chance já cobre a máquina ocupada. |
| Scrollback adaptativo | `terminal-scrollback.ts` | a partir de 10 terminais | Mantido: é memória, não CPU. |
| Consultas simultâneas do Atualizar (painel de Limites) | `agent-usage-service.cjs` (`REFRESH_MAX_CONCURRENCY`, opção `maxConcurrent`) | todas juntas: 52 com 50 contas | 4 fixas, **não** derivadas das CPUs: o que pesa é memória (cada consulta ao vivo é uma CLI em PTY, ≥ 184 MB), não CPU. Ver "Painel de Limites com N contas". |

### Painel de Limites com N contas (26/10/2026)

O **Atualizar** consulta, por conta com login próprio, o comando de login da CLI e, se há
sessão, a consulta ao vivo (o `/status` do Claude abre um PTY; o Codex abre o app-server).
Antes todas as contas corriam juntas num `Promise.all`; agora no máximo
`REFRESH_MAX_CONCURRENCY` (4) por vez, a fila não abre CLI depois do cancelamento (teto de
90 s ou **Reconectar**) e o cancelamento chega ao processo de login em voo, que antes seguia
até o timeout de 30 s. Bancada: `npm run benchmark:agent-usage` (`:check` reprova acima
dos tetos).

**Custo de uma conta** (máquina do dono: Ryzen 7 5700G, 8 núcleos/16 threads, 13,8 GB; perfil
temporário vazio, sem login, pelo caminho de código do app):

| O quê | Medido |
| --- | --- |
| `claude auth status --json` | 300 ms a quente, 680 ms a frio |
| `codex login status` | 130 ms a quente, 390 ms a frio |
| CLIs de login em voo ao mesmo tempo | 2 CLIs: 7 processos, 338 MB; 4 CLIs: 14 processos, 406 MB (amostragem grossa: é limite inferior), ou **100 a 170 MB por comando** |
| `claude` interativo recém-aberto (o piso de uma consulta ao vivo) | 184 MB, 2 processos; nas sessões longas desta máquina, 351 a 477 MB |

Extrapolando o custo por comando (não rodei 50 CLIs de uma vez: a máquina tinha 1,7 GB livres),
sem teto 50 contas pediam de 5 a 8,5 GB só de login em voo, ou de 9 a 24 GB com a consulta ao
vivo de todas; com o teto, 4 comandos medidos são ~0,4 GB de login, ou 0,7 a 1,9 GB de PTYs. O
tempo da consulta ao vivo **não foi medido**: exige login real, e a bancada não usa credencial
pessoal.

**Rampa de N contas** (modo `sim`, 30 ms por comando, Windows; teto de 4 contra o antigo, sem limite):

| Contas | Em voo antes → depois | Rodada antes → depois |
| --- | --- | --- |
| 5 | 7 → 4 | 141 → 214 ms |
| 10 | 12 → 4 | 256 → 314 ms |
| 25 | 27 → 4 | 346 → 731 ms |
| 50 | 52 → 4 | 614 → 1320 ms |
| 100 | 102 → 4 | 1558 → 2664 ms |
| 200 | 202 → 4 | 2142 → 7000 ms |

Custo fixo por conta ≈ 11 ms (gravar amostra e montar o painel). Laço de eventos do processo
principal: p99 de 16 a 27 ms em todos os casos (a base com resolução de 10 ms já é ~16 ms).
Memória do processo principal: +8 MB com 50 contas, +23 MB com 200 sem teto.

**Com processos de verdade** (modo `spawn`, CLI falsa em Node, lançada pelo `runBufferedCommand`):
24 contas lançaram 46 processos, nunca mais de 4 vivos, nenhum sobrou. Cancelamento (12 contas, 25%
travadas para sempre, teto de 3 s): rodada de 3,5 s, 21 processos, **nenhum sobrou** (a árvore
chegou a 15 processos e 234 MB). O smoke real (`--mode=real`, 8 contas) abriu 10 CLIs de verdade
com no máximo 4 vivas e nenhuma sobrou.

**Tetos do `--check`** (definidos antes de medir; a latência foi calibrada na primeira
medição, e todos só podem baixar): consultas em voo ≤ 4 e, com contas de sobra, = 4; toda
conta com amostra e só as que falham de propósito em erro; rodada ≤ 2 × lotes × tempo da
consulta + 15 ms por consulta + 500 ms; atraso do laço p99 ≤ 100 ms; memória do principal
≤ +60 MB; nenhum filho vivo 2 s depois da rodada.

**Limites declarados.**
- *Contas travadas custam mais com o teto.* Uma CLI travada segura uma via até o timeout de
  30 s. Com 3 de 12 travadas a rodada fez 32 s, como antes; com **metade** travada (6 de 12)
  fez 61,5 s contra 30,7 s sem teto, ainda dentro dos 90 s.
- *Até cerca de 55 contas logadas por rodada.* A rodada leva ~`ceil(contas / 4)` vezes o tempo
  de uma conta. Supondo ~6 s por conta (estimativa: a consulta ao vivo não foi medida), acima de
  ~55 contas o teto de 90 s corta o fim da fila, e essas contas mostram a última leitura com a
  mensagem do teto. A fila tem sempre a mesma ordem, então são sempre as mesmas (task aberta).
- *Não medido:* a máquina de referência de 2 núcleos/4 threads, o macOS, e a consulta ao vivo
  de uma conta logada de verdade.

### Reduced motion (atualizado em 03/11/2026)
`prefers-reduced-motion` do sistema operacional é combinado com o Modo
Performance em saídas animadas, fit/pan, minimapa e céu do canvas. O minimapa
e as estrelas deixam de ser montados quando qualquer uma das duas preferências
está ativa. `useReducedMotionPreference` acompanha mudanças da preferência do
sistema enquanto o app está aberto; ativar reduced motion não altera a opção
salva do Modo Performance.

### Safe mode pós-crash
O processo principal registra a sessão em arquivo próprio por processo, dentro
do perfil, e remove seu registro no encerramento normal. Ao encontrar uma
sessão encerrada sem esse fechamento, ou após falha do renderer principal, o
app ativa o Modo Performance antes de montar o workspace e informa o motivo.
O aviso pode ser dispensado; o modo permanece ligado até a pessoa desligá-lo
nas Configurações. Nenhum bloco, terminal ou sessão é removido pelo modo.
O marcador detecta interrupção, não a causa exata; alterações ainda pendentes
de gravação no momento da falha não são garantidas. Outra instância viva do
mesmo perfil não é considerada uma falha. A verificação de instância usa PID:
se o sistema reutilizar o PID de uma sessão interrompida para outro processo,
ela pode ser confundida com uma instância viva e a recuperação não ser ativada.

## Degradações aceitáveis vs. não aceitáveis

| Elemento | Aceitável cortar | Nunca cortar |
|---|---|---|
| Céu animado, grade pontilhada, minimapa | sim, no Performance Mode | — |
| Transições de painel/dock/toolbar | sim, no Performance Mode | — |
| Scrollback visual do terminal | sim, reduz para 5.000 linhas, com aviso antes de chegar no limite (80% da capacidade) e no limite | o replay do processo principal (200.000 chars) continua intacto, mas só é reaplicado quando o terminal é recriado (recarregar a janela ou voltar do Chat); com linhas longas tem menos linhas que o histórico visual, com linhas curtas pode ter mais |
| `AgentUsagePanel` (preview de uso) | no Modo Performance a atualização automática passa de 30 s para 5 min durante atividade; o painel continua visível e o botão Atualizar continua funcionando | nunca parar de existir — usuário precisa saber que o dado está atrasado, não sumido |
| PTY, sessão de terminal, handoff, prompt em andamento | — | nunca. Nenhum modo aqui mata processo ou perde estado — só decoração e buffer visual |

## Implementação e medição — 03/11/2026

Os benchmarks de conexões e de saída do terminal agora cruzam seus modos de
dados com os modos visuais Normal e Performance. O benchmark de conexões confere
o atributo no documento e a presença do minimapa; o de terminal mede o painel
com logs visíveis, a transição de largura e a preservação dos logs ao trocar de
modo. `benchmark:ui-render` continua sendo a medição do app completo e aceita
throttling de CPU para repetir a interação em uma máquina mais lenta.

A mudança do modo não desmonta o observador que acompanha `data-performance-mode`
nem cancela um refresh já ativo. As medições cobrem o minimapa, o céu animado, o
tutorial aberto, o painel de uso e o refresh manual. A cadência automática do
painel de uso é 30 segundos no modo Normal e 5 minutos no Modo Performance.

Limite da evidência: o benchmark com throttling simula CPU lenta por CDP; não
substitui uma medição em um notebook físico de referência. O harness da UI
agora aceita `--legacy-baseline=<hash>`, valida o commit do checkout, usa o
marcador antigo do canvas e registra que a versão histórica não tinha toggle
de Performance.

**Medição local do app completo (03/11/2026).** Windows x64 (build 10.0.26300),
GPU integrada AMD Radeon (driver 31.0.21923.1000), 16 CPUs lógicas; 48 blocos e
31 conexões, tutorial aberto, três rodadas de 3 s por modo, sem aquecimento,
CDP `cpuThrottle=4`:

| Modo | FPS | Quadro p95 | Estilo por quadro | Long tasks por rodada |
|---|---:|---:|---:|---:|
| Normal | 16,33 | 133,1 ms | 22,97 ms | 23 |
| Performance | 35,33 | 83,1 ms | 1,512 ms | 16 |

Nesta execução, Performance teve 116% mais FPS, quadro p95 38% menor e estilo
por quadro 93% menor. A cobertura também confirmou que o toggle acessível
persiste após reload, muda o atributo durante um drag ativo, deixa o drag
terminar e permite restaurar Normal. É uma medição exploratória curta no PC
atual: o throttling via CDP simula a CPU, não reproduz o notebook físico de
referência e não constitui comparação histórica com o commit `44f8cec`.

**Comparação com o código anterior a `44f8cec` (03/11/2026).** A referência é
`b9e3555`, pai direto de `44f8cec`. No mesmo Windows x64, usando o Microsoft
Basic Render Driver (software), CDP `cpuThrottle=4`, 48 nós/31 arestas, três
rodadas de 3 s por condição, um aquecimento e tutorial fechado, o baseline fez
58 FPS, quadro p95 de 33,3 ms e 0,948 ms de estilo por quadro. No commit
`f11da68`, Normal fez 19,67 FPS, p95 de 116,57 ms e 19,203 ms de estilo por
quadro; Performance fez 36,33 FPS, p95 de 66,6 ms e 1,282 ms de estilo por
quadro. Cada rodada concluiu dois toggles da barra/sidebar em ambos os
checkouts.

O Modo Performance atual elevou o FPS em 85% frente ao Normal e reduziu o p95
em 43%, mas ficou 37% abaixo do FPS histórico e com p95 duas vezes maior; o
estilo por quadro é 35% maior. Portanto, a meta de igualar ou superar o
baseline pré-`44f8cec` **segue aberta**. A comparação usa a mesma renderização
por software e throttle sintético, mas não substitui a execução no notebook
físico de referência. Acompanhar uma otimização do canvas e validar os mesmos
critérios no hardware físico.

### Atualização da comparação calibrada (03/11/2026)

O harness agora exige dois toggles concluídos por amostra e calcula FPS com
o tempo efetivamente amostrado. Esta execução de cinco rodadas substitui a
leitura exploratória de três rodadas acima. O Modo Performance também deixou
de montar a grade pontilhada decorativa do React Flow; os nós, as conexões, a
seleção, o arraste e os observadores cobertos pelos harnesses continuam ativos.
A calibração e a alteração estão em [f23da83](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/f23da833be85c392bcb23796cfc2c3e1705a69c4).

| Versão e modo | FPS | Quadro p95 | Estilo por quadro | Paint por quadro |
|---|---:|---:|---:|---:|
| b9e3555 Normal | 42,18 | 49,975 ms | 1,442 ms | 4,106 ms |
| Atual Normal | 18,21 | 114,01 ms | 17,514 ms | 8,066 ms |
| Atual Performance | 43,88 | 49,9 ms | 0,892 ms | 4,257 ms |

Com cinco amostras, Performance ficou 4,0% acima do baseline em FPS, 0,075 ms
abaixo no p95 e 38,1% abaixo no custo de estilo por quadro: os três limites
de aceite da comparação foram atingidos. O paint por quadro permaneceu 3,7%
acima, embora não seja um limite de aceite desta task. O relatório foi feito
no Windows x64 com Microsoft Basic Render Driver por software, CDP
cpuThrottle=4, 48 nós/31 arestas, aquecimento único e tutorial fechado. A
carga do host oscilou entre 18% e 54%; não houve validação no notebook físico
de referência. Repetir nessa máquina quando ela estiver acessível.

## Trade-offs e telemetry opt-in

Telemetry de uso do Performance Mode (quantas sessões ativam manualmente,
em que carga) **não existe hoje** — o app não tem telemetria alguma fora do
uso de agente já visível em `agent-usage.ts` (que é sobre limite de API, não
sobre performance). Se vier a existir, deve ser opt-in explícito nas
Configurações, nunca ligado por padrão, e nunca incluir conteúdo de
terminal — só contadores agregados (modo ligado/desligado, contagem de
terminais no momento da ativação).

### Avaliação em 03/11/2026

O objetivo definido foi calibrar as recomendações por carga para priorizar
melhorias. Hoje, o cenário carregado começa em 10 terminais ativos ou 300 nós,
mas a sugestão guarda apenas um marcador local de que já foi respondida. A
contagem de ativações, sozinha, não mostra quantas sugestões apareceram nem
quantas foram recusadas; portanto, não basta para ajustar o limiar.

O próximo passo escolhido é desenhar um piloto opt-in que avalie contagens
agregadas de exibição e resposta por faixa de carga. A amostra será voluntária
e não deve ser tratada como representativa de toda a base. Este direcionamento
cobre o desenho do piloto, não autoriza implementar coleta ou infraestrutura.
[Task de desenho do piloto](https://app.notion.com/p/Felixo-AI-Core-Performance-desenhar-piloto-opt-in-para-calibrar-recomenda-es-por-carga-40d91f95497e813f85b4dc6b5ef11d93).

## Aceite desta política — status

- Tabela baseline/meta por cenário: acima. ✅
- Modo performance é política compreensível: os quatro modos e o que cada
  um desliga estão listados; a UI (`PerformanceModeSection.tsx`) já descreve
  em linguagem simples o que o toggle atual faz. ✅
- Usuário sabe o que foi reduzido: coberto pelo texto da UI existente para o
  Performance Mode; Safe Mode informa a ativação automática após interrupção.
  Reduced Motion ainda não tem aviso próprio na UI. ⚠️ parcial
- Ativação não perde prompt, dados ou processo: verificado no design atual
  (scrollback só afeta sessões novas; nenhum modo chama kill de processo).
  ✅ o Safe Mode usa o mesmo toggle sem descartar dados persistidos.

## Tasks de acompanhamento abertas a partir desta política

1. Unificar `prefers-reduced-motion` do SO com o conjunto completo de cortes
   do Performance Mode (hoje falta no céu animado e no minimapa).
2. Ativação automática do Performance Mode por carga (hoje só o scrollback
   adaptativo é automático; o resto da decoração exige toggle manual).
3. Safe Mode pós-crash implementado; ver a seção correspondente acima.
4. Desenhar o piloto telemetry opt-in de uso do Performance Mode para calibrar
   recomendações por carga ([task](https://app.notion.com/p/Felixo-AI-Core-Performance-desenhar-piloto-opt-in-para-calibrar-recomenda-es-por-carga-40d91f95497e813f85b4dc6b5ef11d93)).

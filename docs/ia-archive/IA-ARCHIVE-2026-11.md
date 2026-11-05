# Arquivo do IA.md — 2026-11

> Registros movidos, na íntegra e sem edição, de [`IA.md`](../../IA.md) em 2026-11-05
> (compactação sem perda do template de contexto). Não edite aqui: se uma decisão mudar,
> acrescente uma entrada nova e datada no `IA.md`.

## 2026-11-03 — Limites: scheduler central, backoff por conta e atualização base de 30 s (v0.1.495)

**Pedido.** Tarefa "Felixo AI Core/Limites — scheduler central, backoff e atender o pedido de atualização a cada ~30s": substituir os intervalos independentes do painel por um scheduler coordenado, priorizar fontes econômicas enquanto o painel está visível, reduzir ou pausar conforme o contexto, aplicar backoff e instrumentar carga e deduplicação.

**O que mudou** (commit 3ffa74e). O processo principal agora possui um único scheduler para os consumidores visíveis do painel e do modal. Ele favorece sessões ativas e medições antigas; usa cadência base de 30 s, desacelera para 5 min após 5 min de inatividade e para 2 min na bateria. Pausa quando a janela está oculta ou minimizada, em Modo Performance, durante suspensão ou sem consumidor visível. Consultas agendadas usam somente Codex app-server (account/rateLimits/read) e Openia statusline; Claude continua vindo do watcher local e Gemini interativo é ignorado. O refresh manual suspende/deduplica o agendado.

O backoff é por conta: falha genérica exponencial até 15 min, autenticação em 15 min e rate limit respeitando Retry-After (mínimo de 5 min). A instrumentação agrega duração, tentativas, erros, requests por provider, processos iniciados, CPU, RSS e concorrência, sem identificar contas. Painel, modal e documentação foram atualizados para a política automática.

**Validação.** Testes focados: 62/62; typecheck; testes nativos 9/9; frontend 211 arquivos, 3.361 testes passando e 3 pulados; canvas-context 6/6; lint e build passaram. A suíte Node completa teve 3.060 testes: 3.048 passaram, 3 falharam e 9 foram pulados. As três falhas estão fora dos arquivos alterados e dependem do perfil local: duas em agent-session-discovery (metadados/sessão de fixture não encontrados) e uma em pty-process-manager (CODEX_HOME do perfil local presente quando o teste esperava ausência). O CI 41643528998 passou em Linux, Windows, macOS, ARM e smoke do canvas; Release gate 41644654511 passou; Release 41644702651 publicou v0.1.495 como Latest para Ubuntu, Windows e macOS, incluindo o smoke de atualização silenciosa no Windows.

**Não medido em uso real.** A aplicação e contas reais não foram usadas numa rodada ao vivo; portanto CPU, RAM, duração e cadência instrumentadas ainda não foram observadas com providers reais. O trabalho implementa a coleta desses dados para validação operacional posterior.

## 2026-11-03 — Terminal: origem e detalhes do prompt no painel de atividade (v0.1.496)

**Pedido.** Task "Terminal — unificar TerminalPanel com a proveniência do prompt e expor origem/detalhe": mostrar no painel a origem e os detalhes de cada prompt enviado pelo Terminal, cobrindo envios sucessivos e preservando o texto e o fluxo de envio existentes.

**O que mudou** (commit `09c3840`). `ChatWorkspace` anexa ao envio metadados de proveniência sem o corpo do prompt. O IPC propaga esses metadados tanto no envio direto quanto na sessão persistente; os registros mantêm o histórico e atualizam a proveniência mais recente da sessão. `TerminalPanel` exibe o nome/origem e o modo de envio, e permite expandir o histórico com origem, modo, horário e prévia. O detalhe é somente leitura e não reexecuta o prompt. A cobertura também confirma a preservação dos metadados no fallback inline de arquivo.

**Validação.** Testes focados Node: 39/39; frontend focado: 21/21 nos tipos/armazenamento e 1/1 no painel; fallback de arquivo: 4 passaram (18 ignorados pelo filtro). `npm run test:frontend`: 212 arquivos passaram, 2 ignorados; 3.364 testes passaram e 3 foram ignorados. `npm run typecheck`, `npm run lint`, `npm run build` e `git diff --check` passaram (o build mantém o aviso existente de chunk acima de 500 kB). `npm test`: 3.063 testes, 3.051 passaram, 3 falharam e 9 foram ignorados. Após retirar `CODEX_HOME` herdado, as falhas restantes ficaram em `installer-kill-smoke.test.cjs`: a sonda de processos inclui processos GitHub Desktop já existentes como descendentes. A task de isolamento foi aberta. CI `41652088260` passou em Windows, Linux, ARM, macOS e Canvas smoke; Release gate `41653045630` passou; Release `41653097003` publicou **v0.1.496** como Latest, com instaladores e smoke de atualização silenciosa no Windows aprovados.

**Não validado.** Inspeção visual manual no app Electron; a cobertura do painel é por teste de renderização estática. O detalhe expansível não foi exercitado numa sessão interativa real.

**Acompanhamento.** Task "Testes Windows — isolar a sonda de árvore de processos do harness": https://app.notion.com/p/Testes-Windows-isolar-a-sonda-de-rvore-de-processos-do-harness-40d91f95497e81ed8ac3d491c63ba4a8

Estado: concluído e publicado (v0.1.496).

## 2026-11-03 — Performance: harnesses cruzam modos, observers e baseline histórico

**Pedido.** Tarefa [adaptar harnesses para medir o Modo Performance e cobrir observers](https://app.notion.com/p/Felixo-AI-Core-Performance-adaptar-harnesses-para-medir-Modo-Performance-e-cobrir-observers-minima-3e691f95497e816aa1c9c0b3b37c8046).

**O que mudou.** O commit [`f11da68`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/f11da6839d5955ea527ae8cb62cace6c84e259d4) adaptou os harnesses de conexões, saída do terminal e UI real para cobrir Normal/Performance, settings, persistência, drag ativo, minimapa, céu, tutorial, painel e observers do scheduler. O commit [`125dfa2`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/125dfa25cdf5bd2c9ffeacbbf0d963a058ea1b75) acrescentou comparação reproduzível com um checkout histórico (`--legacy-baseline=<hash>`) e documentou os resultados.

**Comparação final.** Mesmo Windows x64, Microsoft Basic Render Driver por software, CDP throttle 4×, 48 nós/31 arestas, três rodadas de 3 s por condição, um aquecimento, tutorial fechado e dois toggles concluídos por rodada. O pai de `44f8cec`, `b9e3555`, fez 58 FPS, quadro p95 33,3 ms e estilo 0,948 ms/quadro. No build `f11da68`, Normal fez 19,67 FPS, p95 116,57 ms e estilo 19,203 ms/quadro; Performance fez 36,33 FPS, p95 66,6 ms e estilo 1,282 ms/quadro. Performance melhora o Normal atual, mas fica 37,4% abaixo do FPS histórico, com p95 100% maior e estilo por quadro 35,2% maior. O critério de empatar/superar o baseline **não foi atendido**; não é medição num notebook físico.

**Validação.** Frontend completo: 215 arquivos passaram, 2 ignorados; 3.372 testes passaram e 3 foram ignorados. Typecheck, lint, build, inventário de canvas e harnesses focados passaram; o novo teste do baseline fechou em 16/16. `npm test` teve 3 falhas dependentes do perfil local: duas em `agent-session-discovery` (metadados de fixture ausentes) e uma em `pty-process-manager` (`CODEX_HOME` do perfil herdado), fora dos arquivos alterados. CI [`41676452685`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41676452685) passou em Windows, Linux, ARM, macOS e Canvas smoke. Release Gate [`41677473109`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41677473109) e Release [`41677540943`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41677540943) passaram; [`v0.1.497`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.497) é Latest. O segundo CI [`41680750421`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41680750421) passou nos cinco alvos; Release Gate [`41681888547`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41681888547) concluiu sem publicar nova versão porque o commit só alterou harness/documentação.

**Acompanhamento.** A tarefa original continua em andamento. A subtarefa [recuperar o baseline pré-44f8cec](https://app.notion.com/p/Felixo-AI-Core-Performance-recuperar-o-baseline-pr-44f8cec-no-Modo-Performance-40d91f95497e81ce8846f7f454a41e16) cobre a otimização e a medição no hardware físico quando disponível. Os relatórios brutos permaneceram em `%TEMP%`, fora do repositório.

## 2026-11-03 — Performance: comparação calibrada e validação física pendente

**Atualização.** Esta entrada sucede a comparação exploratória e o estado de acompanhamento da
entrada anterior. O commit `f23da83` calibrou o harness para exigir dois toggles concluídos por
rodada e calcular FPS pelo tempo real amostrado; também deixou de montar a grade pontilhada no
Modo Performance. A documentação da comparação foi atualizada em `f47b496`.

**Resultado registrado.** No Windows x64, com renderer por software, throttle de CPU 4×, 48 nós,
31 arestas, um aquecimento e cinco rodadas de 3 s por condição, o baseline `b9e3555` registrou
42,18 FPS, p95 de 49,975 ms e 1,442 ms de estilo por quadro. O Modo Performance atual registrou
43,88 FPS, p95 de 49,9 ms e 0,892 ms de estilo por quadro. Os três critérios sintéticos foram
atingidos; a carga do host variou de 18% a 54%. O paint por quadro ficou 3,7% acima do baseline,
fora dos três critérios de aceite. Condições e resultados completos estão em
`docs/performance/PERFORMANCE.md` e `docs/projeto/POLITICA-PERFORMANCE.md`.

**Validação desta atualização.** Os números foram conferidos com os documentos da comparação
calibrada já registrados no repositório; o benchmark não foi repetido nesta atualização. A edição
do resumo e desta entrada foi pontual: uma automação específica teria custo maior que a correção
de contexto.

Estado: comparação sintética concluída; validação no notebook físico de referência pendente de
acesso à máquina.

## 2026-11-03 — Sugestão de Modo Performance por carga

**Pedido.** Sugerir ou ativar o modo quando o canvas ficar carregado, com aviso e escolha da pessoa.

**Entrega.** `CanvasPerformanceSuggestion` usa `classifyPerformanceScenario` após a hidratação:
10 sessões de terminal ativas ou 300 blocos mostram uma sugestão. Sessões encerradas ou com erro
não contam. A pessoa escolhe ligar ou dispensar; a resposta é salva separadamente da sugestão por
hardware. Sem armazenamento, vale durante a sessão. O modo pode ser desligado em Configurações.

**Validação.** Testes focados: 4/4; frontend completo: 3.376 passaram e 3 foram ignorados;
inventário: 9/9; lint e build passaram. A instância de desenvolvimento abriu com perfil isolado e
canvas hidratado. Os cliques no aviso sob carga não foram exercitados no Electron; os testes
invocam as ações e verificam persistência e ativação. O DevTools da instalação empacotada estava
indisponível; a instância de desenvolvimento foi encerrada após o smoke.

Estado: implementação e testes locais concluídos; validação visual sob carga pendente.

## 2026-11-03 — Reduced motion do sistema em todo o canvas

**Pedido.** Combinar a preferência `prefers-reduced-motion` com o Modo Performance
nas superfícies que ainda consultavam somente a opção do app.

**Entrega.** `CanvasAmbientLayer` deixa de montar o campo de estrelas, e `CanvasView`
oculta o minimapa quando o sistema pede menos movimento ou o Modo Performance está
ligado. A preferência continua acompanhada em tempo real pelo hook compartilhado;
isso não altera a opção persistida do app. A regra conjunta está em
`shouldReduceMotion` no módulo de acessibilidade.

**Validação.** A preferência foi emulada na instância de desenvolvimento isolada via
Playwright/CDP. No modo normal, estrelas e minimapa estavam presentes; em
`prefers-reduced-motion: reduce`, ambos desapareceram; ao restaurar `no-preference`,
ambos voltaram. Teste focado 4/4; inventário 9/9; frontend 3.377 testes passaram e 3
foram ignorados. Typecheck/build, lint e `git diff --check` passaram.

Estado: concluído; a preferência do sistema e o Modo Performance aplicam o mesmo corte
às superfícies de movimento do canvas.

## 2026-11-03 — Performance: avaliação de telemetria opt-in

**Pedido.** Avaliar se vale instrumentar o uso do Modo Performance antes de criar
telemetria. O usuário esclareceu que os dados serviriam para calibrar as
recomendações por carga e priorizar melhorias.

**O que foi observado.** `classifyPerformanceScenario` considera o canvas carregado
a partir de 10 terminais ativos ou 300 nós. `CanvasPerformanceSuggestion` mostra
uma recomendação com opções de ligar ou dispensar, mas só persiste um marcador
local `answered`; não conta exibições nem distingue as respostas. Os contadores
propostos na tarefa original só cobririam ativações e não permitiriam medir o
funil da recomendação. Não existe SDK, coletor ou endpoint de analytics no app.

**Decisão.** O usuário escolheu desenhar um piloto opt-in, sem implementar coleta
nesta etapa. O desenho deve avaliar exibições e respostas agregadas por faixa de
carga, manter consentimento explícito desligado por padrão, excluir conteúdo de
terminal e explicar o viés de amostra. Ver a [task de desenho do piloto](https://app.notion.com/p/Felixo-AI-Core-Performance-desenhar-piloto-opt-in-para-calibrar-recomenda-es-por-carga-40d91f95497e813f85b4dc6b5ef11d93).

## 2026-11-03 — Performance: recuperação após encerramento anormal

**Pedido e entrega.** A sessão passa a ter um marcador por processo no perfil.
Uma interrupção ou falha do renderer principal ativa o Modo Performance antes
de montar o workspace na próxima abertura e exibe o motivo. O aviso é dispensável,
o toggle continua manual e nenhum registro de canvas ou terminal é removido.
Instâncias ainda vivas não são tratadas como falhas.

**Validação local.** Quatro testes do serviço passaram, cobrindo saída normal,
interrupção, falha de renderer e instância concorrente. A suíte frontend teve
3.377 testes aprovados e 3 ignorados; lint, build e inventário passaram. Em
Electron com perfil temporário, uma saída abrupta com código 23 foi seguida de
reabertura com modo ligado, aviso e nota persistida; o fechamento normal seguinte
não repetiu o aviso. Um evento de falha do renderer foi simulado em outra sessão,
e o toggle em Configurações desligou o modo e persistiu após reload.

`npm test` terminou com erro em testes alheios à mudança. Reexecutando apenas
`agent-session-discovery` e `pty-process-manager`, 87/90 passaram: os dois testes
de descoberta de sessão e um de isolamento do perfil falharam, como na task
[existente de isolamento](https://app.notion.com/p/Felixo-AI-Core-Testes-isolar-agent-session-discovery-e-CODEX_HOME-do-perfil-local-40d91f95497e811ea808d8c03a40bff5).

**Limite.** O marcador identifica encerramento anormal, sem identificar a causa;
ele não recupera alterações que ainda não haviam sido gravadas na interrupção.
A verificação de processo vivo usa PID e pode confundir PID reutilizado com a
instância original, deixando de detectar aquela interrupção.

## 2026-11-03 — Layout: clique sob o inspetor recolhido

**Investigação.** O inspetor atual usa `inert` e `pointer-events: none` quando
recolhido; a faixa fantasma descrita na task não se reproduziu após o redesenho.
Em Electron com perfil isolado, cliques reais num alvo sob a dock e no botão de
reabertura passaram em 320 e 768 px. Uma regressão injetada que torna a camada
recolhida clicável fez o mesmo teste falhar.

**Entrega.** O smoke do canvas protege esses cliques e o inventário deixa de
apontar o defeito antigo como presente. Inventário 9/9, lint e build passaram.
Em 320 px com a sidebar expandida, ela interceptou o botão de recolher o
inspetor; essa sobreposição diferente precisa de acompanhamento.

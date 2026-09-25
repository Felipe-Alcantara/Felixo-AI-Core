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
sabem medir hoje.

## Os quatro modos

### Normal
Estado padrão. Scrollback adaptativo já entra sozinho a partir de 10
terminais (`TERMINAL_ADAPTIVE_THRESHOLD`, `terminal-scrollback.ts`) — é o
único corte automático por carga que já existe. Toda a decoração (céu
animado, minimapa, transições de painel/dock/toolbar) fica ligada.

### Performance (existe, manual)
Toggle do usuário em Configurações (`PerformanceModeProvider`,
`data-performance-mode` no `<html>`). Hoje desliga, tudo de uma vez:

- Céu animado do canvas (`CanvasAmbientLayer`) — não renderiza, não é só
  pausa de animação.
- Minimapa do React Flow (`CanvasView.tsx:2730`).
- Transições CSS de painel/dock/toolbar/controles (`index.css`).
- Animações de fit/pan do canvas e de saída de nó (`useExitAnimation`,
  `CanvasView.tsx:2310`).
- Scrollback do terminal força 5.000 linhas mesmo abaixo do limiar de 10
  (`terminalScrollbackForSessionCount(..., performanceMode)`).

Nada disso mexe em processo, PTY ou prompt: é corte de decoração e de
buffer visual, nunca de estado. Ativar/desativar não reabre terminal nem
perde handoff — confirmado pelo próprio design (scrollback só se aplica a
sessões novas; sessões vivas mantêm o contrato que tinham ao nascer).

### Reduced motion (existe, parcial — gap real encontrado nesta investigação)
`prefers-reduced-motion` do sistema operacional já é lido
(`reduced-motion-preference.ts`) e combinado com `performanceMode` em DOIS
lugares: `useExitAnimation` (saída de nó) e `CanvasView.tsx:2310` (fit/pan).
Mas não é combinado no minimapa nem no céu animado (`CanvasAmbientLayer`,
`CanvasView.tsx:2730` só olham `performanceMode` puro) — ou seja, alguém com
`prefers-reduced-motion: reduce` no SO, sem nunca ter aberto Configurações,
continua vendo o céu animado e o minimapa. **Gap real, não coberto por
teste**; vira task de acompanhamento (ver Trade-offs).

### Safe mode pós-crash (não existe)
Não há hoje nenhum modo automático acionado depois de o app travar ou ser
morto pelo SO por uso de memória. Política proposta para quando for
implementado: ao detectar que a sessão anterior não fechou normalmente
(sem o unmount limpo que `useCanvasPersistence`/`terminal-session-store`
fazem), a próxima abertura entra em Performance Mode automaticamente e
mostra um aviso dizendo por quê — nunca descarta terminais, nós ou
sessões persistidas sozinho. Ativação automática, sem perguntar; desligar
continua manual, como hoje. **Não implementado — task de acompanhamento.**

## Degradações aceitáveis vs. não aceitáveis

| Elemento | Aceitável cortar | Nunca cortar |
|---|---|---|
| Céu animado, minimapa | sim, no Performance Mode | — |
| Transições de painel/dock/toolbar | sim, no Performance Mode | — |
| Scrollback visual do terminal | sim, reduz para 5.000 linhas | o replay do processo principal (200.000 chars) continua intacto — reabrir o terminal reaplica |
| `AgentUsagePanel` (preview de uso) | pode cair para polling mais espaçado | nunca parar de existir — usuário precisa saber que o dado está atrasado, não sumido |
| PTY, sessão de terminal, handoff, prompt em andamento | — | nunca. Nenhum modo aqui mata processo ou perde estado — só decoração e buffer visual |

## Trade-offs e telemetry opt-in

Telemetry de uso do Performance Mode (quantas sessões ativam manualmente,
em que carga) **não existe hoje** — o app não tem telemetria alguma fora do
uso de agente já visível em `agent-usage.ts` (que é sobre limite de API, não
sobre performance). Se vier a existir, deve ser opt-in explícito nas
Configurações, nunca ligado por padrão, e nunca incluir conteúdo de
terminal — só contadores agregados (modo ligado/desligado, contagem de
terminais no momento da ativação).

## Aceite desta política — status

- Tabela baseline/meta por cenário: acima. ✅
- Modo performance é política compreensível: os quatro modos e o que cada
  um desliga estão listados; a UI (`PerformanceModeSection.tsx`) já descreve
  em linguagem simples o que o toggle atual faz. ✅
- Usuário sabe o que foi reduzido: coberto pelo texto da UI existente para o
  Performance Mode; Reduced Motion e Safe Mode ainda não têm aviso na UI
  porque a lacuna do primeiro e a ausência do segundo são tratadas como
  tasks de acompanhamento, não implementadas nesta rodada. ⚠️ parcial
- Ativação não perde prompt, dados ou processo: verificado no design atual
  (scrollback só afeta sessões novas; nenhum modo chama kill de processo).
  ✅ para o que já existe; Safe Mode ainda não existe para validar.

## Tasks de acompanhamento abertas a partir desta política

1. Unificar `prefers-reduced-motion` do SO com o conjunto completo de cortes
   do Performance Mode (hoje falta no céu animado e no minimapa).
2. Ativação automática do Performance Mode por carga (hoje só o scrollback
   adaptativo é automático; o resto da decoração exige toggle manual).
3. Implementar Safe Mode pós-crash conforme a política proposta acima.
4. Avaliar telemetry opt-in de uso do Performance Mode, se algum dia vier a
   existir telemetria no app.

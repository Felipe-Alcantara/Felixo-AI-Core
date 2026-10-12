# Especificação — Agente na nuvem (crédito de sessão na nuvem)

Estado: **implementado** na branch `feat/agente-nuvem` (PR #120, 2026-10-12). Este
documento descreve o desenho; a seção 12 registra o que mudou na execução e na
revisão independente.
Origem: o pedido de poder criar um agente configurado para usar o crédito de sessão
na nuvem, e o desenho aprovado em conversa (abordagem B).

## 1. Objetivo

Permitir, a partir do canvas, criar uma **sessão de nuvem do Claude Code**
(`claude --cloud`) na conta escolhida e acompanhá-la por um cartão: título,
link, follow-up e retorno ao terminal local.

Motivação: algumas contas de assinatura recebem um **crédito de sessão na nuvem**
(valor e validade variam por conta) que só vale para sessões na nuvem. Esse crédito
não cobre o CLI rodando local. Gastá-lo em tarefas de programação também poupa o
limite semanal do plano.

Critério de sucesso: um clique confirmado cria **exatamente uma** sessão na
conta certa, o cartão guarda o ID e o link, e nenhuma abertura, restauração ou
reinício do app cria sessão (e gasta crédito) sem uma ação explícita.

## 2. Fatos verificados (spike de 2026-10-11, Windows, Claude Code 2.1.287)

| Fato | Evidência |
|---|---|
| `claude --cloud "<tarefa>"` **exige TTY**; com stdout redirecionado recusa com `--cloud requires an interactive terminal` e código 1. | Execução real. |
| Em PTY, cria a sessão em 5 a 7 s e **sai com código 0**. Não abre TUI. | 3 execuções reais. |
| Saída de sucesso (3 linhas): `Created cloud session: <título>`, `View: https://claude.ai/code/session_<ID>?from=cli&m=0`, `Resume with: claude --teleport session_<ID>`. | Captura real. |
| Na primeira vez numa pasta aparece a tela "Quick safety check: Is this a project you created or one you trust?" antes de criar a sessão. Depois de confiada, não volta. | Captura real. |
| `claude -p "<texto>" --cloud <id>` funciona **sem TTY**: imprime `Sent to cloud session.`, `Session ID: …`, `View: …` e sai com 0. | Execução real. |
| `--model sonnet --effort low` e `--effort medium` são aceitos junto com `--cloud` sem erro. | Execução real. O efeito na sessão **não** foi verificado. |
| O saldo do crédito de nuvem diminuiu depois das sessões de teste, o que é consistente com `claude --cloud` do CLI gastar esse crédito na conta logada na máquina. A barra semanal também subiu um ponto, mas o uso local da própria sessão de trabalho impede atribuir isso à nuvem. | Leitura manual do painel Uso (valores inteiros, sem prova isolada). |
| Cloud sessions exigem login claude.ai (não API key). Sem remote no GitHub, o CLI envia um bundle do repositório local (até 100 MB). Na nuvem não há MCPs nem skills locais; permissões são só Auto, Accept edits e Plan. | Documentação oficial (code.claude.com/docs/en/claude-code-on-the-web). Não testado. |

**Não verificado:** efeito de `--model` e `--effort` na nuvem; saídas de erro de
login, limite e bundle grande; comportamento em Linux e macOS (o spike rodou só
no Windows); se continuar localmente com `--teleport` consome o plano em vez do
crédito.

## 3. Escopo

**Dentro (v1):** nó "Agente na nuvem", serviço de disparo, follow-up, abrir link,
trazer para o terminal (teleport), erros classificados, testes, documentação.

**Fora da v1 (melhorias que o projeto poderia expandir, com ajuda bem-vinda):**
escolher modelo e esforço (a CLI aceita as flags, mas falta provar o efeito na nuvem);
ler o saldo do crédito (hoje não há API); acompanhar andamento ou resultado em tempo
real; listar ou reconciliar sessões do claude.ai; presets `.fxpreset`; Codex e Gemini.

## 4. Decisão de arquitetura

**Novo tipo de nó `cloud-session`**, com serviço próprio no processo principal.
O cartão é só dado; o único caminho que cria sessão é um clique confirmado.

Alternativa descartada: bloco de terminal com `launchMode: 'cloud'`. Um bloco de
terminal é restaurado, reiniciado e redescoberto pelo app; cada um desses
caminhos relançaria `--cloud` e gastaria crédito de novo. Evitar isso exigiria
blindar cerca de oito pontos do ciclo de vida do terminal (restauração,
Reiniciar do cartão e da gaveta, texto inicial e skills, descoberta de sessão
local, fallback do Windows, vigia de contas, exportação `.fxcanvas`). Os dois
custos principais da escolha: migração 019 e componente novo.

## 5. Modelo de dados

### 5.1 Tipo e persistência

- `CanvasNodeType` ganha `'cloud-session'` (`app/src/features/canvas/types.ts`).
- `NODE_TYPES` ganha `'cloud-session'` (`services/storage/canvas-repository.cjs`).
- Migração `019_canvas_cloud_session_nodes.sql` recria `canvas_nodes` com o
  `CHECK` ampliado, no padrão das migrações 006, 007, 012 e 013. Sem ela o
  salvamento falha em silêncio.
- Os dados ficam em `data_json`, sem coluna nova.

### 5.2 `CloudSessionNodeData`

```ts
type CloudSessionStatus = 'draft' | 'launching' | 'created' | 'failed'

// Os campos levam o prefixo `cloud` (ver o ajuste 2 da seção 12).
type CloudSessionNodeData = {
  label?: string
  cloudTask: string           // 1 a 4000 caracteres; não começa com "-"
  cloudCwd: string            // pasta do projeto; existente e diretório
  cloudAccountId?: string     // vazio = Login do sistema
  cloudStatus: CloudSessionStatus
  cloudSession?: { id: string; url: string; title: string; createdAt: string }
  cloudFollowUps: Array<{ at: string; text: string; ok: boolean; error?: CloudSessionErrorCode }>
  cloudError?: { code: CloudSessionErrorCode; message: string }
}
```

`followUps` guarda no máximo 20 itens (descarta os mais antigos); `text` até
2000 caracteres. `launching` nunca é persistido: ao carregar um nó nesse estado,
ele vira `failed` com código `interrupted` ("interrompido; confira em
claude.ai/code", porque uma sessão pode ter sido criada).

### 5.3 Transições

```
draft ──Disparar (confirmado)──▶ launching ──ok──▶ created
                                     └──erro──▶ failed ──Tentar de novo──▶ launching
created ──Nova sessão (confirmada)──▶ draft   (limpa session/followUps; mantém task, cwd, accountId)
load com status=launching ──▶ failed(interrupted)
```

`Tentar de novo` só existe para erros que provam que **nenhuma sessão foi
criada** (`trust-required`, `login-required`, `limit-reached`, `invalid-input`).
Para `timeout`, `network`, `interrupted` e `unknown` o cartão mostra o aviso
"pode ter sido criada; confira em claude.ai/code" e exige confirmação para
tentar de novo.

## 6. Serviço (processo principal)

Pasta: `app/electron/services/cloud-session/`, com injeção de dependências no estilo
de `claude-usage-query.cjs` (PTY, `execFile`, relógio, plataforma e resolvedores
injetáveis para teste). Um arquivo por responsabilidade: `cloud-session-output.cjs`
(parser), `cloud-session-input.cjs` (validação), `cloud-session-executable.cjs`
(resolução do `claude`), `cloud-session-command-line.cjs` (linha de comando por
plataforma) e `cloud-session-service.cjs` (orquestração).

### 6.1 API

- `launch({ nodeId, task, cwd, accountId })` → `{ ok: true, session } | { ok: false, code, message }`
- `followUp({ nodeId, sessionId, text, cwd, accountId })` → `{ ok: true } | { ok: false, code, message }`
- `openSession(url)` → valida e abre no navegador padrão.

### 6.2 Execução

- **Executável.** Resolver o `claude` **nativo** (no Windows, o `claude.exe` para
  o qual o shim `.cmd` aponta: `…\node_modules\@anthropic-ai\claude-code\bin\claude.exe`)
  e executá-lo com `argv`, **sem `cmd.exe`**. O caminho padrão do app
  (`createPtyLaunchSpec`) passa por `cmd.exe /d /s /c`, onde `%VAR%`, `"`, `&`,
  `^`, `|`, `<`, `>` e quebras de linha do texto da tarefa podem ser reinterpretados.
  Se só houver o shim, o serviço **recusa** tarefas com esses caracteres
  (`invalid-input`) em vez de arriscar. A busca continua pelo `PATH` quando um shim
  antigo não tem o exe por trás. A resolução é uma função pura e testada.
- **Como o texto chega ao processo, por plataforma** (cada uma com teste):
  - *Windows, PTY:* uma linha de comando montada pela regra do `CommandLineToArgvW`
    (`quoteWindowsArg`), porque o `argsToCommandLine` do node-pty não cita um argumento
    que começa e termina com aspas. Conferida contra o parser real do sistema.
  - *Windows, follow-up:* lista para o `execFile`, que cita corretamente.
  - *macOS:* o `claude` roda pelo shell de login (um app com janela herda um `PATH`
    reduzido) e **cada argumento viaja numa variável de ambiente** (`FELIXO_ARG_n`),
    expandida só entre aspas duplas (`buildPosixExecLine`); o escape de shell do app
    não cobre quebra de linha. O follow-up usa o shell de login sem `-i`, pois não há TTY.
  - *Linux:* o node-pty entrega a lista como `argv`.
  - *Todas:* tarefa e mensagem que começam com `-` são recusadas, porque o próprio
    `claude` as leria como opção (`--settings=…` roda comando).
- **Ambiente.** `buildAccountProcessEnv` + `createCliEnv` (já usados por
  `claude-usage-query.cjs`), que removem credenciais herdadas como
  `ANTHROPIC_API_KEY`. `accountMode: 'chain'` **nunca** é usado.
- **`launch`.** PTY descartável (como a consulta de uso) com
  `claude --cloud <tarefa>`, em `cwd`, com timeout de 60 s e 120 colunas. Ao
  fechar o PTY ou estourar o tempo, o processo é encerrado. Lê a saída acumulada
  sem ANSI.
- **`followUp`.** `execFile` sem TTY: `claude -p <texto> --cloud <id>`, timeout de
  90 s, sucesso quando a saída contém `Sent to cloud session.`.
- **Trava por nó.** Um `Set` em memória por `nodeId`: um segundo `launch` ou
  `followUp` do mesmo nó enquanto outro está em andamento devolve `busy` sem
  executar nada.
- **Observabilidade.** Cada operação termina com um evento (`operation`, `ok`, `code`,
  `durationMs`) que o main grava no QA Logger com `describeCloudSessionEvent`. O evento
  nunca leva a tarefa, a mensagem, a pasta nem o ID da sessão, e um log com defeito não
  muda o resultado. `busy` e entrada inválida não são registrados.
- **Encerramento.** `dispose` encerra os PTY vivos, inclusive durante a tolerância de
  3 s depois da criação, sem esperar o relógio.

### 6.3 Parser e classificação (funções puras)

`parseCloudSessionOutput(text)`:

- Sucesso: três linhas reconhecidas; `id` casa `session_[A-Za-z0-9]+`; `url` deve
  ser `https://claude.ai/code/session_<mesmo id>` com query opcional; `title` é o
  texto depois de `Created cloud session:` (até 200 caracteres). Os rótulos `View:` e
  `Resume with:` só valem no começo da linha: um título como "Create View: component"
  não pode transformar uma sessão criada (e cobrada) em erro.
- `trust-required`: a saída contém "Is this a project you created or one you
  trust" e nenhuma linha `Created cloud session`.
- Demais códigos: login, limite e rede reaproveitam `accounts/cli-failure-patterns.cjs`;
  sem correspondência, `unknown` com as últimas 20 linhas redigidas.

Códigos: `trust-required`, `login-required`, `limit-reached`, `network`, `timeout`,
`interrupted`, `invalid-input`, `busy`, `unknown`. (Um código para "repositório grande
demais" foi removido: nenhum caminho o produzia, porque a saída real desse erro nunca
foi capturada. Quem capturá-la pode propor o padrão e o código.)

### 6.4 IPC e preload

Canais `cloud-session:launch`, `cloud-session:follow-up` e `cloud-session:open`,
registrados por `registerCloudSessionIpcHandlers` e expostos em
`window.felixo.cloudSession`, seguindo `register*IpcHandlers`. O main valida o
formato de cada payload (tipos, tamanhos, `nodeId`); `open` aceita somente
`https://claude.ai/code/session_…`.

## 7. Interface

- **Criação.** Botão **Agente na nuvem** na seção *Criar* da barra lateral (como
  Grupo e Página Web) cria um cartão em `draft`, com o nome "Agente na nuvem", na
  pasta do primeiro projeto. Cada clique cria um cartão novo.
- **Rascunho.** Campos: tarefa (textarea), pasta (projeto) e conta (seletor
  existente). Aviso fixo: "Gasta o crédito de sessão na nuvem da conta escolhida
  (se houver) ou o limite do plano. O saldo só aparece em Configurações > Uso." Botão
  **Disparar na nuvem**. Uma tarefa que começa com `-` mostra o motivo no campo
  (`aria-invalid`) e mantém o botão desabilitado.
- **Confirmação inline** (sem modal e sem `window.confirm`), que esconde o formulário
  e mostra conta, pasta e a **tarefa inteira** (o que se confirma é o que roda). O
  aviso do pacote de 100 MB aparece sempre, sem consultar o git no renderer.
- **Criada.** Título, ID copiável e botões **Abrir**, **Enviar follow-up** (campo +
  envio), **Trazer para cá** e **Nova sessão**. Lista os últimos follow-ups com
  resultado.
- **Trazer para cá.** Cria um bloco de terminal normal com `claude --teleport <id>`
  na mesma pasta e conta, **sem texto inicial** (mesma ideia do launcher Openia,
  `launchMode` opaco), para não digitar contexto dentro de uma conversa
  retomada. Dica no botão: "continua localmente e pode usar o limite do plano".
- **Falha.** Mensagem em português do código; para `trust-required`, botão
  **Abrir Claude nesta pasta** (terminal comum, uma vez) e depois **Tentar de novo**.
- **Acessibilidade** (baseline obrigatório do padrão de qualidade, frontend §9): todo
  campo tem rótulo e todo botão de ícone tem nome; estados anunciados com
  `aria-live`/`role="alert"`. **Foco:** entra na tarefa de um cartão novo e vazio; na
  confirmação ao abri-la (no contêiner, e não no botão que gasta crédito, para um
  Enter mantido não confirmar sem querer); volta ao botão de origem ao cancelar ou
  com **Esc**; vai para o resultado quando o disparo termina; e para a tarefa depois
  de **Nova sessão**. Os spinners usam `motion-safe:animate-spin`
  (`prefers-reduced-motion`).
- **Inventário.** Cada botão novo entra em `inventory/data/nodes.ts` e o
  inventário é regenerado (`npm run docs:inventario-canvas`), porque um teste
  conta `<button` por arquivo dono.
- **Exportar e importar.** `canvas-transfer.cjs` exporta o cartão como `draft`
  (tarefa, sem pasta, conta, `session` nem `followUps`). Importar nunca dispara.

## 8. Invariantes de segurança (cada um com teste)

| # | Invariante |
|---|---|
| I1 | Só um clique confirmado em **Disparar** ou **Nova sessão + Disparar** cria sessão. Restaurar, abrir o app, reconectar o IPC ou recarregar o renderer nunca chamam `launch`. |
| I2 | Dois disparos simultâneos do mesmo nó resultam em uma execução (`busy` no outro). |
| I3 | Depois de `created`, o botão Disparar não existe; só **Nova sessão**, confirmada. |
| I4 | A tarefa e o follow-up chegam ao processo como um único argumento, nunca reinterpretados por um shell: linha de comando exata no Windows, variável de ambiente no macOS, `argv` no Linux (§6.2). |
| I10 | Tarefa e mensagem não começam com `-`: o `claude` as leria como opção. |
| I5 | `ANTHROPIC_API_KEY` e credenciais herdadas não entram no ambiente; a conta vem só do perfil escolhido. |
| I6 | `open` só abre `https://claude.ai/code/session_…`. |
| I7 | Saída exibida em erro passa por redação antes de sair do main. |
| I8 | `.fxcanvas` não leva `session`, `followUps`, pasta nem conta. |
| I9 | Um nó carregado em `launching` vira `failed(interrupted)`; nunca re-executa. |

## 9. Testes

- **Parser e classificador** (`node --test`): fixtures com a saída real do spike
  (IDs sintéticos): sucesso, tela de confiança, recusa sem TTY.
- **Resolução do executável** (`node --test`): shim do npm, binário nativo, Linux e
  macOS; recusa de caracteres perigosos quando só há shim.
- **Serviço** com PTY falso: I2, I4, I5, timeout, encerramento do processo, falha
  parcial.
- **Migração 019** e `canvas-repository`: ida e volta do tipo novo; dados antigos
  preservados.
- **Estado do cartão** (`vitest`, `.ts` puro): transições da seção 5.3 e I3, I9.
- **IPC**: validação de payload e I6, com `electron` stub (`pty-ipc-handlers.test.cjs`
  como modelo).
- **Transferência**: I8.
- **Manual (não roda no CI, porque gasta crédito):** roteiro em
  `docs/validation/` com disparo real, follow-up, teleport e pasta nunca vista.

## 10. Documentação a atualizar na implementação

`IA.md` (raiz) e `docs/projeto/IA.md` (entradas datadas), `ARQUITETURA.md`,
`GUIA-USUARIO.md`, `README.md`, `INVENTARIO-CANVAS.md` (regenerado),
`docs/README.md` (índice) e o checklist de release, se aplicável.

## 11. Pontos em aberto e convites à contribuição

O que segue ainda não foi provado e é um bom lugar para quem quiser ajudar. O roteiro
`docs/validation/CHECKLIST-AGENTE-NUVEM.md` diz como conferir cada ponto.

1. **Linux e macOS na tela.** O CI roda os testes automáticos nos dois (inclusive a prova
   do shell POSIX), mas a criação real de sessão foi conferida só no Windows. Quem tiver
   um deles pode rodar o checklist e registrar o resultado.
2. **Saídas de erro reais** de login, limite, rede e pacote grande: os padrões vêm do
   classificador de falhas das contas, e só a tela de confiança foi capturada de verdade.
3. **Continuar localmente com `--teleport`**: confirmar se consome o plano ou o crédito
   de nuvem; a dica do botão deve refletir o resultado.
4. **Efeito de modelo e esforço na nuvem**: a CLI aceita as flags junto com `--cloud`,
   mas falta provar que a sessão as usa para oferecê-las no cartão.
5. **Sessões duplicadas por timeout**: o timeout de 60 s pode estourar depois de a sessão
   ser criada; por isso `timeout` não oferece "Tentar de novo" direto.

## 12. Ajustes feitos durante a implementação

Registrados aqui em vez de reescrever as seções acima, que descrevem o desenho aprovado.

1. **Migração `019`, não `018`.** A `018_system_design_sources.sql` já existia em
   `origin/main` (e já estava aplicada no banco local). A branch saiu de um `main`
   local desatualizado; foi rebaseada sobre `origin/main` e a migração renumerada. A
   `019` foi ensaiada numa cópia do banco real (versão 18 para 19, mesmas contagens
   de blocos, `integrity_check` ok).
2. **Campos do nó com prefixo `cloud`** (`cloudTask`, `cloudCwd`, `cloudAccountId`,
   `cloudStatus`, `cloudSession`, `cloudFollowUps`, `cloudError`). `CanvasNodeData` é
   uma intersecção plana de todos os tipos de bloco, e `cwd` e `accountId` já existem
   no terminal: reaproveitá-los faria o código que varre "blocos com conta" tratar o
   cartão como um terminal vivo daquela conta.
3. **Criação fora do menu Agente (§7).** A primeira ideia foi o menu de ferramentas,
   como o bloco Tarefas Notion, mas ele é acoplado a painéis; o item 8 registra o que
   ficou.
4. **`createdAt` é carimbado pelo renderer**; o serviço devolve só `id`, `url` e
   `title`.
5. **Saída parcial.** O parser só aceita a última linha sem quebra depois que o
   processo sai (`final`), porque antes disso o ID pode estar cortado no meio do
   pedaço recebido do PTY.
6. **Confirmação inline esconde o formulário.** Medido ao rodar o cartão no app real: com
   o resumo aberto abaixo dos campos, os botões de confirmar ficavam fora da área
   visível. Com a confirmação aberta, só o resumo (conta, pasta e tarefa) aparece.
7. **Sem detecção de remote.** O aviso do pacote de 100 MB aparece sempre na confirmação
   ("Sem remote no GitHub, o repositório inteiro é enviado como pacote"), em vez de
   consultar `git remote get-url origin` (§7), para o renderer não executar git.
8. **Botão na seção Criar.** O ponto de entrada é um botão **Agente na nuvem** na seção
   *Criar* da barra lateral (como Grupo e Página Web), e cada clique cria um cartão novo.
   O cartão nasce com o nome "Agente na nuvem" (o dock de elementos usa o `label`) e
   altura padrão de 560 px.

## 13. Revisão independente e ajustes de padrão de qualidade (2026-10-12)

Depois de o cartão estar funcionando, uma revisão independente da branch inteira, com os
guias do padrão de qualidade como régua (guia mínimo, backend, frontend §9 e §10 e a
política de git), achou os pontos abaixo. Todos têm teste automatizado ou verificação
registrada; os de interface foram conferidos no app real.

| # | Achado | O que mudou |
|---|---|---|
| 1 | No Windows o node-pty não cita um argumento que começa e termina com aspas: uma tarefa como `"abc" --settings=x "def"` virava vários argumentos e o `--settings` chegava ao `claude` como opção. Em qualquer plataforma, texto começando com `-` também vira opção. | Linha de comando montada pela regra do `CommandLineToArgvW` (conferida contra o parser real do Windows); recusa de texto que começa com `-` no main e na tela (I4 e I10). |
| 2 | Um título como "Create View: component" fazia uma sessão já criada e cobrada virar erro, e o cartão perdia o ID. | Os rótulos `View:` e `Resume with:` só valem no começo da linha. |
| 3 | Sem gestão de foco, sem Esc na confirmação e com spinner sem `prefers-reduced-motion` (frontend §9, obrigatório); o foco inicial caía no botão que gasta crédito. | Foco, Esc e `motion-safe` (seção 7), conferidos no app real; o foco entra no contêiner da confirmação. |
| 4 | O ID da sessão era comparado ao link com `includes`; o carregamento do cartão deixava passar campos soltos de outro tipo de bloco. | Igualdade exata do ID e lista fechada de campos ao reabrir. |
| 5 | No macOS o escape de shell do app não cobre quebra de linha nem tabulação. | Cada argumento viaja numa variável de ambiente (verificado com um `sh` de verdade, e o CI de Linux e macOS roda o mesmo teste). |
| 6 | Sem log das falhas (backend §9.2); `dispose` não encerrava o PTY durante a tolerância; a busca do `claude.exe` parava no primeiro shim; um código de erro que nenhum caminho produzia. | Eventos no QA Logger sem conteúdo privado; `dispose` imediato; busca segue pelo `PATH`; código removido. |
| 7 | Valores privados da conta e do banco de quem testou nos documentos, spec com "nada está implementado", plano sem as caixas marcadas, trabalho futuro escrito como pendência interna, e um commit de documentação misturando `IA.md` com README e guias. | Valores generalizados, documentos atualizados, trabalho futuro como convite (seções 3 e 11), commits separados por tema nas correções. |

Dois aprendizados que valem para quem mexer aqui: o `tsc -p .` não verifica nada neste
projeto (o gate é `npm run typecheck`), e o shell das ferramentas de edição reduz pela
metade as barras invertidas em heredocs, o que corrompe fixtures com caminhos do Windows.

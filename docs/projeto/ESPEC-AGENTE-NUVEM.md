# Especificação — Agente na nuvem (crédito de sessão na nuvem)

Estado: **rascunho para revisão** (2026-10-11). Nada abaixo está implementado.
Origem: pedido do dono para "spawnar um agente configurado para usar os créditos
especiais" e design aprovado em conversa na mesma data (abordagem B).

## 1. Objetivo

Permitir, a partir do canvas, criar uma **sessão de nuvem do Claude Code**
(`claude --cloud`) na conta escolhida e acompanhá-la por um cartão: título,
link, follow-up e retorno ao terminal local.

Motivação: contas Max recebem um **crédito de sessão na nuvem** (exemplo medido:
US$ 250, com prazo de 4 a 5 de novembro de 2026) que só vale para sessões na
nuvem. Esse crédito não cobre o CLI rodando local. Gastá-lo em tarefas de
programação também poupa o limite semanal do plano.

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
| O crédito de nuvem caiu de US$ 159 para US$ 158 depois das sessões de teste, o que é consistente com `claude --cloud` do CLI gastar esse crédito na conta logada na máquina. A barra semanal também subiu 1 ponto, mas o uso local da própria sessão de trabalho impede atribuir isso à nuvem. | Leitura manual do painel Uso (valores inteiros, sem prova isolada). |
| Cloud sessions exigem login claude.ai (não API key). Sem remote no GitHub, o CLI envia um bundle do repositório local (até 100 MB). Na nuvem não há MCPs nem skills locais; permissões são só Auto, Accept edits e Plan. | Documentação oficial (code.claude.com/docs/en/claude-code-on-the-web). Não testado. |

**Não verificado:** efeito de `--model` e `--effort` na nuvem; saídas de erro de
login, limite e bundle grande; comportamento em Linux e macOS (o spike rodou só
no Windows); se continuar localmente com `--teleport` consome o plano em vez do
crédito.

## 3. Escopo

**Dentro (v1):** nó "Agente na nuvem", serviço de disparo, follow-up, abrir link,
trazer para o terminal (teleport), erros classificados, testes, documentação.

**Fora (v1):** escolher modelo e esforço; ler o saldo do crédito (não há API);
acompanhar andamento ou resultado em tempo real; listar ou reconciliar sessões
do claude.ai; presets `.fxpreset`; Codex e Gemini.

## 4. Decisão de arquitetura

**Novo tipo de nó `cloud-session`**, com serviço próprio no processo principal.
O cartão é só dado; o único caminho que cria sessão é um clique confirmado.

Alternativa descartada: bloco de terminal com `launchMode: 'cloud'`. Um bloco de
terminal é restaurado, reiniciado e redescoberto pelo app; cada um desses
caminhos relançaria `--cloud` e gastaria crédito de novo. Evitar isso exigiria
blindar cerca de oito pontos do ciclo de vida do terminal (restauração,
Reiniciar do cartão e da gaveta, texto inicial e skills, descoberta de sessão
local, fallback do Windows, vigia de contas, exportação `.fxcanvas`). Os dois
custos principais da escolha: migração 018 e componente novo.

## 5. Modelo de dados

### 5.1 Tipo e persistência

- `CanvasNodeType` ganha `'cloud-session'` (`app/src/features/canvas/types.ts`).
- `NODE_TYPES` ganha `'cloud-session'` (`services/storage/canvas-repository.cjs`).
- Migração `018_canvas_cloud_session_nodes.sql` recria `canvas_nodes` com o
  `CHECK` ampliado, no padrão das migrações 006, 007, 012 e 013. Sem ela o
  salvamento falha em silêncio.
- Os dados ficam em `data_json`, sem coluna nova.

### 5.2 `CloudSessionNodeData`

```ts
type CloudSessionStatus = 'draft' | 'launching' | 'created' | 'failed'

type CloudSessionNodeData = {
  task: string                // 1 a 4000 caracteres
  cwd: string                 // pasta do projeto; existente e diretório
  accountId?: string          // vazio = Login do sistema
  status: CloudSessionStatus
  session?: { id: string; url: string; title: string; createdAt: string }
  followUps: Array<{ at: string; text: string; ok: boolean; error?: CloudSessionErrorCode }>
  error?: { code: CloudSessionErrorCode; message: string }
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

Arquivo: `app/electron/services/cloud-session-service.cjs`, com injeção de
dependências no estilo de `claude-usage-query.cjs` (PTY, relógio e resolvedores
injetáveis para teste).

### 6.1 API

- `launch({ nodeId, task, cwd, accountId })` → `{ ok: true, session } | { ok: false, code, message }`
- `followUp({ nodeId, sessionId, text, cwd, accountId })` → `{ ok: true } | { ok: false, code, message }`
- `openSession(url)` → valida e abre no navegador padrão.

### 6.2 Execução

- **Executável.** Resolver o `claude` **nativo** (no Windows, o `claude.exe` para
  o qual o shim `.cmd` aponta: `…\node_modules\@anthropic-ai\claude-code\bin\claude.exe`)
  e executá-lo com `argv`, **sem shell e sem `cmd.exe`**. O caminho padrão do app
  (`createPtyLaunchSpec`) passa por `cmd.exe /d /s /c`, onde `%VAR%`, `"`, `&`,
  `^`, `|`, `<`, `>` e quebras de linha do texto da tarefa podem ser reinterpretados.
  Se só houver o shim, o serviço **recusa** tarefas com esses caracteres
  (`invalid-input`) em vez de arriscar. Linux e macOS executam o binário direto.
  A resolução é uma função pura e testada.
- **Ambiente.** `buildAccountProcessEnv` + `createCliEnv` (já usados por
  `claude-usage-query.cjs`), que removem credenciais herdadas como
  `ANTHROPIC_API_KEY`. `accountMode: 'chain'` **nunca** é usado.
- **`launch`.** PTY descartável (como a consulta de uso) com
  `claude --cloud <tarefa>`, em `cwd`, com timeout de 60 s e 120 colunas. Ao
  fechar o PTY ou estourar o tempo, o processo é encerrado. Lê a saída acumulada
  sem ANSI.
- **`followUp`.** `execFile` sem TTY: `claude -p <texto> --cloud <id>`, timeout de
  90 s, sucesso quando a saída contém `Sent to cloud session.`.
- **Trava por nó.** Um `Map` em memória por `nodeId`: um segundo `launch` ou
  `followUp` do mesmo nó enquanto outro está em andamento devolve `busy` sem
  executar nada.

### 6.3 Parser e classificação (funções puras)

`parseCloudSessionOutput(text)`:

- Sucesso: três linhas reconhecidas; `id` casa `session_[A-Za-z0-9]+`; `url` deve
  ser `https://claude.ai/code/session_<mesmo id>` com query opcional; `title` é o
  texto depois de `Created cloud session:` (até 200 caracteres).
- `trust-required`: a saída contém "Is this a project you created or one you
  trust" e nenhuma linha `Created cloud session`.
- Demais códigos: login e limite reaproveitam `accounts/cli-failure-patterns.cjs`;
  `repo-too-large` e `network` ganham padrões novos **confirmados contra saída
  real durante a implementação**; sem correspondência, `unknown` com as últimas 20
  linhas redigidas.

Códigos: `trust-required`, `login-required`, `limit-reached`, `repo-too-large`,
`network`, `timeout`, `interrupted`, `invalid-input`, `busy`, `unknown`.

### 6.4 IPC e preload

Canais `cloud-session:launch`, `cloud-session:follow-up` e `cloud-session:open`,
registrados por `registerCloudSessionIpcHandlers` e expostos em
`window.felixo.cloudSession`, seguindo `register*IpcHandlers`. O main valida o
formato de cada payload (tipos, tamanhos, `nodeId`); `open` aceita somente
`https://claude.ai/code/session_…`.

## 7. Interface

- **Criação.** Item "Agente na nuvem (créditos)" no menu **Agente** (`TerminalMenu.tsx`)
  cria o cartão em `draft` na pasta do projeto atual.
- **Rascunho.** Campos: tarefa (textarea), pasta (projeto), conta (seletor
  existente). Aviso fixo: "Gasta o crédito de sessão na nuvem da conta escolhida
  (se houver) ou o plano. O saldo só aparece em Configurações > Uso." Botão
  **Disparar na nuvem**.
- **Confirmação.** Diálogo com conta, pasta e tarefa. Se `git remote get-url origin`
  falha na pasta, acrescenta: "Esta pasta não tem remote no GitHub: o repositório
  será enviado como pacote (limite de 100 MB)."
- **Criada.** Título, ID copiável e botões **Abrir**, **Enviar follow-up** (campo +
  envio), **Trazer para cá** e **Nova sessão**. Lista os últimos follow-ups com
  resultado.
- **Trazer para cá.** Cria um bloco de terminal normal com `claude --teleport <id>`
  na mesma pasta e conta, **sem texto inicial** (mesma ideia do launcher Openia,
  `launchMode` opaco), para não digitar contexto dentro de uma conversa
  retomada. Dica no botão: "continua localmente e pode usar o limite do plano".
- **Falha.** Mensagem em português do código; para `trust-required`, botão
  **Abrir Claude nesta pasta** (terminal comum, uma vez) e depois **Tentar de novo**.
- **Acessibilidade.** Rótulos, foco no primeiro campo, estados anunciados
  (`aria-live`), mesmo padrão dos nós existentes (`docs/design/NODES.md`).
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
| I4 | A tarefa e o follow-up chegam ao processo apenas como `argv`; nenhum shell interpreta o texto. |
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
- **Migração 018** e `canvas-repository`: ida e volta do tipo novo; dados antigos
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

## 11. Riscos e pontos a confirmar antes de codar

1. **Linux e macOS** não foram testados: confirmar `--cloud` em PTY e a resolução
   do binário.
2. **Saídas de erro** (login, limite, bundle grande, rede) ainda não foram
   capturadas; os padrões novos dependem de captura real.
3. **Resolver `accountId` em ambiente**: localizar a função que o
   `pty-ipc-handlers.cjs` usa e reutilizá-la, sem `chain`.
4. **Continuar localmente com `--teleport`**: confirmar se consome o plano; a dica
   do botão deve refletir o resultado.
5. **Sessões duplicadas por timeout**: o timeout de 60 s pode estourar depois de a
   sessão ser criada; por isso `timeout` não oferece "Tentar de novo" direto.
6. **Efeito de modelo e esforço na nuvem**: fora da v1 por falta de prova.

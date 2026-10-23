# Arquivo do IA.md — 2026-10

> Registros movidos, na íntegra e sem edição, de [`docs/projeto/IA.md`](../projeto/IA.md) em 2026-10-23
> (compactação sem perda do template de contexto). Não edite aqui: se uma decisão mudar,
> acrescente uma entrada nova e datada no `docs/projeto/IA.md`.

## [2026-10-05] Limites e uso: campos do `/status` do Codex no painel

Task: [Felixo AI Core/Limites — mostrar no painel todas as informações do /status do Codex](https://app.notion.com/p/Felixo-AI-Core-Limites-mostrar-no-painel-todas-as-informa-es-do-status-do-Codex-3db91f95497e8186bb2ef5d707a05d2b).

O `/status` real do Codex CLI 0.150.1 foi capturado por PTY e renderizado num
`@xterm/headless` (a TUI redesenha com movimento de cursor; tirar só os
escapes funde textos sobrepostos). Campos medidos: Model (modelo, esforço,
resumos), Directory, Permissions, Agents.md, Account (e-mail e plano),
Collaboration mode, Session e o limite (Monthly limit, % restante e reset).

Fonte escolhida: o `codex app-server`, não a TUI. A mesma sessão que já lia
`account/rateLimits/read` agora também pede `account/read`
(`refreshToken: false`, para nunca renovar credencial ao abrir o painel) e
`config/read`. `requestCodexAppServer()` passou a aceitar pedidos opcionais
no mesmo processo: um opcional que responde erro ou não responde até o tempo
limite só deixa o próprio campo de fora, e a leitura dos limites continua.

O que entra no painel, só quando a CLI publicou (campo nulo não vira valor
presumido): e-mail, plano, tipo de login, modelo, esforço e resumo do
raciocínio, nível de serviço, perfil, política de aprovação, sandbox, o rótulo
"Permissões" derivado das duas (ex.: `never` + `danger-full-access` → "Acesso
total (Full Access)", conferido contra o `/status` real), limite atingido e
controle de gastos. O limite em si continua como métrica ("Últimos 30 dias").
Omitidos de propósito, com o motivo escrito no próprio painel: Directory,
Agents.md, Collaboration mode, Session, tokens e janela de contexto — eles
dependem de uma sessão de chat aberta, e o painel é por conta/perfil.

Cada conta continua lendo o próprio app-server com o ambiente do seu perfil;
um teste prova que dois perfis não trocam e-mail nem plano. Consulta ao vivo
nesta máquina bateu com o `/status`: `gpt-5.6-terra`, esforço `low`, Plus,
100% do limite mensal, 2 resets disponíveis, "Acesso total (Full Access)".

Testes: 12/12 em `codex-account-rate-limits.test.cjs` (4 novos, com fixture
real anonimizada). Backend 2395/2398 e frontend 2916/2924; as falhas
(`app-relaunch.test.cjs`, EPERM de symlink, e 5 timeouts em
`terminal-reading.fixtures.test.ts`) se repetem idênticas sem esta mudança.
Lint e typecheck limpos. O `node_modules` local precisou ser reinstalado do
zero (estava desatualizado depois do pull, sem TypeScript 7 nem
`@tailwindcss/vite`).

## [2026-10-05] Instalação: o app do dia a dia rodava da cópia de smoke em %TEMP%

Task: [Felixo AI Core/Instalação — app do dia a dia roda da cópia de smoke em %TEMP% e o autostart aponta para ela](https://app.notion.com/p/Felixo-AI-Core-Instala-o-app-do-dia-a-dia-roda-da-c-pia-de-smoke-em-TEMP-e-o-autostart-aponta-p-3db91f95497e81699310d1f0e05ec51d).

Causa raiz medida no registro do Windows do Felipe (05/10/2026): em 02/09 um
release smoke rodou localmente num shell elevado. `scripts/release-smoke.cjs`
instalava o NSIS com `/S /D=%TEMP%\felixo-release-smoke-*` e o mesmo appId do
app real; elevado, o NSIS fez instalação "para todos os usuários": gravou a
desinstalação e o `InstallLocation` em HKLM
(`38f15219-ae73-5ead-9234-72a65f4ddfd3`), criou atalhos no Menu Iniciar
(ProgramData) e na Área de Trabalho pública, todos apontando para `%TEMP%`. O
Felipe abriu o app por esses atalhos; o auto-update lê o `InstallLocation` e
atualiza no lugar (a cópia estava na 0.1.433); o "iniciar com o sistema"
gravou esse exe em `HKCU\...\Run`, habilitado em `StartupApproved`.

Correções:
- `release-smoke.cjs`: fora de um runner descartável (`GITHUB_ACTIONS`/`CI`),
  o instalador NSIS é recusado com mensagem explicando o risco; a escolha
  automática passa a usar `win-unpacked`. `--allow-system-install` libera
  numa máquina descartável. O CI segue instalando como antes.
- `autostart.cjs`: `isInsideTemporaryDirectory()` compara o exe com as
  pastas temporárias depois de `realpathSync.native` — no Windows
  `os.tmpdir()` vem em nome curto 8.3 (`FELIPE~1`) e o exe em nome longo, e
  texto cru nunca casaria. Ligar o autostart a partir de %TEMP% é recusado;
  desligar continua permitido; o status traz `warning`, mostrado em
  Configurações.
- `electron/release-smoke.test.cjs` apaga as pastas que cria (`after`).
  Medido: 200 pastas `felixo-release-*` antes e 200 depois de rodar os dois
  arquivos de teste.

Pendente, manual: migrar esta máquina para uma instalação normal (precisa
fechar o app, que hospeda as sessões do canvas). Testes: autostart 17/17,
smoke 17/17 + 7/7 (`electron/release-smoke.test.cjs`); backend 2402/2405 e
frontend 2916/2924, com as mesmas falhas pré-existentes de antes
(`app-relaunch`, EPERM de symlink; 5 timeouts em `terminal-reading`). Lint e
typecheck limpos.

## [2026-10-05] Script para tirar uma instalação do Felixo de %TEMP%

`app/scripts/windows/migrar-instalacao-de-temp.ps1` corrige uma máquina que
ficou com o estado da entrada anterior (app do dia a dia rodando de
`%TEMP%\felixo-release-smoke-*`). Por padrão só simula; com `-Executar`:
recusa continuar com o app aberto (nunca o encerra), roda o desinstalador da
cópia (`/allusers` quando ela está em HKLM, exigindo administrador), remove
item de login e atalhos que apontem para `%TEMP%`, instala o instalador
oficial com `/S /currentuser` — sem esse argumento, rodando elevado, o NSIS
repetiria a instalação para todos os usuários — e confere que o exe novo mora
fora de `%TEMP%`. Gravado em UTF-8 **com BOM**: o Windows PowerShell 5.1 lê
UTF-8 sem BOM como ANSI e o parser quebra nos acentos. Simulado nesta máquina
em 05/10/2026: encontrou a cópia 0.1.433 em HKLM, o item de login e os dois
atalhos; nada foi alterado. A execução de verdade fica com o Felipe, porque
fechar o app encerra as sessões do canvas.

Também em 05/10: apagadas, com autorização, 198 pastas de teste
(`felixo-release-smoke-test-*`, `-app-test-*`) e a `felixo-release-smoke-EanLXu`
(smoke de 14/09) em `%TEMP%`, depois de conferir que nenhum processo rodava
delas. A `felixo-release-smoke-4pap4S`, de onde o app roda, ficou intacta.

## [2026-10-05] Terminal: links longos dos agentes abriam cortados (H2 confirmada)

Task: [Felixo AI Core/Terminal — links enviados pelos agentes ainda não abrem](https://app.notion.com/p/Felixo-AI-Core-Terminal-links-enviados-pelos-agentes-ainda-n-o-abrem-reproduzir-no-app-real-e-ach-3db91f95497e81a79554c9cffa821c63).
O PR #98 já tinha tratado OSC 8 (H3) e o mouse tracking (H1); faltava a H2
e um clique em saída de agente real.

Medição com os agentes reais: Claude Code 2.1.285 e Codex 0.150.1 num PTY
de 100 colunas (Windows/ConPTY), renderizados num `@xterm/headless`, cada um
respondendo com uma URL de 322 caracteres. O Codex quebra a resposta com
quebra mole (`isWrapped`, sem recuo), que o `WebLinksAddon` já resolvia. A
Claude Code reposiciona o cursor na coluna 3 a cada linha (`ESC[n;3H`): a
primeira quebra chega sem `isWrapped` e o recuo de dois espaços vira
caractere real no buffer, inclusive nas linhas seguintes marcadas como
continuação. Os dois ecoam o prompt com quebra dura e o mesmo recuo. Com isso
o addon via só a primeira linha da URL.

Correção: `terminal-spanning-url-links.ts`, registrado com
`registerLinkProvider` antes do `WebLinksAddon` (no xterm, o primeiro
provedor com link na posição vence). Critério geométrico, não `isWrapped`:
a linha encosta na margem direita (com uma coluna de folga, que o Codex
deixa) e a seguinte começa com recuo curto e caractere de URL; o recuo sai
do texto juntado. Só links que atravessam linhas; o resto segue com o addon.
Mesmo gesto, dica e menu de destino; só http/https.

Prova no app real (fonte, Windows): passo L13 do smoke de links (sessão D),
com a CLI roteirizada desenhando a URL como a Claude Code real. Ctrl+clique
na primeira linha, na de baixo e na última: com o provedor, o menu mostra a
URL inteira; sem ele (desligado de propósito), o menu mostrou
`https://example.com/felixo/url-quebrada/segmento01/segmento02/segmento03/se`.
9 testes de unidade com as linhas reais do buffer (fixture JSON).

Limites: não houve clique numa sessão viva da Claude Code dentro do app — o
bloco "Agente" abriu a Claude real pedindo confiança na pasta pessoal
inteira, e essa confiança não foi concedida para um teste; a prova usa os
mesmos bytes reproduzidos pela CLI roteirizada no terminal real do app. Não
rodei no app empacotado (o empacotamento local segue bloqueado; o código é o
mesmo bundle do renderer). A suíte completa do backend foi interrompida pelo
Claude Code por falta de memória na máquina; os testes do backend alterado
(CLI roteirizada) passaram 18/18 e a CI roda a suíte inteira. Frontend
2925/2933, com as 5 falhas pré-existentes de `terminal-reading`.

## [2026-10-05] Limites: o monitor do Claude travava e só reiniciar o app destravava

Task: [Felixo AI Core/Limites — reconectar o monitor quando o Claude dessincroniza, sem reiniciar o app](https://app.notion.com/p/Felixo-AI-Core-Limites-reconectar-o-monitor-quando-o-Claude-dessincroniza-sem-reiniciar-o-app-3db91f95497e8195a468fc5cd74cd6cc).

Causa reproduzida com teste: `refresh()` deduplicava as rodadas num
`refreshPromise` compartilhado e só o liberava no `finally`. A consulta ao
vivo é uma função injetada que RECEBE `timeoutMs`, mas nada garantia que ela
cumprisse; uma promessa que nunca resolve prendia todo clique em Atualizar
(que, além disso, fica desabilitado enquanto carrega) até o processo morrer.
O teste com `queryLiveUsage: () => new Promise(() => {})` travou até o
`timeout 60` do shell antes da correção.

Correção:
- Teto da rodada (`REFRESH_DEADLINE_MS`, 90 s) com um `AbortController` por
  rodada; `untilAborted()` faz a rodada não depender de a consulta honrar o
  cancelamento. Estourar grava amostra de erro com motivo e passa pelo
  `onLiveQueryFailure`, que alimenta o QA Logger já persistido em disco
  (`qa-log-disk-store.cjs`, da task de observabilidade, concluída) — a
  evidência sobrevive ao restart.
- Rede de segurança: teto + 5 s devolve o painel atual com `refreshError`.
- `reconnect()` (IPC `agent-usage:reconnect`): abandona a rodada, cancela as
  consultas dela e refaz; uma geração por rodada impede que a abandonada
  grave por cima da nova. A mensagem distingue teto de Reconectar.
- Consultas do Claude (PTY) e do Codex (app-server) aceitam `signal`:
  abortar encerra o processo descartável na hora.
- Painel: botão Reconectar habilitado mesmo durante a coleta; só a resposta
  do pedido mais recente vale; card mostra "Última consulta falhou (hora):
  motivo" quando exibe o último valor conhecido.

Validação: teste de reprodução sai em ~0,3 s; Reconectar com a consulta presa
refaz sem ser sobrescrito; cancelamento mata o PTY e o app-server; 40/40 nos
testes de serviço, IPC, consulta do Claude e do Codex; 3 testes do aviso de
falha. Typecheck e lint limpos. No app real (fonte, perfil isolado),
Reconectar clicado no meio da coleta concluiu uma rodada nova em ~30 s.
Não validado: a consulta real do Claude travando de verdade (não há como
provocar sob demanda) e o app empacotado.

Achado à parte (task própria): o selo de plano do Codex mostra FREE numa conta
Plus, porque `agent-usage-local-probes.cjs:46` prefere o `plan_type` dos
limites (`free`) ao plano da conta (`chatgpt_plan_type` = `plus`).

## [2026-10-05] Dependências: Release destravado (braces via Excalidraw) e v0.1.434 publicada

Task: [Felixo AI Core/Dependências — tirar o braces vulnerável (GHSA-vfj7-8cjw-p6xm) que entra pelo Excalidraw e reprova o Dependency policy](https://app.notion.com/p/Felixo-AI-Core-Depend-ncias-tirar-o-braces-vulner-vel-GHSA-vfj7-8cjw-p6xm-que-entra-pelo-Excalid-3f091f95497e8109bcdac1df0785f87e).

Desde o alerta GHSA-vfj7-8cjw-p6xm, o job Dependency policy reprovava em main
(`npm audit --omit=dev` com high=4) e o Release não publicava: o último
publicado era a v0.1.433, de 01/10. Cadeia: `@excalidraw/excalidraw@0.18.1 →
sass@1.51.0 → chokidar@3.6.0 → braces@3.0.3`. Não existe braces corrigido (o
alerta cobre `<=3.0.3`, a versão mais nova publicada). O chokidar 4 não
depende de braces; o Excalidraw declara o sass como dependência, mas o dist
não o importa e o app não usa sass. Correção: override
`@excalidraw/excalidraw > sass > chokidar: ^4.0.3`. Descartado o override do
sass para 1.105, que traria o `@parcel/watcher` (módulo nativo) ao app
empacotado sem necessidade.

O lock foi montado a partir do original aplicando só as diferenças reais de
pacote: o `npm install` desta máquina (Windows) também apagava os campos
`libc` (glibc/musl) dos pacotes nativos por plataforma — que o npm no Linux
usa para escolher o binário — e entradas `inBundle` do oxide-wasm32. Prova:
`npm ci` do zero com o lock montado (exit 0), audit de produção 0, build ok.

Deploy (Etapa 9 cumprida até o fim, a pedido do Felipe): CI 37291727326 verde
(o benchmark de scrollback do macOS oscilou e passou na reexecução); Release
37293541428 verde às 07:12; **v0.1.434 publicada como Latest** (alvo
f01f69f), instaladores dos três SOs, "Smoke do canvas no app empacotado"
verde em Linux, Windows e macOS — o que inclui o passo L13 dos links
quebrados e fecha a validação empacotada das tasks de links e de Limites de
hoje.

## 2026-10-05 — Limites: o /status inteiro do Codex no painel, e o resumo por provedor

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Limites — mostrar no painel todas as informações do /status do Codex" (Notion 3db91f95-497e-8186-bb2e-f5d707a05d2b). Feito em 02/10 (14:24 em diante) e portado em 05/10.

### Porte sobre o `19d9dae4` (05/10)

O código ficou pronto em 02/10, mas não subiu. Em 05/10, às 02:35, outra sessão entregou uma versão menor da mesma task (`19d9dae4`): só app-server, com `extraRequests` dentro de `codex-account-rate-limits.cjs`. A pessoa escolheu **portar tudo**, então esta versão substitui aquela parte.

- **Mantido do `main`:**
  - o cancelamento por `signal` (teto da rodada e "Reconectar", `058750ae`), que agora vale para o app-server (`runCodexAppServerSession`, motivo `cancelled`), para a tela do `/status` (fecha o PTY) e para a consulta combinada;
  - o campo `profile` da configuração;
  - o teste de cancelamento.
- **Coberto pelos testes daqui:** isolamento por perfil e CLI sem os métodos novos (opcional recusado ou `timeout`).
- **Saiu:**
  - o rótulo "Permissões" derivado de aprovação e sandbox: o `/status` real mostra permissões da pasta, que são da sessão;
  - o e-mail nos detalhes: a identidade já aparece no cabeçalho da conta.

### Decisões da pessoa

- **Campos da conversa ficam fora, com aviso.** Pasta, permissões da pasta, Agents.md, nome e modo da conversa, ID da sessão e janela de contexto descrevem um terminal, não a conta.
- **Duas fontes.** O app-server estruturado e também a tela do `/status`, para o texto exato da CLI.
- **Tudo o que o app-server dá.** Inclui o histórico de tokens e os avisos de bloqueio.
- **Pedido no meio da task.** Agrupar as contas do mesmo provedor: cada cartão abre com uma tabela de resumo, e o /status completo de cada conta fica recolhido.

### Como ficou

- **Processo principal.**
  - `codex-app-server-client.cjs`: uma sessão JSON-RPC manda vários pedidos de uma vez; só o limite é obrigatório, e os opcionais têm uma folga de 8 s.
  - `codex-status-details.cjs`: monta os detalhes, com texto em português e uma allowlist em `agent-usage-model.cjs`.
  - `codex-status-screen.cjs`: lê a tela num PTY, usando `@xterm/headless` para saber o que está visível.
  - `codex-status-query.cjs`: junta as duas fontes em paralelo.
- **Métricas.** Os outros baldes de `rateLimitsByLimitId` (a reserva semanal de um modelo) saem com `scope: 'model'`, e `account-chain-policy.cjs` ignora esse escopo: a cadeia não declara a conta esgotada por causa de um modelo. O limite de gasto individual de workspace vira métrica da conta.
- **Painel.** `summarizeProviderAccounts` (puro, em `agent-usage.ts`) alimenta `AgentUsageProviderSummary.tsx`, e cada conta fica num `<details>` sem `open` controlado, que guarda o estado entre coletas.
- **Fixtures reais anonimizadas.**
  - `electron/__fixtures__/codex-app-server-status.json`, gravada por `scripts/record-codex-app-server-fixture.cjs`.
  - `codex-status-conta*.json`, gravadas pelo cenário `status-conta` de `record-terminal-fixture.cjs`, que ganhou `--reanonymize` e a troca do plano da linha "Account:".

### Cuidados medidos no Codex 0.156.1

- **Confiança na pasta.** Em pasta nova, o Codex pergunta "Trust this folder?", e Enter grava no `config.toml`. Um teste de sonda gravou, e a linha foi removida com backup. A leitura usa `-c projects={'<pasta>'={trust_level='trusted'}}`, que vale só para a execução, e sai com Esc se algum diálogo aparecer.
- **Enter durante a subida do MCP.** Enquanto os servidores MCP sobem, o Enter de um comando é ignorado. Uma gravação digitou `/status` de novo, mandou "/status/status" como mensagem e criou uma conversa real (sessão `01a0fe3e…` e uma linha no `history.jsonl`, deixadas para a pessoa decidir). Desde então:
  - a leitura e o gravador só digitam com o campo vazio e sem "Starting MCP servers" na tela;
  - o Enter só é repetido com o `/status` ainda no campo.
- **Primeiro `/status` sem limites.** O primeiro `/status` de uma sessão nova pode responder "refresh requested". A leitura repete até 4 vezes.
- **Isolamento.** `--no-daemon` evita um servidor compartilhado de outra conta, e `--no-alt-screen` mantém o quadro em linhas.
- **Conferido por hash depois de cada rodada real.** `config.toml`, `history.jsonl` e `auth.json` ficaram iguais, sem sessão nova. A exceção é a gravação acima.

### Medido

- **Consulta completa.** 6,6 a 11 s. A da medição de CPU levou 7,6 s, com 3,4 s de CPU de usuário e 1,5 s de sistema somando node, app-server e TUI.
- **App isolado.** Rodou da fonte sob Xvfb, com userData temporário e `flock`. O resumo mostrou as janelas do Codex e do Claude, a etiqueta "só este modelo", os detalhes e o aviso do Codex. A coluna Conta, estreita na primeira captura, foi alargada.
- **Testes.** 53 testes novos. Lint e typecheck limpos, Vitest com 2.928 testes, e a suíte node com 2.442 no Node 25 e no Node 22. Os testes novos com timer passaram 6 rodadas paralelas sob carga, depois de corrigidas duas corridas de timer nos próprios testes.

### Observado e não resolvido aqui

- **Créditos de reset.** O backend às vezes devolve `availableCount: 4` com a lista de créditos vazia (gravado na fixture). Sem a lista, o botão "Usar reset" não tem o ID do crédito.

### Não validado

- **Windows e macOS.** Não houve leitura real do PTY nesses sistemas. As aspas do `-c projects` no `cmd.exe`, com pasta temporária contendo espaço, estão cobertas só por teste de unidade.
- **Duas contas Codex reais no mesmo cartão.** Não foram vistas no app isolado: usar o perfil real é vetado. O agrupamento com duas linhas está coberto pelos testes de renderização.
## 2026-10-05 — Ditado por voz: validação de ponta a ponta no Linux (microfone virtual + whisper local)

Registro de Claude - Tasks do AI Core, task "Entrada de voz — validar o ditado com microfone real nos três sistemas" (Notion 3e091f95-497e-81e2-9cd8-d7f19085de39). Início às 09:31.

### Decisões da pessoa

- **Microfone.** Esta máquina só tem o microfone embutido, que está quebrado, então a validação usa só um microfone virtual.
- **Transcrição.** Só servidor local, sem chave de nuvem.
- **Windows e macOS.** Uma task por sistema, com o roteiro pronto.

### Como

- **Instância isolada.** `felixo devtools launch --visible`, sob Xvfb e `flock`, com TMPDIR próprio.
- **Microfone virtual.** O PipeWire faz uma saída nula e uma `module-remap-source` com o nome `felixo_vmic`. `PULSE_SOURCE` aponta o app para essa fonte, sem trocar a fonte padrão do sistema.
- **Fala.** Cinco frases em pt-BR, geradas com o piper (`pt_BR-faber-medium`).
- **Transcrição.** `app/scripts/servidor-transcricao-local.py`, com faster-whisper 1.2.1 e PyAV 15.1. O PyAV 16+ quebra: `TypeError: open() got an unexpected keyword argument 'metadata_errors'`.
- **Roteiro.** `app/scripts/validar-ditado-linux.cjs`.

### Medido no Linux

| # | Item | Resultado |
| --- | --- | --- |
| 1 | Fluxo | `Ctrl+Shift+M`, fala, `Ctrl+Shift+M`: o texto ficou na linha do bash real (`bash-5.2$ e um teste para função que calcula o fete.`) e não foi executado. |
| 2 | Indicadores | Ponto vermelho com cronômetro (`0:04`) na barra de cima, `data-dictation-state` passando por `recording`, `transcribing` e `idle`, e o spinner. |
| 3 | Permissão negada | Com a sessão recusando `media`: "O acesso ao microfone foi negado. Confira a permissão de microfone do seu sistema (portal/PipeWire/PulseAudio) para o Felixo AI Core." Nenhum stream de captura aberto. |
| 4 | Sem terminal aberto | O aviso "Nenhum terminal aberto: copiei o texto ditado." aparece e o texto vai para a área de transferência. |
| 5 | Erros | Servidor local desligado, DNS inexistente, rota 404 (mensagem "modelo ou endereço não encontrado") e chave falsa na API real da OpenAI (401, "A chave … foi recusada"). Nenhuma mensagem trouxe a chave. |
| 6 | Tipo de áudio | `MediaRecorder.isTypeSupported`: `audio/webm;codecs=opus` e `audio/mp4` sim, `audio/ogg;codecs=opus` não. O servidor recebeu `ditado.webm` (`audio/webm`) e transcreveu. |
| 7 | Linux sem keyring | Com o D-Bus apontando para lugar nenhum, o Chromium não alcança o KWallet. O `speech:set-key` devolve "Este sistema não oferece armazenamento cifrado …" e não grava o `speech-key.bin`. |
| 8 | Microfone liberado | Um stream "Chromium input" (`electron`) no `pactl list source-outputs` durante a gravação, e zero depois de parar, cancelar ou fechar o app gravando. |

**Latência e qualidade.** As frases têm de 2,6 a 3,3 s, com voz sintética, num notebook de 2 núcleos e 4 threads, com o app principal e o navegador abertos (load average por volta de 9 a 14). A WER compara com o texto de referência.

| Modelo | Mediana | Média de WER |
| --- | --- | --- |
| tiny | 1,6 s | 30,6% |
| base | 3,0 s | 30,2% |
| small | 8,8 s | 13,5% |

Na prova pelo app, do segundo atalho ao texto no terminal, o `base` levou 9,7 s, e 19,9 s numa rodada com a máquina mais carregada.

**macOS (estático).** O `NSMicrophoneUsageDescription` está no `build.mac.extendInfo`. A build não é assinada (`identity: null`), então o entitlement `com.apple.security.device.audio-input` segue desnecessário.

### Mudou

- A tela de configurações deixou de dizer que o servidor local "ainda não foi testado com um servidor real" e passou a citar o exemplo.
- O guia do usuário ganhou a seção "Ditado por voz".
- A lacuna do inventário foi atualizada.

### Achado fora do escopo

`session-security.cjs` concede toda permissão que não seja `openExternal`, inclusive `media`, a qualquer sessão. Isso vale também para as partições dos blocos "Página Web". Um site aberto no navegador interno abre microfone e câmera sem perguntar. Virou task própria.

### Não validado

- **Microfone físico.** O desta máquina está quebrado.
- **API na nuvem com chave real**, por decisão da pessoa.
- **Windows e macOS.** Ficaram em tasks próprias.
- **Diálogo de permissão do macOS empacotado.**

## 2026-10-05 — CLI: diagnóstico na interface conferido com CLIs quebradas de verdade, e dois erros de causa no Linux/macOS

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/CLI — mostrar o diagnóstico de CLI na UI (causa, próxima ação e copiar para suporte)" (Notion 3e291f95-497e-8109-8851-e4ff2193c4db). Início às 10:52.

### Estado encontrado

Os passos 1 a 4 da task já estavam no main desde o PR #94 (`d0496cd6`, 26/09):

- `cli-diagnosis.ts`, com rótulo por causa e `shouldOfferCliInstall`;
- `CliDiagnosisView.tsx`, com a linha por CLI e o "Copiar texto para o suporte";
- o botão "Diagnosticar CLIs" no gerenciador de modelos, e os testes.

Faltava a conferência com CLIs quebradas de verdade.

### Medido (Linux, execução real)

Uma pasta em `FELIXO_CLI_PATHS` com CLIs falsas, PATH sem o nvm e HOME falso. Cada CLI falsa reproduz uma causa:

- `claude` sem bit de execução;
- `codex` que sai com código 3;
- `gemini` com `#!` para um Node que não existe.

| CLI falsa | Antes | Depois da correção |
| --- | --- | --- |
| `claude` (sem bit de execução) | `permission`, sem instalar (certo) | igual |
| `codex` (sai com código 3) | `not-installed` e `recommendInstall: true` ("Não encontrei Codex CLI no PATH") | `exec-error`, sem instalar |
| `gemini` (Node do `#!` não existe) | `not-installed`, oferecendo instalar | `shim`, sem instalar |

**Causa.** No POSIX, `detectCli` roda o comando pelo nome e só resolve o caminho no Windows. Por isso `attempts[].resolvedPath` saía `null`: o `exec-error` não achava `found` e caía em "não instalada". O ENOENT de um interpretador ausente era lido como "arquivo não existe".

**Correção** (`cli-detector.cjs`). Na falha, o caminho é resolvido no PATH só para o registro. ENOENT com o arquivo presente vira `shim-broken`. O Windows não muda, porque lá o caminho já era resolvido antes.

**Testes.** Três testes com execução real em `cli-diagnostics.test.cjs`: falharam antes da correção e passaram depois.

**Na tela** (instância isolada, `felixo devtools`, Xvfb e `flock`). Pelo "Configurar modelos" e pelo "Diagnosticar CLIs" do gerenciador:

- "Instalada, mas falhou ao responder";
- "Bloqueada por permissão";
- "Instalada, mas o atalho não executa".

Nenhuma das três mostrou botão "Instalar". O "Copiar texto para o suporte" copiou 1.699 caracteres, com causa, motivo técnico e próxima ação de cada CLI.

### Limitações

- O texto de suporte esconde o usuário só em `/home/<u>/`, `/Users/<u>/`, `C:\Users\<u>\` e no HOME real. Um caminho fora desses padrões que tenha o nome dentro de outro diretório mantém o nome. Isso só apareceu porque o teste usou um HOME falso.
- O Windows real (shim `.cmd` quebrado e CLI gerenciada fora do PATH) não foi rodado: não há máquina Windows nesta sessão.
- O caso "instalação gerenciada fora do PATH" não foi montado aqui.

## 2026-10-05 — Motor local do ditado: medido com voz humana, decidido não embutir

Registro de Claude - Tasks do AI Core, task "Entrada de voz — medir e decidir o motor local com microfone real" (Notion 3e091f95-497e-818d-bac4-c8fb971cdb4c). Início às 12:47.

### Decisões da pessoa

- **Voz humana.** Sem microfone que funcione nesta máquina, a voz humana veio de gravações públicas.
- **Motivo de um motor local.** O que pesa é não pagar API.
- **Instalador.** Nada a mais; um motor local, se viesse, seria baixado sob demanda.
- **Com os números na mesa:** documentar o servidor local (não embutir), com `small` como modelo padrão.

### Como foi medido

- **Máquina.** i5-6200U (2 núcleos e 4 threads, AVX2/FMA/F16C), com o uso normal da pessoa ao mesmo tempo: app Felixo, Firefox tocando mídia e outras sessões. O load average ficou entre 5 e 13.
- **Voz humana.**
  - 6 frases do **FLEURS** pt_br (`google/fleurs`, CC-BY 4.0), de 6,7 a 9,5 s. As duas partes do pt_br só têm vozes masculinas. O `dev.tar.gz` foi lido em fluxo, sem baixar o pacote inteiro.
  - 6 frases do **VoxForge** pt (GPL), de 3,3 a 5,8 s, de 3 locutoras com microfones caseiros, achadas lendo o README de cada pacote ("Gênero: Feminino").
- **Comparação.** O **faster-whisper** 1.2.1 (CTranslate2 int8, pelo `servidor-transcricao-local.py`) contra o **whisper.cpp** `60c0be6` (compilado aqui, `-t 4`). Nos dois, decodificação **gulosa** (beam 1). O `whisper-cli` usa beam 5 por padrão, e a primeira rodada, injusta por isso, deu de 35 a 39 s no `small`. A ordem dos motores alterna a cada frase, para os dois dividirem a mesma carga.
- **WER.** Contra a transcrição oficial, depois de normalizar maiúsculas e pontuação.

### Medido: os dois motores (voz humana, 12 frases por modelo)

| Modelo | Motor | Mediana | WER | Masculinas | Femininas |
| --- | --- | --- | --- | --- | --- |
| tiny | faster-whisper | 1,39 s | 31,2% | 21,6% | 40,8% |
| tiny | whisper.cpp | 3,89 s | 30,8% | 22,4% | 39,3% |
| base | faster-whisper | 2,51 s | 21,8% | 12,6% | 31,1% |
| base | whisper.cpp | 5,85 s | 19,5% | 9,5% | 29,5% |
| small | faster-whisper | 7,31 s | 13,2% | 7,7% | 18,7% |
| small | whisper.cpp | 18,21 s | 13,7% | 8,8% | 18,7% |

- **Qualidade igual**, porque são os mesmos pesos. O whisper.cpp é de 2,3 a 2,8x mais lento nesta CPU.
- **Parte do WER é formatação:** "10 km" e "10 quilômetros", "nove e vinte e cinco" e "9h25", "21 a 20" e "21-20". Os erros reais ficam em nomes próprios ("Lakkha Singh" virou "Lacasingue") e em palavras como "móveis", que virou "Moved".
- **Voz sintética** (piper, 5 frases de 5,2 a 5,9 s): o faster-whisper levou 1,5 s no `tiny`, 2,1 a 4,6 s no `base` e 6,2 a 6,6 s no `small`. A voz sintética tropeça em termos em inglês ("TypeScript" virou "tipisquite"), então só a voz humana entrou na decisão.

### Medido: critério de aceite (ditar sem internet, no app)

- **Isolamento.** `bwrap --dev-bind / / --unshare-net --die-with-parent`: só loopback (`curl` para fora dá "sem rota"), com o servidor local dentro (`HF_HUB_OFFLINE=1`).
- **Microfone e app.** O microfone virtual do PipeWire tocou as frases humanas. O app foi dirigido por `felixo devtools`, com perfil temporário.
- **Resultado.** O texto ficou na linha do bash real, sem Enter, nas 5 frases (3 masculinas e 2 femininas). Da segunda tecla do atalho até o texto:

| App | Modelo | Tempo | WER |
| --- | --- | --- | --- |
| Instalado (v0.1.437), com Modo Performance | `small` | 13,4 a 16,8 s | 0% a 7,7% |
| Instalado | `base` | 4,5 a 9 s | 0% a 8,7%, com uma frase feminina toda errada |
| Modo dev (Vite), sob Xvfb | `small` | 14 a 25 s | 0% a 5,6% |

- **De onde vem a demora.** O próprio app acrescenta só de 0,4 a 0,9 s. O resto é a transcrição, sensível à carga da máquina:
  - a mesma frase de 7,4 s levou 7,9 s com a máquina livre (medição A/B);
  - levou 12,6 a 13,7 s com outra sessão e o navegador ocupando a CPU;
  - levou 23,6 a 25,3 s com o app em modo dev aberto ao lado, porque o Vite e o Electron sem GPU somavam cerca de 1,7 núcleo.

### Decisão e consequência

Não embutir motor no app.

- **Por quê.** O faster-whisper, que é o mais rápido aqui, depende de Python e não é embutível. O whisper.cpp, embutível, não ganha em qualidade e é mais de 2x mais lento no modelo que dá para usar (`small`, 18 s por frase).
- **O que mudou.** O guia do usuário passa a indicar `small` como padrão, com a tabela de custo. A seção do `ARQUITETURA.md` deixou de dizer "nenhum servidor real foi rodado".

### Não medido

- Microfone físico (o desta máquina está quebrado).
- O backend Vulkan do whisper.cpp na GPU integrada.
- Modelos maiores (`medium`, `large-v3-turbo`).
- Windows e macOS.
- A API na nuvem (task própria).

## 2026-10-05 — CLI: o diagnóstico mostra o PATH efetivo (origem e ordem) e diz se a pasta da CLI está nele

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/CLI — incluir o PATH efetivo (origem e ordem) no diagnóstico de CLI" (Notion 3e291f95-497e-8184-8b28-ce3a7a52f3e2). Início às 15:15.

### Decisão

Segui a recomendação da própria task: origem, posição e caminho minimizado, sem ler variável de ambiente além das que já montam o PATH.

### O que mudou

- **Fonte única.** `describeCliPath(env)` (`cli-process-manager.cjs`) devolve `{ position, origin, path }`, com origem em `CLI_PATH_ORIGINS` (`configurada`, `usuario`, `sistema`, `processo`, `app`, `gerenciada`). `createCliEnv` só junta essa lista. Antes da troca, comparei com a implementação anterior: string de PATH idêntica em três ambientes (18, 11 e 19 pastas).
- **Diagnóstico.** `binaryDir`/`managedDir` trazem a pasta minimizada e a posição (`null` = fora). A causa `path` cita a pasta exata, dentro ou fora da lista; "não instalada" diz em quantas pastas o app procurou; o texto de suporte termina com a lista `N. [origem] pasta`.
- **Privacidade.** `minimizePaths` aceita `userName` (de `os.userInfo()`, não de variável de ambiente): o nome some também fora da pasta pessoal, só como pedaço inteiro e sem diferenciar maiúsculas. Nomes genéricos que são pastas comuns (`node`, `bin`…) ficam de fora. Fecha a limitação "nome de usuário em outros caminhos" da entrada anterior.
- **Tela.** `<details>` "PATH que o app enxerga (N pastas)" no rodapé do diagnóstico, fechado por padrão, com a origem no fluxo do texto (o aviso das CLIs tem 320 px).

### Achado

`createCliEnv` sempre acrescenta `layout.packagesBin` quando a pasta existe. Então, se há binário gerenciado no disco, a pasta dele **está** no PATH, e o texto antigo da causa `path` ("a pasta dela não está no PATH") estava errado no caso comum. O que acontece de fato é o arquivo não ser reconhecido como executável (sem bit `x`, ou só `.cmd` fora do Windows). O texto novo diz isso.

### Medido (Linux, app real isolado)

`felixo devtools`, Xvfb, `flock`, `env -i` com HOME falsa e CLIs falsas: `codex` em `FELIXO_CLI_PATHS`, nenhum `claude`, e `gemini.cmd` na pasta gerenciada.

- Codex "Pronta", pasta na posição 1; Claude "Não instalada… procurou em 8 pastas"; Gemini causa `path`, "a pasta 8 de 8".
- Lista com as 6 origens na ordem; `<details>` fechado no início, abre no clique e é focável pelo teclado.
- Texto copiado (2.681 caracteres) e tela sem o nome da conta nem `/home/<conta>`. O nome sumiu também dentro de `/tmp/claude-1000/-home-<usuario>-…`.
- Lint, typecheck, Vitest (2.947) e suíte Node (2.478 no Node 25; Node 22 verde).

### Limitações

- Windows real não rodado (sem máquina Windows nesta sessão); a task já aberta de validação no Windows ganhou este item.
- A deduplicação continua exata por texto, como antes: no Windows, a mesma pasta com maiúsculas diferentes aparece duas vezes na lista (é o que a CLI recebe).

## 2026-10-07 — Openia no pacote instalado num Windows limpo, e o alias .ps1 passa a funcionar

Task: [Felixo AI Core/Agentes — validar Openia empacotado em Windows limpo (NSIS real, aliases .cmd/.ps1, cancelamento, exportação de canvas)](https://app.notion.com/p/Felixo-AI-Core-Agentes-validar-Openia-empacotado-em-Windows-limpo-NSIS-real-aliases-cmd-ps1-c-3e291f95497e81e19363e1888d82cbaf). A validação de 21/09 rodou numa máquina não limpa e deixou cinco itens sem prova.

### Decisões do Felipe (07/10)

- **Ambiente limpo = runner `windows-latest`** (com Python, sem Felixo e sem Openia). Esta máquina não serve: Felixo, Python e o launcher legado instalados; Windows Sandbox desativado; 0,5 GB de RAM livre.
- **Chave real**, a "Teste Felipe Home" do Audiofy (`.audiofy/keys.json`, fora do git), como secret temporário `OPENIA_TEST_KEY` — criado para a validação e apagado no fim. A chave não tem limite de gasto no OpenRouter; o roteiro se impôs teto de US$ 0,05 e gastou US$ 0.
- **Suportar o alias `.ps1`** do Openia (alternativas: remover do catálogo ou só abrir task).

### Achado e correção: aliases `.cmd`/`.ps1`

Medido nesta máquina com pastas temporárias, e depois no app instalado da v0.1.438 no runner limpo:

- `.ps1`: nunca detectado (o `execFile` não roda script); o serviço do Openia não chamava `list`/`models`/`key`; o terminal abria com "não é reconhecido" — o `cmd.exe` não executa `.ps1` (o PATHEXT padrão não tem `.PS1`, ao contrário do que dizia o comentário em `createPtyLaunchSpec`). Nenhum instalador do Openia cria `openia.ps1`: o instalador PowerShell grava uma *função* no `$PROFILE`, que os terminais (`-NoProfile`) nem carregam.
- `.cmd` numa pasta com espaço: detectado, mas `list --json` falhava — `resolveOpeniaSpawn` passava `shell: true` ao `cross-spawn`, que então repassa o caminho sem aspas. É o caso do launcher legado desta máquina (`C:\Users\Felipe Martins\AppData\Local\openia\openia.cmd`).

Uma regra para as três camadas (commit `44fde46`): `resolveCommandPath` no Windows procura primeiro o que o `cmd.exe` executa (`.exe`/`.cmd`/`.bat`) em todo o PATH, depois `.ps1` e por último o arquivo sem extensão — o `.ps1` só entra quando nada mais existe, então nada que já funcionava muda. O adaptador win32 ganhou `createPowerShellScriptLaunch` (`-NoLogo -NoProfile -ExecutionPolicy Bypass [-NonInteractive] -File`), usado pelo detector, pelo serviço do Openia (via o `prefixArgs` que o serviço de imagens já aceitava) e pelo terminal (interativo, `-NoExit` na sessão de rodar arquivo). O serviço deixou de usar `shell: true`. O diagnóstico marca `[powershell]`.

Testes que falham antes e passam depois (conferido com `git stash`): detector (precedência, `-File`, `.ps1` real em pasta com espaço), serviço (`list --json` real por `.cmd` com espaço e por `.ps1`) e um teste novo de PTY nativa (`pty-ps1-launch.integration.test.cjs`, no `test:native`). A guarda do `AttachConsole` virou fixture compartilhada (`electron/__fixtures__/conpty-console-list-agent-guard.cjs`).

### Validação no Windows limpo

Workflow manual `openia-windows-limpo.yml` + roteiro reutilizável `app/scripts/openia-windows-limpo.cjs`, que dirige o app INSTALADO por `felixo devtools launch --packaged`. Rodada final 37582901029 (instalador construído do commit `6cd0736`, opção `construir`): **8/8 etapas**. A "antes" é a rodada 37580814167 (v0.1.438).

- **NSIS real:** instala por usuário em `~\AppData\Local\Programs\Felixo AI Core` com o app fechado; atalhos na área de trabalho e no menu Iniciar apontam para o exe; a desinstalação silenciosa remove registro, atalhos e exe (0 arquivos sobram). O NSIS do electron-builder **não grava `InstallLocation`** — a pasta é a do desinstalador.
- **Aliases:** `openia.exe` do pip embrulhado por `openia.cmd` e por `openia.ps1` em `C:\Felixo Aliases\so cmd|so ps1`. Antes: `.cmd` detectado e `list --json` falhando; `.ps1` não detectado e "not recognized" no terminal. Depois: os dois detectados (`0.1.0`), `list --json` com 7 interfaces e `openia --version` no PTY do app (o `.ps1` pelo PowerShell 7).
- **Usuário real com espaço** ("Felixo Teste", criado no runner): instala o pacote e o Openia; a detecção do app (modo Node do próprio Electron) acha `~\AppData\Roaming\Python\Python314\Scripts\openia.exe` dentro do perfil com espaço; contrato com 7 interfaces.
- **Exportação do canvas:** chave salva pelo campo de senha da UI; 1 bloco de terminal Openia exportado pelo mesmo `canvas:export` do botão. Chave ausente da exportação, da tela, da saída do terminal e de 115 arquivos (perfil, logs, `llm`); o único lugar é o `keys.json` do próprio Openia, apagado no fim.
- **Cancelamento:** recusar o consentimento não instala nada; pip encerrado no meio → "py encerrou com codigo 1." e nada instalado; a repetição instala e detecta `0.1.0`.
- **Launcher legado (dependente de clone, instalado pelo `install-openia-cmd.cmd` do próprio Openia):** sem o clone, não é detectado (correto). **Com um clone recém-baixado, a detecção do app instala 7 pacotes** (typer, rich, pygments…) no Python do PATH — o `start_app.py` faz `pip install` antes de responder, e o `py` segue o shebang `#!/usr/bin/env python3` — e **mostra a versão "0.27.3-py3"**, que é a do typer, não a do Openia (6 s). A segunda chamada responde `0.1.0` em 350 ms. Task aberta.

### Outros achados e limitações

- O roteiro precisou de seis ajustes nas rodadas intermediárias (registro sem `InstallLocation`, painel fechado pelo Esc, pip errado no diff, `PSModulePath` do pwsh 7 quebrando o PowerShell 5.1, aviso do pip virando erro fatal no 5.1, `EBUSY` no clone); cada um está no commit correspondente.
- Os testes reais do `.ps1` falharam uma vez no CI: no runner a variável herdada chama-se `Path`, e `{ ...process.env, PATH }` ficava com duas grafias. Defeito do teste, não do produto (`createCliEnv` grava as duas com o mesmo valor).
- **Release bloqueada por fator externo:** o job "Dependency policy" passou a falhar com `npm audit --omit=dev` acusando 1 vulnerabilidade *high* numa dependência de produção (aviso publicado depois do CI verde de 05/10; o PR do Dependabot também falha). Sem CI verde o Release gate não publica, então a correção do alias ainda não está numa release — por isso a validação "depois" usou o instalador construído do commit. Task aberta.
- O chat real não rodou no runner: o seletor "Modelo Openia" não abriu (lista de modelos vazia ao carregar). Chat e agente reais já tinham sido validados em 21/09 nesta máquina; não é critério desta task.
- Validação de UI do Windows só no runner (Windows Server 2025); macOS segue na task própria.
- Gates locais: suíte Node 2481/2484 (a falha é EPERM de symlink em `app-relaunch.test.cjs`, igual sem esta mudança), `test:native` 6/6, lint e typecheck limpos. CI: todos os `Validate` (Linux x64/arm64, macOS, Windows) verdes; só o "Dependency policy" vermelho.

## 2026-10-07 — Instalador: a instalação silenciosa com o app aberto não trava mais em pasta 8.3

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Instalador — investigar instalador NSIS silencioso que não avança com o app aberto e deixa processo elevado" (Notion 3e291f95-497e-8105-8292-f38d63a3034c). Início às 09:30.

### Ponto de partida

Outra sessão, entre 04:28 e 05:03, deixou a branch `investigacao/nsis-app-aberto` com o roteiro de reprodução e três runs: A–F com runner elevado terminam; G (usuário sem admin) para no UAC; I (réplica de 21/09) fica preso. Continuei dali.

### Causa (linha do tempo do cenário I, run 37591182111)

- A instalação anterior é para todos, numa pasta 8.3. O desinstalador antigo procura o app com `Win32_Process.Path.StartsWith('C:\Users\RUNNER~1\...')`. O Windows devolve o caminho longo do processo, então o app não é visto e não é fechado.
- Com os arquivos em uso, o desinstalador sai com 2 cinco vezes. O instalador mostra "Failed to uninstall old application files. Please try running the installer again.: 2" num `MessageBox` sem `/SD` (`installUtil.nsh:129` do electron-builder 26.15.3). Em `/S` ninguém clica, e o processo elevado não pode ser morto pelo chamador sem elevação.

### Decisões do Felipe

- Com o app aberto, o `/S` fecha o app e instala.
- Cobertura por cenário no Release.
- O caso do usuário sem admin com instalação para todos (UAC) só é documentado.

### Correção

`app/installer/instalador.nsh` (`build.nsis.include`):

- `customCheckAppRunning` faz a checagem padrão com caminho longo, também nas pastas da instalação anterior (HKCU/HKLM).
- `customUnInstallCheck*` põe `/SD IDOK` no `MessageBox`; a falha vira exit 2.

Detalhes e armadilhas (`-WX`, `Var pid`, rótulos) estão em ARQUITETURA.md, seção "Instalador NSIS do Windows: ganchos próprios".

### Medido (windows-latest, chamador com token limitado)

| Cenário | Instalador v0.1.438 | Instalador corrigido |
| --- | --- | --- |
| I: para todos em 8.3, app aberto, `/S /D=` | preso 180 s, app aberto (run 37591182111) | exit 0 em 38 s, app fechado, 1.826 arquivos (run 37625032022) |
| L: para todos em 8.3, app aberto, `/S` | preso 180 s, app aberto (run 37624204763) | exit 0 em 43 s, app fechado, 1.826 arquivos (run 37625032022) |

Na linha do tempo do I corrigido, o instalador novo fecha os 5 processos pelo caminho longo do `InstallLocation` de HKLM (7,4 s) antes de chamar o desinstalador antigo.

A compilação local no Linux (`-c.win.signAndEditExecutable=false`) validou a passada do desinstalador com `-WX`. A do instalador só compila no Windows (precisa de wine aqui).

### Cobertura

- O `release.yml` (Windows) roda I e L com `-Verificar` depois do smoke do canvas no pacote.
- `release-relevant.sh` e `release-inputs.cjs` passam a contar `app/installer/*` e o `.ps1`.
- O workflow `reproduzir-nsis-app-aberto.yml` virou manual.

### Limitações

- O gate novo do Release ainda não rodou num Release de verdade, porque a main está vermelha no Dependency policy (`npm audit`), e o Release gate não publica. Há task própria para isso.
- O Windows real do Felipe não foi usado. A prova é em runner descartável, com `ConsentPromptBehaviorAdmin=0` (UAC sem caixa). No PC dele, com UAC padrão, o mesmo caminho passa pela caixa de consentimento.

## 2026-10-07 — Notion: aba Painel com um cartão por repositório no bloco Tarefas Notion

### Ponto de partida

Uma forma comum de ler as tarefas no Notion é uma página "Repositórios" em galeria. Nela há um cartão por repositório, com barra de progresso, tarefas abertas, stack e link do GitHub, ligada à database de tarefas por uma relação. O bloco Tarefas Notion só tinha a tabela, com visualizações que filtram estado e propriedade.

### Decisões do Felipe

- O placar sai da coluna de agrupamento das tarefas (`Repositório`). Os detalhes (link, linguagem, arquivado) vêm da database ligada (`Projeto` → `GITHUB`), quando o nome bate.
- O lugar é a aba **Painel** no próprio bloco, como primeira aba. O clique abre a tabela filtrada.
- Os cartões são montados no renderer; a segunda database é lida pelo IPC que já existia.

### O que mudou

- `services/notion-repo-board.ts` concentra as funções puras: preferências, colunas elegíveis, automático, cartões e filtro por grupo. `hooks/useNotionDetailsSource.ts` lê a database de detalhes, e `components/tools/NotionRepoBoard.tsx` desenha a grade e a configuração.
- No `NotionTasksPanel.tsx` entraram:
  - a aba Painel;
  - o chip do filtro temporário e "Voltar ao painel";
  - a busca, que no Painel filtra só na tela;
  - `tasksQuery`, que impede o placar de usar a lista filtrada de outra aba.
- Duas descobertas na database real mudaram o casamento de nomes:
  - Os títulos da database de repositórios vêm como `dono/repositório`, por isso nenhum nome batia direto.
  - Dois repositórios aparecem nas duas contas, um deles como fork.

  Por isso o casamento usa o trecho depois da barra ou o fim do link. No empate, vence a linha mais ligada pelas tarefas e depois a que não é fork.
- A database medida tinha 77 de 91 repositórios sem nenhuma tarefa. Mostrar todos encheria o painel, então eles ficam escondidos por padrão e aparecem por "Mostrar repositórios sem tarefas".

### Medido

- `notion-repo-board.test.ts`: 24 testes.
- Com os dados reais (1.756 tarefas, 91 repositórios), fora do app, saíram:
  - 34 cartões, 12 deles com link;
  - "Sem Repositório" com 284 tarefas;
  - Felixo-AI-Core com 57%, 183 abertas de 428.
- A primeira versão levava cerca de 130 ms por cálculo. Depois de indexar os nomes e usar um `Intl.Collator` só, a mediana caiu para cerca de 7 ms, com a máquina em load 18. A busca passou a filtrar fora do memo do placar.
- Tela renderizada com a ponte do Notion simulada (Electron em xvfb, fixture local, sem token):
  - Painel com 34 cartões, configuração aberta;
  - clique em Felixo-AI-Core → aba "Todas" com o chip "Repositório: Felixo-AI-Core" e 428 tarefas;
  - busca "estudo" → 5 cartões, sem nova chamada às tarefas;
  - agrupar por `Projeto` → 13 cartões com o título da página ligada e o seletor de detalhes travado;
  - ligação sem acesso → aviso "detalhes indisponíveis" com o placar mantido.
- Gates: lint, `npm run build`, vitest 2.977 testes passando (5 ignorados), suíte node 2.494 testes no Node 25 e no Node 22 sem falhas.

### Limitações

- A tela não foi aberta no app real com uma conexão Notion de verdade. A validação foi com a ponte simulada e dados reais exportados.
- A database de detalhes não entra na sincronização automática. Ela recarrega ao abrir o Painel e no botão Sincronizar.
- A pasta local do repositório ("Sem repositório local" na galeria de origem) ficou fora do escopo.

## 2026-10-08 — Openia: chave recusada pelo OpenRouter falha em segundos, com faixa no bloco

Registro de Claude - Tasks do AI Core, task "Openia/Felixo — falhar rápido com chave OpenRouter inválida em vez de ficar sem mensagem" (Notion 3e291f95-497e-8110-b07b-f7f7ccb41a46). Início às 05:10.

### Problema

Com uma chave do OpenRouter inválida, `openia run claudecode --provider` ficava 170 s sem mensagem nenhuma. O OpenRouter responde 401 em décimos de segundo, mas o Claude Code em `-p` silencia o 401. A barreira do Felixo só confere se a chave existe (`secretConfigured`), não se ela vale.

### Decisões do Felipe

- Validar no Openia, que vale também fora do Felixo, e o Felixo mostrar um aviso próprio quando o `run` sair com o código da recusa.
- Rede fora, timeout ou 5xx: avisar e lançar mesmo assim. Nunca virar "chave inválida".
- Saldo zerado: só avisar, porque os modelos `:free` funcionam sem saldo.

### Openia (Felipe-Alcantara/Openia)

- `60705d6`: o `run --provider` testa a chave em `/api/v1/credits` antes de instalar e lançar. O 401/403 sai com **código 3**, o mesmo do `openia image`, junto com a resposta curta do OpenRouter. O 403 também cobre "Key limit exceeded"; padrões `sk-or-…` são omitidos. Rede fora ou saldo zerado só avisam. A conexão derrubada no meio (`RemoteDisconnected`) deixou de escapar como exceção.
- `024167e`: versão **0.2.0**. Medido num venv limpo: com `d248538` instalado, `pip install --upgrade` do zip novo montava `openia==0.1.0`, achava a mesma versão e não reinstalava. O botão de atualizar do Felixo entregaria o código antigo sem avisar. Com 0.2.0: `Successfully installed openia-0.2.0`.

### Felixo

- `official-cli-catalog.cjs`: o pino do Openia (instalar e atualizar) sobe de `d248538` para `024167e`. O teste do catálogo exige que os dois sejam iguais. O roteiro `openia-windows-limpo.cjs` passa a ler o pino do catálogo, em vez de manter uma cópia própria.
- `pty-process-manager.cjs` (`isOpeniaKeyRefusal`): no Windows, o `openia run` que sai com código 3 não cai mais na recuperação de saída precoce (< 800 ms). Essa recuperação abriria o menu interativo do Openia, sem os argumentos, ou o shell de emergência, no lugar da recusa. É o mesmo tratamento da retomada recusada.
- `openia-key-refused-banner.ts` + `TerminalNode.tsx`: com o bloco do Openia encerrado em código 3, aparece a faixa **O OpenRouter recusou a chave**, apontando Agente → Openia → conta → Chave do OpenRouter. O guia do usuário explica a recusa, a rede fora e o saldo zerado.

### Medido

- OpenRouter com chave falsa: `/api/v1/credits` → 401 "User not found." em 0,36 s. Com a chave real deste PC (só em memória, nada impresso) → 200.
- Openia do commit novo, `OPENROUTER_API_KEY=<falsa> py -m openia run claudecode --provider --no-model --dir <pasta>`:
  - exit 3 em 536, 1387, 558 e 569 ms;
  - mensagem com "Resposta do OpenRouter: User not found.";
  - nenhum trecho da chave na saída (inteira e trechos de 8, 12 e 16 caracteres).
  - Três das quatro saídas ficaram abaixo dos 800 ms da saída precoce do Windows. Daí a mudança no PTY.
- Rede fora (`HTTPS_PROXY` numa porta fechada): aviso e segue em 2,08 s.
- Testes: Openia **121** (21 novos, todos vermelhos antes); Felixo PTY + catálogo **81/81**, faixa **6/6**; os testes novos do PTY e da faixa falharam antes da mudança. Suíte Node **2483/2486**: a única falha é o EPERM de symlink em `app-relaunch.test.cjs`, preexistente nesta máquina. Vitest **2980/2988**: as 5 falhas são os timeouts de 5 s em `terminal-reading.fixtures.test.ts` (codex-cancelamento), também preexistentes aqui. Typecheck e eslint limpos.

### Limitações

- O bloco com a faixa não foi aberto no app real com uma chave recusada. A faixa foi provada pela função pura, e a passagem do código 3 pelo PTY pelos testes do gerenciador.
- O pino novo só chega a quem instala ou atualiza o Openia pelo Felixo depois do próximo Release. Instalações antigas continuam na 0.1.0 até alguém clicar em atualizar.
- O disco E: deste PC está cheio (0 GB livres; o pytest nem gravava o cache). O trabalho foi feito num clone temporário. O clone local em `E:\Programação\Github\Openia`, que o launcher legado do PATH usa, ficou em `ed1e85c`, sem os commits novos.

### Validação no app, depois do push (08/10/2026, 05:45–05:55)

Um roteiro de uso único abriu o app pela fonte, com `felixo devtools launch`, perfil isolado e Openia 0.2.0 de um venv descartável na frente do PATH. Pela interface, ele salvou uma chave **falsa** no Login do sistema e clicou em "Abrir agente" com a interface `llm`. O Openia detectado foi o `0.2.0` do venv.

| Rodada | Fim do bloco | Retry ou shell de emergência | Faixa | Chave na tela/terminal |
| --- | --- | --- | --- | --- |
| 1 | código 3 em 9,0 s do clique | não | apareceu, mas dizia "a conta" num bloco sem conta | nenhum trecho |
| 2 (texto corrigido) | código 3 em 5,0 s do clique | não | "Agente → Openia → Login do sistema → Chave do OpenRouter" | nenhum trecho |

A primeira rodada mostrou o defeito de texto: sem conta, o bloco roda no **Login do sistema**, e a faixa mandava ir em "a conta". A correção veio com teste (vermelho antes). Com isso, a limitação "faixa não aberta no app real" acima fica coberta para o app da fonte; o pacote instalado só recebe a faixa no próximo Release.


## 2026-10-08 — Notion: Painel validado no app instalado com a conexão real; o % e a memória da database corrigidos

### Ponto de partida

A aba **Painel** (entrada de 2026-10-07) tinha sido vista só numa bancada com a ponte do Notion simulada. A task de validação pedia o app instalado com uma conexão de verdade, números conferidos contra o Notion, clique, configuração e "fechar e reabrir volta no Painel".

### Como foi validado

- **Binário instalado da v0.1.440** (`felixo devtools launch --packaged "/opt/Felixo AI Core/felixo-ai-core"`), perfil isolado, `env -i` com HOME e TMPDIR próprios, Xvfb `:87`, `flock`. Nenhuma CLI de IA no PATH.
- **Conexão real**: o token da integração "Automações do notion" (a mesma da CLI `notion-tasks`) entrou só por variável de ambiente, num script que chama `window.felixo.notion.saveConnection` pelo CDP. A saída do script é conferida contra o token, e o perfil (com o `notion-connection-secrets.bin`) foi apagado no fim.
- **Gabarito independente**: as linhas da database exportadas pela API (`notion-tasks linhas --completo`), contadas em Python por `Repositório` e `Etapa`.
- **Console**: `Runtime.enable` numa sessão CDP nova devolve as mensagens guardadas desde o carregamento; um `console.error` de sonda provou que o método enxerga mensagens antigas.

### Medido na v0.1.440

- 1.774 tarefas → **34 cartões, 34/34 iguais à API** no mesmo instante (total, abertas e %). Uma diferença intermediária no SpicyGame era uma task concluída às 05:49 por outra sessão, entre a leitura do app e a exportação; o botão de sincronizar trouxe o cartão para 55% · 10 abertas.
- Felixo-AI-Core com link do GitHub e etiqueta JavaScript (database GITHUB pela ligação `Projeto`).
- Clique no cartão → aba Todas, filtro "Repositório: Felixo-AI-Core", 433 tarefas (= total do cartão); **Voltar ao painel** → 34 cartões; **×** → 1.774.
- Agrupar por Projeto → 13 cartões, seletor de detalhes travado; "Mostrar repositórios sem tarefas" → 107 cartões = 34 + **73 vazios**, igual à conta pela API (91 linhas da GITHUB, 12 casadas, sem arquivados e forks).
- Console do renderer: **0 erros e 0 avisos** do boot até o fim (fora as 2 sondas).

### Os dois defeitos encontrados

1. **Percentual no meio.** Agrupando por Projeto, Felixo-AI-Core mostrava 57% com 253 feitas de 440 (57,5% exato), enquanto 1/8 (12,5%) virava 13%. `Math.round((253 / 440) * 100)` é 57 porque a divisão primeiro dá 57,4999…; `253 * 100 / 440` dá 57,5 exato. Defeito do commit `95870840`.
2. **O bloco esquecia a database.** Fechando o app na "Tarefas — HOME (pessoal)" com o Painel aberto, ele reabriu em "Ideias criativas" (a primeira da lista) na aba Todas. A conexão e a database viviam só em `useState('')` desde o commit `58be0fc7` (08/09); o Painel, que lembra a aba por conexão + database, nunca tinha onde reabrir. O Felipe decidiu corrigir nesta task.

### O que mudou

- `progressPercent` (`services/notion-repo-board.ts`): multiplica antes de dividir; 100% só com tudo feito e 0% só com nada feito, para o cartão não dizer "100% · 1 aberta".
- `services/notion-tasks-selection.ts`: `keepIfListed`, `readNotionTasksSelection`, `selectionPatch`. A escolha vai para o `data` do bloco (`notionConnectionId`, `notionDataSourceId`) pelo `onDataChange` que o `CanvasView` já injetava; conexão removida ou database que sumiu volta para a primeira.
- `openingViewId`: a aba inicial do bloco segue a mesma regra da troca de database. Sem isso, a escolha já gravada na montagem nunca disparava a troca, e o Painel continuava sem reabrir — achado na primeira rodada de "fechar e reabrir" depois da correção.
- Inventário do canvas: a persistência do bloco e os dois seletores descrevem a escolha gravada no bloco.

### Medido depois da correção

O código do worktree rodou num Electron 41.10.7 com o nome de app "Felixo AI Core" (pasta de preparo com o `package.json` do worktree mais `productName`), para usar a mesma chave do chaveiro do app instalado sem pedir permissão na tela. Perfil isolado, mesma conexão real.

- Escolhida a "Tarefas — HOME (pessoal)" e aberto o Painel, o `data` do bloco no canvas ficou com `notionConnectionId` e `notionDataSourceId: f65396de…`.
- `app.quit()` e reabertura com o mesmo perfil: o bloco voltou na HOME **direto no Painel** (32 cartões, 1.789 tarefas, do cache e revalidando).
- **32/32 cartões iguais à API** com a regra nova; console sem erro nem aviso.

### Testes

- Unitários: `notion-repo-board.test.ts` foi de 24 para 30 (`progressPercent` e `openingViewId`; o do cartão com 253/440 e os de `openingViewId` falharam antes da mudança) e `notion-tasks-selection.test.ts` tem 8.
- Bateria no worktree em `cc0b7939`: lint limpo; build (`tsc -b` + Vite) ok; vitest **2997 passaram, 5 pulados**; suíte Node **2496 testes, 2493 passaram, 3 pulados, 0 falhas** no Node 25.9.0 e no 22.22.3.

### Achado paralelo

Os cofres do token (`notion-connection-store.cjs` e `cli-account-store.cjs`) comparam `getSelectedStorageBackend()` com `'basic'`, mas o Electron 41 devolve `basic_text`. Medido com um app mínimo sem D-Bus: `{"backend":"basic_text","available":false}`. O token continua protegido, porque `isEncryptionAvailable()` já recusa; só a mensagem específica ("chaveiro indisponível, desbloqueie") nunca aparece. Task aberta.

### Limitações

- Windows e macOS não foram abertos (decisão do Felipe: task para depois).
- O app de uso diário do Felipe (v0.1.440, com a 0.1.441 pronta para instalar) não tem bloco Tarefas Notion no canvas; não foi criado um ali para não mexer no canvas durante o trabalho dele. A conexão real dele pode ser outra integração, com outro acesso à GITHUB.
- A database "Repositórios" do André não aparece para nenhuma das integrações daqui (`home-pessoal` e `vitis`); task aberta para ele conferir.
- A correção rodou do código-fonte com o Electron do projeto, não de um pacote gerado pelo electron-builder; o pacote só sai no Release.

## 2026-10-08 — Notion: seletor de repositório na tabela e concluídas escondidas por padrão

### Pedido

Pedido no canvas: no bloco Tarefas Notion, uma opção para escolher de qual repositório aparecem as tarefas e não ver as concluídas. Até aqui o recorte por repositório só existia como chip temporário depois de clicar num cartão do Painel, e as abas fixas eram Todas/Abertas/Concluídas.

### O que mudou

- `services/notion-task-scope.ts` (novo, puro): `readTaskScope`/`saveTaskScope` em `felixo:notion-task-scope:<conexão>:<database>` com `{ repo, showCompleted }`; `visibleBuiltInViews` (com as concluídas escondidas sobra só **Abertas**), `defaultTableView`, `effectiveRepoFilter` (o repositório gravado só vale com o Painel agrupando pela mesma coluna), `hideCompletedTasks` e `repoChoices` (opções do seletor a partir de `buildRepoCards`, com a contagem que a tabela vai mostrar).
- `NotionTasksPanel.tsx`: seletor **Todos os repositórios** à direita das abas (some no Painel), botão com o olho ao lado da sincronização, aba ativa destacada pela visualização efetiva e clique no cartão do Painel gravando o mesmo recorte. O chip "<coluna>: <valor>" e o **Voltar ao painel** saíram: o seletor mostra e desfaz o recorte. Mostrar as concluídas a partir de **Abertas** vai para **Todas**, senão o clique não mudaria nada na tela.
- O Painel continua contando abertas e concluídas: o filtro das concluídas vale só para a tabela.
- O `FelixoSelect` fixa `width: 100%` fora das camadas do Tailwind, então a largura do seletor vem de um contêiner (`w-52`), não do `className`.

### Como foi validado

- Bancada temporária (apagada antes do commit): o `NotionTasksPanel` real numa página do Vite, com a ponte do Notion simulada e as 164 linhas reais do "To do list!" exportadas pela API e normalizadas pelo `normalizePage` do próprio `notion-client.cjs`.
- No bloco de 680 px: o seletor listou social-api-manager 48, Contas.exe 9, vip-fit 7… (iguais às abertas no Notion); escolher Contas.exe deixou 9 linhas; a escolha voltou depois de recarregar; o olho mostrou as 22 do Contas.exe (9 + 13 concluídas) e as abas Todas/Concluídas; o cartão vip-fit abriu a tabela com 7 e o seletor em vip-fit; concluir uma tarefa a tirou da lista (6). Em 420 px o seletor desce para a linha de baixo, alinhado à direita. Console sem erro.

### Testes

- `notion-task-scope.test.ts`: 12 casos (padrão, gravação por conexão + database, campo inválido, barra com as concluídas escondidas, contagem do seletor, repositório gravado sem tarefas, coluna sem "reposit", filtro aplicado).
- Bateria no worktree, no Windows 11 com Node 24.15.0: lint limpo; build (`tsc -b` + Vite) ok; vitest **3.011 passaram, 3 pulados** e 1 falha intermitente em `context-file-delivery.shell.test.ts` (o PowerShell estourou o tempo com a máquina carregada; o arquivo sozinho passa no commit base e nesta branch); suíte Node **2.493 testes, 2.483 passaram, 6 pulados, 4 falhas**, todas em `agent-session-discovery.test.cjs` e iguais no commit base `f329c33`: a sessão roda com `CLAUDE_CONFIG_DIR` apontando para outro perfil, e o teste procura as sessões do Claude no lugar padrão.

### Limitações

- Não rodou no Electron nem com a conexão real: a bancada simula a ponte. A lógica nova é toda no renderer, sobre as tarefas que a ponte já entrega.
- Windows apenas (a máquina da sessão).

## 2026-10-08 — System Design: lista de guias por camada e guias por projeto

### Ponto de partida

A fonte do System Design era uma só por instalação (commit `f3fcfc3`, 21/09): a precedência entregue foi "escolha do usuário > padrão do app", e a camada por projeto ficou de fora porque não existia configuração por projeto. Times que padronizam o guia por repositório (um guia por cliente, o Doktor do André) não tinham como.

### Decisões do Felipe

- Os três mecanismos de projeto, à escolha de quem usa: arquivo versionado no repositório, escolha no app e pasta de guias. Dá para usar dois padrões ao mesmo tempo.
- Cada camada é uma **lista de guias**; a lista do projeto **substitui** a do usuário naquele projeto, com aviso.
- Alcance completo: agentes, orquestrador e painel (um cache e um índice por fonte).

### O que mudou

- `core/system-design-source.cjs` (v3): a configuração só guarda escolhas (`customSources`, até 5); o estado de sincronização vai para um store por fonte (`system-design.sync`). Migração v1/v2 → v3 idempotente, sem reset.
- `core/system-design-project.cjs`: arquivo `.felixo/system-design.json` (até 5 guias, 16 KB, URL validada como a do usuário), confirmação pelo hash da lista normalizada, pastas `Padrão de qualidade - <nome>/` e escolha no app; `resolveEffectiveGuides` aplica a precedência e diz o que foi substituído.
- `services/system-design-project-service.cjs`: raiz do projeto subindo até o `.git` dentro do autorizado (mesma régua dos IPCs de projetos), sem seguir link simbólico; documento de pasta local não sai dela (caminho real).
- Migração SQL `018`: índice por fonte; os documentos da tabela antiga migram para a fonte que os entregou. Cache por fonte em `config/system-design/sources/<hash>/repo`.
- IPC novos `system-design:resolve-project` e `system-design:save-project`; `sync` com `{ projectRoot }` só clona guias que já valem — arquivo pendente nunca chega ao `git clone`.
- Renderer: `useProjectGuides`; lembrete por `cwd` no canvas (criar terminal espera a camada do projeto; o render monta o texto só de estado); modelo de lista no lembrete, com o texto histórico idêntico byte a byte quando só vale o padrão do app; bloco do orquestrador por guia e por projeto ativo; seção "Seus guias" + "Por projeto" nas Configurações (canvas e chat).

### Medido

- Testes novos: contrato v3 (39), camada de projeto (21), handlers com SQLite real (22, incluindo "nenhum clone antes da confirmação", link simbólico, `../`, pasta fora dos projetos), lembrete de lista (7), apresentação (6), bloco do orquestrador (4). Mutação: incluir arquivo pendente na camada, tirar a contenção do documento local e autorizar qualquer pasta derrubam testes (2, 1 e 2 falhas).
- App (código do worktree, Electron 41.10.7, perfil isolado, três projetos registrados, CLI falsa que só faz `cat`): `cliente-a` com o arquivo pendente → lembrete original do Felixo e nada clonado; depois de **Usar estes guias** → Doktor clonado (75 documentos, `7fc7f5e`) e o agente novo cita "System Design (Doktor-SystemDesign): https://github.com/AndreGustavoms/Doktor-SystemDesign (branch: main)" com "Estes guias são do projeto e valem aqui no lugar dos guias gerais do app (Felixo System Design)". `cliente-b` (pasta) → cita a pasta; a chave desliga e volta à lista do usuário. `cliente-c` → guia escolhido no app vale só ali. Dois guias na lista do usuário → os dois no lembrete. Escolhas sobrevivem a três reinícios. Console do renderer: 0 erros e 0 avisos (com sonda provando o método).
- Achados no app e corrigidos (`fix(system-design)`): dois syncs da mesma fonte ao mesmo tempo (o da tela e o do canvas) clonavam na mesma pasta e o segundo falhava com código 128 — agora compartilham a execução (teste vermelho antes); o Felixo virava "System Design (Felixo-System-Design)" ao entrar numa lista; textos e espaços da seção.
- Bateria sobre a branch rebaseada em `0e16817a`: lint limpo; build (`tsc -b` + Vite) ok; vitest **3028 passaram, 5 pulados**; suíte Node **2532 testes, 2529 passaram, 3 pulados, 0 falhas** no Node 25.9.0 e no 22.22.3.

### Limitações

- O pacote gerado pelo electron-builder não foi aberto; a validação rodou do código-fonte com o Electron do projeto.
- Windows e macOS não foram abertos (o caminho do repositório e o link simbólico têm testes; o chaveiro não entra nesta feature).
- O orquestrador do chat foi validado pelo teste do bloco, não com uma conversa real.
- Ao trocar o padrão do app, o conteúdo do padrão antigo segue no cache dele, e o novo aparece como ainda não sincronizado até a próxima sincronização (antes, a fonte única mostrava o conteúdo antigo como entregue).
- Guia privado no Windows pode abrir o Git Credential Manager (task irmã já aberta).

## 2026-10-09 — Git: repositório alinhado à política de versionamento do Felixo System Design

### Contexto

Pedido do Felipe: colocar o repositório no padrão de git e versionamento do Felixo System Design (`docs/GIT-POLITICA-DE-VERSIONAMENTO.md`, `cc4aae7`) e alinhar o GitHub. O lado local já estava em ordem desde a limpeza de 26/09 (só a `main`, em dia com o remoto, sem worktree sobrando).

### Decisões do Felipe

- Apagar as branches remotas já mescladas (`feat/notion-tarefas-escolher-repositorio`, PR #108, e `fix/menus-fecham-ao-clicar-fora`, PR #106).
- Aplicar a correção de segurança do PR #104 direto na `main` e fechar o PR.
- Apagar as 43 pré-releases que nunca foram promovidas, com a tag.
- Ligar no GitHub: apagar a branch ao mesclar o PR, tirar o merge commit dos PRs e usar `chore(deps)` no Dependabot.

### O que mudou

- `GUIA-DESENVOLVEDOR.md`: commit direto na `main` por padrão; branch (`feat/`, `fix/`, `refactor/`, `docs/`) só para feature grande, refatoração significativa ou alto risco, apagada ao mesclar; PR mesclado só por squash ou rebase; `git pull --rebase`; tipos `perf`, `ci` e `build` na tabela. Antes ele mandava abrir branch e PR para toda mudança.
- `POLITICA-VERSIONAMENTO.md`: o mesmo fluxo; pré-release esquecida é publicação que falhou e se apaga com a tag; o `Release gate` olha só o último commit do push.
- Launcher: o padrão do "Atualizar" e do `--update` passa de `production` (que não existe mais no remoto e fazia a atualização falhar) para `main`, num lugar só (`DEFAULT_UPDATE_BRANCH`); `FELIXO_PRODUCTION_BRANCH` vazia não vira branch vazia. Valor salvo no Configurar continua valendo.
- `.github/dependabot.yml`: prefixo `chore` (npm e pip), para os commits do bot saírem como `chore(deps): …` em vez de `deps(deps): …`.
- `app/package-lock.json`: `http-cache-semantics` 4.3.0 (GHSA-ch52-4w7c-c8xp), diff idêntico ao do PR #104.
- GitHub: `delete_branch_on_merge` ligado e `allow_merge_commit` desligado (squash e rebase continuam). As branches remotas mescladas e a do Dependabot saíram, com bundle de backup; as 43 pré-releases saíram, com nome, commit, notas e lista de arquivos guardados fora do repositório.

### Medido

- Antes: 3 branches remotas além da `main` (2 já mescladas por squash — o diff de cada uma é idêntico ao commit de merge na `main` — e 1 do Dependabot), 1 PR aberto, 43 pré-releases (16 sem nenhum arquivo), 24 de 400 commits recentes da `main` fora de `tipo(escopo): descrição` (quase todos "Merge …" de merge commit ou de pull sem rebase).
- Depois: só `main` no remoto, 0 PR aberto, 0 pré-release, 295 releases normais; a `Latest` continua `v0.1.445`.
- Launcher: teste novo (`tests/test_update_branch.py`, 6 casos) reprovou antes da correção (`'production' != 'main'` e `'' != 'main'`) e passa depois; suíte do launcher (104) verde no Python 3.9, 3.12 e 3.13; `ruff` limpo.
- App com o lockfile novo: lint limpo, build ok, vitest 3028 passaram e 5 pulados, suíte Node 2532 testes (2529 passaram, 3 pulados, 0 falhas) no Node 25 e no 22.

### Limitações

- O histórico antigo continua com os commits "Merge …" e "deps(deps)": não se reescreve a `main`.
- A cópia de `http-cache-semantics` embutida no pacote `npm` 11.19.1 continua na 4.2.0 até sair um npm novo com a correção.
- Existem duas releases com a mesma tag `v0.1.8` (de 09/08/2026); ficou para uma task.

## 2026-10-09 — System Design: migração v2 → v3 conferida numa instalação real

### Contexto

A migração da configuração do System Design (v1/v2 → v3, com documentos por fonte na migração SQL `018`) só tinha sido provada com configurações sintéticas. A instalação de uso diário do Felipe (pacote `.deb`, aberta pelo autostart) foi de 0.1.443 para 0.1.445 em 09/10/2026 às 12:03:35 (`dpkg.log`), e a 0.1.445 é a primeira com a v3 — a migração rodou sozinha na primeira abertura.

### Como foi conferido

Sem abrir, fechar ou escrever no app: cópia dos bancos com a API de backup do SQLite a partir de conexões `mode=ro`, lidas fora do perfil. O "antes" é o retrato `felixo.antes-monolito-20261008-093432.sqlite` (08/10, 09:34, ainda na 0.1.440, migração SQL 17); o "depois" é o banco vivo às 13:35.

### Medido

- Antes: `system-design.config` = `schemaVersion 2`, `enabled: true`, `sourceMode: default`, entregue `Felixo-System-Design.git#main` no `cc4aae7`, sincronizado em 2026-09-27T05:05:36Z; 32 documentos em `system_design_documents`.
- Depois: migração SQL 18; `system-design.config` = `{"schemaVersion":3,"enabled":true,"sourceMode":"default","customSources":[]}` gravada uma única vez, em 2026-10-09T15:04:14Z (primeira abertura da 0.1.445); `system-design.sync` com a fonte `…/Felixo-System-Design#main` no mesmo `cc4aae7`; `system_design_documents` vazia e 32 documentos em `system_design_source_documents` na chave da fonte; o clone antigo `config/system-design/repo` removido e o novo em `sources/4b15ed3220559c4b/repo` (= `sha256("…/Felixo-System-Design#main")[:16]`) no `cc4aae7`.
- A sincronização da sessão (13:31:17, log de QA) releu a configuração sem regravá-la (`updated_at` continuou 15:04:14Z) e registrou "Sincronizado 32 doc(s) (sha=cc4aae7, removidos=0)".
- Resultado: sem reset silencioso — mesma fonte, ligada, no modo padrão, com o mesmo commit e os mesmos 32 documentos.

### Limitações

- O retrato "antes" é de 08/10 09:34; entre ele e a atualização a 0.1.443 rodou e pode ter sincronizado de novo (o commit de origem era o mesmo).
- O app não foi reaberto depois da migração (é onde esta sessão roda); a idempotência ficou provada entre leituras da mesma sessão, não entre aberturas.
- Uma instalação com fonte escolhida à mão (`sourceMode: custom`, como a do André se apontar para o Doktor) não foi conferida.

## 2026-10-09 — System Design: guia privado só pede login no clique

### Contexto

Task "permitir escolher a fonte (URL e branch) pela interface": o formulário já tinha saído em 08/10; faltava tratar o guia privado. O `git` rodava sem nenhum controle de interação: no Windows, a janela do Git Credential Manager podia abrir numa sincronização automática (ao abrir o app), inclusive por um endereço digitado errado (o GitHub pede login para repositório que não existe); num `npm run dev`, o Git perguntava "Username for …" no terminal de quem rodou.

### Decisões do Felipe

- A janela de login só abre quando a pessoa clica (Sincronizar, adicionar/tirar guia, voltar ao padrão, ligar, "Usar estes guias"); a sincronização automática nunca pede e falha na hora.
- Falha da automática por login: aviso na tela.
- Validação do Windows só pela CI (teste automático nos três sistemas).

### O que mudou

- `electron/core/git-failure.cjs` (novo): `gitEnvironment` (sempre `GIT_TERMINAL_PROMPT=0`; sem clique, `GCM_INTERACTIVE=never` e `SSH_ASKPASS_REQUIRE=never`), prazos 60 s / 180 s, `classifyGitFailure` (lê o erro cru antes da redação) e `describeGitFailure`.
- `system-design-service.cjs`: `interactive`, ambiente e prazo em todo `git`; o erro redigido leva `reason`; `fetch` que falha por login, repositório sumido, rede ou prazo mantém o clone em cache.
- `system-design-ipc-handlers.cjs`: `system-design:sync` aceita `{ interactive }`; a mensagem de falha começa pela frase para a pessoa; cada guia volta com `reason` e `label`; a deduplicação por fonte "sobe de nível" quando um clique chega durante uma automática que falhou por login.
- Renderer: `system-design-sync.ts` (`runAutomaticSync`) para as duas automáticas; `SystemDesignLoginNotice` no `App` (NoticeToast com a opção nova `placement="left"`, para não cobrir os avisos do centro e da direita); os cliques passam `interactive: true`; inventário do canvas com o aviso.

### Medido

- Testes que reprovaram antes da mudança: 5 do serviço (ambiente, prazo, motivo, cache mantido, git real) e 3 dos handlers; 2 mutações no `runAutomaticSync` (pedir com login, esquecer o "uma vez por sessão") derrubam 1 teste cada.
- Git real num terminal falso (`script`) contra um servidor local que responde 401: sem `GIT_TERMINAL_PROMPT=0` o Git pergunta "Username for 'http://127.0.0.1:…'"; com ela, "terminal prompts disabled". O teste de integração faz o mesmo sem terminal e roda na CI dos três sistemas (no Windows, com o Git Credential Manager do runner).
- App isolado (código do worktree, `dist`, Xvfb, servidor local que exige senha): clicar em Adicionar guia → 1 pedido e "O login não foi concluído…" na seção, sem aviso flutuante; sessão nova → 1 pedido, aviso "Um guia do System Design pede login" no canto esquerdo, ao lado do aviso do Modo Performance sem cobri-lo; "Fazer login e sincronizar" → 1 pedido, aviso some; console sem erros.
- Bateria: lint e build ok; vitest 3035 passaram (5 pulados); suíte Node 2557 testes (2554 passaram, 3 pulados) no Node 25 e no 22 — no 22, `process-tree.test.cjs:198` falhou uma vez sob carga e passou em 3 de 3 rodadas isoladas (task aberta).

### Limitações

- A janela real de login do Windows com um guia privado de verdade não foi vista (decisão: só a CI).
- Achado do teste no app: sem locale UTF-8 (`env -i` sem `LANG`), o Electron não carrega o preload de um caminho com acentos e a interface mostra "Indisponível fora do app desktop" sem nenhum erro no console; com `LANG=C.UTF-8` funciona.

## 2026-10-09 — Openia: geração de imagem de verdade pela tela, falta de créditos e Openia antigo

### Contexto

Task "Openia — tela no canvas para pedir e acompanhar geração de imagem". O popover "Gerar imagem" já existia (PR #94), mas nenhuma imagem tinha sido gerada de verdade. Ao tentar: o Openia instalado era a 0.1.0, sem `openia image` (o app mostrava "O Openia não conseguiu gerar a imagem."); o `.env` do Audiofy tinha `OPENROUTER_API_KEY` vazia; e a conta da chave do shell tinha US$ 0,77, abaixo do mínimo de US$ 1,00 que o OpenRouter exige para imagem.

### Decisões do Felipe

- Usar a chave à vontade nos testes; a chave usada foi a ativa do keystore do Audiofy ("Validacao voz estavel", conta com US$ 3,49), só no ambiente, nunca impressa.
- Um Openia só: atualizar o instalado (não uma segunda instalação) e, se faltar algo, mudar o repositório do Openia e usar no AI Core.
- O app avisar quando o Openia é antigo; cadastrar a chave no Openia para a produção funcionar.

### O que mudou

- Openia `6f75f8f` (0.2.1): 402 com o texto do saldo mínimo para imagem vira `minimum_balance`. `a832a14` corrige o registro: pelo endpoint de imagens, o mesmo saldo baixo chega como "Insufficient credits" (`account_limit`).
- `official-cli-catalog.cjs`: pino do Openia (instalar e atualizar) de `024167e` para `6f75f8f`.
- `openia-image-service.cjs`: `account_limit` e `minimum_balance` viram `insufficient_credits` (mensagem com o saldo mínimo para imagem), vencendo o código de saída 5 genérico; código 2 sem envelope + `openia --version` abaixo de 0.2.0 vira `openia_outdated` (a versão só é consultada nesse caso).
- `GenerateImageButton.tsx` + `openia-update.ts`: com `openia_outdated`, o popover oferece "Atualizar o Openia" → aviso de que executa código do GitHub do Openia → "Confirmar atualização" (`cli:install-official`, o mesmo caminho do catálogo, com a repetição do PEP 668) → "Openia atualizado. Clique em Gerar de novo." (o erro antigo é esquecido).
- Inventário do canvas: 3 controles novos; a lacuna do teste de interface aponta para a task nova do smoke.

### Medido

- Openia do Felipe atualizado pela função do app (`installOfficialCli('openia', { confirmed: true })`): 0.1.0 → 0.2.0 em 30 s e 0.2.0 → 0.2.1 em 25 s, as duas com `retriedWithBreakSystemPackages: true`.
- CLI com chave só no ambiente: `google/gemini-3.1-flash-lite-image` gerou JPEG 1408×768 (42 KB) em 6 s; com só a chave cadastrada no Openia, JPEG de 95 KB em 6 s.
- Janela real (código do worktree sobre o `dist`, perfil isolado, Openia real): Gerar → "Imagem adicionada ao canvas." em 11,6 s, blocos 0 → 1; Cancelar no meio → "A geração de imagem foi cancelada.", blocos 1 → 1 oito segundos depois; conta de US$ 0,77 → a mensagem de falta de créditos; `openia` falso igual à 0.1.0 no PATH → mensagem de Openia antigo → Atualizar → Confirmar → "Openia atualizado"; console sem erros nos quatro.
- Testes: serviço 33/33 (os de créditos e de Openia antigo reprovaram antes), catálogo, `openia-update.test.ts` 5/5, inventário 9/9; lint e build ok; vitest 3040 passaram (5 pulados); suíte Node 2561 testes (2558 passaram, 3 pulados) no Node 25 e no 22.

### Limitações

- Só Linux foi visto rodando; macOS e Windows não.
- O popover não tem teste de interface na CI (task aberta para a sessão de smoke).
- A geração de imagem não usa a chave por conta do Felixo, só a do Openia (nota na task de unificar a chave).
- O Openia guarda a chave dentro da pasta do pacote; sobreviver a uma troca de versão de verdade não foi medido (task aberta no Openia).

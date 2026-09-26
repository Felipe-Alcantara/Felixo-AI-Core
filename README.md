# Felixo AI Core

Felixo AI Core é o núcleo inteligente do ecossistema FelixoVerse: uma aplicação desktop, orientada a canvas, para controlar, organizar e orquestrar múltiplas IAs, agentes, terminais, repositórios e fluxos de trabalho.

> **Pare de trocar de IA. Comece a orquestrar.**

---

## O que é

Uma aplicação desktop que transforma as CLIs de IA que você já usa no terminal — Claude, Codex, Gemini e outros — em blocos de trabalho conectados num canvas visual.

O canvas é a superfície principal e recomendada do produto. O modo de chat foi
depreciado: continua acessível apenas como caminho legado para consultar,
exportar ou excluir sessões antigas, mas novas funcionalidades e fluxos devem
ser criados no canvas.

O objetivo de longo prazo é evoluir para um sistema capaz de escolher modelos, coordenar agentes, manter memória persistente e executar pipelines inteligentes com base em custo, contexto e objetivo da tarefa.

## Arquitetura atual

O projeto agora segue uma arquitetura híbrida:

- **Terminal Adapters** controlam CLIs autenticadas por assinatura.
- **Orchestrator Core** decide modo de execução, continuidade e contexto.
- **MCP Layer** padroniza ferramentas, Git, memória, prompts, skills e contexto.

MCP não substitui as CLIs nem vira uma API universal de modelos. No Felixo AI Core, MCP é a camada de ferramentas; os modelos continuam entrando por adapters de terminal, APIs futuras ou modelos locais.

Veja a [visão da arquitetura atual](./docs/projeto/ARQUITETURA.md). A antiga
[especificação do orquestrador híbrido com MCP](./docs/_legado/arquitetura/ORQUESTRADOR-HIBRIDO-MCP.md)
fica preservada apenas como referência histórica.

---

## Status atual

Base funcional entregue:

- Canvas visual como superfície principal, com agentes, arquivos, notas, grupos e páginas web
- Modo de chat legado, mantido somente para compatibilidade com sessões e exportações antigas; uma conversa pode ser excluída pela lixeira que aparece ao passar o mouse (ou chegar com Tab) na linha dela em **Recentes** ou no painel **Pesquisar**, depois de confirmar. A conversa é arquivada no banco local, sai da lista e, se estava aberta, a tela volta para um chat novo. Ainda não há como restaurá-la pela interface.
- Logs da CLI do chat com janela visual limitada, batching por frame e exportação de análise a partir do histórico completo da execução
- Backend Electron executando CLIs reais em streaming
- Adapters para `claude`, `codex` e `gemini`
- Launcher Openia para as interfaces compatíveis com OpenRouter, sem duplicar seu catálogo de modelos
- Perfis padrão para CLIs instaladas no sistema, sem depender dos scripts locais em `ai-clis/`
- Registry de Terminal Adapters
- Orchestrator Core inicial para decidir processo persistente, retomada nativa ou one-shot
- Catálogo inicial de ferramentas MCP do Felixo
- Empacotamento Electron Builder e base de auto-update via GitHub Releases
- Append incremental de resposta com cursor de streaming
- Botão de parar para interromper processo em andamento
- Canvas visual para organizar agentes, arquivos compartilhados, notas, grupos e páginas web (mini-navegador embutido)
- Launcher **Agente** com reutilização das últimas configurações e arquivo de planejamento opcional
- **Conta por terminal**: cada conta tem login próprio, então duas contas da mesma CLI convivem sem logout e o terminal escolhe em qual nasce
- Entrega de contexto inicial por artefatos somente leitura, com trilha persistida `written → path-typed → read` em `logs/qa` para diagnosticar reinícios e trocas de terminal/agente
- Painel **Limites e uso** no canvas, com consumo por janela, conta, plano e horário de reset de cada CLI; no Codex, também mostra a quantidade, validade e detalhes dos resets bancados por conta, com uso protegido por confirmação
- Bloco **Tarefas Notion** no canvas (**Ferramentas → Tarefas Notion** cria o bloco ou foca o que já existe), com conexão própria cifrada, seleção de database compartilhada, cache offline e CRUD de tarefas
- Preview de Markdown com sanitização de HTML/URLs externos, remoção de ANSI, limite de 200.000 caracteres e imagens remotas bloqueadas por padrão; GFM e imagens locais seguem a autorização do arquivo
- Sincronização do Felixo System Design com diagnóstico Git redigido antes de chegar ao SQLite, QA Logger ou renderer
- Superfícies do canvas que dividem o espaço entre si: painel, gaveta do terminal, Mini Map e dock encolhem uns pelos outros em vez de se cobrirem
- Escolha da **placa de vídeo** (Automático, Integrada ou Dedicada experimental) como opção avançada, com volta automática para Automático se a GPU falhar, e sugestão do **Modo Performance** em máquina com até 4 CPUs lógicas
- Frontend organizado por feature em `app/src/features/`, com o que é comum às telas em `features/shared/`
- Processo Electron modularizado em `core/`, `services/` e `windows/`
- Testes unitários para adapters, orquestrador, catálogo MCP e leitura JSONL

### Sincronização segura do Felixo System Design

O guia obrigatório é sincronizado pelo processo principal com `git`, usando
`execFile` sem shell. Repositórios privados continuam funcionando com o
credential helper do Git, Keychain do macOS, Credential Manager do Windows ou
outro mecanismo seguro configurado no sistema; não coloque usuário, senha ou
token na URL do repositório. Se uma URL antiga contiver credenciais, o app as
remove antes de persistir a configuração ou iniciar o Git.

Falhas de clone/fetch/reset mostram somente a etapa, o código, o branch e o
destino sem userinfo. Tokens, parâmetros sensíveis, cabeçalhos de autorização,
stderr cru e a linha de comando completa são redigidos antes de `lastError`, do
QA Logger e da resposta ao renderer.

A fonte (URL e branch) tem um contrato único em `electron/core/system-design-source.cjs`:
só a escolha explícita é gravada, o padrão do app é resolvido na leitura, e a UI e os
prompts dizem a fonte **entregue** (a do conteúdo em cache), que pode diferir da
configurada até a próxima sincronização. Uma fonte escolhida nunca é trocada por um
novo padrão do app; configurações antigas são migradas sem reset.

Os agentes procuram uma cópia local dos guias em
`Padrão de qualidade - Felixo System Design/`. Essa pasta é opcional e fica fora do
versionamento; quando não existe, o prompt aponta para a URL e a branch da fonte
configurada.

Para voltar de uma fonte escolhida à fonte padrão do app, abra **Configurações →
System Design** e use **Voltar ao padrão do app**; a tela troca a configuração e
inicia a sincronização. Se uma sincronização falhar, a tela e o prompt informam qual
fonte ficou entregue e mantêm o último conteúdo sincronizado. A interface não guarda
histórico nem permite selecionar um SHA anterior.

Os guias também podem ser lidos dentro do app. Em **Configurações → Felixo System
Design → Ver índice**, clicar num guia (ou usar Enter/Espaço) o abre renderizado logo
abaixo do item, numa moldura com rolagem própria. Fica um guia aberto por vez, e clicar
de novo o fecha. O conteúdo vem do cache da última sincronização, então a leitura
funciona sem rede. Pelo teclado, Tab entra no texto e as setas ou PageDown rolam. A
mesma seção aparece nas Configurações do canvas e no modal de Configurações do chat.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron 41 |
| Frontend | React 19 + TypeScript 7 + Vite 8 |
| Estilos | Tailwind CSS 4 (plugin `@tailwindcss/vite`) |
| Ícones | lucide-react |
| Tooling | ESLint 10 + typescript-eslint (sobre a API do TypeScript 6), Node 25.9.0 via `.nvmrc` |
| Testes | `node:test` nativo + Vitest |

### TypeScript 7 lado a lado com a API do 6

O `tsc` do projeto é o TypeScript 7 (compilador nativo), usado por
`npm run typecheck` e `npm run build`. O TypeScript 7.0 ainda não publica uma
API programática, e o typescript-eslint só aceita `typescript` abaixo de 6.1
enquanto a issue typescript-eslint#10940 está aberta. Por isso o `app/package.json`
segue a forma oficial do anúncio do 7.0 ("Running Side-by-Side with TypeScript
6.0") e instala os dois lado a lado por alias npm:

```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2"
```

- `@typescript/native` é o TypeScript 7 e fornece o bin `tsc`;
- `typescript` é o pacote de compatibilidade do 6: `require('typescript')`
  (o que o typescript-eslint faz) recebe a API do TypeScript 6 e o bin dele se
  chama `tsc6`.

O nome do alias importa: o pacote do 6 também traz um `tsc`, e o npm resolve o
conflito pela ordem do nome (microsoft/typescript-go#4567). Com
`@typescript/native` o `node_modules/.bin/tsc` aponta para o 7 no npm 10 e no
npm 11; outros gerenciadores (Yarn Berry, Bun) resolvem esse conflito de outro
jeito e não são suportados aqui. Para conferir:

```bash
cd app
npx tsc -v                                  # Version 7.x
node -p "require('typescript').version"     # 6.0.x
```

O `npm test` confere essa fiação em cada SO onde roda, inclusive nos runners
Linux, macOS e Windows da CI (`app/scripts/typescript-toolchain.test.cjs`). No
notebook de referência (2 núcleos, 4 threads), o typecheck a frio caiu de
25,8 s para 3,2 s (p50) e o pico de RSS de 756 MiB para 452 MiB; números e
método em
[`app/benchmarks/README.md`](app/benchmarks/README.md#benchmark-do-typecheck).
Quando o typescript-eslint suportar o TypeScript 7, o alias do 6 pode sair e o
`typescript` volta a ser o pacote normal.

### Tailwind CSS 4

O renderer usa o Tailwind 4 pelo plugin oficial `@tailwindcss/vite`, registrado
em `app/vite.config.ts`. Não existem mais `tailwind.config.js` nem
`postcss.config.js`: a configuração mora no próprio `app/src/index.css` —
`@import 'tailwindcss' source('.')` (varre só `src/`), `@theme` com as fontes e
sombras extras e `@utility` para os tokens de tema (`text-theme-error`,
`rounded-theme`...).

Onde pôr CSS novo no `index.css` (motivo e medição em
[ARQUITETURA.md](docs/projeto/ARQUITETURA.md#tailwind-4-e-a-cascata-do-css-próprio)):

- regra de elemento ou variável global (`button`, `select`, `body`, `:root`):
  dentro de `@layer base`;
- classe própria (`.felixo-*`, override de `.react-flow__*`): fora de camada,
  como o resto do arquivo — ela vence qualquer utility sem `!`;
- utility reaproveitável que precisa de variantes (`hover:`, `disabled:`):
  `@utility`.

O Tailwind 4 exige Chromium 111+ (`color-mix()`, `@property`); o Electron 41 do
projeto traz o Chromium 146.

---

## Como rodar

Forma mais simples — abre o menu interativo onde você instala, configura e inicia:

```bash
python3 start_app.py
```

No menu você tem: **Iniciar/Rodar** (app desktop ou preview web), **Instalar/Setup**, **Configurar** (CLIs, permissões dos agentes e branch usada pela atualização explícita) e **Status/Sair**.

### Atualização automática

Ao iniciar, o launcher verifica sozinho se há uma versão nova da branch em que você está e atualiza antes de abrir o app — você não precisa ficar rodando `git pull` para saber se saiu novidade. Quando já está em dia, não mostra nada e não custa nada perceptível.

No macOS, ao escolher **Iniciar/Rodar**, aparece também uma confirmação de
atualização forçada, ativada por padrão. Se confirmada, ela sincroniza a branch
atual exatamente com `origin/<branch>` antes de abrir; alterações locais são
guardadas em `git stash`; commits locais divergentes são substituídos, mas
ficam recuperáveis pelo reflog do Git. Se essa atualização explícita falhar, o
app não abre uma versão antiga silenciosamente.

A atualização automática silenciosa só atualiza quando é seguro e **nunca impede o app de abrir**. Ela pula a atualização quando:

- há alterações locais não commitadas (seu trabalho sempre ganha da atualização);
- não há rede, ou o `fetch` demora demais (é interrompido e o app abre normalmente);
- o histórico divergiu, quando um fast-forward reescreveria commits locais;
- o checkout está em *detached HEAD*, sem branch para atualizar.

Atualiza a branch em que você **já está** — não troca de branch nem puxa de `production` quando você está em `main`.

Para desligar (necessário em CI, que deve compilar exatamente o commit que baixou):

```bash
FELIXO_AUTO_UPDATE=off python3 start_app.py
python3 start_app.py --no-auto-update --web
```

Ou manualmente:

```bash
cd app
nvm use
npm install
npm run dev
```

Scripts/CI que já chamam `start_app.py` com flags continuam funcionando sem o menu (`--web`, `--skip-install`, `--update`, `--branch`) — ver [`docs/projeto/RODAR-VIA-CODIGO-FONTE.md`](docs/projeto/RODAR-VIA-CODIGO-FONTE.md).

## Rodar em outro PC

Pré-requisitos:

- Git
- Python 3
- Node.js 22+ com npm
- Pelo menos uma CLI de IA instalada e autenticada: `codex`, `claude` ou `gemini`

Linux/macOS:

```bash
git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core
python3 start_app.py
```

Windows PowerShell:

```powershell
git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core
py start_app.py
```

O `start_app.py` instala as dependências Python do lock `requirements.txt`
(hoje `questionary`, `rich` e o grafo transitivo usado pelo menu) e as
dependências Node com `npm install` quando necessário. O arquivo
`requirements.in` contém somente as dependências diretas editáveis; o
`requirements.txt` é gerado pelo `uv` com versões exatas, marcadores para o
Python 3.9+ suportado e hashes de todas as distribuições. Não edite o lock
diretamente.

Para atualizar o lock de forma reproduzível, instale o `uv` e rode:

```bash
uv pip compile --universal --python-version 3.9 --generate-hashes \
  --upgrade --output-file requirements.txt requirements.in
python3 -m pip install pip-audit==2.10.1
python3 -m pip_audit --requirement requirements.txt --strict --progress-spinner off
```

O CI instala o mesmo lock com `--require-hashes` em todos os sistemas e
executa o `pip-audit` contra ele antes de aceitar a alteração.

### Se o Python for "externally managed" (macOS com Homebrew, Debian/Ubuntu)

Nessas instalações o `pip` recusa instalar pacotes no Python do sistema e responde `error: externally-managed-environment` (PEP 668).

O launcher lida com isso sozinho: primeiro verifica se os pacotes já estão disponíveis (é o caso de várias distribuições Linux, e aí nem tenta instalar); se faltarem, tenta `--user` e, se o sistema também bloquear, `--break-system-packages`.

Essas dependências servem só para desenhar o menu — o app em si é Node. Se a instalação falhar mesmo assim, o launcher avisa e **segue rodando o app normalmente**.

Se quiser o ambiente mais previsível em qualquer SO, use um virtualenv:

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python3 start_app.py
```

No macOS, o launcher procura Node/npm em instalações comuns de Homebrew Apple Silicon, Homebrew Intel, MacPorts, NVM, fnm, Volta, asdf, mise e nodenv, mesmo quando o app é iniciado por uma GUI com `PATH` reduzido. Se precisar forçar um diretório específico, use `FELIXO_NODE_BIN=/caminho/do/bin`.

No Windows, o launcher resolve `npm.cmd` automaticamente e também procura Node.js em instalações comuns do instalador oficial, NVM for Windows, Volta, Scoop e `%APPDATA%\npm`.

Se quiser apenas abrir sem instalar dependências automaticamente:

```bash
python3 start_app.py --skip-install
```

Se alguma CLI não estiver no `PATH`, defina `FELIXO_CLI_PATHS` com a pasta onde o comando está instalado. Por padrão, as CLIs rodam em modo de automação com acesso total: Claude usa `--permission-mode bypassPermissions`, Codex usa `--dangerously-bypass-approvals-and-sandbox` e Gemini usa `--yolo`/`--skip-trust`. Para reduzir permissões, use `FELIXO_CLAUDE_PERMISSION_MODE=default|plan|auto|dontAsk|acceptEdits|off`, `FELIXO_CODEX_FULL_ACCESS=off` ou `FELIXO_GEMINI_FULL_ACCESS=off`.

### Organizar os blocos do canvas

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

### Área útil e foco do canvas

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

### Remover o que está selecionado

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

### Placa de vídeo e máquinas com poucas CPUs

Com duas placas de vídeo ou mais, **Configurações → Renderização e recuperação →
Opções avançadas: placa de vídeo** oferece Automático (o padrão, sem mudança),
Integrada ou Dedicada (experimental). A escolha fica em `gpu-preference.json`, no
perfil, e é aplicada antes do `app.whenReady()` do próximo início:

- **Linux**: Dedicada liga o ANGLE sobre Vulkan (`--use-angle=vulkan` e as
  features `Vulkan`, `VulkanFromANGLE` e `DefaultANGLEVulkan`, conferidas no
  Chromium 146). O offload da NVIDIA pelo GLX derruba o GL do Chromium, e
  variáveis gravadas no processo principal não chegam ao processo de GPU (ele
  nasce de um zygote criado antes do `main.cjs`). Integrada é o GL padrão; com
  variáveis herdadas que forçam a dedicada (como as do `prime-run`), o app limpa o
  ambiente e relança uma vez. No AppImage o `app.relaunch()` não traz o app de
  volta (o binário está na montagem que some quando ele sai), então o app abre de
  novo o próprio `.AppImage` (`electron/core/app-relaunch.cjs`). Antes de sair ele
  grava um pedido de relançamento, que o processo relançado apaga; uma abertura
  que ainda o encontra volta para Automático, com aviso, em vez de relançar em
  laço.
- **Windows e macOS**: `force_high_performance_gpu` / `force_low_power_gpu`,
  documentados pelo Electron 41 e usados pelo Chromium só nesses sistemas. Eles só
  têm efeito quando o Chromium marca uma placa de baixo consumo e outra de alto
  desempenho (`gpuPreference` no `app.getGPUInfo('basic')`), e é só aí que a opção
  aparece.
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
[`docs/projeto/POLITICA-PERFORMANCE.md`](docs/projeto/POLITICA-PERFORMANCE.md).

### Conta da CLI oficial: ver e trocar

No gerenciador de CLIs (Modelos > CLIs oficiais), uma CLI que expõe operações de conta — hoje o Codex — ganha dois botões:

- **Status da conta** roda o comando de status da própria CLI (`codex login status`) e mostra o que ela responder. Identidade (conta, plano, organização) só aparece quando a CLI a imprime; quando ela informa apenas "conectado", a tela diz exatamente isso, em vez de sugerir qual conta está em uso. O app não lê arquivo de credencial nem deduz identidade por caminho no disco, e a saída do comando é redigida antes de virar mensagem ou linha de log.
- **Trocar conta** abre uma confirmação antes de qualquer coisa: ela mostra a conta autenticada, lista os terminais do canvas que estão rodando aquela CLI e explica o efeito. Só depois de confirmar é que o app executa o logout e abre o login oficial em um terminal do sistema. Cancelar não desconecta nada.

**Efeito sobre terminais abertos.** O app não encerra nenhum processo durante a troca: o cartão, o diretório e o histórico do terminal continuam no canvas. Isso não é o mesmo que preservar a autenticação — um processo que já estava rodando pode perder a autorização no meio do trabalho, porque a credencial que ele carregou é a da conta anterior. Quando isso acontecer, reinicie aquele terminal pelo botão de reiniciar do próprio cartão: o nó e o diretório são reaproveitados; o contexto interno da CLI, não.

**Recuperação manual.** Se o app não conseguir abrir um terminal para o login, a troca informa o comando a rodar à mão (`codex login`). Para conferir o estado a qualquer momento, `codex login status` no terminal responde o mesmo que o botão.

### Diagnóstico das CLIs

Quando uma CLI de IA não aparece, o app explica o motivo sem instalar nada. Há dois caminhos:

- em **Gerenciar modelos** (tela Chat, ícone **Configurar modelos** da barra lateral), seção **CLIs oficiais**, o ícone **Diagnosticar CLIs**, ao lado de **Atualizar detecção**;
- no aviso **Não foi possível instalar as CLIs de IA**, que só aparece quando a instalação automática falha, o botão **Ver diagnóstico**.

Cada CLI com instalação automática (Codex, Claude Code e Gemini) ganha uma linha com a causa e a próxima ação. As causas possíveis são: pronta, não instalada, instalada mas invisível ao app (fora do `PATH`), bloqueada por permissão, sem resposta a tempo, atalho que não executa, falha ao responder, instalação incompleta ou falha de rede. Com o diagnóstico na tela, **Instalar** só continua onde reinstalar resolve, isto é, em "não instalada" e "instalação incompleta". **Copiar texto para o suporte** copia um resumo que o processo principal já limpa: sem nome de usuário, URL nem segredo.

O diagnóstico é uma fotografia. Fechar o gerenciador o descarta, e **Atualizar detecção** o refaz se ele estiver na tela. O Openia não entra no diagnóstico e mantém o **Instalar** de sempre.

## Openia como launcher de OpenRouter

O gerenciador de modelos (Modelos > CLIs oficiais) também identifica o `openia` como
launcher oficial. Ele não é apresentado como um modelo fictício: na configuração
de spawn, o Felixo consulta o registro do Openia e oferece interface, modelo e
chave na própria interface, mantendo o catálogo no Openia como fonte única.

Quando o Openia não está instalado, o botão **Instalar** mostra o repositório de
origem e pede confirmação antes de executar o `pip` remoto. A instalação usa o
Python do sistema (`python3` no Linux/macOS ou `py` no Windows), não depende de um
clone local e não entra na instalação automática baseada em npm do app. Depois de
instalado, o botão de spawn já pode abrir a interface escolhida sem repetir a
configuração no terminal. O botão de terminal do gerenciador continua abrindo o
menu manual do Openia para quem quiser administrá-lo diretamente.

O spawn usa `openia list --json` e `openia models --json`. Sem uma conta
selecionada, a chave do login do sistema é enviada ao
`openia key set-stdin felixo --json` exclusivamente por stdin. Com uma conta
selecionada, a chave é guardada cifrada no perfil daquela conta e chega ao
processo somente como `OPENROUTER_API_KEY`; ela não é herdada do login do
sistema nem compartilhada com outra conta. Em ambos os casos, nenhum segredo
entra em argumento, log, preferência do canvas ou dado do node. O terminal já
nasce com `openia run <interface> --provider --model <id> --dir <projeto>` (ou
`--no-model`), sem o prompt de interface, modelo ou pasta. Se Python, `pip` ou o
comando `openia` não estiverem disponíveis, o cartão informa a falha e o restante
do app continua utilizável. A versão pode ser conferida com `openia --version`.

### Gerar imagem pelo canvas

Na seção **Criar** da barra lateral do canvas, **Gerar imagem** (logo abaixo de
**Abrir imagem**) abre um painel com dois campos. O primeiro é a descrição da
imagem, com até 4.000 caracteres (Ctrl/Cmd+Enter gera). O segundo é o modelo,
escolhido no catálogo público de imagem do OpenRouter. O Openia gera com a chave
do OpenRouter configurada **nele**: o Felixo nunca lê essa chave, e a geração pode
consumir créditos da conta. Na primeira vez nenhum modelo vem escolhido; depois,
o último escolhido é lembrado.

Durante a geração, o painel mostra "Gerando imagem…" com os segundos decorridos,
e **Cancelar** interrompe o pedido. Fechar o painel (Esc ou clique fora) não
interrompe a geração: o botão da barra continua em "Gerando imagem…" e, se a
geração falhar com o painel fechado, ganha um ícone de alerta. Ao
terminar, a imagem entra no canvas como bloco temporário, com **Remover
temporário**. Os erros aparecem com mensagens fixas: chave ausente ou recusada,
limite ou créditos, modelo indisponível, rede, tempo esgotado ou catálogo
indisponível (com **Tentar de novo**). É preciso ter o Openia instalado e com a
chave configurada, e rede para o catálogo. O contrato com o Openia está em
[`docs/projeto/OPENIA-IMAGEM-CONTRATO.md`](docs/projeto/OPENIA-IMAGEM-CONTRATO.md).

### Limites e uso por conta

O painel **Limites e uso** (menu **Ferramentas** do canvas) reúne as contas
detectadas de cada CLI instalada, com o consumo de cada janela, o horário do
reset, a conta e o plano informados pela própria ferramenta. O identificador da
conta aparece inteiro, para dar para dizer qual linha é qual quando há mais de
uma conta no mesmo provedor; quem separa as contas por dentro é um fingerprint
SHA-256, não esse texto. Nenhum token, cookie, chave ou senha é lido para o
painel ou gravado por ele.

Cada número mostra de onde veio e **quando foi medido**, que nem sempre é quando
o app leu — uma fonte que só é atualizada durante a sessão continua exibindo o
último valor conhecido, marcado como antigo em vez de apresentado como atual.
Onde a CLI não oferece cota consultável sem interação, o painel diz isso por
extenso, em vez de mostrar zero. As fontes declaradas com consulta ao vivo são
executadas em cada atualização e por conta/perfil: o Codex usa o
`account/rateLimits/read` do app-server autenticado, o Claude abre uma sessão
PTY descartável e executa o `/status`, e o Openia chama seu `statusline`. Por
isso o painel não copia o limite do login do sistema para outra linha. O botão
**Atualizar** repete a consulta, e a atualização automática pode ser
configurada em intervalos de 5, 15 ou 30 minutos.

No Claude Code, cada linha também traz **Dados completos do /status**: versão,
sessão, peer, pasta, método de login, organização, e-mail, modelo, fontes de
configuração, custo, duração, alterações, uso por modelo, janelas, resets,
promoção, explicação/atribuição das últimas 24 horas e créditos de uso. Esses
campos são extraídos e redigidos antes de serem armazenados; a saída bruta do
terminal nunca vai para o renderer.

O que cada CLI publica hoje:

| CLI | Fonte | O que aparece |
|-----|-------|---------------|
| Codex | `account/rateLimits/read` ao vivo no app-server por conta/perfil; rollout local só como fallback | janela de 5 h, janela semanal, reset, créditos e plano |
| Claude Code | `/status` interativo ao vivo por conta/perfil | Status + Usage completos, janelas de 5 h e semanal, resets, estatísticas e atribuição |
| Openia | `openia statusline` ao vivo (créditos da conta no OpenRouter) | usado, restante e total em US$ |
| Gemini | — | sem endpoint não interativo seguro: a quota só existe no `/stats model` interativo e fica explicitamente indisponível |

A coleta de status line do Claude Code continua **opcional e explícita** e serve
como fallback local: pelo botão do painel, o app registra um script no arquivo
de configuração do Claude Code, preserva uma status line que já exista (recusa
sobrescrever), continua imprimindo uma linha útil, e desligar a coleta devolve
a configuração ao estado anterior. A consulta principal do painel não depende
dessa instalação: ela usa o `/status` ao vivo.

### Conta por terminal

Cada conta cadastrada ganha uma pasta de login própria dentro do perfil do app,
e o terminal nasce autenticado nela. Não há logout entre contas: duas sessões
da mesma CLI, em contas diferentes, rodam ao mesmo tempo. O campo **Conta**
aparece no configurador de qualquer agente compatível; ele começa em **Login do
sistema**, oferece **+ Nova conta…** e mostra o botão **Remover** depois que um
perfil é selecionado. O padrão continua sendo o login que você já tem no
sistema.

O login em si é feito pela própria CLI, dentro do terminal, na primeira vez que
você abre um perfil novo — o app não intermedeia credencial. A exceção é o
Openia: a chave digitada no configurador é guardada cifrada pelo chaveiro do
sistema. Sem conta selecionada ela atualiza o login global; com conta
selecionada ela fica vinculada somente àquela conta.

Para impedir que uma conta sem chave use acidentalmente a chave global, o
configurador consulta a lista atual da conta, que só expõe o booleano
`secretConfigured`. Antes de criar o PTY, o renderer consulta novamente o
estado e o processo principal repete a validação; conta Openia sem chave é
recusada antes do processo nascer. A chave nunca atravessa o renderer e o
estado falso não revela o conteúdo do segredo.

Ao trocar de agente no configurador, a conta e a lista anterior são limpas
imediatamente; respostas assíncronas antigas não podem repopular o campo. O
provedor acompanha o terminal até o processo principal, que confere comando,
provedor e conta antes de montar o ambiente do PTY. Uma combinação stale é
recusada sem iniciar processo nem expor o perfil errado.

Como cada CLI isola o login (medido, não presumido):

| CLI | Isolamento | Observação |
|-----|-----------|------------|
| Codex | `CODEX_HOME` | variável dedicada |
| Claude Code | `CLAUDE_CONFIG_DIR` | variável dedicada |
| Gemini | `HOME` próprio | não tem variável dedicada; o perfil recebe cópia de `.gitconfig`, `.ssh` e `.npmrc` para o trabalho no repositório continuar funcionando |
| Openia | `OPENROUTER_API_KEY` por conta; chave global sem conta | é o único caso em que o app guarda um segredo, cifrado pelo `safeStorage` do sistema; sem chaveiro disponível, o app recusa guardar em vez de salvar em texto |

Se um terminal for reiniciado pelo drawer lateral, o `accountId` e o provedor
persistidos no bloco acompanham o novo PTY. Assim, o restart mantém o perfil
selecionado; quando o bloco não tem `accountId`, ele continua usando o login do
sistema.

Remover uma conta pede confirmação e apaga a pasta de login dela — manter
credencial órfã seria pior que refazer o login. A pasta já ausente (`ENOENT`) é
tratada como removida; se o sistema devolver qualquer outra falha, a conta e a
credencial são preservadas, um diagnóstico seguro aparece na interface e a
remoção pode ser tentada novamente. Terminais já abertos podem perder esse
login; a ação é separada de **Remover do painel**, que aparece em **Limites e
uso** e arquiva somente o histórico local de uso, sem apagar o perfil de login.

Cada conta cadastrada também vira uma linha própria no painel **Limites e uso**,
com a quota lida da pasta dela — é assim que duas contas do mesmo provedor
aparecem com números separados. Enquanto a conta não tiver sido usada, a linha
diz isso em vez de mostrar zero.

### Identidade das inserções de prompt

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

## Como distribuir

Build local:

```bash
cd app
npm run dist
```

O workflow `.github/workflows/release.yml` publica instaladores para Linux,
Windows e macOS depois que o CI do commit em `main` passa (também pode ser
acionado manualmente para um SHA já validado). O app empacotado verifica
atualizações no início e periodicamente; quando encontra uma versão nova
publicada no GitHub Releases, baixa automaticamente e instala ao fechar.

O workflow também valida cada instalador na própria matriz do Linux, Windows e
macOS: abre o app empacotado, cria um PTY real, usa o npm-runtime que foi
embarcado para instalar e atualizar uma CLI de teste e registra o resultado em
`release-smoke-<plataforma>.json` junto dos artefatos da release. Esse JSON
também registra a quantidade/bytes do npm-runtime e os tempos de startup,
primeira instalação e atualização; o benchmark `npm run
benchmark:npm-runtime:check` compara a árvore anterior e a política atual em
cada SO antes do empacotamento. O inventário `package-inventory-<plataforma>.json`
é anexado à execução e à release para permitir conferir o conteúdo distribuído.

Observações importantes:

- Usuários precisam ter as CLIs `codex`, `claude` e/ou `gemini` instaladas e autenticadas no próprio sistema; para usar o launcher Openia, precisam também de Python 3 e pip.
- Se a CLI não estiver no `PATH`, defina `FELIXO_CLI_PATHS` com os diretórios extras onde os comandos estão instalados.
- No Linux, prefira o AppImage para auto-update dentro do app; pacote `.deb` é útil para instalação tradicional, mas não segue o mesmo fluxo de atualização automática.
- **macOS: os artefatos não são assinados nem notarizados**, então o Gatekeeper bloqueia a primeira abertura — às vezes com uma mensagem confusa que sugere procurar um app na App Store. O usuário precisa liberar manualmente em **Ajustes do Sistema > Privacidade e Segurança**, ou rodar `xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"`. Resolver isso de vez exige uma conta do Apple Developer Program (US$ 99/ano) e os secrets de assinatura no workflow de release.
- No Windows, o SmartScreen pode alertar enquanto não houver assinatura, mas o app abre após confirmar.

Detalhes de instalação por sistema operacional: [Guia do Usuário](./docs/guias/GUIA-USUARIO.md#2-instalação-por-sistema-operacional).

---

## Validação

Aplicação:

```bash
cd app
npm run typecheck
npm test
npm run test:native
npm run test:frontend
npm run test:canvas-context
npm run lint
npm run build
```

`npm run test:canvas-context` inclui a matriz ponta a ponta do contexto. Ela
repete por padrão 50 vezes os fluxos de reidratação após restart, troca de
agente no mesmo node, reabertura de terminal, dois terminais simultâneos,
confiança de pasta do Claude e relançamento do Codex após auto-update. Para uma
execução curta de diagnóstico, defina `FELIXO_CONTEXT_MATRIX_RUNS=1`; para
guardar a evidência em um caminho específico, use
`FELIXO_CONTEXT_MATRIX_REPORT=build/context-matrix.json`. Cada artefato deixa
os estados `written`, `path-typed` e `read` no JSONL diário do QA em
`logs/qa/qa-AAAA-MM-DD.jsonl`; uma leitura ausente ou erro registra `failed` e
faz a matriz falhar.

`npm run check:hardware` (depois de `npx vite build`) confere no app real a
escolha de placa de vídeo e a sugestão do Modo Performance: abre o app com um
perfil temporário, escolhe a placa pela tela, reabre e lê a GPU em uso pelo CDP
(`SystemInfo.getInfo`); também simula um início que travou, uma GPU que sobe
desligada, o ambiente do `prime-run` e um relançamento que não voltou. Passe
`--expect-integrada=0x8086 --expect-dedicada=0x10de` (vendorIds da máquina) para
exigir a GPU certa em cada cenário; sem eles, só relata. Com
`--app-image=<arquivo.AppImage>` os cenários rodam no pacote AppImage em vez de
`electron .`.

`npm run typecheck` usa o cache incremental do `tsc -b` (TypeScript 7) sem
relaxar a verificação. Para uma auditoria limpa dos dois projetos TypeScript,
use `npm run typecheck:full`; para comparar cinco execuções frias e cinco
incrementais, use `npm run benchmark:typecheck:check`. O `npm run lint` continua
lendo os `.ts` com a API do TypeScript 6 (ver
[TypeScript 7 lado a lado com a API do 6](#typescript-7-lado-a-lado-com-a-api-do-6)).

O instalador leva um `npm-runtime` próprio para instalar CLIs sem Node/npm
externo. A política de empacotamento remove apenas documentação e artefatos de
desenvolvimento comprovadamente não runtime; compare-a com a política anterior
e valide instalação/atualização offline nos três SOs com
`npm run benchmark:npm-runtime:check` dentro de `app/`. O smoke do release
também registra o tamanho do runtime e os tempos do npm no artefato real.

Para avaliar uma substituição sem mudar o produto, use
`npm run benchmark:package-managers -- --check` em `app/`. A bancada mede o
npm-runtime, pnpm, Yarn Classic, Yarn moderno e Corepack em prefixos
descartáveis, com bootstrap e fixtures locais. Em cada PR a comparação completa
roda no Linux (os outros SOs medem só o npm-runtime); o workflow
`.github/workflows/nightly.yml` repete a comparação completa nos quatro SOs
todo dia e publica um JSON por SO.
O resultado Linux de 03/09/2026 manteve o npm como recomendação: pnpm foi
funcional, mas maior e mais lento; Yarn Classic preservou global install com
layout próprio; Yarn moderno não ofereceu o global install exigido; e Corepack
adicionou bootstrap/cache. Nenhuma migração deve ocorrer sem repetir o smoke
com CLIs reais, scripts nativos, cache offline e os três sistemas.

### Auditoria de dependências e SBOM

O CI executa separadamente o `npm audit` completo e `npm audit --omit=dev`, gera
um SBOM CycloneDX e inventaria o `app.asar` junto do `npm-runtime` que realmente
entra no pacote. A árvore de produção precisa estar sem vulnerabilidades e o
grafo completo não pode conter advisories críticos; advisories não críticos de
ferramentas continuam registrados para as atualizações do Dependabot. O launcher
Python também é auditado com `pip-audit` e publica seu SBOM. O workflow
`nightly.yml` repete esses audits todo dia, com os mesmos gates, para que um
advisory publicado sem nenhum commit novo apareça sem esperar o próximo PR.

Para repetir localmente:

```bash
cd app
npm audit --json
npm audit --omit=dev --json
npm sbom --package-lock-only --sbom-format=cyclonedx --sbom-type=application
npm run pack
npm run inventory:package -- --release-dir release --out build/dependency-policy/package-inventory.json
```

`npm test` executa os testes Node unitários; o segundo comando é o gate explícito
de PTY nativa: ele inicia fixtures reais
no runner atual e valida a fila de escrita, EOF, Unicode e a consulta
interativa `/status` do Claude. A matriz do CI executa esse mesmo gate em
Linux, macOS e Windows/ConPTY; incompatibilidade de shell ou do addon nativo
falha com diagnóstico no log, em vez de ser ocultada por `skip`. O comando
serializa as fixtures para não criar uma disputa artificial entre múltiplos
handles ConPTY no mesmo runner.

Launcher (`start_app.py`) — não precisa de Node nem de dependências instaladas:

```bash
python3 -m unittest discover -s tests -t .
```

Os testes do launcher cobrem o que costuma quebrar entre sistemas operacionais: descoberta de Node no macOS (Homebrew Apple Silicon/Intel, gerenciadores de versão, `PATH` reduzido de apps de GUI), `Path`/`npm.cmd` no Windows, instalação de pacotes em Python "externally managed" (PEP 668) e a limpeza de processos, que só pode encerrar processos iniciados pelo próprio launcher. O CI roda esses testes em Linux, Windows e macOS.

### Estrutura do launcher

O `start_app.py` na raiz é a porta de entrada (exigida pelo padrão de qualidade) e apenas chama o pacote `felixo_launcher/`, onde cada módulo tem uma responsabilidade:

| Módulo | Responsabilidade |
|---|---|
| `paths` | Caminhos do repositório e configurações compartilhadas |
| `config` | Arquivo local de configuração escrito pelo menu |
| `node` | Encontrar Node.js/npm e montar o ambiente dele |
| `commands` | Resolver e executar comandos filhos |
| `process` | Parar o app e limpar processos de execuções anteriores |
| `node_deps` | Manter `app/node_modules` em dia com o `package.json` |
| `python_deps` | Instalar as dependências Python do próprio launcher |
| `git` | Atualizar o checkout com as regras de update da branch atual/explicita |
| `runner` | Preparo de ambiente e o caminho sem menu (flags) |
| `menu` | O menu interativo — interface principal do launcher |

Cada módulo tem seu arquivo de teste correspondente em `tests/`.

---

## Roadmap

Ver [ROADMAP.md](./docs/projeto/ROADMAP.md) para fases, checklists, metas e backlog completo.

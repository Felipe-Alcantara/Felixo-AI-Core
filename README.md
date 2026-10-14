# Felixo AI Core

Felixo AI Core é o núcleo inteligente do ecossistema FelixoVerse: uma aplicação desktop, orientada a canvas, para controlar, organizar e orquestrar múltiplas IAs, agentes, terminais, repositórios e fluxos de trabalho.

> **Pare de trocar de IA. Comece a orquestrar.**

---

## Índice

- [O que é](#o-que-é)
- [Arquitetura atual](#arquitetura-atual)
- [Status atual](#status-atual)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Rodar em outro PC](#rodar-em-outro-pc)
- [Guias de uso](#guias-de-uso)
- [Openia como launcher de OpenRouter](#openia-como-launcher-de-openrouter)
- [Como distribuir](#como-distribuir)
- [Validação](#validação)
- [Roadmap](#roadmap)
- [Licença e contribuições](#licença-e-contribuições)

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
- **Cadeia de contas**, desligada por padrão: quando uma conta bate o limite, propõe continuar em outra, sempre com a sua confirmação, num bloco novo com o contexto e sem tocar no terminal antigo
- **Retomada de conversas com motivo**: ao reabrir o app ou reiniciar um bloco, o agente só volta sozinho à mesma conversa quando agente (Claude Code, Codex, ou Gemini CLI a partir da 0.57, conforme a versão instalada), pasta e conta coincidem; nos outros casos o cartão explica o motivo, sem mostrar IDs, e você escolhe entre a lista da CLI e uma conversa nova, sem apagar o registro (ver o [Guia do Usuário](docs/guias/GUIA-USUARIO.md#retomar-conversas-de-agentes))
- Entrega de contexto inicial por artefatos somente leitura, com trilha persistida `written → path-typed → read` em `logs/qa` para diagnosticar reinícios e trocas de terminal/agente
- Painel **Limites e uso** no canvas, com consumo por janela, conta, plano e horário de reset de cada CLI; no Codex, também mostra a quantidade, validade e detalhes dos resets bancados por conta, com uso protegido por confirmação
- Bloco **Tarefas Notion** no canvas (**Ferramentas → Tarefas Notion** cria o bloco ou foca o que já existe), com conexão própria cifrada, seleção de database compartilhada, cache offline, CRUD de tarefas e a aba **Painel**: um cartão por repositório (ou por valor de qualquer coluna de escolha/ligação) com o placar de abertas e concluídas
- Preview de Markdown com sanitização de HTML/URLs externos, remoção de ANSI, limite de 200.000 caracteres e imagens remotas bloqueadas por padrão; GFM e imagens locais seguem a autorização do arquivo
- Sincronização do Felixo System Design com diagnóstico Git redigido antes de chegar ao SQLite, QA Logger ou renderer; lista de guias (dá para seguir dois padrões juntos) e guias por projeto — arquivo `.felixo/system-design.json` no repositório (só vale depois de confirmado), pasta de guias ou escolha no app
- Superfícies do canvas que dividem o espaço entre si: painel, gaveta do terminal, Mini Map e dock encolhem uns pelos outros em vez de se cobrirem
- Escolha da **placa de vídeo** (Automático, Integrada ou Dedicada experimental) como opção avançada, com volta automática para Automático se a GPU falhar, e sugestão do **Modo Performance** em máquina com até 4 CPUs lógicas
- **Tutorial do canvas** no primeiro uso (projeto, agente, contexto, terminais, ferramentas e onde rever), não bloqueante e sem criar nada, e **Ajuda** na barra de ícones para reabrir o tutorial, ver novidades e redefinir. Quem já usava o app recebe só um aviso discreto da Ajuda, uma vez; o progresso fica versionado no SQLite local, sem reabrir a cada atualização (ver o [Guia do Usuário](docs/guias/GUIA-USUARIO.md#tutorial-e-ajuda))
- Frontend organizado por feature em `app/src/features/`, com o que é comum às telas em `features/shared/`
- Processo Electron modularizado em `core/`, `services/` e `windows/`
- Bloco **Agente na nuvem** (opção do menu **Agente**, em **Criar**): cria uma sessão do Claude Code na nuvem (`claude --cloud`) por um cartão no canvas, com confirmação antes de gastar crédito, follow-up e **Trazer para cá** (`--teleport`). A sessão só nasce de um clique confirmado: abrir, restaurar ou importar o canvas nunca criam (ver o [Guia do Usuário](docs/guias/GUIA-USUARIO.md#agente-na-nuvem))
- Testes unitários para adapters, orquestrador, catálogo MCP e leitura JSONL

### Sincronização segura do Felixo System Design

O guia obrigatório é sincronizado pelo processo principal com `git`, sem shell, e nunca guarda credencial na URL. O Git só pode pedir login quando você clica; a sincronização automática falha com um aviso e os agentes seguem com o último conteúdo. Detalhes no [guia da sincronização](./docs/guias/GUIA-SYSTEM-DESIGN.md).

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

Atualiza a branch em que você **já está** — não troca de branch.

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

## Guias de uso

Os recursos do dia a dia têm guias próprios, para este README ficar no essencial:

| Guia | O que cobre |
|------|-------------|
| [Guia do canvas](./docs/guias/GUIA-CANVAS.md) | Organizar os blocos, área útil e foco, remover a seleção, identidade das inserções de prompt e máquinas com poucas CPUs ou mais de uma placa de vídeo. |
| [Guia de contas, limites e diagnóstico das CLIs](./docs/guias/GUIA-CONTAS-E-LIMITES.md) | Ver e trocar a conta da CLI oficial, diagnóstico das CLIs, **Limites e uso por conta**, conta por terminal e cadeia de contas. |
| [Guia da sincronização do Felixo System Design](./docs/guias/GUIA-SYSTEM-DESIGN.md) | Como o guia obrigatório é sincronizado e quando o Git pode pedir login. |
| [Guia de auditoria de dependências e SBOM](./docs/guias/GUIA-DEPENDENCIAS-E-SBOM.md) | O que o CI audita, o SBOM e como repetir localmente. |

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
falta de créditos (o OpenRouter exige saldo mínimo na conta para gerar imagem:
US$ 1,00 em 09/10/2026), limite de requisições, modelo indisponível, rede, tempo
esgotado ou catálogo indisponível (com **Tentar de novo**). É preciso ter o
Openia 0.2.0 ou mais novo instalado, com a chave configurada, e rede para o
catálogo. Com um Openia anterior (sem `openia image`), o painel diz isso e
oferece **Atualizar o Openia**, que instala a versão fixada no catálogo de CLIs
depois de uma confirmação. O contrato com o Openia está em
[`docs/projeto/OPENIA-IMAGEM-CONTRATO.md`](docs/projeto/OPENIA-IMAGEM-CONTRATO.md).

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
`electron .`, e `--app-image-arg=--appimage-extract-and-run` roda o pacote sem
FUSE (extraído).

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

Ao abrir o app, a preparação automática das CLIs começa alguns segundos depois.
A cada rodada o npm-runtime consulta os canais publicados de cada CLI no registry
(`latest` e os de pré-lançamento, como `next`, `preview` e `alpha`) e leva para a
versão mais nova entre eles a cópia que o app mantém no prefixo gerenciado e, quando
existir, a instalação feita pelo npm global do sistema. Instalação nativa, Homebrew,
pnpm ou Volta não são alteradas. No Windows, uma CLI aberta por um agente não pode
ser trocada: a atualização dela fica adiada e a rodada tenta de novo a cada 5
minutos. O que mudou de versão aparece num aviso curto. Se o registry estiver
indisponível, a cópia do app usa a última versão/hash revisados no manifesto do
release (a do sistema não é tocada), e a instalação ainda confere o
`dist.integrity` da versão exata antes de extrair o pacote. Em automações isoladas,
use `FELIXO_AUTO_INSTALL_CLIS=0` para desativar essa rodada.

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

O CI audita as dependências do app e do launcher e gera o SBOM; a árvore de produção precisa estar sem vulnerabilidades. Detalhes e como repetir localmente no [guia de auditoria](./docs/guias/GUIA-DEPENDENCIAS-E-SBOM.md).

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

---

## Licença e contribuições

Distribuído sob a licença MIT; o texto completo está em [LICENSE](./LICENSE).

Contribuições são bem-vindas. O fluxo de branches e commits (direto na `main` por padrão, branch só nas exceções) está na [política de branch do Guia para Desenvolvedores](./docs/guias/GUIA-DESENVOLVEDOR.md#política-de-branch), e o [Roadmap](./docs/projeto/ROADMAP.md) lista a direção do projeto e as ideias abertas para quem quiser ajudar.

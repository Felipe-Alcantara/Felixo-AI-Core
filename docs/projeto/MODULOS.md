# Módulos de agente

Status: **proposta**. Nada disto está implementado. Três decisões de produto estão em aberto (seção 7).
Base medida: `main` em `34ffba5c`, em 25/11/2026.

Legenda, usada em todo o texto:

- **[CÓDIGO]**: existe no repositório. O caminho e a linha foram lidos nesta revisão.
- **[PLANEJADO]**: aparece só em tarefas do Notion ou no catálogo com `status: 'planned'`. Nenhum código o executa.
- **[PROPOSTA]**: desenho novo deste documento, sem evidência no código.

## 1. O que é um módulo

Um módulo de agente é um pacote de dados que monta, para uma área, o que um agente precisa: os **presets** (CLI, modelo, contexto), os **prompts** do catálogo (o que pedir), as **skills** (como fazer), os **servidores MCP** exigidos (o que pode tocar), um **time** opcional e um **template de canvas** (onde o resultado aparece). Ao instalar, a pessoa vê o que o módulo pede e confirma.

Na v1, um módulo não:

- traz código executável (script, binário ou comando de shell);
- cria tipo de agente novo: usa as CLIs que o app já abre (`claude`, `codex`, `gemini`, `antigravity`). `openia` é launcher e fica de fora (`app/src/features/canvas/services/agent-preset.ts:31`);
- guarda segredo nem caminho de máquina: credencial é declarada pelo nome e pedida à pessoa;
- liga o modo Yolo.

"Módulo" aqui é unidade de produto. Não confundir com os módulos de código de `app/src` e `app/electron`.

O app já tem dois formatos de troca com o mesmo padrão (JSON com `format` e `version`): `felixo-agent-preset` v1 e `felixo-canvas` v1. O módulo seria o terceiro, no mesmo padrão.

## 2. O que já existe

### 2.1 Peças

Caminhos relativos a `app/`, exceto onde indicado.

| Peça | Onde | Estado | Papel num módulo |
| --- | --- | --- | --- |
| Preset de agente, formato `felixo-agent-preset` v1 | `src/features/canvas/services/agent-preset.ts:20-22` (formato), `:70` (validação), `:128` (saída), `:145` (entrada) | [CÓDIGO] | quem é o agente: CLI, modelo, esforço, fast, yolo, contexto, skills, cor |
| Presets salvos pela pessoa | `electron/services/storage/agent-presets-repository.cjs`; tela `src/features/canvas/components/tools/AgentPresetsPanel.tsx`; nome `.fxpreset` em `src/features/canvas/services/agent-preset-editor.ts:66` | [CÓDIGO] | editar, duplicar e trocar arquivo |
| Presets nativos (3) | `src/features/canvas/services/agent-preset.ts:193-230`: Tasks do Notion (codex), Revisor de PR (claude), Depurador (claude) | [CÓDIGO] | agentes prontos; não se editam, duplica-se |
| Time de 4 papéis | `src/features/canvas/services/agent-team-template.ts:26-51` (papéis e prompts), `:64-83` (monta os terminais e as ligações); acionado em `src/features/canvas/components/TerminalMenu.tsx:175` | [CÓDIGO], fixo no código, sem arquivo | template de time. Os papéis são genéricos (entregável, critério de aceite), não de programação |
| Revisão produtor × checador | `electron/cli/review-command.cjs` (`felixo revisao enviar, pendentes, ler, aprovar, recusar`); `electron/services/agent-review-store.cjs` | [CÓDIGO] | o resultado só sai depois da aprovação do checador |
| Catálogo de prompts (21) | `src/features/shared/data/automations.ts:6` | [CÓDIGO] | o que pedir. 12 são de código e 9 são gerais (pelos títulos, contagem feita aqui) |
| Escopos de prompt (7) | `electron/services/storage/automation-scopes.json`: chat, code, docs, git, notion, planning, security | [CÓDIGO] | categoria. Escopo novo exige migração do SQLite (o próprio arquivo avisa) |
| Prompt em Markdown | `src/features/canvas/services/prompt-markdown.ts:1-12` (cabeçalho YAML e corpo) | [CÓDIGO], sem número de versão | troca de prompt entre máquinas |
| Skills embutidas (24) | `resources/skills/<nome>/SKILL.md`, com `name` e `description` no frontmatter; copiadas no pacote por `package.json:98` | [CÓDIGO] | como fazer. 11 são de desenvolvimento e 13 são de canvas, Notion ou rotina (contagem por nome, feita aqui) |
| Skills da comunidade (8) | `electron/services/skills/skills-catalog.cjs:173-237`, referenciadas pela URL de origem | [CÓDIGO] | não são baixadas; o agente lê a URL quando precisa |
| Skills da pessoa | `electron/services/skills/skills-catalog.cjs:298` (`listAvailableSkills`, origem `user`) | [CÓDIGO] | painel de Skills |
| Registro de MCP ("instalar uma vez") | `electron/services/mcp/mcp-registry.cjs` (segredos cifrados por `safeStorage`); `mcp-injection.cjs` (entrega a Claude e Codex no spawn, Gemini por arquivo); ligados em `electron/main.cjs:1074-1075` | [CÓDIGO], sem tela | um módulo pode exigir servidores pelo `id`. Não há canal IPC nem tela para instalar |
| Catálogo de ferramentas MCP do Felixo (15) | `electron/services/mcp/felixo-tool-catalog.cjs:1-114` | [PLANEJADO]: as 15 têm `status: 'planned'` | o que um agente poderá tocar. Ainda não é permissão real |
| CLI `felixo` do agente | `electron/cli/felixo.cjs:111-168` (grupos `browser`, `context`, `canvas`, `perguntar`, `revisao`, `fetch-all`, `devtools`) | [CÓDIGO] | o agente pede para ler e escrever no canvas; cada pedido (`felixo.cjs:425`, `:455`, `:471`) aparece para a pessoa aprovar em `AgentCanvasWriteRequestsPanel.tsx` |
| Canvas portátil `felixo-canvas` v1 | `electron/services/canvas-transfer.cjs:12-13` (formato), `:23` (cria), `:35` (lê) | [CÓDIGO] | base do template de canvas |
| Geração de imagem (Openia e OpenRouter) | `electron/services/openia-image-service.cjs:39` (catálogo público de modelos), `:77` (mensagem de saldo), `:175` (serviço); botão `src/features/canvas/components/GenerateImageButton.tsx` | [CÓDIGO], paga | criativo. `README.md:373-374` diz que a conta precisa de saldo mínimo de US$ 1,00 (medido em 09/10/2026) |
| Ditado | `electron/services/speech/speech-transcription.cjs:49-53` (servidor local ou chave da nuvem) | [CÓDIGO] | entrada por voz |
| Notion no canvas | `electron/services/notion-service.cjs`, `notion-client.cjs`, `notion-ipc-handlers.cjs`; painéis `NotionTasksPanel.tsx` e `NotionRepoBoard.tsx`. A CLI `notion-tasks` é externa ao repositório | [CÓDIGO] | produtividade; o token fica no cofre e só vai ao terminal do agente |
| Página Web no canvas | `src/features/canvas/components/WebpageNode.tsx`; `felixo browser` em `electron/cli/felixo.cjs` | [CÓDIGO] | onde o resultado aparece |
| Orquestrador | `electron/services/orchestration/` (runner e presets de prompt); `electron/services/orchestrator/delegation-policy.cjs` | [CÓDIGO] | coordena sub-agentes. `orchestrator-prompt-presets.json` tem 12 blocos; `gitDiscipline` e `codeQualityStandard` só valem ao delegar código |
| Terminal comum | `src/features/canvas/components/AgentConfigFields.tsx:100` ("Nenhum (shell)") | [CÓDIGO] | base de módulo de configuração de sistemas, sem allowlist de comandos |

### 2.2 O que não existe no código

Só existe como tarefa no Notion ou como ideia:

- integração com n8n (nenhuma menção em `app/`);
- agente de pergunta rápida. O `felixo perguntar` é outra coisa: o agente faz uma pergunta com opções no canvas (`electron/cli/felixo.cjs:371-376`);
- presets Narrador, Diretor de live, Estúdio de imagem e vídeo, Social media e Apresentação a partir de fontes de fatos;
- integrações com Higgsfield, Zernio, Remotion, OBS, yutu, Shopify e Excel MCP. A busca por esses nomes em `app/` achou só `src/features/canvas/services/excalidraw-embeds.ts:24`, uma lista de domínios para embed, sem integração.

## 3. Contrato `felixo-module` v1 [PROPOSTA]

Arquivo JSON com `format: "felixo-module"` e `version: 1`. Importar recusa versão maior que a do app, como `parsePresetFile` (`agent-preset.ts:161-166`). As chaves são em inglês, como nos outros formatos; os textos são em português.

| Campo | Obrigatório | Regra | Base no código |
| --- | --- | --- | --- |
| `format`, `version` | sim | `"felixo-module"` e `1` | mesmo padrão de `felixo-agent-preset` (`agent-preset.ts:116-121`) |
| `id` | sim | slug `^[a-z0-9][a-z0-9-]{0,39}$` | mesmo padrão do registro MCP (`mcp-registry.cjs:8`) |
| `name`, `description` | sim | até 60 e 160 caracteres | `PRESET_NAME_MAX` (`agent-preset.ts:24`) e `normalizePreset` |
| `areas` | sim | ids da seção 4: `programacao`, `produtividade`, `criativo`, `social`, `sistemas`, `escritorio`, `video`, `audio-live` | [PROPOSTA] |
| `moduleVersion`, `minAppVersion` | sim | semver do módulo; versão mínima do app (hoje `0.1.0`, `package.json:5`) | [PROPOSTA] |
| `author`, `license` | sim | nome de exibição; identificador SPDX | `LICENSE` é MIT; decisão Q3 (seção 7) |
| `presets` | sim (um ou mais) | presets no formato portátil: sem `id`, `cwd` e `native`; cada um com `role` (`agente`, `coordenador`, `produtor` ou `checador`) | a saída já omite `id`, `cwd` e `native` (`agent-preset.ts:128-130`) |
| `team` | não | `links`: pares de índices em `presets` que dizem quem entrega a quem | generaliza `handsOffTo` (`agent-team-template.ts:19`, `:79-81`) |
| `prompts` | não | lista de ids do catálogo (`default-…`) | o texto já está no app; v1 não aceita prompt novo |
| `skills` | não | os ids vêm dentro de `presets[].skillIds`, só do catálogo do app | `skillIds` (`agent-preset.ts:52`) |
| `mcpServers` | não | lista de `{ "id", "required" }` apontando para o registro | `mcp-registry.cjs`; sem instalação automática na v1 |
| `requirements` | sim | `clis`, `tools`, `accounts`, `keys` (só nome e finalidade), `systems` | nome de segredo validado por `SECRET_NAME_PATTERN` (`mcp-registry.cjs:9`) |
| `cost` | sim | `text` e `paidServices`, mostrados antes de instalar; o app não mede na v1 | [PROPOSTA]; o Openia já consulta o preço do modelo (`openia-image-service.cjs:88`) |
| `permissions` | sim | `writesTo` (ex.: `canvas`, `notion`), `folders` (sempre escolhidas pela pessoa), `yolo` (sempre `false`) | `yolo` existe no preset (`agent-preset.ts:48`); no módulo fica proibido |
| `template` | não | um `felixo-canvas` v1 completo | validado por `canvas-transfer.cjs:35` |

### Exemplo

Módulo que monta uma peça que já existe (piloto A, seção 5):

```json
{
  "format": "felixo-module",
  "version": 1,
  "id": "anotacoes-para-tarefas",
  "name": "Anotações viram tarefas (Notion)",
  "description": "Transforma anotações cruas em tarefas do Notion, conferindo o database antes de escrever.",
  "areas": ["produtividade"],
  "moduleVersion": "1.0.0",
  "minAppVersion": "0.1.0",
  "author": "Felixo AI Core",
  "license": "MIT",
  "presets": [
    {
      "role": "agente",
      "name": "Tasks do Notion",
      "description": "Trabalha uma task do Notion seguindo o fluxo completo.",
      "icon": "📋",
      "color": "sky",
      "agentId": "codex",
      "model": "",
      "effort": "",
      "fast": false,
      "yolo": false,
      "contextPrompt": "Você é o agente de tasks do Notion deste canvas. Leia o que o link é antes de escrever…",
      "skillIds": ["builtin-notion-operacoes", "builtin-notion-anotacoes-para-tarefas", "builtin-memoria-viva-ia-md"]
    }
  ],
  "prompts": ["default-notion-intake", "default-notion-safe-ops"],
  "mcpServers": [],
  "requirements": {
    "clis": ["codex"],
    "tools": ["notion-tasks"],
    "accounts": ["Notion conectado no app"],
    "keys": [],
    "systems": ["windows", "linux", "macos"]
  },
  "cost": { "text": "Sem custo próprio; usa a cota da conta da CLI escolhida.", "paidServices": [] },
  "permissions": { "writesTo": ["notion"], "folders": [], "yolo": false }
}
```

Os sistemas do exemplo são suposição a conferir antes de publicar. A CLI `notion-tasks` é externa ao repositório e não foi testada aqui.

### Regras de validação [PROPOSTA]

1. `format` e `version`: formato diferente ou versão maior é recusado (base: `parsePresetFile`).
2. Cada preset: `agentId` precisa ser CLI que não é launcher (`agent-preset.ts:79-80`). Modelo e esforço inválidos viram padrão (`:82-85`), como hoje.
3. `yolo` é `false` em todo preset do módulo. Regra nova.
4. `skillIds` e `prompts` só aceitam ids do catálogo do app. Id desconhecido recusa a instalação e lista o que faltou (`findMissingSkillIds`, `agent-preset-editor.ts:45`).
5. Limites do preset valem: contexto de 20 000 caracteres e 30 skills (`agent-preset.ts:25-26`).
6. `team.links` só com índices válidos em `presets`.
7. Nenhum campo aceita caminho absoluto, `cwd` ou valor de segredo. A saída já deixa `cwd` de fora (`agent-preset.ts:128-130`); o resto é regra nova.
8. Antes de instalar, tela com requisitos, custo, permissões, skills e servidores MCP. Confirmação explícita.

## 4. Áreas-alvo

Ids usados em `areas`. A ordem da última coluna é recomendação; a escolha das três primeiras é a Q1 (seção 7).

| Área (id) | Já existe (código) | Falta | Bloqueio | Ordem |
| --- | --- | --- | --- | --- |
| Programação (`programacao`) | presets Revisor de PR e Depurador; time de 4 papéis; 12 prompts de código; 11 skills de desenvolvimento | empacotar; não exige código novo | nenhum | 1 (prova do contrato) |
| Produtividade (`produtividade`) | preset Tasks do Notion; 2 skills de Notion; 3 prompts de Notion; painéis de Notion no canvas | empacotar | a CLI `notion-tasks` é externa e vai como requisito | 2 (prova fora de código) |
| Criativo (`criativo`) | geração de imagem pelo Openia e OpenRouter; botão no canvas; Página Web | preset e texto de estilo (não há nenhum); edição e variações | custo por imagem; saldo mínimo na conta | 3 |
| Social media (`social`) | nada no código; escrita no canvas e Página Web | integração com redes (Zernio, planejada) e calendário | termos de cada rede; contas da pessoa; publicar sem confirmação | depois |
| Configuração de sistemas (`sistemas`) | terminal comum ("Nenhum (shell)") | `terminal.run_allowlisted` (planejado) e receitas com desfazer | sem allowlist, o módulo daria terminal livre | depois da allowlist |
| Escritório (`escritorio`) | registro de MCP no backend | tela para instalar o servidor e escolher a pasta; Excel MCP e Word/PowerPoint (planejados) | não existe tela de MCP | depois da tela |
| Vídeo (`video`) | nada no código | Remotion e Higgsfield (planejados) | custo por crédito; licença do Remotion para empresas (relatado na task) | depois |
| Áudio e live (`audio-live`) | nada no código | presets Narrador e Diretor de live (só tarefas); integrações OBS e yutu | credenciais de terceiros; MCP com segredo | depois |

## 5. Fichas dos três pilotos [PROPOSTA]

Só fichas. Nenhum piloto está implementado.

**A. Anotações viram tarefas (Notion), área `produtividade`**

- Presets: Tasks do Notion (`native:tasks-notion`).
- Prompts: `default-notion-intake`, `default-notion-safe-ops`, `default-notion-crosslink`.
- Skills: `builtin-notion-operacoes`, `builtin-notion-anotacoes-para-tarefas`, `builtin-memoria-viva-ia-md`.
- Requisitos e custo: CLI `notion-tasks` e conexão Notion do app; o custo é a cota da CLI.
- Falta construir: formato, exportação e importação com confirmação. Nenhum preset novo.
- Critério de aceite: num perfil limpo, instalar o arquivo, abrir o preset e colar anotações. O agente confere o database antes de escrever, como manda `default-notion-safe-ops`.

**B. Imagem para redes sociais, área `criativo`**

- Presets: um a criar, com a CLI `claude` e o estilo no `contextPrompt`. Não há preset de criativo no código.
- Prompts: nenhum do catálogo serve; o texto de estilo fica no `contextPrompt`.
- Skills: `builtin-escrever-em-elementos-do-canvas`, `builtin-abrir-paginas-no-navegador`.
- Requisitos e custo: Openia instalado e conta OpenRouter com saldo. O custo por imagem vem do preço do modelo; quando o preço não vem, o Openia avisa (`openia-image-service.cjs:88`).
- Falta construir: o preset e o campo `cost` preenchido. O resto existe.
- Critério de aceite: sem saldo, aparece a mensagem de saldo (`openia-image-service.cjs:77`); com saldo, a imagem chega ao canvas pelo botão existente.

**C. Programação em time, área `programacao`**

- Presets: Revisor de PR, Depurador e os quatro papéis do time (`role`: `coordenador`, `produtor`, `produtor`, `checador`).
- `team.links`: `[[0,1],[0,2],[1,3],[2,3]]`, igual a `agent-team-template.ts:79-81`.
- Prompts: `default-plan-feature`, `default-code-review`.
- Skills: `builtin-revisar-pull-request`, `builtin-depurar-causa-raiz`, `builtin-escrever-testes-que-valem`.
- Requisitos e custo: CLI (padrão `claude`) e uma pasta de repositório local; o custo é a conta da CLI.
- Falta construir: o campo `team` no lugar do time fixo em código (`agent-team-template.ts:26-51`). É o único piloto que pede mudança de código.
- Critério de aceite: instalar, abrir o time (4 terminais e 4 ligações) e fechar um ciclo de `felixo revisao` com uma recusa e uma aprovação.

O terceiro candidato da task de origem, configuração de sistemas, não entra: depende de `terminal.run_allowlisted`, que está só planejado.

## 6. Distribuição, confiança e segurança [PROPOSTA]

- **Distribuição (v1):** arquivo `.fxmodule`, importado pela tela de presets, no mesmo modelo do `.fxpreset`. Catálogo público depende da Q2.
- **Confiança:** módulo não executa código. O risco é o texto: `contextPrompt`, skills e a comunidade. As skills da comunidade não são baixadas; o agente lê a URL de origem quando precisa (`skills-catalog.cjs:1-18`). Um módulo de terceiro pode trazer instrução maliciosa para um agente com acesso a arquivos. Por isso a tela de confirmação mostra o que o módulo pede, inclusive as URLs.
- **Permissões:** `yolo` proibido. Pastas sempre escolhidas pela pessoa. `permissions.writesTo` declara o que o módulo escreve, mas o app não aplica isso hoje: é regra nova.
- **Segredos:** o módulo declara nome e finalidade. O valor fica no cofre do app (`mcp-registry.cjs`, com `safeStorage`) e nunca no arquivo.
- **Custo:** declarado antes de instalar. Quem paga é a conta de quem usa.
- **Licença e Windows:** a licença atual é MIT (`LICENSE`). A task de Release no Notion registra que a assinatura gratuita do SignPath exige licença "sem dual-licensing comercial", e que um plano de módulos pagos pode tirar o projeto desse caminho. Por isso a Q3.
- **n8n:** módulo de n8n só depois da task de desenho da integração, que trata da licença Sustainable Use. O texto da licença citado na task de origem (lido em 15/10/2026) não foi reverificado aqui.
- **Conteúdo interno:** o catálogo de 95 papéis de agente, segundo a task correspondente no Notion, vem de um plano interno e não está no repositório. Módulos públicos não trazem esse material. O comentário de `src/features/canvas/services/agent-team-template.ts:6` cita o nome desse plano: candidato a limpeza.

## 7. Decisões de produto (em aberto)

Três perguntas. A recomendação vem primeiro. Q2 e Q3 são decisões críticas: são públicas e difíceis de desfazer. Por isso há uma task dedicada a elas, aberta junto com este documento.

### Q1. Quais três áreas entram primeiro?

- Por que é decisão de produto: define a prioridade e o que a landing mostra.
- Opções:
  1. Programação, Produtividade e Criativo (imagem) (Recomendado). Tudo já existe no app; a imagem tem custo e exige saldo.
  2. Programação, Produtividade e Escritório (planilhas). Exige uma tela de instalação de MCP, que não existe.
  3. Programação, Produtividade e Configuração de sistemas. Exige a allowlist de terminal, só planejada; risco alto para um módulo.
- Fica parado: as fichas B e C (seção 5). O contrato (seção 3) não depende disso.

### Q2. Módulos só curados pela equipe, ou também de terceiros?

- Por que é decisão de produto: muda o modelo de confiança e a distribuição. É a decisão mais cara de desfazer.
- Opções:
  1. Só curados pela equipe (Recomendado). Importar arquivo de fora fica desligado na v1; a confiança fica com o projeto.
  2. Arquivo de qualquer pessoa, com confirmação. Mais aberto; quem importa precisa ler o que o módulo pede.
  3. Catálogo público de terceiros. Exige revisão contínua e fila de curadoria.
- Fica parado: a importação de arquivo de fora e o catálogo.

### Q3. Algum módulo sai pago, ou tudo continua MIT?

- Por que é decisão de produto: é licença. Depois que um módulo circula, não se volta atrás com facilidade. Também mexe na assinatura do Windows.
- Opções:
  1. Tudo MIT (Recomendado). Bate com o `LICENSE` atual e mantém o SignPath gratuito possível.
  2. Módulos pagos fora do repositório. O código segue MIT; exige decidir a assinatura do Windows (o SignPath pode deixar de aceitar; o caminho seria certificado pago).
  3. Decidir antes do primeiro módulo publicado. Nada muda agora; o campo `license` já é obrigatório.
- Fica parado: a publicação do primeiro módulo. Nenhum código depende disso.

## 8. Fora da v1

Cada corte tem a menor versão que fica:

- Parâmetros de prompt e exemplos clicáveis: fica o texto fixo no `contextPrompt`.
- Prompts novos dentro do módulo: fica só a referência ao catálogo.
- Skills embutidas no módulo: fica só a referência ao catálogo do app.
- Instalar MCP pelo módulo: fica declarar o `id` que já existe no registro.
- Código ou script: nunca entra na v1.
- Atualização automática: fica reinstalar o arquivo.
- Marketplace e assinatura de módulo: só depois da Q2.

## 9. Tasks e docs relacionados

- Preset v2 (Notion): contrato técnico de agente que o módulo usa. Os campos de `presets` devem bater com ele.
- Entregar a instrução do preset num artefato próprio (Notion): hoje o contexto do preset vai para o fim do skills-manifest.
- Templates de canvas e catálogo de papéis (Notion, concluídos): o time de 4 papéis está no código; o catálogo não está.
- Escritor de tasks (Notion): base do piloto A.
- Instalar um MCP uma vez (Notion): dona da tela de instalação que as áreas de escritório exigem.
- n8n e Release/SignPath (Notion): licença e assinatura, citadas na seção 6.
- `docs/projeto/ROADMAP.md:121` lista "plugins e marketplace de skills" como ideia de longo prazo. Atualizar depois da Q2.
- `docs/projeto/INVENTARIO-CANVAS.md` é gerado pelo código (`src/features/canvas/inventory/canvas-inventory.ts`) e não repete este inventário.

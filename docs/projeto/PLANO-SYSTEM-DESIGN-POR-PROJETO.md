# Plano — System Design por projeto (lista de guias por camada)

Task: Felixo AI Core/System Design — camada por projeto na precedência da fonte
(https://app.notion.com/p/3e291f95497e812984c8c17c2970e5bd). Base: commit `f3fcfc3`
(fonte configurável, contrato em `app/electron/core/system-design-source.cjs`).

## Decisões do Felipe (08/10/2026)

1. **Onde a fonte do projeto mora:** os três mecanismos, à escolha do usuário:
   - um arquivo versionado no repositório;
   - a escolha feita no app, por projeto;
   - uma pasta de guias dentro do repositório.

   Dá para usar mais de um padrão ao mesmo tempo.
2. **Dois padrões ao mesmo tempo:** cada camada é uma **lista de guias** (ex.: Felixo + Doktor),
   e os agentes recebem todos.
3. **Divergência:** a lista do projeto **substitui** a do usuário naquele projeto, e a UI e o
   lembrete avisam isso.
4. **Alcance:** agentes, orquestrador e painel — um cache e um índice por fonte.

## Decisões de implementação (minhas, declaradas)

- **Arquivo no repositório:** `.felixo/system-design.json`, no formato
  `{ "guias": [ { "url": "https://…", "branch": "main" } ] }`.
  - `branch` é opcional e vale `main`.
  - Até 5 guias e 16 KB por arquivo.
  - Cada URL passa pelo mesmo `validateSourceUrl` da fonte do usuário. Entrada inválida
    aparece como problema e não entra.
  - **Nunca vale sem confirmação:** a confirmação guarda o hash da lista normalizada. Mudou
    URL ou branch, pergunta de novo; mudou só espaço ou formatação, não.
- **Pasta de guias:** pastas na raiz chamadas `Padrão de qualidade - <nome>`, a convenção que o
  lembrete já cita. Cada uma é um guia local, sem rede.
  - Vale por padrão, porque o comportamento de hoje já manda o agente usá-la.
  - Pode ser desligada por projeto.
  - O índice é lido do disco na hora: só `.md`, com limite de tamanho e de profundidade.
- **Escolha no app:** a chave `system-design.projects` das configurações, indexada pela raiz do
  repositório, guarda:
  - a lista de guias escolhidos;
  - se usa o arquivo do repositório e o hash confirmado;
  - se usa a pasta.
- **Raiz do projeto de um terminal:** sobe do `cwd` até a primeira pasta com `.git`, sem passar
  da raiz autorizada; sem `.git`, é o próprio `cwd`.
- **Autorização:** só lê dentro de pasta escolhida no seletor ou de projeto registrado
  (`authorizeProjectDirectory`). Fora disso o estado é "fora dos projetos registrados" e nada
  é lido.
- **Precedência:**
  1. projeto, que é a união dos três mecanismos, sem repetir guia;
  2. usuário (lista própria);
  3. padrão do app (Felixo).

  Lista do projeto não vazia substitui a do usuário naquele projeto.
- **Sincronização:**
  - os guias do usuário, uma vez por sessão, como hoje, agora todos da lista;
  - os guias de projeto vindos do app ou de arquivo confirmado, ao confirmar ou adicionar, e
    uma vez por sessão quando um terminal daquele projeto resolve;
  - guia de arquivo não confirmado nunca é buscado.
- **Armazenamento:**
  - a migração `018` cria `system_design_source_documents (source_key, path, …)`;
  - na primeira leitura, os documentos da tabela antiga vão para a chave da fonte entregue, e a
    tabela antiga é esvaziada;
  - o cache vira `config/system-design/sources/<hash>/repo`.
- **Config do usuário:** `schemaVersion` 3, com `customSources` (lista) e o estado de
  sincronização por fonte. A migração v2 → v3 é idempotente. Os campos planos de antes
  continuam, descrevendo o primeiro guia.
- **Lembrete:** com só o padrão do app e sem camada de projeto, o texto é **idêntico byte a
  byte** ao de hoje (há teste com o literal). Com lista ou projeto, ele cita cada guia e a
  camada.

## Fases (commits na branch `feat/system-design-por-projeto`)

- [ ] **1. Contrato:** lista de guias do usuário, v3 com migração, camada de projeto (arquivo,
  pasta, escolha no app), precedência e efetivo. Só funções puras, com testes.
- [ ] **2. Processo principal:**
  - migração 018 e documentos por fonte;
  - sincronização por fonte;
  - `system-design:resolve-project` e `system-design:save-project`;
  - leitura autorizada da raiz;
  - testes de integração com SQLite real.
- [ ] **3. Renderer:**
  - tipos, hook, seção "Seus guias" (adicionar URL e branch, remover, voltar ao padrão) e "Por
    projeto" (confirmar o arquivo, ligar a pasta, escolher guias);
  - lembrete por `cwd` no canvas;
  - bloco do orquestrador por projeto ativo;
  - índice do painel por guia;
  - testes de apresentação e de texto.
- [ ] **4. Docs, inventário e validação no app:**
  - README, GUIA-USUARIO, ARQUITETURA, IA.md e inventário do canvas;
  - app isolado com um projeto que traz o arquivo (Doktor), outro com pasta de guias e um com
    escolha no app.

## O que prova

- Testes de contrato: precedência, projeto ausente, URL inválida ou maliciosa no arquivo, arquivo
  grande ou malformado, confirmação por hash, troca de projeto, migração v1/v2 → v3.
- Integração dos handlers com SQLite real: os documentos antigos migram sem perda, a
  sincronização é por fonte, e nenhum `git clone` acontece para guia de arquivo não confirmado.
- App isolado: o lembrete de cada terminal cita os guias e a camada certos, o orquestrador
  separa por projeto, o painel lista por guia, e o console fica sem erros.

## Fora desta task

- Janela do Git Credential Manager no Windows para guia privado (task irmã "permitir escolher a
  fonte pela interface", que fica com só esse item).
- O app não escreve o arquivo `.felixo/system-design.json` no repositório; quem versiona é a
  pessoa.
- Validar a migração numa instalação real anterior (task já aberta).

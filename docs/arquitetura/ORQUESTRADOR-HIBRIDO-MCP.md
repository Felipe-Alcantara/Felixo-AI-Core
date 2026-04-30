# Orquestrador Híbrido com MCP

## Tese

O Felixo AI Core deve tratar MCP como infraestrutura de ferramentas, não
como substituto das CLIs de IA.

As CLIs autenticadas por assinatura continuam sendo chamadas por adapters de
terminal. A camada MCP deve padronizar acesso a arquivos, Git, memória,
contexto, prompts e skills para clientes compatíveis.

## Arquitetura Alvo

```
Felixo AI Core
├── UI Desktop
│   ├── Chat
│   ├── Projetos
│   ├── Terminal
│   └── Painel de modelos
├── Orchestrator Core
│   ├── roteamento de tarefa
│   ├── seleção de modelo/provider
│   ├── seleção de contexto
│   ├── histórico
│   └── política de segurança
├── Terminal Adapters
│   ├── ClaudeCodeTerminalAdapter
│   ├── GeminiTerminalAdapter
│   ├── CodexTerminalAdapter
│   └── LocalModelTerminalAdapter
├── MCP Layer
│   ├── Filesystem/Project MCP
│   ├── Git MCP
│   ├── Memory MCP
│   ├── Project Context MCP
│   └── Custom Skills MCP
└── Tooling Local
    ├── processos CLI
    ├── logs
    ├── armazenamento local
    └── workspace ativo
```

## Papel de Cada Camada

### Terminal Adapters

Responsáveis por controlar CLIs que foram feitas primeiro para uso humano no
terminal.

Responsabilidades:

- montar comando e argumentos;
- abrir processo one-shot ou persistente;
- escrever no stdin quando houver protocolo estruturado;
- interpretar stdout/stderr;
- capturar `providerSessionId`;
- normalizar eventos para o chat.

Estado atual:

- `claude`: processo persistente real quando possível;
- `codex`: one-shot com retomada nativa;
- `gemini`: one-shot com retomada nativa;
- protocolos persistentes futuros ficam por adapter, sem mudar o contrato do app.

### Orchestrator Core

Responsável por decidir como usar um adapter, sem conhecer detalhes de UI.

Responsabilidades atuais:

- decidir entre processo persistente, retomada nativa e one-shot;
- escolher `prompt` completo ou `resumePrompt`;
- normalizar entrada persistente de adapters simples ou multi-etapa.

Arquivo inicial:

- `app/electron/services/orchestrator/cli-execution-planner.cjs`

Responsabilidades futuras:

- escolher modelo por tipo de tarefa;
- acionar revisão por outro modelo;
- compactar contexto;
- coordenar pipelines entre modelos;
- aplicar limites de segurança antes de ferramentas sensíveis.

### MCP Layer

Responsável por padronizar ferramentas, contexto e memória. Ela não deve
controlar diretamente os modelos por assinatura.

Ferramentas planejadas no catálogo inicial:

- `project.read_file`
- `project.search`
- `project.write_file`
- `git.status`
- `git.diff`
- `git.commit_message`
- `memory.save`
- `memory.search`
- `summary.create`
- `terminal.run_allowlisted`

Arquivo inicial:

- `app/electron/services/mcp/felixo-tool-catalog.cjs`

Esse catálogo ainda não é um servidor MCP completo. Ele fixa nomes,
escopo e sensibilidade antes de implementar o transporte MCP.

## Estratégia de Evolução

### Fase A: Terminal confiável

Manter o app funcional com CLIs reais:

- sessão por modelo;
- streaming normalizado;
- retomada nativa quando disponível;
- processo persistente só com protocolo estruturado;
- observabilidade no painel Terminal.

### Fase B: Contrato formal de provider

Padronizar os adapters como provedores:

```ts
interface AIProvider {
  name: string
  type: 'terminal' | 'api' | 'local'
  sendMessage(prompt: string): Promise<AIResponse>
  isAvailable(): Promise<boolean>
}
```

No backend atual, esse contrato começa com:

- `providers/terminal-adapter-registry.cjs`;
- `adapters/*.cjs`;
- `orchestrator/cli-execution-planner.cjs`.

### Fase C: Felixo como MCP Server

Implementar um servidor MCP próprio expondo o catálogo Felixo:

- ferramentas de projeto;
- ferramentas Git;
- memória local;
- resumos;
- prompts/skills.

Antes de liberar escrita, cada ferramenta sensível precisa de:

- validação de path dentro do workspace;
- allowlist de comandos;
- confirmação explícita;
- log auditável;
- bloqueio de acesso fora do projeto ativo.

### Fase D: Felixo como MCP Client

Conectar o app a servidores MCP externos ou locais:

- filesystem;
- Git;
- memory;
- docs/fetch;
- ferramentas específicas por projeto.

O Orchestrator Core decide quais ferramentas ficam disponíveis para cada
modelo, thread e projeto.

### Fase E: Orquestração real

Depois que providers, histórico, memória e ferramentas estiverem estáveis:

- Gemini planeja;
- Claude revisa;
- Codex executa;
- modelo local classifica;
- Felixo junta resultado, logs e contexto.

## Regras de Segurança

- Nenhum comando livre deve ser exposto como tool padrão.
- Escrita em arquivo exige confirmação no MVP.
- `git push`, remoção de arquivo e comandos destrutivos exigem confirmação
  explícita e log.
- Ferramentas devem operar somente dentro de workspaces ativos.
- MCP server deve iniciar com tools read-only antes de liberar escrita.
- Terminal adapters continuam isolados da camada MCP.

## Estado Implementado Agora

- Registro explícito de Terminal Adapters em `providers/`.
- Decisão de execução extraída para `orchestrator/`.
- Catálogo inicial de ferramentas MCP em `mcp/`.
- Testes cobrindo registry, planner e catálogo de tools.
- `ipc-handlers.cjs` continua responsável por IPC e streaming, mas já delega
  decisões para as camadas novas.

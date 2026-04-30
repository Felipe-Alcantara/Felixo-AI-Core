# Plano: Confirmacoes e Permissoes para CLIs

## Contexto

Hoje o Felixo AI Core executa CLIs reais (`claude`, `codex`, `gemini`) e confia
no contrato de permissao de cada CLI. Isso funciona para prototipagem, mas ainda
nao existe uma camada propria do Felixo para pausar a execucao, mostrar uma acao
sensivel ao usuario e escrever a resposta de volta no processo.

O caso mais importante e quando uma CLI pede uma decisao antes de:

- executar comando shell;
- editar arquivo;
- aplicar diff;
- acessar caminho fora de um projeto ativo;
- alterar Git;
- pedir permissao geral de workspace.

Claude ja roda como processo persistente via `stdin`, Codex app-server ja tem
um caminho experimental para `requestApproval`, e a camada MCP planejada ja marca
tools de escrita com `requiresConfirmation`. Falta unificar isso numa politica
visual e auditavel.

## Objetivo

Criar uma camada de permissao do Felixo que:

- interrompa a resposta da CLI quando houver pedido de acao sensivel;
- mostre a acao em uma UI de confirmacao;
- permita aprovar, negar ou aprovar apenas uma vez;
- responda a CLI pelo `stdin` quando o protocolo suportar;
- registre a decisao no QA Logger/Terminal;
- bloqueie automaticamente acoes fora dos escopos permitidos.

## Nao objetivos da primeira versao

- Nao criar um sandbox completo de sistema operacional.
- Nao substituir as permissoes internas das CLIs.
- Nao expor comando shell livre como tool MCP padrao.
- Nao aplicar automaticamente diffs grandes sem revisao visual.
- Nao resolver todos os formatos interativos de TTY; priorizar protocolos JSONL
  ou eventos parseaveis.

## Politica inicial

| Acao | Padrao |
|------|--------|
| Leitura dentro de projeto ativo | Permitir |
| Leitura fora de projeto ativo | Confirmar |
| Escrita dentro de projeto ativo | Confirmar |
| Escrita fora de projeto ativo | Bloquear por padrao |
| Comando shell read-only simples | Confirmar |
| Comando shell destrutivo | Confirmar forte ou bloquear |
| `git diff` / `git status` | Permitir ou confirmar leve |
| `git commit` | Confirmar |
| `git push`, reset, clean, delete | Confirmar forte |
| Acesso a segredo/env/token | Bloquear ou confirmar forte |

Confirmacao forte significa mostrar impacto, caminho/comando completo e exigir
uma acao explicita do usuario, sem default automatico.

## Modelo de eventos

Adicionar um tipo normalizado de evento de permissao entre adapters e IPC:

```ts
type PermissionRequestEvent = {
  type: 'permission_request'
  requestId: string
  action: 'command' | 'file_change' | 'file_read' | 'workspace' | 'git' | 'unknown'
  title: string
  description?: string
  command?: string
  path?: string
  diff?: string
  risk: 'low' | 'medium' | 'high'
  defaultDecision: 'deny' | 'ask' | 'allow'
  responseFormat: 'json-rpc' | 'jsonl' | 'text' | 'adapter-specific'
}
```

O backend deve manter o `activeRun` pausado ate uma decisao chegar do frontend.

## Resposta para a CLI

Cada adapter fica responsavel por transformar a decisao em entrada nativa:

```ts
type PermissionDecision = {
  requestId: string
  decision: 'approved' | 'denied'
  remember?: 'none' | 'thread' | 'workspace'
}
```

Exemplos de saida por adapter:

- Codex app-server: resposta JSON-RPC para o `id` do request.
- Claude persistente: resposta JSONL/texto somente se o formato real da CLI
  expuser pedido estruturado.
- Gemini ACP: mapear quando o protocolo passar a expor pedidos de tool/permissao.

## Fluxo esperado

1. CLI emite pedido de permissao em stdout JSONL.
2. Adapter converte para `permission_request`.
3. IPC envia `cli:permission-request` ao renderer e registra no Terminal.
4. Chat fica em estado "aguardando permissao".
5. Usuario aprova ou nega.
6. Renderer chama `cli:permission-decision`.
7. Backend valida se o pedido ainda esta ativo.
8. Adapter serializa a resposta nativa.
9. `CliProcessManager.write(threadId, responseInput)` envia a decisao.
10. CLI continua ou encerra conforme a decisao.

## UI

Criar um painel/modal de confirmacao com:

- nome do modelo/CLI;
- tipo da acao;
- comando ou caminho;
- diff quando houver;
- nivel de risco;
- botoes `Aprovar`, `Negar` e, futuramente, `Aprovar nesta conversa`;
- estado de expirado quando a execucao ja terminou.

O Terminal deve mostrar:

- pedido recebido;
- decisao tomada;
- se foi auto-bloqueado por politica;
- se a CLI aceitou ou falhou ao receber a resposta.

## Backend

Mudancas planejadas:

- adicionar canal IPC `cli:permission-decision`;
- armazenar `pendingPermissionRequests` por `threadId` e `requestId`;
- impedir nova mensagem na mesma thread enquanto houver permissao pendente;
- adicionar timeout opcional para pedidos pendentes;
- adicionar helpers de politica para classificar risco;
- nunca auto-aprovar escrita em arquivo no modo padrao;
- preservar compatibilidade com adapters sem pedido estruturado.

## Frontend

Mudancas planejadas:

- estender `StreamEvent` com `permission_request` ou criar canal dedicado;
- criar componente `PermissionRequestDialog`;
- exibir estado de espera no Composer;
- desabilitar envio de nova mensagem enquanto a decisao estiver pendente;
- registrar decisao no painel Terminal/QA Logger.

## Adapters

### Claude

Investigar o formato real emitido pela Claude CLI quando ha pedido de permissao.
Se o pedido aparecer como JSONL estruturado, converter para `permission_request`.
Se aparecer como prompt interativo de TTY, documentar limitacao e bloquear com
mensagem clara ate existir suporte confiavel.

### Codex

O adapter `codex-app-server` ja reconhece requests como:

- `item/commandExecution/requestApproval`;
- `item/fileChange/requestApproval`;
- `item/permissions/requestApproval`.

Trocar a auto-aprovacao por `permission_request` e responder somente depois da
decisao do usuario.

O adapter `codex` one-shot (`codex exec`) deve continuar dependendo das
permissoes nativas do CLI enquanto nao houver protocolo estruturado.

### Gemini

Mapear suporte do Gemini CLI/ACP para pedidos de permissao. Enquanto nao houver
evento estruturado, tratar prompts interativos como erro amigavel em vez de
deixar a execucao presa ate timeout.

## Testes

- adapter converte request nativo em `permission_request`;
- backend armazena pedido pendente por `threadId`;
- backend rejeita decisao com `requestId` inexistente;
- decisao aprovada escreve `responseInput` correto no stdin;
- decisao negada escreve resposta nativa de negacao;
- timeout de permissao encerra execucao com erro claro;
- UI renderiza comando, caminho, diff e risco;
- Codex app-server deixa de auto-aprovar em teste.

## Etapas

### 1. Contrato interno

- Definir `permission_request` normalizado.
- Definir `PermissionDecision`.
- Atualizar tipos compartilhados do frontend.

### 2. Backend IPC

- Criar `cli:permission-decision`.
- Guardar requests pendentes.
- Pausar/liberar execucao por decisao.

### 3. Codex app-server

- Remover auto-aprovacao.
- Emitir `permission_request`.
- Serializar resposta JSON-RPC apos decisao.

### 4. UI

- Criar dialog de confirmacao.
- Mostrar diff/comando/caminho.
- Bloquear Composer enquanto espera decisao.

### 5. Claude e Gemini

- Validar formatos reais.
- Implementar quando houver evento estruturado.
- Criar erro claro para prompts interativos nao suportados.

### 6. Politica e auditoria

- Classificar risco por acao.
- Registrar decisao no QA Logger.
- Adicionar configuracao futura por workspace/modelo.

## Perguntas abertas

- Aprovacao deve valer so para uma chamada, para a thread ou para o workspace?
- O usuario deve poder configurar politicas por projeto?
- Como mostrar diffs grandes sem travar a UI?
- O app deve bloquear qualquer escrita fora de projetos ativos mesmo se a CLI
  pedir permissao?
- Qual formato real a Claude CLI emite para permissoes em `stream-json`
  persistente?

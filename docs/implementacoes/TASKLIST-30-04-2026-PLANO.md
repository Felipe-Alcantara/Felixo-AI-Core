# Plano de Implementacao - Tasklist 30/04/2026

## Contexto

Este plano registra a investigacao e o recorte de implementacao para a tasklist
`docs/Tasklists/Tasklist 30-04-2026.md`.

O projeto atual e um app Electron + React que orquestra CLIs de IA pelo backend
local. A arquitetura existente separa renderer, IPC Electron, adapters de CLI,
orquestrador, catalogo MCP inicial e documentacao operacional em `docs/`.

## Padroes usados como referencia

- `docs/padroes/design/DESIGN_SYSTEM_PARA_FRONTEND.md`
- `docs/padroes/design/DESIGN_SYSTEM_PARA_BACKEND.md`
- `docs/frontend/COMPONENTES.md`
- `docs/frontend/SERVICOS.md`
- `docs/backend/ELECTRON.md`
- `docs/projeto/STATUS-ATUAL.md`

## Diagnostico inicial

### Chat e threads

O frontend ja cria `threadId` logico por conversa/modelo e gera `sessionId` por
mensagem. O botao "Novo chat" zera mensagens e reseta a thread logica, mas nao
encerra explicitamente uma thread persistente ja concluida no backend. Isso
pode deixar processo persistente ocioso ate o timeout de 30 minutos.

### Projetos

Projetos e projetos ativos ficam somente em memoria no `ChatWorkspace`. Ao
reiniciar o app, a lista volta vazia.

### Automacoes

O item "Automacoes" existe na sidebar, mas nao abre nenhuma experiencia. Nao ha
modelo de dados para automacoes padrao ou personalizadas.

### Janelas e paineis

O Electron usa `BrowserWindow` com dimensoes fixas iniciais, mas sem politica
explicita de resize/maximize. A sidebar ja e redimensionavel; Terminal e QA
Logger ainda precisam de resize/hide mais completo.

### Modelos

O clique nos modelos da sidebar nao abre configuracao. O modal de modelos ja
edita `providerModel` e `reasoningEffort`, mas precisa mostrar melhor o que
cada CLI pode fazer e quais campos sao configuraveis.

### Code/Git

O catalogo MCP ja lista tools Git planejadas, mas ainda nao ha IPC preparado
para o botao "Code". O recorte seguro e criar backend Git read-only com comandos
allowlisted e UI inicial para consultar status/diff/log de projetos ativos.

### Felixo

O botao "Felixo" abre o modal de modelos. Ele deve abrir configuracoes do app e
perfil local, separado das configuracoes das CLIs.

### Composer e midias

O botao "+" no composer esta visualmente presente, mas nao tem acao. O recorte
seguro e permitir anexar arquivos locais, mostrar chips no composer e injetar
metadados/preview textual no prompt.

### Logo

A tela inicial usa um circulo gradiente como placeholder. O repositorio
`Felipe-Portifolio` usa `src/assets/images/CATT transparente.png` como logo do
site; esse asset deve ser copiado para `app/public/brand/`.

### Documentacao diaria

Nao existe pasta dedicada a relatorios diarios. Sera criada a estrutura
`docs/relatorios/2026-04-30.md`, usando hifen no nome do arquivo para evitar pastas por data.

## Plano de implementacao

1. Criar servicos de persistencia frontend para projetos e automacoes.
2. Adicionar modelo de automacoes padrao e personalizadas.
3. Implementar modal de automacoes com lista padrao, formulario personalizado e
   acao para aplicar prompt no composer.
4. Implementar anexos de contexto no composer e no prompt enviado para CLI.
5. Ajustar "Novo chat" para resetar thread local, limpar terminal do chat e
   pedir reset explicito da thread persistente ao backend.
6. Implementar modal "Code" com consultas Git read-only para projetos ativos.
7. Preparar IPC Git com comandos allowlisted (`status`, `diff --stat`,
   `log --oneline`) e testes unitarios de parsing/validacao.
8. Implementar modal "Felixo" separado do modal de modelos.
9. Tornar Terminal e QA Logger redimensionaveis/ocultaveis.
10. Melhorar a experiencia do Terminal com visao de orquestrador e threads.
11. Corrigir contraste de `<select>/<option>`.
12. Trocar o placeholder visual da tela inicial pela logo do site.
13. Atualizar documentacao de frontend, backend, status e relatorio diario.
14. Rodar `npm test`, `npm run lint`, `npm run build` e `git diff --check`.
15. Fazer commits separados por implementacao coerente.

## Criterios de aceite

- Projetos persistem apos restart via `localStorage`.
- "Novo chat" nao reutiliza `threadId`, limpa contexto efemero e solicita reset
  de thread ao backend quando houver thread corrente.
- Automacoes padrao aparecem no botao "Automacoes"; automacoes customizadas
  podem ser criadas/removidas e persistem.
- Modelos na sidebar sao clicaveis e abrem configuracao/capacidades.
- "Code" abre area Git inicial usando IPC read-only.
- "Felixo" abre modal proprio.
- QA Logger pode ser ocultado e redimensionado.
- Terminal pode ser ocultado, redimensionado e alternar entre visao de
  orquestrador e threads.
- Botao "+" adiciona anexos de contexto ao prompt.
- Selects de modelo/effort ficam legiveis em tema escuro.
- Logo da tela inicial usa asset do portfolio.
- Documentacao final registra o que foi implementado.

## Resultado da implementacao

Status em 30/04/2026:

- "Novo chat" agora limpa input, anexos, terminal local, estado de streaming e solicita `cli:reset-thread` ao backend quando existe thread corrente.
- Projetos e projetos ativos persistem em `localStorage` por `project-storage.ts`.
- "Automações" abre modal proprio com automações padrão, criação/remoção de automações customizadas e persistência local.
- A janela principal do Electron tem `resizable`, `maximizable`, `fullscreenable`, `minWidth` e `minHeight` explícitos.
- Clicar em um modelo na sidebar seleciona o modelo e abre o modal de configuração com capacidades e campos configuráveis.
- "Code" abre painel Git inicial e usa IPC read-only allowlisted para status, diff stat, branch e commits recentes.
- "Felixo" abre modal proprio de perfil/estado do app, separado de "Modelos".
- QA Logger pode ser recolhido e redimensionado verticalmente.
- Terminal lateral pode ser recolhido, redimensionado e alterna entre visão de Threads e Orquestrador.
- O botão "+" do composer adiciona arquivos como contexto; textos pequenos entram como preview no prompt.
- Selects nativos receberam `color-scheme: dark` e `option` com fundo/texto escuros.
- A tela inicial usa `/brand/felixo-logo.png`, copiado do repositório `Felipe-Portifolio`.
- Criada a estrutura `docs/relatorios/` e relatórios para todos os dias com atividade no Git:
  - `docs/relatorios/2026-04-28.md`
  - `docs/relatorios/2026-04-29.md`
  - `docs/relatorios/2026-04-30.md`
  - `docs/relatorios/README.md`

## Validacao

- `npm test`: passou com 118 testes.
- `npm run build`: passou após atualizar os tipos da bridge `window.felixo`.
- `npm run lint`: passou.
- `git diff --check`: passou.

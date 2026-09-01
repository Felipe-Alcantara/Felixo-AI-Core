# Felixo AI Core — Roadmap

Status: em desenvolvimento.
Última revisão: 2026-09-01.

> Este arquivo descreve direção de produto e ideias de contribuição. O estado
> entregue deve ser conferido no [`README.md`](../../README.md) e nos registros
> do [`IA.md`](IA.md); uma ideia aqui não significa que a funcionalidade já
> existe ou que há prazo de entrega.

## Direção do produto

O Felixo AI Core é uma aplicação desktop Linux-first, agora **canvas-first**:
agentes, terminais, arquivos, notas, grupos e páginas web convivem no mesmo
espaço e podem compartilhar contexto por conexões e arquivos Markdown.

O modo de chat foi depreciado. Ele continua no produto somente para abrir
sessões antigas e exportar dados legados. Não é uma frente de evolução: novas
experiências, ferramentas e capacidades devem nascer no canvas.

## Base entregue

### Canvas e execução

- Canvas persistente com nós de agentes, notas, arquivos, grupos e páginas web.
- Terminais PTY reais com `node-pty` e `xterm.js`, execução em background,
  gaveta lateral e estado visual por agente.
- Conexões entre agentes e arquivos compartilhados, com suporte a vários
  agentes ligados ao mesmo Markdown.
- Organização por matriz, repositório ou pasta, dock de elementos,
  notificações, QA Logger e superfícies que não se cobrem.
- Importação e exportação do manifesto portátil `.fxcanvas`.

### Providers, contas e uso

- Adapters e registry para Claude, Codex, Gemini, Codex App Server, Gemini ACP
  e launcher Openia, conforme as ferramentas instaladas.
- Perfis de conta isolados por terminal, sem exigir logout entre contas do
  mesmo provider.
- **Limites e uso** separado por conta, com fonte, horário de medição, estado
  atual/antigo/indisponível/erro e sem inventar quota ausente.
- Consulta ao `/status` do Claude em tempo real por conta/perfil, incluindo os
  dados completos e redigidos publicados pela CLI.

### Ferramentas e persistência

- Projetos e contexto Git, painel Git, Fetch All com plano de leitura e
  confirmação antes de pull/push/commit.
- Catálogo de prompts, skills incorporadas, automações e orquestrador com
  limites por execução, seleção de modelos e políticas de delegação.
- Banco SQLite, arquivos do canvas fora do repositório e entregas temporárias
  de contexto somente leitura.
- Launcher Python com menu, descoberta de Node/npm em múltiplos sistemas e
  atualização silenciosa da branch atual.

## Frentes prioritárias de contribuição

As frentes abaixo são oportunidades abertas, priorizadas pelo risco e pelo uso
observado. Elas não substituem uma task específica e devem ser detalhadas
contra o código antes de começar.

### 1. Desempenho e previsibilidade

- Permitir escolher e limitar as raízes da varredura do Fetch All; a busca
  ampla padrão pode visitar muitos diretórios antes de produzir um resultado.
- Instrumentar tempo por etapa, volume de diretórios e consumo de memória,
  preservando progresso e cancelamento seguros.
- ✅ Dividir o bundle inicial por carregamento sob demanda: canvas/chat,
  ferramentas, Markdown e runtime PTY têm fronteiras próprias; o entry caiu
  para 191,73 KiB (60,37 KiB gzip) e o build deixou de emitir o aviso de chunk
  grande. O benchmark Electron continua sendo o guard de startup, primeira
  interação, assets relativos e primeiro painel.
- Evitar trabalho duplicado no carregamento inicial do canvas, painéis e
  catálogos sem transformar dados antigos em estado incorreto.

### 2. Confiabilidade multi-SO

- Exercitar no CI e em máquinas reais os fluxos de PTY, login por perfil,
  clipboard, atualização e empacotamento em Linux, Windows e macOS.
- Cobrir falhas de rede, CLI ausente, credencial expirada, processo órfão e
  encerramento inesperado com mensagens recuperáveis.
- Manter a política de não destruir trabalho local durante update, Fetch All,
  importação ou remoção de perfil.

### 3. Uso por conta e providers

- Adicionar novas fontes somente quando o provider publicar uma API/comando
  estável para isso; continuar mostrando explicitamente quando não há cota
  consultável.
- Melhorar o diagnóstico de uma conta/perfil sem expor token, cookie, chave ou
  saída sensível nos logs, no painel ou nos relatórios.
- Aumentar a cobertura de cenários com várias contas reais do mesmo provider.

### 4. Orquestração no canvas

- Tornar pipelines gráficos mais expressivos, com dependências, retomada,
  cancelamento e aprovação visíveis no grafo.
- Exibir melhor custo, duração, modelo, erro e resultado de cada execução sem
  deslocar a responsabilidade de confirmação para ações sensíveis.
- Evoluir ferramentas MCP de leitura e adicionar confirmações auditáveis para
  futuras operações de escrita.

### 5. Experiência de contribuição e documentação

- Manter README, guias, arquitetura e `IA.md` sincronizados com o
  comportamento realmente entregue.
- Documentar skills e adapters com exemplos portáveis e sem dados privados.
- Criar smoke tests de instalação e atualização para que uma release seja
  reproduzível nos três sistemas suportados.

## Ideias de longo prazo

Estas ideias podem ser avaliadas depois que a base local estiver previsível:

- memória persistente com busca e relevância por projeto;
- plugins e marketplace de skills;
- integração com editores, calendários e serviços externos;
- IDE leve com editor, diff e Git assistidos por agentes;
- cliente-servidor para tarefas longas e acesso remoto;
- conexão com modelos locais e balanceamento de custo entre providers.

## Critério para considerar uma frente concluída

Uma mudança de roadmap só deve ser apresentada como entregue quando o código,
os testes automatizados, a documentação vigente e a validação observável no
app estiverem alinhados. Se algum deles ficar pendente, registre o limite no
`IA.md` e descreva a condição restante em vez de marcar a frente como pronta.

# Felixo AI Core — Roadmap e Objetivos

> **Ideia central:** criar uma aplicação desktop Linux-first para orquestrar múltiplas IAs de terminal em uma única interface, evoluindo de um protótipo simples para um projeto open source, depois para um sistema inteligente e, futuramente, para uma plataforma pessoal 24/7 acessível de qualquer dispositivo.

---

## Visão Geral

**Nome:** Felixo AI Core
**Categoria:** Orquestrador de IA / Desktop AI Workspace
**Plataforma inicial:** Linux Desktop
**Objetivo inicial:** controlar, em uma única tela, várias IAs já disponíveis no terminal.
**Objetivo futuro:** transformar o app em um cérebro inteligente capaz de escolher modelos, agentes, funções, repositórios e estratégias com base em custo, eficiência, contexto e objetivo da tarefa.

---

## Fase 1 — Protótipo Inicial ✅

### Objetivo

Criar uma primeira versão funcional e testável, com foco em usar as IAs que já estão disponíveis no terminal.

### Funcionalidades

- [x] Tela inicial com campo de prompt e área de resposta
- [x] Executar comandos de terminal a partir do frontend
- [x] Suporte a múltiplas IAs instaladas no terminal
- [x] Seletor visual de modelo/CLI antes de enviar o prompt
- [x] Resposta em streaming com append incremental
- [x] Botão de parar para interromper execução em andamento
- [x] Adapters para `claude`, `codex` e `gemini`
- [x] Testes unitários para adapters e leitura JSONL
- [x] Histórico básico por sessão (em memória, salvo ao iniciar novo chat)
- [x] Busca em tempo real no histórico de sessões
- [x] Gerenciamento de projetos Git (repositório único e workspace)
- [x] Contexto de projetos ativos injetado no prompt com diff entre mensagens
- [ ] Painel de terminal em tempo real (stdout/stderr bruto por thread)
- [ ] Sessão CLI persistente entre mensagens da mesma conversa
- [ ] Múltiplas threads simultâneas na mesma conversa
- [ ] Cadastrar e editar comandos locais manualmente
- [ ] Estrutura inicial de contas/perfis (mesmo que mockada)

---

## Frente Atual — Terminal Persistente e Painel de Output

### Contexto

Hoje cada mensagem spawna um processo CLI novo que encerra ao responder. O objetivo é tornar a sessão persistente e dar visibilidade ao que acontece dentro do terminal em tempo real.

### Etapa 1 — Painel de terminal em tempo real *(próxima)*

Barra lateral direita que exibe o output bruto (stdout/stderr) de cada processo CLI enquanto roda. Não requer interação direta — é observação.

- [ ] Painel recolhível à direita do chat
- [ ] Output bruto acumulado por `sessionId` (stdout + stderr)
- [ ] Atualização em tempo real via eventos IPC já existentes
- [ ] Indicador visual: rodando (pulsando), concluído, erro
- [ ] Scroll automático para o final, com lock quando o usuário rolar para cima
- [ ] IPC: novo evento `cli:raw-output` emitido a cada chunk de stdout/stderr

### Etapa 2 — Sessão CLI persistente

Manter o processo da CLI vivo entre mensagens da mesma conversa, enviando novos prompts via stdin sem spawnar um novo processo.

**Desafios por CLI:**

| CLI | Modo interativo | Estratégia |
|-----|----------------|------------|
| `claude` | `claude` (sem `--print`) aceita stdin contínuo | Enviar prompt via stdin, aguardar `result` no stdout |
| `codex` | Investigar suporte a stdin ou `--session` | A definir |
| `gemini` | Investigar | A definir |

- [ ] Investigar modo interativo de cada adapter
- [ ] Novo método `CliProcessManager.write(sessionId, prompt)` para stdin
- [ ] Adapter expõe `getInteractiveArgs()` além de `getSpawnArgs()`
- [ ] Reutilizar processo existente se `sessionId` de conversa estiver vivo
- [ ] Encerrar processo ao trocar modelo ou iniciar nova conversa

### Etapa 3 — Múltiplas threads simultâneas

Spawn de mais de uma CLI em paralelo na mesma conversa, cada uma com sua própria thread visível no painel direito.

- [ ] UI para criar nova thread manualmente
- [ ] Painel direito lista todas as threads com status individual
- [ ] Composer permite escolher em qual thread enviar o próximo prompt
- [ ] Threads podem ter modelos diferentes

---

## Fase 2 — MVP

### Objetivo

Transformar o protótipo em uma ferramenta utilizável no dia a dia, com organização mínima, persistência básica e suporte a fluxos de trabalho mais claros.

### Interface e experiência

- [ ] Lista de sessões recentes na sidebar
- [ ] Painel lateral de configurações rápidas
- [ ] Sistema de temas simples
- [ ] Atalhos de teclado básicos
- [ ] Mensagens de status: `rodando`, `aguardando`, `erro`, `finalizado`
- [ ] Tratamento visual de erros melhorado

### Prompts e padrões

- [ ] Gerenciador de prompts salvos
- [ ] Categorias de prompts (programação, estudo, resumo, revisão, documentação)
- [ ] Editar prompts diretamente na interface
- [ ] Aplicar prompt salvo sobre entrada do usuário

### Skills iniciais

- [ ] Skill de resumo
- [ ] Skill de relatório
- [ ] Skill de geração de documentação
- [ ] Skill de explicação de código
- [ ] Skill de revisão de código
- [ ] Skill de criação de checklist
- [ ] Skill de planejamento de tarefas

### Organização por projetos

- [ ] Criar conceito de workspace/projeto
- [ ] Alternar entre projetos
- [ ] Histórico separado por projeto
- [ ] Prompts favoritos por projeto
- [ ] Associar pasta local a um projeto

### Persistência

- [ ] Salvar configurações locais
- [ ] Salvar histórico de sessões
- [ ] Salvar lista de modelos/terminais cadastrados
- [ ] Salvar prompts personalizados
- [ ] Salvar projetos/workspaces

---

## Fase 3 — Projeto Open Source

### Objetivo

Preparar o projeto para ser publicado, entendido, instalado e expandido por outras pessoas.

### Repositório

- [ ] README completo com screenshots ou mockups
- [ ] Seção de instalação e uso básico
- [ ] Guia de contribuição
- [ ] Licença open source
- [ ] `.env.example` se necessário

### Qualidade do código

- [ ] Padronizar nomes de arquivos e funções
- [ ] Separar camadas: frontend, backend, execução, provedores, skills, persistência
- [ ] Tratamento de erros mais robusto

### Documentação técnica

- [ ] Documentar arquitetura inicial
- [ ] Documentar como adicionar uma nova IA
- [ ] Documentar como adicionar uma nova skill
- [ ] Documentar limitações conhecidas

### Publicação

- [ ] Criar primeira release experimental com tags de versão
- [ ] Criar issues iniciais com tarefas futuras
- [ ] Labels: `bug`, `feature`, `documentation`, `good first issue`

---

## Fase 4 — Orquestração Avançada

### Objetivo

Fazer o Felixo AI Core funcionar como um sistema de coordenação inteligente, não apenas uma interface para múltiplas IAs.

### Ferramentas externas

- [ ] Executar scripts locais
- [ ] Chamar APIs externas
- [ ] Integração com arquivos locais e repositórios Git
- [ ] Geração automática de documentos e relatórios

### Comunicação entre IAs

- [ ] Uma IA revisar a resposta de outra
- [ ] Uma IA gerar tarefa para outra
- [ ] Modo "debate entre modelos"
- [ ] Modo "revisor + executor"
- [ ] Modo "planejador + programador + crítico"
- [ ] Sistema de pipeline de agentes

### Escolha de modelo por tarefa

- [ ] Tabela de modelos com pontos fortes, custo, velocidade e limite de contexto
- [ ] Recomendação manual de modelo por tipo de tarefa
- [ ] Seleção automática inicial baseada em regras
- [ ] Fallback para outro modelo quando um falhar

### Economia de tokens e contexto

- [ ] Monitorar uso estimado de tokens por conversa
- [ ] Resumos automáticos de contexto
- [ ] Compactação de histórico
- [ ] Memória curta por sessão e longa por projeto
- [ ] Seleção de contexto relevante antes de enviar para a IA

### Agentes e repositórios

- [ ] Adicionar e configurar agentes com personalidade/função definida
- [ ] Associar agentes a projetos específicos
- [ ] Alternância de repositório em tempo real
- [ ] Histórico separado por repositório

---

## Fase 5 — Memória Persistente e Contexto Inteligente

### Objetivo

Criar um sistema de memória persistente para manter continuidade entre sessões sem depender de conversas gigantes ou repetição manual de contexto.

### Memória persistente

- [ ] Banco de memória local separado por escopo global e por projeto
- [ ] Salvar decisões automaticamente e permitir edição/remoção manual
- [ ] Busca semântica na memória
- [ ] Sistema de relevância para escolher o que enviar ao modelo

### Contexto em tempo real

- [ ] Trocar contexto (projeto, repositório, agente, modelo) sem reiniciar sessão
- [ ] Painel mostrando o contexto atual
- [ ] Aviso quando o contexto estiver incoerente

### Economia de janela de contexto

- [ ] Resumos hierárquicos da conversa
- [ ] Índice dos arquivos do projeto
- [ ] Busca de trechos relevantes
- [ ] Cache de respostas úteis
- [ ] Prompts modulares reutilizáveis

---

## Fase 6 — O Grande Cérebro

### Objetivo

O sistema escolhe qual IA, modelo, agente, estratégia e ferramenta usar para cada tarefa. O usuário delega objetivos, não microgerencia ferramentas.

### Decisão automática

- [ ] Classificador de tipo de tarefa (programação, escrita, resumo, análise, pesquisa, revisão, automação)
- [ ] Escolha de modelo por custo, velocidade, qualidade e disponibilidade

### Análise de eficiência

- [ ] Registrar tempo de resposta, qualidade percebida, custo estimado e taxa de erro por modelo
- [ ] Painel de desempenho e comparação entre modelos
- [ ] Recomendação baseada em histórico real de uso

### Autonomia controlada

- [ ] Modo manual, semiautomático e automático
- [ ] Limite de gasto por tarefa
- [ ] Confirmação antes de ações sensíveis
- [ ] Logs auditáveis de decisões
- [ ] Botão de emergência para interromper pipelines

---

## Fase 7 — Servidor Externo 24/7

### Objetivo

Transformar o Felixo AI Core em um sistema acessível de qualquer dispositivo, com servidor próprio rodando continuamente.

### Arquitetura cliente-servidor

- [ ] Separar frontend e backend com API própria
- [ ] Autenticação segura + HTTPS
- [ ] Painel web responsivo (desktop, mobile, navegador)
- [ ] Manter compatibilidade com app desktop

### Servidor pessoal

- [ ] Rodar backend em VPS ou servidor local
- [ ] Persistência remota, backups, logs, monitoramento e limites de uso

### Mini agente pessoal

- [ ] Agente sempre disponível acessível pelo celular
- [ ] Rodar tarefas longas no servidor
- [ ] Continuar conversas iniciadas no desktop
- [ ] Consultar memórias e documentos remotamente
- [ ] Receber notificações

### Modelos próprios

- [ ] Conectar modelos locais e remotos (open source)
- [ ] Configurar múltiplos provedores
- [ ] Balancear custo entre API externa e modelo próprio

---

## Frente Extra — Editor, IDE Simples e Git Integrado

### Objetivo

Adicionar uma camada de IDE leve e integrada, permitindo editar arquivos, navegar por repositórios e executar Git sem sair do app.

### Editor de código

- [ ] Painel de editor com árvore de arquivos
- [ ] Abrir, editar e salvar arquivos locais
- [ ] Destaque de sintaxe, numeração de linhas, busca no arquivo, múltiplas abas
- [ ] Enviar arquivo aberto ou trecho selecionado como contexto para uma IA

### IDE simples

- [ ] Terminal integrado
- [ ] Painel de problemas/logs
- [ ] Atalhos para instalar dependências, rodar testes e iniciar projeto
- [ ] IA explica, revisa e sugere alterações com confirmação antes de aplicar

### Git integrado

- [ ] Mostrar branch atual, arquivos modificados, staged/unstaged
- [ ] Visualizar diff, fazer add por arquivo ou total, criar commit
- [ ] Gerar mensagem de commit com IA
- [ ] Pull, push, trocar/criar branch
- [ ] Descartar alterações com confirmação forte

### Fluxo IA + IDE + Git

- [ ] Fluxo `planejar → editar → revisar → commitar`
- [ ] Fluxo `abrir issue → modificar código → testar → gerar commit`
- [ ] Pedir para a IA analisar alterações, explicar diff, revisar antes do commit

---

## Backlog de Ideias Futuras

- [ ] Marketplace de skills e sistema de plugins
- [ ] Integração com Obsidian, Discord, GitHub, VSCode, calendário
- [ ] Modo foco, modo estudo, modo documentação, modo pesquisa
- [ ] Sistema visual de pipelines
- [ ] Gráfico de custo por modelo e eficiência por tarefa
- [ ] Histórico pesquisável
- [ ] Exportação de conversas e relatórios
- [ ] Importação e compartilhamento de prompts/presets
- [ ] Modo ARG/enigmas

---

## Ordem Recomendada de Execução

### Bloco 1 — Protótipo funcional
- [x] Escolher stack
- [x] Criar tela desktop com campo de prompt e resposta
- [x] Rodar CLI de terminal pela interface
- [x] Capturar output em streaming
- [x] Suporte a Claude, Codex e Gemini
- [x] Histórico básico de sessão
- [x] Busca em tempo real no histórico
- [x] Gerenciamento de projetos Git com contexto no prompt
- [ ] Painel de terminal em tempo real (ver stdout/stderr bruto por thread)
- [ ] Sessão CLI persistente (manter processo vivo entre mensagens)
- [ ] Múltiplas threads simultâneas na mesma conversa

### Bloco 2 — Organização
- [ ] Histórico persistente
- [ ] Sistema de prompts salvos
- [ ] Projetos/workspaces
- [ ] Salvar configurações localmente

### Bloco 3 — Open Source
- [ ] Skills simples
- [ ] Documentação do projeto
- [ ] Publicar no GitHub com primeira release

### Bloco 4 — Inteligência
- [ ] Agentes
- [ ] Pipelines
- [ ] Memória persistente
- [ ] Escolha automática de modelo

### Bloco 5 — Plataforma
- [ ] Separar app em cliente e servidor
- [ ] Acesso remoto
- [ ] Servidor 24/7
- [ ] Mini agente pessoal multiplataforma

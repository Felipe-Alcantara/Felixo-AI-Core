# Felixo AI Core
 Felixo AI Core é o núcleo inteligente do ecossistema FelixoVerse: uma aplicação desktop para controlar, organizar e orquestrar múltiplas IAs, agentes, terminais, repositórios e fluxos de trabalho.

## Status Atual

O projeto foi iniciado com uma aplicação desktop em `app/`.

Stack inicial:

* Electron
* React
* TypeScript
* Vite
* Tailwind CSS

Primeira versão funcional:

* interface simples de chatbot;
* layout desktop com sidebar fixa e prompt central;
* seletor visual de agentes/CLIs;
* respostas locais para organizar ideias;
* front-end separado por feature em `app/src/features/chat/`;
* processo Electron modularizado como backend local;
* base pronta para conectar os scripts de `ai-clis/`.

### Como rodar

Atalho recomendado:

```bash
python3 start_app.py
```

Ou manualmente:

```bash
cd app
nvm use
npm install
npm run dev
```

Requisito recomendado: Node `25.9.0`, definido em `.nvmrc`.


# Felixo AI Core — Roadmap e Tasklist

> **Ideia central:** criar uma aplicação desktop Linux-first para orquestrar múltiplas IAs de terminal em uma única interface, evoluindo de um protótipo simples para um projeto open source, depois para um sistema inteligente e, futuramente, para uma plataforma pessoal 24/7 acessível de qualquer dispositivo.

---

## 0. Visão Geral do Projeto

**Nome provisório:** Felixo AI Core
**Categoria:** Orquestrador de IA / Desktop AI Workspace
**Plataforma inicial:** Linux Desktop
**Objetivo inicial:** controlar, em uma única tela, várias IAs já disponíveis no terminal.
**Objetivo futuro:** transformar o app em um cérebro inteligente capaz de escolher modelos, agentes, funções, repositórios e estratégias com base em custo, eficiência, contexto e objetivo da tarefa.

---

## 1. Identidade e Nome do Projeto

### Ideia de identidade

O projeto pode seguir uma identidade mais autoral, conectada ao ecossistema **FelixoVerse**, em vez de usar um nome genérico como `IA Center`.

A proposta é que o nome transmita a ideia de:

* central de inteligência;
* núcleo operacional;
* orquestração de modelos;
* ambiente pessoal de trabalho com IA;
* conexão com o universo FelixoVerse;
* ferramenta criada para produtividade, código, automação e agentes.

### Nome principal sugerido

## **Felixo AI Core**

### Por que funciona

* **Felixo** conecta o projeto diretamente à marca pessoal e ao FelixoVerse.
* **AI** deixa claro que o foco é inteligência artificial.
* **Core** passa a ideia de núcleo, cérebro, motor central e sistema base.

### Interpretação do nome

> **Felixo AI Core é o núcleo inteligente do ecossistema FelixoVerse: uma aplicação desktop para controlar, organizar e orquestrar múltiplas IAs, agentes, terminais, repositórios e fluxos de trabalho.**

### Possíveis variações

* [ ] Felixo AI Core
* [ ] Felixo Core AI
* [ ] FelixoVerse AI Core
* [ ] FelixCore AI
* [ ] Felixo Nexus
* [ ] Felixo Brain
* [ ] Felixo Command Center
* [ ] FelixOS AI
* [ ] FAI Core
* [ ] FX Core

### Direção recomendada por enquanto

Usar **Felixo AI Core** como nome provisório/principal durante o desenvolvimento inicial.

O nome pode evoluir depois, mas já cria uma identidade mais forte do que nomes genéricos como `IA Center`, `AI Hub` ou `AI Workspace`.

---

## 2. Fase 1 — Protótipo Inicial

### Objetivo

Criar uma primeira versão extremamente simples, funcional e testável, com foco em usar as IAs que já estão disponíveis no terminal.

A prioridade aqui não é beleza, arquitetura perfeita ou automação avançada. A prioridade é responder a esta pergunta:

> “Consigo controlar minhas IAs de terminal a partir de uma única interface?”

### Funcionalidades principais

* [ ] Criar uma tela inicial simples.
* [ ] Permitir executar comandos de terminal a partir do front-end.
* [ ] Adicionar suporte inicial a múltiplas IAs instaladas no terminal.
* [ ] Permitir escolher qual IA/modelo será usado antes de enviar o prompt.
* [ ] Criar campo de entrada de prompt.
* [ ] Criar área de resposta/output.
* [ ] Exibir logs básicos de execução.
* [ ] Permitir interromper uma execução em andamento.
* [ ] Permitir limpar a tela/output.

### Gerenciamento inicial

* [ ] Criar estrutura inicial para “contas” ou perfis.
* [ ] Adicionar opção visual de login, mesmo que ainda seja mockada.
* [ ] Adicionar opção visual de trocar de conta/perfil, mesmo que ainda seja simples.
* [ ] Criar configuração básica de caminhos/comandos das IAs.
* [ ] Permitir cadastrar comandos locais manualmente.
* [ ] Permitir editar/remover comandos cadastrados.

### Gerenciamento de terminais

* [ ] Criar sistema básico de múltiplos terminais.
* [ ] Permitir abrir nova instância de terminal.
* [ ] Permitir fechar uma instância de terminal.
* [ ] Permitir alternar entre terminais abertos.
* [ ] Identificar cada terminal por nome, exemplo: `Gemini`, `Claude`, `GPT CLI`, `Codex`, `Local Model`.
* [ ] Salvar histórico simples por terminal.

### Critério de conclusão da fase

A fase de protótipo estará concluída quando for possível:

* abrir o app;
* escolher uma IA/comando;
* enviar um prompt;
* ver a resposta na interface;
* alternar entre pelo menos duas instâncias de terminal;
* manter um histórico básico da sessão.

---

## 2. Fase 2 — MVP

### Objetivo

Transformar o protótipo em uma ferramenta realmente utilizável no dia a dia, com organização mínima, persistência básica e suporte a fluxos de trabalho mais claros.

Nesta fase, o app deixa de ser apenas uma tela de terminal e começa a virar um workspace de IA.

### Interface e experiência de uso

* [ ] Criar layout mais organizado com sidebar.
* [ ] Adicionar lista de IAs/modelos disponíveis.
* [ ] Adicionar lista de sessões recentes.
* [ ] Adicionar área central de conversa/output.
* [ ] Adicionar painel lateral de configurações rápidas.
* [ ] Criar sistema de temas simples.
* [ ] Criar atalhos de teclado básicos.
* [ ] Melhorar tratamento visual de erros.
* [ ] Criar mensagens de status, como `rodando`, `aguardando`, `erro`, `finalizado`.

### Prompts e padrões

* [ ] Criar gerenciador de prompts salvos.
* [ ] Criar categorias de prompts.
* [ ] Adicionar prompts para programação.
* [ ] Adicionar prompts para estudo.
* [ ] Adicionar prompts para resumo.
* [ ] Adicionar prompts para revisão de código.
* [ ] Adicionar prompts para documentação.
* [ ] Permitir editar prompts diretamente na interface.
* [ ] Permitir aplicar um prompt salvo sobre uma entrada do usuário.

### Skills iniciais

* [ ] Criar skill de resumo.
* [ ] Criar skill de relatório.
* [ ] Criar skill de geração de documentação.
* [ ] Criar skill de explicação de código.
* [ ] Criar skill de revisão de código.
* [ ] Criar skill de criação de checklist.
* [ ] Criar skill de planejamento de tarefas.

### Organização por projetos

* [ ] Criar conceito de workspace/projeto.
* [ ] Permitir criar um projeto.
* [ ] Permitir alternar entre projetos.
* [ ] Salvar histórico separado por projeto.
* [ ] Salvar prompts favoritos por projeto.
* [ ] Salvar comandos e IAs preferidas por projeto.
* [ ] Permitir associar uma pasta local a um projeto.

### Persistência básica

* [ ] Salvar configurações locais.
* [ ] Salvar histórico de sessões.
* [ ] Salvar lista de modelos/terminais cadastrados.
* [ ] Salvar prompts personalizados.
* [ ] Salvar projetos/workspaces.

### Critério de conclusão da fase

O MVP estará pronto quando o app já puder ser usado como ferramenta real para:

* alternar entre IAs;
* salvar prompts;
* organizar tarefas por projeto;
* executar skills simples;
* manter histórico;
* reduzir a necessidade de ficar alternando manualmente entre vários terminais.

---

## 3. Fase 3 — Projeto Open Source

### Objetivo

Preparar o projeto para ser publicado, entendido, instalado, testado e expandido por outras pessoas.

A prioridade aqui é transformar o app em algo apresentável e colaborativo.

### Organização do repositório

* [ ] Criar README completo.
* [ ] Explicar a ideia do projeto.
* [ ] Adicionar screenshots ou mockups.
* [ ] Criar seção de instalação.
* [ ] Criar seção de uso básico.
* [ ] Criar seção de roadmap.
* [ ] Criar guia de contribuição.
* [ ] Criar licença open source.
* [ ] Criar arquivo `.env.example`, se necessário.
* [ ] Criar estrutura clara de pastas.

### Qualidade do código

* [ ] Padronizar nomes de arquivos e funções.
* [ ] Adicionar comentários importantes.
* [ ] Separar front-end, back-end e camada de execução.
* [ ] Criar camada para provedores/modelos.
* [ ] Criar camada para skills.
* [ ] Criar camada para gerenciamento de projetos.
* [ ] Criar camada para persistência local.
* [ ] Adicionar tratamento de erros mais robusto.

### Primeira documentação técnica

* [ ] Documentar arquitetura inicial.
* [ ] Documentar como adicionar uma nova IA.
* [ ] Documentar como adicionar uma nova skill.
* [ ] Documentar como configurar comandos locais.
* [ ] Documentar limitações conhecidas.
* [ ] Documentar próximos passos.

### Publicação

* [ ] Criar repositório no GitHub.
* [ ] Criar primeira release experimental.
* [ ] Adicionar tags de versão.
* [ ] Criar issues iniciais com tarefas futuras.
* [ ] Criar labels como `bug`, `feature`, `documentation`, `good first issue`.
* [ ] Adicionar aviso de projeto experimental.

### Critério de conclusão da fase

A fase open source estará concluída quando outra pessoa conseguir:

* acessar o repositório;
* entender a proposta;
* instalar o projeto;
* executar o app;
* cadastrar uma IA de terminal;
* contribuir com uma skill ou melhoria simples.

---

## 4. Fase 4 — Orquestração Avançada

### Objetivo

Fazer o Felixo AI Core deixar de ser apenas uma interface para múltiplas IAs e começar a funcionar como um sistema de coordenação inteligente.

Aqui entram integração entre modelos, agentes, ferramentas externas e controle de contexto.

### Funções externas e ferramentas

* [ ] Criar sistema de ferramentas externas.
* [ ] Permitir executar scripts locais.
* [ ] Permitir chamar APIs externas.
* [ ] Permitir conectar ferramentas de documentação.
* [ ] Permitir conectar ferramentas de organização pessoal.
* [ ] Criar integração com arquivos locais.
* [ ] Criar integração com repositórios Git.
* [ ] Permitir leitura controlada de arquivos do projeto.
* [ ] Permitir geração automática de documentos.
* [ ] Permitir geração automática de relatórios.

### Comunicação entre IAs

* [ ] Permitir que uma IA revise a resposta de outra.
* [ ] Permitir que uma IA gere uma tarefa para outra.
* [ ] Permitir usar funções do Claude com respostas do GPT.
* [ ] Permitir usar funções do GPT com respostas do Claude.
* [ ] Criar modo “debate entre modelos”.
* [ ] Criar modo “revisor + executor”.
* [ ] Criar modo “planejador + programador + crítico”.
* [ ] Criar sistema de pipeline de agentes.

### Escolha de modelo por tarefa

* [ ] Criar tabela de modelos disponíveis.
* [ ] Registrar pontos fortes de cada modelo.
* [ ] Registrar custo estimado de cada modelo.
* [ ] Registrar velocidade média de cada modelo.
* [ ] Registrar limite de contexto de cada modelo.
* [ ] Criar recomendação manual de modelo por tipo de tarefa.
* [ ] Criar seleção automática inicial baseada em regras.
* [ ] Criar fallback para outro modelo quando um falhar.

### Economia de tokens e contexto

* [ ] Monitorar uso estimado de tokens.
* [ ] Monitorar limite de contexto por modelo.
* [ ] Avisar quando a conversa estiver ficando grande.
* [ ] Criar resumos automáticos de contexto.
* [ ] Criar compactação de histórico.
* [ ] Criar memória curta por sessão.
* [ ] Criar memória longa por projeto.
* [ ] Criar seleção de contexto relevante antes de enviar para a IA.
* [ ] Evitar mandar arquivos inteiros quando apenas trechos forem necessários.

### Agentes e repositórios

* [ ] Permitir adicionar novos agentes.
* [ ] Permitir configurar personalidade/função de cada agente.
* [ ] Permitir associar agentes a projetos específicos.
* [ ] Permitir adicionar novos repositórios.
* [ ] Permitir alternar repositórios em tempo real.
* [ ] Permitir que agentes consultem repositórios separados.
* [ ] Criar histórico separado por repositório.
* [ ] Criar mudança rápida de contexto entre projetos.

### Critério de conclusão da fase

Esta fase estará concluída quando o app conseguir coordenar múltiplas IAs e agentes em fluxos reais, como:

* uma IA planeja;
* outra executa;
* outra revisa;
* outra resume;
* o sistema mantém contexto e reduz gasto desnecessário.

---

## 5. Fase 5 — Memória Persistente e Contexto Inteligente

### Objetivo

Criar um sistema de memória persistente que permita ao Felixo AI Core lembrar projetos, decisões, preferências, padrões de trabalho, arquivos importantes e histórico útil sem desperdiçar janela de contexto.

### Memória persistente

* [ ] Criar banco de memória local.
* [ ] Separar memória global e memória por projeto.
* [ ] Salvar decisões importantes automaticamente.
* [ ] Permitir salvar memórias manualmente.
* [ ] Permitir editar memórias.
* [ ] Permitir apagar memórias.
* [ ] Criar busca semântica na memória.
* [ ] Criar resumo de memória por projeto.
* [ ] Criar sistema de relevância para escolher o que enviar ao modelo.

### Contexto em tempo real

* [ ] Permitir trocar de contexto sem reiniciar sessão.
* [ ] Permitir mudar de projeto durante uma conversa.
* [ ] Permitir alternar repositório ativo.
* [ ] Permitir alternar agente ativo.
* [ ] Permitir alternar modelo ativo.
* [ ] Criar painel mostrando o contexto atual.
* [ ] Criar aviso quando o contexto estiver incoerente.

### Economia de janela de contexto

* [ ] Criar resumos hierárquicos da conversa.
* [ ] Criar índice dos arquivos do projeto.
* [ ] Criar busca de trechos relevantes.
* [ ] Criar sistema de contexto mínimo necessário.
* [ ] Evitar repetição de instruções longas.
* [ ] Criar prompts modulares reutilizáveis.
* [ ] Criar cache de respostas úteis.

### Critério de conclusão da fase

Esta fase estará concluída quando o app conseguir manter continuidade entre sessões sem depender de conversas gigantes ou repetição manual de contexto.

---

## 6. Fase 6 — O Grande Cérebro

### Objetivo

Evoluir o Felixo AI Core para um sistema inteligente de tomada de decisão, onde o próprio programa escolhe qual IA, modelo, agente, estratégia e ferramenta usar para cada tarefa.

Nesta fase, o usuário deixa de escolher tudo manualmente e passa a delegar objetivos.

### Decisão automática

* [ ] Criar classificador de tipo de tarefa.
* [ ] Identificar se a tarefa é programação, escrita, resumo, análise, planejamento, pesquisa, revisão ou automação.
* [ ] Criar matriz de escolha de modelo.
* [ ] Escolher modelo com base em custo.
* [ ] Escolher modelo com base em velocidade.
* [ ] Escolher modelo com base em qualidade esperada.
* [ ] Escolher modelo com base em limite de contexto.
* [ ] Escolher modelo com base em disponibilidade.

### Análise de eficiência

* [ ] Registrar tempo de resposta por modelo.
* [ ] Registrar qualidade percebida da resposta.
* [ ] Registrar custo estimado.
* [ ] Registrar taxa de erro.
* [ ] Registrar número de tentativas necessárias.
* [ ] Criar painel de desempenho dos modelos.
* [ ] Criar comparação entre modelos.
* [ ] Criar recomendação baseada em histórico real de uso.

### Testes e avaliação

* [ ] Criar testes padronizados por tipo de tarefa.
* [ ] Testar modelos em tarefas de código.
* [ ] Testar modelos em tarefas de resumo.
* [ ] Testar modelos em tarefas de documentação.
* [ ] Testar modelos em tarefas criativas.
* [ ] Testar modelos em tarefas longas.
* [ ] Gerar relatórios automáticos de desempenho.

### Autonomia controlada

* [ ] Criar modo manual.
* [ ] Criar modo semiautomático.
* [ ] Criar modo automático.
* [ ] Criar limite de gasto por tarefa.
* [ ] Criar confirmação antes de ações sensíveis.
* [ ] Criar logs auditáveis de decisões.
* [ ] Criar botão de emergência para interromper pipelines.

### Critério de conclusão da fase

Esta fase estará concluída quando o usuário puder dizer algo como:

> “Crie uma documentação completa desse repositório e escolha o melhor fluxo para isso.”

E o Felixo AI Core conseguir:

* entender a tarefa;
* escolher modelos;
* dividir subtarefas;
* executar agentes;
* revisar resultado;
* gerar entrega final;
* registrar custo, tempo e eficiência.

---

## 7. Fase 7 — Servidor Externo 24/7

### Objetivo

Transformar o Felixo AI Core em um sistema acessível de qualquer dispositivo, com servidor próprio rodando continuamente, mantendo modelos, agentes, chats, funções, memória e contexto pessoal disponíveis em qualquer lugar.

### Arquitetura cliente-servidor

* [ ] Separar front-end e back-end.
* [ ] Criar API do Felixo AI Core.
* [ ] Criar autenticação segura.
* [ ] Criar painel web responsivo.
* [ ] Permitir acesso por desktop.
* [ ] Permitir acesso por celular.
* [ ] Permitir acesso por navegador.
* [ ] Manter compatibilidade com app desktop.

### Servidor pessoal

* [ ] Rodar o back-end em VPS ou servidor local.
* [ ] Configurar persistência remota.
* [ ] Configurar backups.
* [ ] Configurar logs.
* [ ] Configurar monitoramento.
* [ ] Configurar limites de uso.
* [ ] Configurar autenticação forte.
* [ ] Configurar HTTPS.

### Mini agente pessoal

* [ ] Criar agente pessoal sempre disponível.
* [ ] Permitir conversar com o agente pelo celular.
* [ ] Permitir acessar projetos remotamente.
* [ ] Permitir rodar tarefas longas no servidor.
* [ ] Permitir receber notificações.
* [ ] Permitir continuar conversas iniciadas no desktop.
* [ ] Permitir consultar memórias e documentos.

### Modelos próprios

* [ ] Permitir conectar modelos locais.
* [ ] Permitir conectar modelos remotos.
* [ ] Permitir rodar modelos open source.
* [ ] Permitir configurar provedores diferentes.
* [ ] Permitir escolher onde cada tarefa será executada.
* [ ] Permitir balancear custo entre API externa e modelo próprio.

### Critério de conclusão da fase

Esta fase estará concluída quando o Felixo AI Core puder funcionar como uma central pessoal de IA 24/7, acessível de qualquer dispositivo, com memória, agentes, funções e modelos próprios.

---

## 8. Frente Extra — Editor, IDE Simples e Git Integrado

### Objetivo

Adicionar ao Felixo AI Core uma camada de IDE simples, bonita e intuitiva, permitindo editar arquivos, navegar por repositórios e executar comandos Git básicos sem sair da aplicação.

A ideia não é competir com VSCode, JetBrains ou editores completos no começo. O objetivo inicial é criar uma experiência integrada parecida com um ambiente de trabalho com IA, onde o usuário possa:

* conversar com modelos;
* abrir arquivos;
* editar código;
* revisar alterações;
* executar comandos Git;
* pedir ajuda da IA sobre o próprio repositório;
* aplicar mudanças com mais controle.

### Editor de código

* [ ] Criar painel de editor de arquivos.
* [ ] Adicionar árvore de arquivos do projeto.
* [ ] Permitir abrir arquivos locais.
* [ ] Permitir editar arquivos.
* [ ] Permitir salvar arquivos.
* [ ] Adicionar destaque de sintaxe.
* [ ] Adicionar numeração de linhas.
* [ ] Adicionar busca dentro do arquivo.
* [ ] Adicionar múltiplas abas de arquivos.
* [ ] Adicionar tema claro/escuro.
* [ ] Criar layout dividido entre chat, terminal e editor.
* [ ] Permitir enviar arquivo aberto como contexto para uma IA.
* [ ] Permitir enviar trecho selecionado como contexto para uma IA.

### Recursos de IDE simples

* [ ] Criar painel de terminal integrado.
* [ ] Criar painel de problemas/logs.
* [ ] Criar painel de tarefas do projeto.
* [ ] Permitir rodar scripts comuns do projeto.
* [ ] Permitir configurar comandos personalizados por projeto.
* [ ] Criar atalhos para instalar dependências, rodar testes e iniciar projeto.
* [ ] Permitir que a IA explique arquivos do projeto.
* [ ] Permitir que a IA revise código selecionado.
* [ ] Permitir que a IA sugira alterações sem aplicar automaticamente.
* [ ] Permitir aplicar mudanças sugeridas com confirmação.

### Git integrado

* [ ] Detectar se o projeto atual é um repositório Git.
* [ ] Mostrar branch atual.
* [ ] Mostrar arquivos modificados.
* [ ] Mostrar arquivos staged e unstaged.
* [ ] Permitir visualizar diff de arquivos.
* [ ] Permitir executar `git status`.
* [ ] Permitir executar `git add` por arquivo.
* [ ] Permitir executar `git add .`.
* [ ] Permitir criar commit.
* [ ] Permitir gerar mensagem de commit com IA.
* [ ] Permitir executar `git commit`.
* [ ] Permitir executar `git pull`.
* [ ] Permitir executar `git push`.
* [ ] Permitir trocar de branch.
* [ ] Permitir criar branch nova.
* [ ] Permitir descartar alterações com confirmação forte.
* [ ] Adicionar logs de ações Git.

### Fluxo IA + IDE + Git

* [ ] Permitir pedir para a IA analisar alterações atuais.
* [ ] Permitir pedir para a IA explicar o diff.
* [ ] Permitir pedir para a IA revisar antes do commit.
* [ ] Permitir pedir para a IA gerar mensagem de commit.
* [ ] Permitir pedir para a IA sugerir próximos passos no repositório.
* [ ] Permitir que agentes diferentes analisem o mesmo código.
* [ ] Criar fluxo `planejar -> editar -> revisar -> commitar`.
* [ ] Criar fluxo `abrir issue -> modificar código -> testar -> gerar commit`.

### Critério de conclusão da frente

Esta frente estará funcional quando o usuário puder abrir um repositório, editar arquivos, consultar a IA sobre o código, revisar mudanças e executar comandos Git básicos sem sair do Felixo AI Core.

---

## 9. Backlog de Ideias Futuras

* [ ] Marketplace de skills.
* [ ] Sistema de plugins.
* [ ] Integração com Obsidian.
* [ ] Integração com Discord.
* [ ] Integração com GitHub.
* [ ] Integração com VSCode.
* [ ] Integração com calendário.
* [ ] Integração com tarefas pessoais.
* [ ] Modo foco para programação.
* [ ] Modo estudo.
* [ ] Modo produção musical.
* [ ] Modo documentação.
* [ ] Modo pesquisa.
* [ ] Modo ARG/enigmas.
* [ ] Sistema visual de pipelines.
* [ ] Gráfico de custo por modelo.
* [ ] Gráfico de eficiência por tarefa.
* [ ] Histórico pesquisável.
* [ ] Exportação de conversas.
* [ ] Exportação de relatórios.
* [ ] Importação de prompts.
* [ ] Compartilhamento de presets.

---

## 9. Ordem Recomendada de Execução

### Primeiro bloco

* [ ] Escolher stack inicial.
* [ ] Criar tela desktop simples.
* [ ] Rodar comando de terminal pela interface.
* [ ] Capturar output do terminal.
* [ ] Cadastrar primeira IA.
* [ ] Cadastrar segunda IA.
* [ ] Alternar entre elas.

### Segundo bloco

* [ ] Criar histórico básico.
* [ ] Criar sistema de prompts salvos.
* [ ] Criar projetos/workspaces.
* [ ] Salvar configurações localmente.

### Terceiro bloco

* [ ] Criar skills simples.
* [ ] Criar documentação do projeto.
* [ ] Publicar no GitHub.
* [ ] Preparar primeira versão open source.

### Quarto bloco

* [ ] Criar agentes.
* [ ] Criar pipelines.
* [ ] Criar memória persistente.
* [ ] Criar escolha automática de modelo.

### Quinto bloco

* [ ] Separar app em cliente e servidor.
* [ ] Criar acesso remoto.
* [ ] Rodar servidor 24/7.
* [ ] Criar mini agente pessoal multiplataforma.

---

## 10. Definição Simples do MVP

O MVP não precisa ser perfeito. Ele só precisa provar que o fluxo funciona.

### MVP mínimo aceitável

* [ ] App desktop abre.
* [ ] Usuário cadastra comandos de IA.
* [ ] Usuário escolhe uma IA.
* [ ] Usuário envia prompt.
* [ ] App executa no terminal por trás.
* [ ] App mostra resposta.
* [ ] App salva histórico.
* [ ] Usuário troca de IA sem sair da tela.
* [ ] Usuário salva prompts úteis.

Se isso funcionar, o projeto já existe de verdade.

---

## 11. Frase-guia do Projeto

> **Pare de trocar de IA. Comece a orquestrar.**

---

## 12. Notas de Direção

* O começo deve ser simples.
* Não tentar construir o “grande cérebro” logo no início.
* Primeiro, resolver o problema real: reduzir o atrito de usar várias IAs no terminal.
* Depois, adicionar organização.
* Depois, adicionar inteligência.
* Depois, adicionar autonomia.
* Depois, transformar em plataforma.

---

## 13. Próxima Decisão Importante

Antes de codar, definir:

* [ ] Stack do app desktop.
* [ ] Como executar comandos de terminal com segurança.
* [ ] Como armazenar configurações locais.
* [ ] Como representar IAs/modelos/agentes internamente.
* [ ] Como separar protótipo, MVP e versão open source.

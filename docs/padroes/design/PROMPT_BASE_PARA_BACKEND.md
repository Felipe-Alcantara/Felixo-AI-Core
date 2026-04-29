# 🚀 PROMPT BASE PARA DESENVOLVIMENTO BACKEND

> **Objetivo**: Este arquivo é um **guia técnico para o desenvolvedor montar prompts de backend mais completos e mais úteis logo na primeira interação**.
>
> **Uso correto**: Ele não existe para gerar um prompt genérico do zero. Ele existe para ajudar você a descrever o sistema com decisões técnicas claras, reduzindo re-prompts, ambiguidades e retrabalho.
>
> **Regra central**: Todo prompt montado a partir deste arquivo deve mandar a IA seguir [`DESIGN_SYSTEM_PARA_BACKEND.md`](i:\Programação\GitHub\Projetos\Felixo%20System%20Design\PADRÕES%20DE%20DESIGN\DESIGN_SYSTEM_PARA_BACKEND.md#L1) como **contrato de qualidade**. A IA não deve inventar o padrão de backend do zero se o acervo já define princípios, qualidade e filosofia de construção.

---

## 1. PAPEL DESTE ARQUIVO

Use este documento quando você quiser que a IA já comece com contexto técnico suficiente para:

- propor arquitetura com menos suposição
- escolher stack com mais precisão
- entender limites reais do sistema
- levar em conta problemas atuais do projeto
- considerar futuras features desde o início
- seguir o padrão do `Felixo System Design` sem precisar ser relembrada a cada resposta

Se o backend já existe, este arquivo deve ajudar a IA a entender:

- o que já está pronto
- o que está errado hoje
- o que precisa mudar agora
- o que provavelmente será adicionado depois

---

## 2. COMO PREENCHER BEM

Este prompt base funciona melhor quando você toma decisões explícitas sobre:

- tipo de sistema
- stack preferida
- requisitos funcionais
- regras de negócio
- integrações externas
- problemas atuais
- backlog / futuras features
- restrições técnicas
- expectativa de arquitetura

Se algo ainda não estiver decidido:

- escreva `A definir`
- ou descreva 2 opções com trade-off

Não deixe silencioso o que pode gerar arquitetura errada.

---

## 3. STACKS RECOMENDADAS NO FELIXO SYSTEM DESIGN

Esta seção existe para guiar o desenvolvedor na escolha da base técnica antes de montar o prompt.

### 3.1 Escolha padrão para a maioria dos backends

**Stack sugerida**:

- Python
- Django
- Django REST Framework
- SQLite
- pytest

**Quando usar**:

- APIs CRUD
- sistemas internos
- painéis administrativos
- produtos com autenticação, regras de negócio e persistência tradicional
- backends que precisam crescer com estrutura e velocidade de desenvolvimento

**Por que essa é a base padrão do acervo**:

- reduz decisões desnecessárias no começo
- já entrega estrutura sólida para domínio, admin, autenticação e ORM
- combina bem com a filosofia de monólito modular

**Banco preferido nesse cenário**:

- prefira **SQLite** quando o projeto ainda couber bem em uma base simples, local, leve e de baixa complexidade operacional
- se o sistema deixar de caber bem em SQLite, suba para **PostgreSQL**

### 3.2 Quando já existe necessidade de processamento assíncrono

**Stack sugerida**:

- Python
- Django
- Django REST Framework
- PostgreSQL
- Celery
- Redis
- pytest

**Quando usar**:

- filas
- envio de email em background
- integrações lentas
- importações pesadas
- agendamentos e jobs recorrentes

**Observação sobre banco**:

- nesse cenário, **PostgreSQL** tende a ser mais adequado que SQLite
- especialmente quando houver concorrência maior, múltiplos workers, crescimento de volume ou necessidade operacional mais robusta

### 3.3 Quando o contexto exigir ecossistema Node

**Stack sugerida**:

- TypeScript
- Fastify
- SQLite ou PostgreSQL
- Vitest

**Quando usar**:

- serviços fortemente acoplados ao ecossistema JS
- integrações em que TypeScript traga ganho real
- serviços menores e específicos no universo Node

**Observação**:

- use essa opção quando houver motivo claro
- se não houver um motivo técnico real, continue preferindo Python + Django

### 3.4 Para scripts e automações pequenas

**Stack sugerida**:

- Python
- `argparse` ou `Typer`
- pytest

**Quando usar**:

- scripts utilitários
- automações locais
- pipelines simples
- ferramentas de produtividade

### 3.5 Quando NÃO começar com .NET

Só use **C#/.NET** quando existir uma exigência concreta, como:

- ecossistema corporativo obrigatório
- integração com legado
- demanda operacional já definida nesse stack

Se não houver isso, não use .NET só por hábito.

### 3.6 Regra de escolha de banco no acervo

Use esta regra como padrão:

- **SQLite é o banco preferível por padrão**
- **PostgreSQL entra quando SQLite não couber bem**

Sinais de que **SQLite ainda cabe**:

- projeto pequeno ou médio
- MVP
- automações
- sistemas locais ou de baixo volume
- backend com pouca concorrência
- ambiente simples de setup

Sinais de que vale migrar para **PostgreSQL**:

- múltiplos usuários concorrentes
- workers assíncronos
- filas
- necessidade maior de robustez operacional
- consultas mais complexas
- crescimento previsível de volume e estrutura relacional

---

## 4. DECISÕES TÉCNICAS QUE MAIS EVITAM RE-PROMPTS

Se você preencher apenas parte do prompt, priorize estes blocos:

- objetivo do sistema
- estado atual do projeto
- problemas atuais
- requisitos funcionais da etapa
- futuras features esperadas
- stack escolhida
- banco de dados
- integrações externas
- autenticação/autorização
- necessidade de filas, cron, upload, storage e versionamento
- formato de resposta e erro da API

Esses pontos economizam a maior parte das perguntas repetidas.

---

## 5. PROMPT BASE GUIADO

Copie, preencha e adapte:

```markdown
Você é um engenheiro backend sênior.

Antes de propor arquitetura ou escrever código, leia e siga o arquivo `DESIGN_SYSTEM_PARA_BACKEND.md` como padrão obrigatório de qualidade.

Não invente o padrão técnico do zero se o arquivo já definir princípios, filosofia de construção, separação de camadas, testes, Open/Closed, documentação viva e critérios de manutenção.

Se houver qualquer desvio em relação ao `DESIGN_SYSTEM_PARA_BACKEND.md`, justifique tecnicamente.

# 1. IDENTIFICAÇÃO DO PROJETO
- Nome do projeto:
- Tipo de sistema:
  Exemplo: API REST, automação, worker, integração, script, CLI, painel administrativo.
- Estado atual:
  Exemplo: ideia, MVP, sistema existente, refatoração, manutenção.
- Objetivo principal:
- Resultado esperado desta etapa:

# 2. CONTEXTO DO SISTEMA
- Problema que o sistema resolve:
- Quem usa o sistema:
- Fluxo principal de valor:
- O que está explicitamente fora do escopo:

# 3. ESTADO ATUAL DO PROJETO
- O projeto já existe? [sim/não]
- Stack atual:
- Estrutura atual:
- Módulos já implementados:
- O que já funciona:
- O que está incompleto:
- O que está ruim hoje:

# 4. PROBLEMAS ATUAIS
- Bug conhecido 1:
- Bug conhecido 2:
- Gargalo técnico:
- Débito técnico relevante:
- Comportamento inconsistente atual:

# 5. FUTURAS FEATURES / EVOLUÇÃO ESPERADA
- Feature futura 1:
- Feature futura 2:
- Feature futura 3:
- Partes do sistema que provavelmente vão crescer:
- Pontos onde vale planejar extensão desde já:

# 6. REQUISITOS FUNCIONAIS DA ETAPA
- RF01:
- RF02:
- RF03:
- RF04:

# 7. REGRAS DE NEGÓCIO
- Regra 1:
- Regra 2:
- Regra 3:
- Restrições críticas:
- Validações obrigatórias:

# 8. DADOS E DOMÍNIO
- Entidades principais:
- Campos importantes:
- Relacionamentos importantes:
- Eventos importantes do domínio:
- Dados sensíveis:
- Necessidade de histórico / auditoria:
- Volume esperado:

# 9. API E CONTRATOS
- Interface principal: [API REST / CLI / webhook / jobs / script]
- Padrão de resposta esperado:
- Padrão de erro esperado:
- Precisa paginação?
- Precisa filtros?
- Precisa ordenação?
- Precisa versionamento de API?

# 10. INTEGRAÇÕES EXTERNAS
- Integração 1:
  - finalidade:
  - criticidade:
  - direção: entrada / saída / ambos
- Integração 2:
  - finalidade:
  - criticidade:
  - direção:
- Precisa email?
- Precisa storage?
- Precisa webhooks?
- Precisa fila assíncrona?

# 11. STACK E INFRA
- Linguagem escolhida:
- Framework escolhido:
- Banco de dados:
- Cache:
- Filas/jobs:
- Hospedagem:
- Sistema operacional alvo:
- Restrições obrigatórias:
- Tecnologias proibidas ou indesejadas:

# 12. ESCOLHA TÉCNICA BASE
- Se não houver motivo contrário, use a stack mais alinhada com o Felixo System Design
- Se este projeto for um backend padrão, prefira Python + Django + DRF + SQLite + pytest
- Se SQLite não couber bem para o cenário, use PostgreSQL e explique por quê
- Se houver processamento assíncrono forte, considere PostgreSQL + Celery + Redis
- Se houver exigência real de ecossistema Node, considere TypeScript + Fastify
- Se você sugerir outra base, explique por quê

# 13. EXPECTATIVAS DE ARQUITETURA
- Quero monólito modular ou serviço separado?
- Precisa autenticação? Qual tipo?
- Precisa autorização por perfil/permissão?
- Precisa upload de arquivos?
- Precisa cron/agendamento?
- Precisa processamento assíncrono?
- Precisa multi-tenant?
- Precisa logs estruturados?
- Precisa observabilidade além de logs?

# 14. FILOSOFIA DE CONSTRUÇÃO
- Pense primeiro na ferramenta reutilizável antes da solução específica
- Estruture o sistema para extensão com mínimo de modificação no núcleo
- Sempre que houver variações previsíveis de comportamento, considere Strategy, adaptadores, handlers ou políticas
- Comece pelos testes sempre que possível: comportamento -> teste -> implementação -> refatoração

# 15. DOCUMENTAÇÃO VIVA
- Atualize `README.md` e `IA.md` em tempo real sempre que o estado do projeto mudar
- Registre decisões técnicas, testes relevantes, bugs corrigidos, limitações e próximos passos
- Não deixe a documentação para o fim

# 16. FORMA DE TRABALHAR
Antes de implementar:
- analise o problema por completo
- use o `DESIGN_SYSTEM_PARA_BACKEND.md` como base de qualidade
- proponha arquitetura, estrutura de pastas e dependências
- destaque dúvidas, riscos e trade-offs
- identifique pontos de extensão para evitar modificações recorrentes no núcleo
- não assuma pontos ambíguos sem sinalizar

Durante a implementação:
- trabalhe por etapas pequenas e verificáveis
- mantenha separação clara de responsabilidades
- comece pelos testes sempre que possível
- prefira soluções moldáveis por composição quando houver variações previsíveis
- escreva ou atualize testes para fluxos críticos
- documente decisões importantes
- atualize `README.md` e `IA.md` em tempo real sempre que o estado do projeto mudar
- seja conservador com dados e operações destrutivas

Na entrega de cada etapa:
- resuma o que foi feito
- liste arquivos alterados
- diga quais testes foram executados
- confirme que `README.md` e `IA.md` foram atualizados naquela etapa
- aponte riscos, pendências e próximos passos

# 17. O QUE EU ESPERO DA RESPOSTA
1. entendimento do problema
2. leitura técnica do estado atual
3. análise de riscos e pontos ambíguos
4. proposta técnica inicial
5. definição da ferramenta/base reutilizável antes da solução específica
6. pontos de extensão planejados para manter o núcleo fechado para modificação frequente
7. estrutura sugerida do projeto
8. dependências necessárias
9. plano de implementação em etapas

Se faltar informação importante, pergunte de forma objetiva.
```

---

## 6. EXEMPLOS DE ESCOLHA TÉCNICA

### Caso 1: API administrativa com regras de negócio e autenticação

**Escolha sugerida**:

- Python
- Django
- Django REST Framework
- SQLite
- pytest

**Como descrever no prompt**:

```markdown
- Linguagem escolhida: Python
- Framework escolhido: Django + DRF
- Banco de dados: SQLite
- Tipo de arquitetura desejada: monólito modular
- Precisa autenticação? Sim
- Precisa autorização por perfil/permissão? Sim
```

### Caso 2: API com jobs assíncronos, integrações e processamento pesado

**Escolha sugerida**:

- Python
- Django
- Django REST Framework
- PostgreSQL
- Celery
- Redis
- pytest

**Como descrever no prompt**:

```markdown
- Linguagem escolhida: Python
- Framework escolhido: Django + DRF
- Banco de dados: PostgreSQL
- Filas/jobs: Celery + Redis
- Precisa processamento assíncrono? Sim
- Precisa cron/agendamento? Sim
```

### Caso 3: Serviço menor no ecossistema Node

**Escolha sugerida**:

- TypeScript
- Fastify
- SQLite ou PostgreSQL, conforme carga e concorrência
- Vitest

**Como descrever no prompt**:

```markdown
- Linguagem escolhida: TypeScript
- Framework escolhido: Fastify
- Banco de dados: SQLite se o serviço for pequeno; PostgreSQL se houver concorrência maior ou necessidade operacional mais robusta
- Motivo para não usar Django: integração forte com stack Node já existente
```

---

## 7. VERSÃO RÁPIDA

Quando quiser algo mais direto, use:

```markdown
Você é um engenheiro backend sênior.

Siga `DESIGN_SYSTEM_PARA_BACKEND.md` como padrão obrigatório de qualidade. Não proponha um backend ignorando esse arquivo.

# PROJETO
- Nome:
- Tipo:
- Estado atual:
- Objetivo:

# ESTADO ATUAL E PROBLEMAS
- O que já existe:
- Problemas atuais:
- Bugs conhecidos:

# REQUISITOS E EVOLUÇÃO
- RF01:
- RF02:
- RF03:
- Futuras features:

# STACK E ARQUITETURA
- Linguagem/framework:
- Banco:
- Integrações:
- Autenticação:
- Jobs/filas:
- Restrições obrigatórias:

# FORMA DE CONSTRUÇÃO
- pense primeiro na ferramenta reutilizável antes da solução específica
- planeje pontos de extensão para seguir Open/Closed
- comece pelos testes sempre que possível
- atualize `README.md` e `IA.md` em tempo real

# O QUE EU ESPERO
1. leitura do problema
2. proposta técnica
3. arquitetura inicial
4. dependências
5. plano de implementação
```

---

## 8. O QUE PERTENCE AO PROMPT

Coloque aqui o que orienta **como a IA deve trabalhar**:

- formato de resposta
- expectativa de entrega
- fluxo de análise
- forma de documentar
- como lidar com dúvidas
- como lidar com testes
- quais arquivos devem ser atualizados durante o trabalho

---

## 9. O QUE NÃO PERTENCE AO PROMPT

Não replique no prompt um acervo inteiro de padrões estruturais. Isso já pertence ao `DESIGN_SYSTEM_PARA_BACKEND.md`, como:

- princípios de arquitetura
- qualidade de API
- separação por camadas
- modelagem de dados
- segurança
- observabilidade
- manutenção

O prompt deve **invocar** esse padrão, não reescrevê-lo inteiro.

---

## 10. REGRA FINAL

Use esta separação:

- **Prompt base**: ajuda o desenvolvedor a descrever o sistema e orientar a IA
- **Design system backend**: define o padrão de qualidade que a IA deve seguir

Esse formato faz o prompt virar uma ferramenta prática de briefing técnico, e não apenas um formulário genérico.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.

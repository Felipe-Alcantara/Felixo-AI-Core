# 🎨 PROMPT BASE PARA DESENVOLVIMENTO FRONTEND

> **Objetivo**: Este arquivo é um **guia técnico para o desenvolvedor montar prompts de frontend mais completos e mais úteis logo na primeira interação**.
>
> **Uso correto**: Ele não existe para gerar um prompt genérico do zero. Ele existe para ajudar você a descrever a interface, os componentes e as decisões visuais com clareza técnica, reduzindo re-prompts, ambiguidades e retrabalho.
>
> **Regra central**: Todo prompt montado a partir deste arquivo deve mandar a IA seguir [`DESIGN_SYSTEM_FRONTEND.md`](DESIGN_SYSTEM_FRONTEND.md) como **referência de qualidade visual e estrutural**. A IA não deve inventar o padrão de frontend do zero se o acervo já define princípios, componentes e filosofia de construção. Quando o projeto tiver identidade visual própria, adapte as escolhas visuais (cores, fonte, efeitos) mas mantenha os princípios estruturais.

---

## 1. PAPEL DESTE ARQUIVO

Use este documento quando você quiser que a IA já comece com contexto técnico suficiente para:

- propor arquitetura de componentes com menos suposição
- escolher stack frontend com mais precisão
- entender limites reais da interface
- levar em conta problemas visuais e de UX atuais
- considerar futuras features de interface desde o início
- seguir o padrão do `Felixo System Design` sem precisar ser relembrada a cada resposta

Se o frontend já existe, este arquivo deve ajudar a IA a entender:

- o que já está pronto visualmente
- o que está inconsistente ou quebrado hoje
- o que precisa mudar agora
- o que provavelmente será adicionado depois

---

## 2. COMO PREENCHER BEM

Este prompt base funciona melhor quando você toma decisões explícitas sobre:

- tipo de interface
- stack preferida
- identidade visual
- componentes necessários
- comportamento responsivo
- animações e transições
- acessibilidade
- integração com backend
- problemas visuais atuais
- backlog / futuras features de interface

Se algo ainda não estiver decidido:

- escreva `A definir`
- ou descreva 2 opções com trade-off

Não deixe silencioso o que pode gerar interface inconsistente.

---

## 3. STACKS RECOMENDADAS NO FELIXO SYSTEM DESIGN

Esta seção existe para guiar o desenvolvedor na escolha da base técnica antes de montar o prompt.

### 3.1 Escolha padrão para a maioria dos frontends

**Stack sugerida**:

- React 18
- Tailwind CSS 3
- Vite
- Vitest

**Quando usar**:

- interfaces com componentes reutilizáveis
- SPAs e dashboards
- portfólios e landing pages
- painéis administrativos
- qualquer frontend que precise crescer com estrutura

**Por que essa é a base padrão do acervo**:

- reduz decisões desnecessárias no começo
- já entrega componentização, estilização utilitária e build rápido
- combina bem com a filosofia de componentes compostos e design tokens

### 3.2 Quando o projeto precisa de animações ricas

**Stack sugerida**:

- React 18
- Tailwind CSS 3
- Framer Motion
- Vite
- Vitest

**Quando usar**:

- portfólios com identidade visual forte
- interfaces com transições complexas
- produtos com micro-interações elaboradas
- experiências visuais imersivas

**Observação**:

- adicione Framer Motion apenas quando animações CSS puras não cobrirem o caso
- para animações simples de hover, fade e slide, Tailwind + CSS keyframes bastam

### 3.3 Quando o projeto é uma página simples ou protótipo

**Stack sugerida**:

- HTML5
- CSS3 ou Tailwind CSS (via CDN)
- JavaScript vanilla

**Quando usar**:

- páginas estáticas
- protótipos rápidos
- formulários isolados
- projetos educacionais ou exercícios

**Observação**:

- não use React para uma página que não precisa de estado reativo
- se não houver componentização real, JavaScript vanilla resolve melhor

### 3.4 Quando o projeto usa Bootstrap

**Stack sugerida**:

- Bootstrap 5
- JavaScript vanilla ou React

**Quando usar**:

- admin panels
- prototipagem rápida com componentes prontos
- projetos onde velocidade de entrega importa mais que identidade visual

**Observação**:

- não misture Bootstrap com Tailwind no mesmo projeto
- se precisar de customização visual forte, prefira Tailwind

### 3.5 Regra de escolha de stack no acervo

Use esta regra como padrão:

- **React + Tailwind é a combinação preferível por padrão**
- **HTML/CSS/JS vanilla entra quando React seria exagero**

Sinais de que **React + Tailwind cabe**:

- múltiplos componentes reutilizáveis
- estado reativo necessário
- SPA ou interface complexa
- integração com API
- projeto que vai crescer

Sinais de que vale usar **vanilla**:

- página única sem estado complexo
- protótipo descartável
- exercício ou demonstração
- sem necessidade de componentes reutilizáveis

---

## 4. DECISÕES TÉCNICAS QUE MAIS EVITAM RE-PROMPTS

Se você preencher apenas parte do prompt, priorize estes blocos:

- objetivo da interface
- estado atual do frontend
- problemas visuais atuais
- componentes necessários na etapa
- identidade visual (cores, fonte, tema)
- comportamento responsivo esperado
- integração com backend/API
- animações e transições
- acessibilidade
- stack escolhida

Esses pontos economizam a maior parte das perguntas repetidas.

---

## 5. PROMPT BASE GUIADO

Copie, preencha e adapte:

```markdown
Você é um engenheiro frontend sênior.

Antes de propor componentes ou escrever código, leia e siga o arquivo `DESIGN_SYSTEM_FRONTEND.md` como referência de qualidade visual e estrutural.

Não invente o padrão visual do zero se o arquivo já definir princípios, componentes, organização de pastas, nomenclatura e padrões de interação.

Se o projeto tiver identidade visual própria (cores, fonte, efeitos diferentes do FelixoVerse), adapte as escolhas visuais mas mantenha os princípios estruturais do design system.

Se houver qualquer desvio em relação ao `DESIGN_SYSTEM_FRONTEND.md`, justifique tecnicamente.

# 1. IDENTIFICAÇÃO DO PROJETO
- Nome do projeto:
- Tipo de interface:
  Exemplo: SPA, landing page, dashboard, painel administrativo, portfólio, formulário.
- Estado atual:
  Exemplo: ideia, protótipo, sistema existente, refatoração, manutenção.
- Objetivo principal da interface:
- Resultado esperado desta etapa:

# 2. CONTEXTO DA INTERFACE
- Problema que a interface resolve para o usuário:
- Quem usa a interface:
- Fluxo principal de valor (o que o usuário faz primeiro?):
- O que está explicitamente fora do escopo visual:

# 3. ESTADO ATUAL DO FRONTEND
- O projeto já existe? [sim/não]
- Stack atual:
- Estrutura de pastas atual:
- Componentes já implementados:
- O que já funciona visualmente:
- O que está incompleto:
- O que está ruim hoje (visual, UX, performance):

# 4. PROBLEMAS VISUAIS E DE UX ATUAIS
- Inconsistência visual 1:
- Inconsistência visual 2:
- Problema de responsividade:
- Problema de performance (render, bundle):
- Comportamento inconsistente de componente:

# 5. FUTURAS FEATURES / EVOLUÇÃO DA INTERFACE
- Feature visual futura 1:
- Feature visual futura 2:
- Feature visual futura 3:
- Componentes que provavelmente vão crescer:
- Pontos onde vale planejar extensão desde já:

# 6. COMPONENTES NECESSÁRIOS NA ETAPA
- Componente 1:
  - Variantes:
  - Estados:
- Componente 2:
  - Variantes:
  - Estados:
- Componente 3:
  - Variantes:
  - Estados:

# 7. IDENTIDADE VISUAL
- Paleta de cores:
  - Primária:
  - Secundária:
  - Fundo:
  - Texto:
  - Status (sucesso, erro, alerta):
- Fonte principal:
- Tema: [claro / escuro / ambos]
- Tem identidade visual própria ou segue o FelixoVerse? [própria / FelixoVerse / a definir]
- Referências visuais (sites, prints, Figma):

# 8. LAYOUT E RESPONSIVIDADE
- Layout geral: [sidebar + content / full-width / grid / outro]
- Breakpoints relevantes:
- Comportamento mobile:
- Comportamento tablet:
- Comportamento desktop:
- Precisa de menu mobile (hamburger)?

# 9. ANIMAÇÕES E TRANSIÇÕES
- Precisa de animações? [sim/não]
- Tipo de animações:
  Exemplo: hover, transições de página, loading, entrada de elementos, glow.
- Ferramenta de animação preferida: [CSS puro / Framer Motion / outra]
- Nível de complexidade visual: [simples / moderado / elaborado]

# 10. INTEGRAÇÃO COM BACKEND
- Tem API? [sim/não]
- Base URL da API:
- Autenticação no frontend: [token / cookie / nenhuma]
- Precisa de estado global? [sim/não]
- Ferramenta de estado: [Context API / Zustand / Redux / a definir]
- Precisa de cache de dados? [sim/não]

# 11. STACK E FERRAMENTAS
- Framework escolhido:
- Estilização:
- Animação:
- Build tool:
- Testes:
- Linting:
- Ícones:
- Restrições obrigatórias:
- Tecnologias proibidas ou indesejadas:

# 12. ESCOLHA TÉCNICA BASE
- Se não houver motivo contrário, use a stack mais alinhada com o Felixo System Design
- Se este projeto for um frontend padrão, prefira React + Tailwind CSS + Vite
- Se precisar de animações ricas, considere adicionar Framer Motion
- Se for uma página simples, considere HTML/CSS/JS vanilla
- Se você sugerir outra base, explique por quê

# 13. ACESSIBILIDADE
- Precisa de suporte a leitor de tela?
- Precisa de navegação por teclado?
- Precisa de contraste mínimo (WCAG)?
- Precisa de alt em imagens?
- Restrições específicas de acessibilidade:

# 14. FILOSOFIA DE CONSTRUÇÃO
- Prefira componentes compostos (compound components) quando o componente tiver múltiplas partes
- Use design tokens centralizados para cores, espaçamentos e tipografia
- Separe componentes de UI genéricos (ui/) de componentes de domínio (features/)
- Mantenha estilos co-localizados: cada componente deve ser visualmente autossuficiente
- Extraia utilitários de classe (cx, getColor) quando houver lógica condicional de estilo

# 15. DOCUMENTAÇÃO VIVA
- Atualize `README.md` e `IA.md` em tempo real sempre que o estado do projeto mudar
- Registre decisões visuais, componentes criados, inconsistências encontradas e próximos passos
- Não deixe a documentação para o fim

# 16. FORMA DE TRABALHAR
Antes de implementar:
- analise o design e os requisitos visuais por completo
- use o `DESIGN_SYSTEM_FRONTEND.md` como base de qualidade
- proponha arquitetura de componentes, estrutura de pastas e dependências
- destaque dúvidas, riscos e trade-offs visuais
- não assuma pontos ambíguos sem sinalizar

Durante a implementação:
- trabalhe por componente ou por seção, em etapas verificáveis
- mantenha separação clara entre componentes de UI e lógica de negócio
- garanta responsividade em cada etapa, não só no final
- teste visualmente em mobile, tablet e desktop
- documente decisões visuais importantes
- atualize `README.md` e `IA.md` em tempo real

Na entrega de cada etapa:
- resuma o que foi feito
- liste componentes criados ou alterados
- confirme responsividade testada
- confirme que `README.md` e `IA.md` foram atualizados
- aponte riscos, pendências e próximos passos

# 17. O QUE EU ESPERO DA RESPOSTA
1. entendimento do design e da interface
2. leitura visual do estado atual
3. análise de riscos e pontos ambíguos
4. proposta de arquitetura de componentes
5. estrutura sugerida de pastas
6. dependências necessárias
7. plano de implementação em etapas

Se faltar informação importante, pergunte de forma objetiva.
```

---

## 6. EXEMPLOS DE ESCOLHA TÉCNICA

### Caso 1: SPA com dashboard e componentes reutilizáveis

**Escolha sugerida**:

- React 18
- Tailwind CSS 3
- Vite
- Vitest

**Como descrever no prompt**:

```markdown
- Framework escolhido: React 18
- Estilização: Tailwind CSS 3
- Build tool: Vite
- Tipo de interface: SPA com dashboard
- Precisa de estado global? Sim (Context API)
- Tema: escuro
```

### Caso 2: Portfólio com animações elaboradas e identidade visual forte

**Escolha sugerida**:

- React 18
- Tailwind CSS 3
- Framer Motion
- Vite
- Vitest

**Como descrever no prompt**:

```markdown
- Framework escolhido: React 18
- Estilização: Tailwind CSS 3
- Animação: Framer Motion
- Build tool: Vite
- Tipo de interface: portfólio pessoal
- Nível de complexidade visual: elaborado
- Tema: escuro
- Identidade visual: segue FelixoVerse
```

### Caso 3: Página estática simples

**Escolha sugerida**:

- HTML5
- CSS3
- JavaScript vanilla

**Como descrever no prompt**:

```markdown
- Framework escolhido: nenhum (vanilla)
- Estilização: CSS3
- Tipo de interface: página estática
- Motivo para não usar React: não há componentização nem estado reativo
```

---

## 7. VERSÃO RÁPIDA

Quando quiser algo mais direto, use:

```markdown
Você é um engenheiro frontend sênior.

Siga `DESIGN_SYSTEM_FRONTEND.md` como referência de qualidade visual e estrutural. Se o projeto tiver identidade visual própria, adapte as cores e efeitos mas mantenha os princípios.

# PROJETO
- Nome:
- Tipo de interface:
- Estado atual:
- Objetivo:

# ESTADO ATUAL E PROBLEMAS
- O que já existe:
- Problemas visuais atuais:
- Inconsistências:

# COMPONENTES E EVOLUÇÃO
- Componente 1:
- Componente 2:
- Componente 3:
- Futuras features visuais:

# IDENTIDADE VISUAL
- Paleta de cores:
- Fonte:
- Tema:

# STACK E ARQUITETURA
- Framework:
- Estilização:
- Animação:
- Integração com API:
- Restrições obrigatórias:

# FORMA DE CONSTRUÇÃO
- prefira componentes compostos quando houver múltiplas partes
- use design tokens centralizados
- garanta responsividade em cada etapa
- atualize `README.md` e `IA.md` em tempo real

# O QUE EU ESPERO
1. leitura do design
2. proposta de componentes
3. arquitetura de pastas
4. dependências
5. plano de implementação
```

---

## 8. O QUE PERTENCE AO PROMPT

Coloque aqui o que orienta **como a IA deve trabalhar**:

- formato de resposta
- expectativa de entrega
- fluxo de análise visual
- forma de documentar
- como lidar com dúvidas de design
- como lidar com responsividade
- quais arquivos devem ser atualizados durante o trabalho

---

## 9. O QUE NÃO PERTENCE AO PROMPT

Não replique no prompt um acervo inteiro de padrões visuais. Isso já pertence ao `DESIGN_SYSTEM_FRONTEND.md`, como:

- paleta de cores
- tipografia e hierarquia de texto
- componentes e suas variantes
- animações e efeitos de glow
- organização de pastas
- padrões de interação

O prompt deve **invocar** esse padrão, não reescrevê-lo inteiro.

---

## 10. REGRA FINAL

Use esta separação:

- **Prompt base**: ajuda o desenvolvedor a descrever a interface e orientar a IA
- **Design system frontend**: define o padrão visual e estrutural que a IA deve seguir

Esse formato faz o prompt virar uma ferramenta prática de briefing visual, e não apenas um formulário genérico.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-05-23  
> Sugestões e pull requests são bem-vindos.

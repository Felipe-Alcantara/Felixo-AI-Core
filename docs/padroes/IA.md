# 🤖 TEMPLATE-CONTEXTO-IA-PARA-PROJETOS.md

Status: concluido.

> **O que é**: Este arquivo é o **template padrão de contexto operacional para projetos desenvolvidos com apoio de IA**.
>
> **De onde ele vem**: Ele nasce do repositório **Felixo System Design**, junto com outros artefatos-base como o `DESIGN-SYSTEM-FRONTEND.md`, o `PROMPT-BASE-BACKEND.md` e o `GUIA_DOCUMENTACAO_README.md`. Enquanto esses arquivos padronizam visual, execução e documentação, este template padroniza a **memória técnica do projeto** para uso por modelos de IA.
>
> **Qual é o propósito**: Servir como um **ponto único de recuperação de contexto**. Ao copiar este arquivo para um projeto real, a IA consegue entender objetivo, stack, decisões, bugs, testes e integrações sem depender de reler todo o código ou o histórico completo da conversa.
>
> **Como ele deve ser usado**: Neste repositório, ele funciona como **template mestre**. Em outros projetos, deve ser copiado e preenchido continuamente durante o desenvolvimento.
>
> **Público-alvo**: Principalmente modelos de IA e fluxos de trabalho assistidos por IA. O conteúdo pode ser técnico, direto e específico.
>
> **Regra fundamental**: Todo contexto relevante deve estar **neste único arquivo**. Não espalhe informações críticas em vários lugares se a intenção for permitir retomada rápida por outra IA ou por uma nova sessão.

## 📌 CONTEXTO DENTRO DO FELIXO SYSTEM DESIGN

Este repositório não guarda apenas padrões visuais. Ele centraliza os artefatos que eu reutilizo para iniciar e manter projetos consistentes do começo ao fim. Dentro desse conjunto, este arquivo ocupa o papel de **memória persistente da execução técnica**.

Ele complementa os demais arquivos assim:

- `DESIGN-SYSTEM-FRONTEND.md` define padrões visuais e de interface
- `PROMPT-BASE-BACKEND.md` define a forma de pedir implementação e arquitetura para IA
- `GUIA_DOCUMENTACAO_README.md` define como documentar o projeto para humanos
- `TEMPLATE-CONTEXTO-IA-PARA-PROJETOS.md` define como preservar o contexto acumulado do projeto para IA

Nos guias técnicos deste acervo, modularização forte e separação clara de responsabilidades são tratadas como princípios estruturais centrais, especialmente no material de backend.

Além dos padrões gerais, a pasta `Utils/` também concentra guias reaproveitáveis mais específicos, inclusive subsistemas de backend extraídos de projetos reais quando esse recorte técnico fizer sentido.

Se o design system dita **como construir com consistência**, este arquivo registra **o que já foi decidido, testado e aprendido** durante a construção.

---

## 📋 COMO A IA DEVE USAR ESTE TEMPLATE

Quando este template for copiado para um projeto real, a IA responsável deve tratá-lo como a fonte principal de contexto acumulado do projeto.

### Quando registrar

Você **DEVE** atualizar este arquivo sempre que:

1. **Decisão técnica for tomada** — escolha de lib, padrão, arquitetura, estrutura de banco
2. **Stack for definida ou alterada** — linguagem, framework, dependências
3. **Teste importante passar ou falhar** — testes que validam comportamento crítico
4. **Design/arquitetura mudar** — refatorações, mudança de padrão, novo módulo
5. **Bug significativo for resolvido** — causa raiz e fix aplicado
6. **Meta ou objetivo mudar** — pivôs, mudanças de escopo, prioridades
7. **Convenção for estabelecida** — naming, estrutura de pastas, padrão de commit
8. **Integração externa for configurada** — APIs, serviços, credenciais (sem expor secrets)
9. **Milestone for atingida** — feature completa, release, deploy
10. **Chain of thought relevante** — registre o raciocínio por trás de decisões complexas, passos de debug e caminhos explorados

### Por que registrar chain of thought?

Modelos de IA podem **alucinar ou se confundir** durante raciocínios longos. Registrar o passo-a-passo do pensamento permite:

- **Identificar onde o erro começou** — se o resultado final estiver errado, dá pra rastrear qual passo do raciocínio divergiu
- **Evitar loops** — se a IA já tentou um caminho e falhou, o registro impede que tente de novo
- **Retomar com outro modelo** — um modelo diferente consegue ler o raciocínio anterior e continuar de onde parou
- **Auditar alucinações** — comparação entre o raciocínio registrado e o código gerado revela inconsistências

### Como registrar

- Seja **técnico e específico** — ex: "Migrado de `express` para `fastify` por performance em rotas async"
- Use **timestamps** — formato `[YYYY-MM-DD]`
- Registre o **porquê**, não só o quê — decisões sem justificativa perdem valor
- Mantenha cada entrada **curta** — 1-3 linhas por item
- Use as seções abaixo — não crie seções novas sem necessidade

---

## 🎯 OBJETIVO DO PROJETO

<!-- 
  Descreva aqui o objetivo principal do projeto em 2-3 frases.
  Atualize se o escopo mudar.
  Exemplo:
  [2026-03-11] API REST para gerenciamento de tarefas com autenticação JWT.
  Público: uso pessoal. Deploy: VPS própria. Prioridade: simplicidade > escalabilidade.
-->

_Preencher no início do projeto._

---

## 🏁 METAS & MILESTONES

<!-- 
  Liste as metas do projeto e marque conforme forem atingidas.
  Formato: [DATA] STATUS - Descrição
  STATUS: ⬜ pendente | 🔄 em progresso | ✅ concluída | ❌ cancelada
-->

_Preencher conforme o projeto avança._

---

## 🛠️ STACK & DEPENDÊNCIAS

<!-- 
  Registre a stack completa e dependências instaladas.
  Atualize quando adicionar/remover/trocar qualquer tecnologia.
  Exemplo:
  [2026-03-11] Back-end: Python 3.12 + Django 5.1 + DRF 3.15
  [2026-03-11] DB: PostgreSQL 16 via Docker
  [2026-03-12] Adicionado django-cors-headers para CORS em dev
-->

_Preencher no setup do projeto._

---

## 📐 DECISÕES DE ARQUITETURA

<!-- 
  Registre decisões estruturais e o motivo de cada uma.
  Exemplo:
  [2026-03-11] Monolito Django ao invés de microserviços — projeto pequeno, não justifica a complexidade.
  [2026-03-11] Pasta `services/` para lógica de negócio separada das views — facilita testes unitários.
  [2026-03-12] JWT via `djangorestframework-simplejwt` ao invés de sessão — API stateless para consumo mobile futuro.
-->

_Preencher ao tomar decisões._

---

## 🎨 DECISÕES DE DESIGN & CONVENÇÕES

<!-- 
  Padrões de código, naming, estrutura que foram definidos.
  Exemplo:
  [2026-03-11] Nomes de variáveis e funções em inglês, comentários em português.
  [2026-03-11] Commits seguem Conventional Commits: feat/fix/docs/refactor.
  [2026-03-11] Respostas da API sempre em formato { "data": ..., "error": ... }.
-->

_Preencher conforme convenções forem definidas._

---

## 🧪 TESTES IMPORTANTES

<!-- 
  Registre testes que validam comportamento crítico.
  Inclua o que o teste cobre e se passou/falhou.
  Exemplo:
  [2026-03-12] ✅ test_auth_login — Login com credenciais válidas retorna token JWT.
  [2026-03-12] ✅ test_auth_login_invalid — Credenciais inválidas retorna 401.
  [2026-03-13] ❌ test_upload_large_file — Timeout em arquivos >50MB. Fix pendente: aumentar TIMEOUT no nginx.
-->

_Preencher ao rodar testes._

---

## 🐛 BUGS & FIXES RELEVANTES

<!-- 
  Bugs significativos e como foram resolvidos.
  Exemplo:
  [2026-03-13] BUG: CORS bloqueando requests do frontend em produção.
  CAUSA: `ALLOWED_ORIGINS` não incluía domínio com www.
  FIX: Adicionado `https://www.dominio.com` em settings.py L45.
-->

_Preencher ao resolver bugs._

---

## 🔗 INTEGRAÇÕES & SERVIÇOS EXTERNOS

<!-- 
  APIs, serviços e integrações configuradas.
  NÃO registre secrets/tokens aqui — apenas o serviço e como está configurado.
  Exemplo:
  [2026-03-14] Stripe API — checkout de pagamento. Webhook configurado em /api/webhooks/stripe.
  [2026-03-14] SendGrid — envio de emails transacionais. Template ID: d-abc123.
-->

_Preencher conforme integrações forem adicionadas._

---

## 📝 NOTAS GERAIS

<!-- 
  Qualquer informação que não se encaixe nas seções acima
  mas que seria útil para outra IA retomar o contexto.
  Exemplo:
  [2026-03-11] O cliente pediu para não usar Docker em produção — deploy direto na VPS.
  [2026-03-15] Performance: endpoint /api/reports leva ~3s. Otimizar se virar problema.
-->

_Preencher quando necessário._

---

## 🧠 CHAIN OF THOUGHT

<!-- 
  Registre aqui o raciocínio detalhado em decisões complexas, debug difícil
  ou qualquer situação onde o passo-a-passo do pensamento importa.
  Isso serve para rastrear alucinações e erros de lógica.
  
  Formato:
  [YYYY-MM-DD] CONTEXTO: <o que estava tentando fazer>
  PENSAMENTO: <passo 1 do raciocínio>
  PENSAMENTO: <passo 2>
  RESULTADO: <o que aconteceu / conclusão>
  
  Exemplo:
  [2026-03-13] CONTEXTO: Endpoint /api/users retornando 500 em produção.
  PENSAMENTO: Logs mostram `KeyError: 'email'` em serializer.py L32.
  PENSAMENTO: O campo `email` existe no model. Verifiquei — o request body do frontend envia `user_email` ao invés de `email`.
  PENSAMENTO: Duas opções: renomear no frontend ou aceitar ambos no serializer. Optei por aceitar ambos via `source='email'`.
  RESULTADO: Fix aplicado. Manter compat retroativa — frontend será atualizado depois.
  
  [2026-03-14] CONTEXTO: Tentando implementar cache com Redis para /api/reports.
  PENSAMENTO: Primeiro tentei django-cacheops — configurei mas não funcionou com queries complexas (aggregations).
  PENSAMENTO: Tentei cache manual com redis-py direto — funcionou mas código ficou verbose.
  PENSAMENTO: Voltei para django cache framework com backend Redis — mais simples, cobre o caso.
  RESULTADO: Usando `django.core.cache` com `django-redis`. Cache de 5min em endpoints pesados.
-->

_Preencher durante debug complexo ou decisões que envolvam múltiplos caminhos._

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.

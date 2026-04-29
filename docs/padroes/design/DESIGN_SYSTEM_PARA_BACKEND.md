# 🧱 DESIGN SYSTEM PARA BACKEND — PADRÕES DE QUALIDADE

> **Contexto**: Este documento define os padrões de arquitetura, qualidade e manutenção para projetos **back-end** do acervo.
>
> **Escopo**: APIs, lógica de negócio, persistência, integrações, testes, segurança, observabilidade e documentação técnica.
>
> **Objetivo**: Servir como referência quando o projeto já existe ou está sendo implementado, ajudando a avaliar se a solução está consistente, segura e fácil de manter.
>
> **Não é**: Este arquivo não é um prompt operacional para IA. O prompt foi separado em `PROMPT_BASE_PARA_BACKEND.md`.

---

## 1. PAPEL DESTE DOCUMENTO

Use este arquivo para responder perguntas como:

- A arquitetura está simples e coerente?
- As responsabilidades estão bem separadas?
- A modularização está protegendo o sistema contra acoplamento e crescimento desordenado?
- A API tem contrato estável e previsível?
- O projeto está testável, observável e seguro?
- As decisões técnicas estão facilitando manutenção futura?

Se a necessidade for **instruir uma IA sobre como trabalhar**, isso pertence ao prompt. Se a necessidade for **avaliar a qualidade do sistema**, isso pertence aqui.

---

## 2. PRINCÍPIOS BASE

### 2.1 Simplicidade antes de sofisticação

- Prefira a solução mais simples que resolva o problema real.
- Não introduza abstrações, filas, microserviços ou camadas extras sem uma necessidade clara.
- O sistema deve ser fácil de entender por leitura direta do código.

### 2.2 Modularização e separação explícita de responsabilidades

- Modularização forte é essencial. O sistema deve ser dividido em partes pequenas, coesas e com fronteiras fáceis de entender.
- Separação de responsabilidades também é essencial. Cada camada, módulo, classe ou função deve ter um papel claro e limitado.
- Entrada e saída HTTP ficam na camada de API.
- Regras de negócio ficam fora de controllers/views.
- Acesso a banco e integrações externas não devem poluir a camada de domínio.
- Configuração, infraestrutura e lógica de aplicação devem ter fronteiras claras.
- Sempre que um arquivo, classe ou função começar a acumular decisões demais, isso deve ser tratado como sinal de refatoração.
- O objetivo é impedir módulos "faz-tudo" que concentram regra de negócio, acesso a dados, formatação, integração e controle de fluxo no mesmo lugar.

### 2.3 Contratos previsíveis

- APIs devem ter formato consistente de request e response.
- Erros devem ser padronizados.
- Campos, nomes e convenções devem permanecer estáveis ao longo do tempo.

### 2.4 Testabilidade como requisito estrutural

- O código deve permitir testes sem depender de acoplamento excessivo.
- Regras críticas precisam ser validáveis por testes automatizados.
- Bugs corrigidos devem virar casos de regressão sempre que fizer sentido.

### 2.5 Segurança e mudança segura

- Operações destrutivas precisam de proteção.
- Segredos nunca devem ir para o repositório.
- Mudanças devem ser auditáveis, reversíveis quando possível e bem documentadas.

### 2.6 Ferramenta antes da solução específica

- Sempre que possível, projete primeiro a **ferramenta reutilizável** e só depois a aplicação pontual dessa ferramenta.
- Em vez de escrever código acoplado a um único caso, prefira criar uma base moldável que aceite variações previsíveis.
- A solução concreta deve ser uma composição da ferramenta, não um bloco rígido que resolve apenas o caso atual.
- Esse princípio é especialmente útil em automações, scripts e fluxos que tendem a ganhar novas regras com o tempo.

### 2.7 Extensão antes de modificação (Open/Closed)

- O sistema deve nascer **aberto para extensão e fechado para modificação frequente**.
- Quando novas regras surgirem, a prioridade deve ser adicionar novas estratégias, adaptadores, handlers ou casos de uso, em vez de reescrever o núcleo já estável.
- Código bom para manutenção é o que aceita comportamento novo com o mínimo possível de alteração em partes já validadas.
- O padrão Strategy é uma referência importante aqui: quando houver variações de comportamento previsíveis, modele pontos de extensão em vez de concentrar decisões em `if/else` crescentes.

---

## 3. STACK PREFERIDA E CRITÉRIOS DE ESCOLHA

### 3.1 Ordem de preferência

| Prioridade | Tecnologia | Quando faz mais sentido |
|------------|------------|-------------------------|
| 1 | **Python + Django** | APIs, painéis administrativos, automações, projetos CRUD e produtos que pedem produtividade com estrutura sólida |
| 2 | **TypeScript** | Serviços Node, integrações, aplicações orientadas a eventos, compartilhamento de tipos com ecossistema JS |
| 3 | **JavaScript** | Scripts auxiliares ou integrações pequenas onde tipagem forte não é prioridade |
| 4 | **C# / .NET** | Quando houver exigência de ecossistema, performance específica, legado ou contexto corporativo que justifique |

### 3.2 Regra prática de escolha

- Use **Django** como escolha padrão para back-end geral.
- Use **TypeScript** quando o contexto pedir Node.js ou integração forte com stack JS.
- Use **C#/.NET** apenas quando houver uma razão concreta, não por preferência abstrata.
- Se a stack escolhida fugir disso, a decisão deve ser justificada no projeto.

### 3.3 Regra de escolha de banco

- **SQLite** é o banco preferível por padrão quando o sistema ainda couber bem em uma estrutura simples, leve e de baixa complexidade operacional.
- **PostgreSQL** entra quando SQLite deixar de caber bem no cenário.
- Para MVPs, automações, sistemas locais, scripts e backends com baixa concorrência, prefira começar com **SQLite**.
- Para cenários com múltiplos usuários concorrentes, filas, múltiplos workers, maior volume de dados ou operação mais robusta, considere **PostgreSQL**.

---

## 4. ESTRUTURA RECOMENDADA

Uma estrutura base saudável para projetos backend tende a separar pelo menos estas áreas:

```text
backend/
├── app/
│   ├── api/              # rotas, views, serializers, DTOs
│   ├── services/         # casos de uso e orquestração
│   ├── domain/           # regras centrais e entidades de negócio
│   ├── repositories/     # consultas e acesso estruturado a dados
│   ├── integrations/     # APIs externas, filas, storage, email
│   └── core/             # config, auth, logging, utilidades compartilhadas
├── tests/
├── docs/
├── README.md
├── .env.example
└── requirements.txt / package.json
```

### 4.1 Responsabilidade por camada

| Camada | Deve conter | Não deve conter |
|--------|-------------|-----------------|
| **API** | Parsing, validação de entrada, autenticação, serialização, resposta HTTP | Regra de negócio espalhada, SQL complexo, lógica de integração |
| **Services** | Casos de uso, coordenação de fluxos, transações | Detalhes de framework e resposta HTTP |
| **Domain** | Regras centrais, invariantes, linguagem do negócio | Dependência direta de controller/view |
| **Repositories** | Consulta e persistência estruturada | Regra de apresentação |
| **Integrations** | Cliente de terceiros, webhooks, email, storage, filas | Regra de negócio principal |

Regras práticas de modulação:

- Se um módulo muda por muitos motivos diferentes, ele está com responsabilidade demais.
- Se uma classe orquestra HTTP, banco, regra de negócio e integração ao mesmo tempo, ela está errada.
- Se a evolução de uma feature exige editar o mesmo núcleo toda vez, faltam fronteiras melhores ou pontos de extensão mais claros.
- Modularizar bem não é espalhar código sem critério; é organizar o sistema para que cada parte tenha uma responsabilidade compreensível, testável e substituível.

---

## 5. PADRÕES DE ARQUITETURA

### 5.1 Controllers finos

- Controllers, views e handlers devem apenas receber dados, validar entrada e delegar.
- Quanto mais lógica no controller, mais difícil fica testar e evoluir.

### 5.2 Casos de uso explícitos

- Fluxos principais devem viver em services/use cases.
- Regras importantes não devem ficar espalhadas em serializers, signals, middlewares ou helpers genéricos.

### 5.3 Integrações isoladas

- Toda integração externa deve ficar encapsulada atrás de uma camada própria.
- O sistema interno não deve depender do formato cru de provedores externos.

### 5.4 Configuração centralizada

- Variáveis de ambiente, flags, segredos e parâmetros operacionais devem ser centralizados.
- Evite configuração hardcoded espalhada em múltiplos módulos.

### 5.5 Evolução gradual

- Comece com monólito modular sempre que possível.
- Só extraia serviços separados quando houver evidência real de necessidade operacional ou de domínio.

### 5.6 Sistema moldável por composição

- Sempre que houver famílias de comportamento, prefira compor por estratégia, política, adaptador ou handler.
- Evite concentrar múltiplas variações de regra em uma única função grande e altamente condicional.
- Se um fluxo tende a ganhar novos cenários, prepare um ponto de extensão explícito desde cedo.
- O objetivo não é abstrair tudo prematuramente, mas criar uma base que aceite crescimento sem deformar o núcleo.

---

## 6. PADRÕES DE API

### 6.1 Contrato consistente

- Defina um padrão de resposta e mantenha-o.
- Use nomes claros, estáveis e coerentes entre endpoints.
- Evite variar convenção sem motivo entre snake_case e camelCase.

### 6.2 Validação de entrada

- Toda entrada externa deve ser validada.
- Tipos, obrigatoriedade, limites e formatos devem ser explicitamente tratados.
- Erros de validação devem ser compreensíveis e previsíveis.

### 6.3 Paginação, filtros e ordenação

- Endpoints de listagem devem prever paginação quando o volume puder crescer.
- Filtros e ordenação devem ser explícitos e documentados.

### 6.4 Versionamento quando necessário

- Se a API for pública, de terceiros ou com evolução frequente, considere versionamento claro (`/api/v1`).
- Se for interna e estável, evite complexidade desnecessária sem abrir mão de compatibilidade.

### 6.5 Tratamento de erro

- Não exponha stack trace para o cliente.
- Diferencie erro de validação, autenticação, autorização, negócio e falha interna.
- Log interno detalhado; resposta externa controlada.

---

## 7. DADOS E PERSISTÊNCIA

### 7.1 Banco como parte do design

- Modelagem de dados deve refletir o domínio, não apenas conveniência imediata.
- Índices, constraints e relacionamentos devem ser pensados como parte da qualidade do sistema.

### 7.2 Migrações obrigatórias

- Toda mudança estrutural de banco deve ser versionada.
- Nunca trate banco em produção como ajuste manual permanente.

### 7.3 Limites transacionais claros

- Operações críticas devem ter fronteiras transacionais explícitas.
- Evite efeitos colaterais parcialmente executados sem controle.

### 7.4 Consultas sob controle

- Consultas complexas devem ficar centralizadas e legíveis.
- N+1, joins excessivos e filtros pouco indexados precisam ser monitorados desde cedo.

---

## 8. TESTES E CONFIABILIDADE

### 8.1 Pirâmide mínima saudável

- **Unitários** para regras de negócio e funções críticas.
- **Integração** para banco, autenticação, APIs e fluxos principais.
- **Regressão** para bugs reais já corrigidos.

### 8.2 Testes primeiro como padrão de partida (TDD)

- O fluxo preferencial é **TDD (Test-Driven Development)**: **definir comportamento -> escrever teste -> implementar -> refatorar**.
- Começar pelos testes ajuda a construir a ferramenta e o sistema em torno de comportamento verificável, em vez de acoplá-los a uma implementação improvisada.
- Testes funcionam como trilho de segurança para manter o código moldável durante extensões futuras.
- Exceções podem existir em spikes exploratórios curtos, mas a consolidação da solução deve voltar para um estado protegido por testes.

### 8.3 O que não pode ficar sem teste

- Autenticação e autorização
- Fluxos financeiros, destrutivos ou irreversíveis
- Regras de negócio centrais
- Integrações externas críticas

---

## 9. SEGURANÇA, LOGS E OPERAÇÃO

### 9.1 Segurança básica obrigatória

- Segredos em `.env`, nunca no repositório
- Sanitização e validação de entrada
- Controle de acesso por perfil/escopo quando aplicável
- Confirmação ou proteção extra em operações destrutivas

### 9.2 Observabilidade mínima

- Logs úteis e consistentes
- Mensagens de erro rastreáveis
- Identificação clara de falhas em integrações externas
- Métricas e tracing quando o sistema justificar

### 9.3 Idempotência e reprocessamento

- Operações sujeitas a retry, webhook ou processamento repetido devem ser idempotentes sempre que possível.

---

## 10. DOCUMENTAÇÃO E MANUTENÇÃO

- `README.md` com setup, execução, ambiente e visão geral
- `.env.example` sem segredos
- Documentação de endpoints e integrações críticas
- Registro de decisões importantes quando a escolha não for óbvia
- Docstrings e comentários apenas onde agregarem clareza real

### 10.1 Documentação viva durante execução assistida por IA

Quando a implementação estiver sendo conduzida com apoio de IA, `README.md` e `IA.md` devem ser tratados como documentos vivos do projeto.

- `README.md` deve refletir o estado atual utilizável do sistema
- `IA.md` deve refletir contexto técnico, decisões, mudanças, bugs, testes e próximos passos
- A IA não deve deixar a atualização desses arquivos apenas para o fim do trabalho
- A cada resposta relevante de execução, se o estado do projeto mudou, a documentação também deve ser atualizada
- Se uma decisão técnica foi tomada, um fluxo foi implementado, um bug foi corrigido ou um teste relevante foi rodado, isso deve ser registrado em tempo real

Regra prática:

- `README.md` registra o que humanos precisam saber para entender e usar o projeto
- `IA.md` registra o que outra IA precisa saber para retomar o contexto sem reler todo o código

Itens como "mostrar progresso para o usuário", "aguardar feedback" ou "fornecer commit message" não pertencem a este documento. Esses pontos são regras de operação da IA e foram movidos para o prompt.

---

## 11. CHECKLIST DE QUALIDADE

Antes de considerar um backend pronto para seguir:

- [ ] A stack escolhida faz sentido para o problema
- [ ] A arquitetura está modular e com fronteiras claras
- [ ] Cada módulo, camada, classe e função tem responsabilidade clara e limitada
- [ ] Controllers/views estão finos
- [ ] Regras de negócio estão centralizadas
- [ ] Não existem módulos "faz-tudo" concentrando responsabilidades demais
- [ ] O código favorece extensão com mínimo de modificação no núcleo
- [ ] Variações previsíveis de comportamento foram modeladas por composição, não por acoplamento crescente
- [ ] Banco, índices e migrações estão sob controle
- [ ] Erros e respostas seguem padrão consistente
- [ ] Fluxos críticos estão cobertos por testes
- [ ] Segredos e operações destrutivas estão protegidos
- [ ] Logs e falhas relevantes são rastreáveis
- [ ] A documentação mínima do projeto está atualizada
- [ ] `README.md` e `IA.md` refletem o estado atual real do projeto

---

## 12. COMO USAR JUNTO COM O PROMPT

- Use `DESIGN_SYSTEM_PARA_BACKEND.md` para definir **o padrão de qualidade do sistema**
- Use `PROMPT_BASE_PARA_BACKEND.md` para definir **como a IA deve trabalhar durante o projeto**
- Em fluxos com IA, trate a atualização contínua de `README.md` e `IA.md` como parte da própria implementação

Essa separação evita que o acervo vire um documento híbrido: um guia continua útil como referência técnica de longo prazo, e o outro continua útil como instrução operacional para novas conversas.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.

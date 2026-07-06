# Guias — Padroes Especificos

A pasta [`guias/`](../guias/) contem **guias reutilizaveis extraidos de projetos reais**, organizados por dominio. Diferente do `core/`, estes arquivos sao **opcionais** — use apenas quando o projeto precisar daquela funcionalidade.

> Voltar ao [README](../README.md). Agentes de IA: o indice compacto destes guias, com palavras-chave para casar com o prompt, esta em [`AGENTS.md`](../AGENTS.md).

Cada guia responde a tres perguntas:

- Qual problema ele resolve
- De qual projeto o padrao foi extraido
- Em que tipo de sistema vale reutiliza-lo

## Frontend

### Arvore Hierarquica

Padrao de **exploracao hierarquica de categorias** com modelo Django (self-referential FK), serializer recursivo e componente React recursivo com animacoes.

**Quando usar:** explorador de categorias/pastas, menus hierarquicos, qualquer dado em arvore parent-child.

[Ver guia](../guias/frontend/GUIA-ARVORE-HIERARQUICA.md)

### Background Visual

Padrao de **background visual em camadas** com gradiente, simbolos animados e troca de tema. Extraido da Calculadora Pro Web (Brython).

**Quando usar:** calculadoras, paginas educacionais, dashboards tecnicos, interfaces com profundidade visual.

[Ver guia](../guias/frontend/GUIA-BACKGROUND-VISUAL.md)

### Heatmap de Atividade

Padrao de **calendario de atividade com intensidade visual** no estilo GitHub. Extraido do Reading Tracker.

**Quando usar:** visualizacao de atividade por dia/semana/mes, dashboards de uso, analise temporal.

[Ver guia](../guias/frontend/GUIA-HEATMAP-DE-ATIVIDADE.md)

### Onboarding e Ajuda

Padrao de **primeira experiencia do usuario** com onboarding leve, destaque contextual e centro de ajuda permanente. Extraido do Reading Tracker.

**Quando usar:** produtos com multiplas funcionalidades, interfaces com curva de aprendizado, dashboards.

[Ver guia](../guias/frontend/GUIA-ONBOARDING-E-AJUDA.md)

### Componentes UI Compostos

Kit de **componentes UI compostos** com Card (compound component), Button (4 variantes x 3 tamanhos), Badge e utilitario de classnames. TypeScript + Tailwind, zero dependencias.

**Quando usar:** qualquer projeto React + Tailwind que precise de componentes base consistentes.

[Ver guia](../guias/frontend/GUIA-COMPONENTES-UI-COMPOSTOS.md)

### Particulas e Sistema de Glow

**Background de particulas flutuantes** com Framer Motion e **sistema completo de glow CSS** com 5 niveis de intensidade controlados por CSS variable.

**Quando usar:** landing pages, portfolios, dashboards dark-theme, interfaces com efeitos de glow.

[Ver guia](../guias/frontend/GUIA-PARTICULAS-E-GLOW.md)

### Arvore de Materiais Dual-View

**Arvore de materiais com dois modos de visualizacao** (simples e dinamico), tracking de itens vistos via localStorage e contagem de progresso por pasta.

**Quando usar:** bibliotecas de materiais, exploradores de documentos, listas de leitura com progresso.

[Ver guia](../guias/frontend/GUIA-ARVORE-DE-MATERIAIS-DUAL-VIEW.md)

### Calendario Academico

**Calendario mensal interativo** com grade de dias, agrupamento de eventos por data, status do usuario e 11 funcoes de data sem dependencias externas.

**Quando usar:** dashboards academicos, calendarios de entregas, agendas de projeto.

[Ver guia](../guias/frontend/GUIA-CALENDARIO-ACADEMICO.md)

### Sistema de Alerta e Grade de Horarios

**Sistema de alerta automatico de proxima aula** com parser de grade, cores por sala e tabela semanal com coluna sticky.

**Quando usar:** paineis academicos, portais de turma, apps de agenda escolar.

[Ver guia](../guias/frontend/GUIA-SISTEMA-DE-ALERTA-E-GRADE.md)

## Backend

### Backend CPF

Padrao de **backend logico para CPF** com algoritmo, contratos, fluxo de validacao, matriz de testes e guardrails para dados reais.

**Quando usar:** geracao sintetica de CPF para testes, validacao backend, normalizacao de entrada, formularios.

[Ver guia](../guias/backend/GUIA-BACKEND-CPF.md)

### Criptografia Cifra de Cesar

Sistemas reutilizaveis da **Cifra de Cesar em Python**: cifra tradicional, cifra numerica, normalizacao de acentos e interface web com Brython.

**Quando usar:** apps educacionais de criptografia, playgrounds web, utilitarios de encode/decode.

[Ver guia](../guias/backend/GUIA-CRIPTOGRAFIA-CIFRA-DE-CESAR.md)

## Integracao

### Integracao API GitHub

Padrao de **coleta robusta de repositorios no GitHub** com autenticacao por token, paginacao, deduplicacao, retry com backoff e tratamento de rate limit.

**Quando usar:** importadores de portfolio, dashboards de projetos, sincronizadores, ETLs de inventario tecnico.

[Ver guia](../guias/integracao/GUIA-INTEGRACAO-API-GITHUB.md)

### Scraping Multiformato

Padrao de **scraping multiformato** com Playwright, parsers offline, JSON embutido, captura manual assistida, persistencia idempotente, URL publica segura, testes e guardrails operacionais.

**Quando usar:** coletores, catalogos, ETLs, comparadores, importadores e pipelines que precisam transformar paginas heterogeneas em dados estruturados auditaveis.

[Ver guia](../guias/integracao/GUIA-SCRAPING-MULTIFORMATO.md)

### Deploy Railway (backend padrao online)

**Servico padrao para colocar backend online**. Railway (PaaS) faz build, deploy, banco gerenciado, variaveis de ambiente, dominio HTTPS e logs sem gerenciar servidor — **mais do que suficiente para a maioria das aplicacoes**. Inclui fluxo completo de CLI, conceitos, deploy por Git ou `railway up`, bancos e checklist.

**Quando usar:** APIs REST, back-ends de apps, workers, bots, scrapers agendados e qualquer servico que precise ficar online com URL publica e HTTPS.

> **Aviso:** o login/autorizacao do Railway falha com frequencia. O guia instrui o agente a **parar e enviar o passo a passo manual ao usuario** (terminal ou interface) apos erros repetidos de conexao, em vez de insistir.

[Ver guia](../guias/integracao/GUIA-DEPLOY-RAILWAY.md)

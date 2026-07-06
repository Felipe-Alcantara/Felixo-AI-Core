# Felixo System Design

<div align="center">

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![C#](https://img.shields.io/badge/C%23-512BD4?style=for-the-badge&logo=csharp&logoColor=white)
![Django](https://img.shields.io/badge/Django-0C4B33?style=for-the-badge&logo=django&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Docs](https://img.shields.io/badge/Docs-Guide-2084FF?style=for-the-badge&logo=read-the-docs&logoColor=white)

**Repositorio central de padroes de design, qualidade de sistema, prompts estruturados, documentacao operacional e guias reutilizaveis para IA.**

[Core (Obrigatorio)](docs/CORE-PADROES-OBRIGATORIOS.md) | [Guias (Opcional)](docs/GUIAS-OPCIONAIS.md) | [Como Usar](docs/INSTALACAO-EM-OUTROS-PROJETOS.md) | [Stack](#%EF%B8%8F-minha-stack)

</div>

---

## Indice

- [Sobre o Repositorio](#-sobre-o-repositorio)
- [Mapa do Repositorio](#-mapa-do-repositorio)
- [Estrutura do Repositorio](#-estrutura-do-repositorio)
- [Minha Stack](#%EF%B8%8F-minha-stack)
- [Para Agentes de IA](#-para-agentes-de-ia)
- [Licenca](#-licenca)
- [Autor](#-autor)

---

## Sobre o Repositorio

Este repositorio serve como **base centralizada** para registrar e padronizar tudo que envolve meus projetos de desenvolvimento. Ele e organizado em duas camadas:

### `core/` — Obrigatorio

Padroes de qualidade que devem acompanhar **todo projeto**:

- **Design Systems** — Contratos de qualidade para frontend, backend e documentacao
- **Prompt Bases** — Guias para montar prompts de IA completos na primeira interacao
- **Guia Minimo de Qualidade** — Regras curtas e obrigatorias para preservar qualidade de software
- **Start App Script** — `start_app.py` obrigatorio em todo programa: um menu interativo, colorido e descritivo que instala, configura e inicia (a porta de entrada do programa)
- **Template de Contexto IA** — Memoria operacional padronizada para continuidade entre sessoes

### `guias/` — Opcional

Guias reutilizaveis extraidos de **projetos reais**, organizados por dominio. Use apenas quando o projeto precisar daquela funcionalidade especifica.

---

## Mapa do Repositorio

Cada area tem um documento proprio, com uma responsabilidade unica. Use o mapa abaixo para ir direto ao que precisa.

| Documento | Responsabilidade | O que voce encontra |
|-----------|------------------|---------------------|
| **[AGENTS.md](AGENTS.md)** | **Roteiro de leitura para IA** | Protocolo de leitura por tipo de tarefa e indice de guias com palavras-chave — o que um agente deve abrir (e o que ignorar) conforme o prompt. |
| **[docs/CORE-PADROES-OBRIGATORIOS.md](docs/CORE-PADROES-OBRIGATORIOS.md)** | Padroes **obrigatorios** | Design systems (frontend, backend, README), guia minimo de qualidade, start app script, prompts base e o template de contexto `IA.md` — cada um descrito e com link. |
| **[docs/GUIAS-OPCIONAIS.md](docs/GUIAS-OPCIONAIS.md)** | Padroes **opcionais** por dominio | Guias reutilizaveis de **frontend** (9), **backend** (2) e **integracao** (3): o que cada um resolve, de qual projeto foi extraido e quando reutilizar. |
| **[docs/INSTALACAO-EM-OUTROS-PROJETOS.md](docs/INSTALACAO-EM-OUTROS-PROJETOS.md)** | **Como usar** em outros projetos | Os 8 metodos de download/sincronizacao (incluindo o comando global `felixo`), variantes com/sem submodulo e a tabela de escolha rapida por cenario. |
| **[docs/GIT-POLITICA-DE-VERSIONAMENTO.md](docs/GIT-POLITICA-DE-VERSIONAMENTO.md)** | **Politica de git** neste repo | Quando criar branch (e quando nao), formato de commit (`tipo: descricao`), documentacao viva, exemplos e checklist. Fonte unica das regras de versionamento. |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | **Contribuir** de fora | Fluxo de fork + Pull Request para contribuicoes externas. |
| [Estrutura do Repositorio](#-estrutura-do-repositorio) | **Layout** das pastas | Arvore completa de arquivos e pastas com uma linha por item. |
| [Para Agentes de IA](#-para-agentes-de-ia) | Regras para agentes **neste** repo | Politica de git/branches, commits e documentacao viva. |

### Mapa rapido por necessidade

- **Quero os padroes obrigatorios de qualidade** → [docs/CORE-PADROES-OBRIGATORIOS.md](docs/CORE-PADROES-OBRIGATORIOS.md)
- **Preciso de um padrao especifico** (arvore, heatmap, scraping, deploy...) → [docs/GUIAS-OPCIONAIS.md](docs/GUIAS-OPCIONAIS.md)
- **Quero baixar/sincronizar este repo num projeto** → [docs/INSTALACAO-EM-OUTROS-PROJETOS.md](docs/INSTALACAO-EM-OUTROS-PROJETOS.md)
- **Quero o comando global `felixo`** → [docs/INSTALACAO-EM-OUTROS-PROJETOS.md — comando `felixo`](docs/INSTALACAO-EM-OUTROS-PROJETOS.md#comando-global-felixo-instalador-multiplataforma)
- **Quero o banco de componentes UI** → submodulo [`components-database/`](components-database/) (veja as variantes "com submodulo" em [docs/INSTALACAO-EM-OUTROS-PROJETOS.md](docs/INSTALACAO-EM-OUTROS-PROJETOS.md))
- **Quero a politica de git** (branches, commits, doc viva) → [docs/GIT-POLITICA-DE-VERSIONAMENTO.md](docs/GIT-POLITICA-DE-VERSIONAMENTO.md)
- **Vou contribuir de fora** → [CONTRIBUTING.md](CONTRIBUTING.md)
- **Sou um agente de IA** (aqui ou consumindo o repo em outro projeto) → [AGENTS.md](AGENTS.md) (roteiro de leitura por tarefa)
- **Vou versionar mudancas neste repo** → [Para Agentes de IA](#-para-agentes-de-ia) (resumo) e [docs/GIT-POLITICA-DE-VERSIONAMENTO.md](docs/GIT-POLITICA-DE-VERSIONAMENTO.md) (completo)

---

## Estrutura do Repositorio

```
Felixo-System-Design/
│
├── core/                                    # OBRIGATORIO — usar em todo projeto
│   ├── TEMPLATE-CONTEXTO-IA.md              # Template de contexto operacional (copiar como IA.md no projeto)
│   ├── DESIGN_SYSTEM_FRONTEND.md            # Padroes de qualidade frontend
│   ├── DESIGN_SYSTEM_BACKEND.md             # Padroes de qualidade backend
│   ├── DESIGN_SYSTEM_README.md              # Padroes de documentacao README
│   ├── GUIA_MINIMO_QUALIDADE.md             # Regras minimas obrigatorias de qualidade
│   ├── GUIA-START-APP-SCRIPT.md             # Menu de entrada obrigatorio (instala/configura/inicia)
│   ├── PROMPT_BASE_FRONTEND.md              # Prompt guiado para frontend
│   └── PROMPT_BASE_BACKEND.md               # Prompt guiado para backend
│
├── guias/                                   # OPCIONAL — usar quando relevante
│   ├── frontend/                            # UI, visual, UX, dados
│   │   ├── GUIA-COMPONENTES-UI-COMPOSTOS.md
│   │   ├── GUIA-PARTICULAS-E-GLOW.md
│   │   ├── GUIA-BACKGROUND-VISUAL.md
│   │   ├── GUIA-HEATMAP-DE-ATIVIDADE.md
│   │   ├── GUIA-ONBOARDING-E-AJUDA.md
│   │   ├── GUIA-ARVORE-HIERARQUICA.md
│   │   ├── GUIA-ARVORE-DE-MATERIAIS-DUAL-VIEW.md
│   │   ├── GUIA-CALENDARIO-ACADEMICO.md
│   │   └── GUIA-SISTEMA-DE-ALERTA-E-GRADE.md
│   ├── backend/                             # Logica pura Python/Django
│   │   ├── GUIA-BACKEND-CPF.md
│   │   └── GUIA-CRIPTOGRAFIA-CIFRA-DE-CESAR.md
│   └── integracao/                          # Integracoes externas
│       ├── GUIA-INTEGRACAO-API-GITHUB.md
│       ├── GUIA-SCRAPING-MULTIFORMATO.md
│       └── GUIA-DEPLOY-RAILWAY.md
│
├── components-database/                     # SUBMODULO — banco de componentes UI
│   ├── scraper/                             # Coletor de componentes (10 fontes)
│   ├── site/                                # Biblioteca visual (Flask + React/Vite)
│   └── start_app.py                         # Setup + coleta com um comando
│
├── scripts/                                 # Instaladores do comando global "felixo"
│   ├── bash-zsh/
│   │   └── install-felixo-bash-zsh.sh       # Instalador p/ Bash e Zsh (Linux, macOS, Git Bash, WSL)
│   ├── powershell/
│   │   └── install-felixo-powershell.ps1    # Instalador p/ PowerShell (Windows, Linux, macOS)
│   └── cmd/                                  # CMD (Prompt classico do Windows)
│       ├── install-felixo-cmd.cmd           # Instalador (roda uma vez)
│       └── felixo-command.cmd               # Comando felixo em si (instalado como felixo.cmd)
│
├── docs/                                    # Documentacao por responsabilidade
│   ├── CORE-PADROES-OBRIGATORIOS.md         # Detalhe dos padroes obrigatorios
│   ├── GUIAS-OPCIONAIS.md                   # Detalhe dos guias por dominio
│   ├── GIT-POLITICA-DE-VERSIONAMENTO.md     # Politica de git (branches, commits, doc viva)
│   └── INSTALACAO-EM-OUTROS-PROJETOS.md     # Como usar em outros projetos (8 metodos)
│
├── AGENTS.md                                # Roteiro de leitura para agentes de IA
├── CONTRIBUTING.md
├── README.md
├── LICENSE
└── .gitmodules
```

---

## Minha Stack

### Linguagens

| Tecnologia | Uso |
|------------|-----|
| **HTML5** | Estrutura e marcacao web |
| **CSS3** | Estilizacao e layout |
| **JavaScript** | Logica client-side e scripts |
| **TypeScript** | Tipagem forte, projetos escalaveis |
| **C#** | Back-end robusto, APIs .NET |
| **Python** | Back-end, automacoes, scripts |

### Frameworks & Bibliotecas

| Tecnologia | Uso |
|------------|-----|
| **React** | Interfaces de usuario reativas |
| **Tailwind CSS** | Estilizacao utilitaria |
| **Bootstrap** | Prototipagem rapida, admin panels |
| **Django** | Back-end Python, APIs REST |
| **Vite** | Build tool e dev server rapido |

### Ferramentas & Infraestrutura

| Ferramenta | Uso |
|------------|-----|
| **Git** | Controle de versao |
| **GitHub** | Repositorios, CI/CD, colaboracao |
| **VS Code** | IDE principal |
| **Railway** | Plataforma padrao para deploy de backend online (PaaS) |
| **Windows** | Sistema operacional de desenvolvimento |

---

## Para Agentes de IA

> **Comece por [`AGENTS.md`](AGENTS.md)** — o roteiro de leitura por tipo de tarefa. Ele diz quais documentos abrir (e quais ignorar) conforme o prompt, tanto para quem trabalha neste repositorio quanto para quem consome uma copia dele em outro projeto.

Instrucoes para agentes que trabalham **diretamente neste repositorio** (nao via fork). Para contribuicoes externas, siga o fluxo de fork + Pull Request descrito em [`CONTRIBUTING.md`](CONTRIBUTING.md).

> **A politica de git completa esta em [`docs/GIT-POLITICA-DE-VERSIONAMENTO.md`](docs/GIT-POLITICA-DE-VERSIONAMENTO.md)** — branches, commits e documentacao viva, com exemplos de mensagem boa/ruim e checklist. O resumo abaixo e o essencial; leia o documento dedicado antes de versionar.

### Git e branches — o padrao e *nao* criar branch

- **Trabalhe direto no `main` por padrao.** Commite no `main` sem branch para: correcoes simples, documentacao, ajustes pequenos e refatoracoes seguras (que nao mudam comportamento).
- **So crie uma branch nova nestes tres casos:** (1) **feature grande**, (2) **refatoracao significativa**, ou (3) algo de **alto risco** (altera comportamento e precisa ser testado antes de entrar, ou pode quebrar algo existente). Se voce nao consegue dizer qual dos tres justifica a branch, **nao crie branch**.
- **Evite o vicio de abrir uma branch por implementacao.** Varios agentes criam branches demais; aqui isso e considerado errado.
- **Apos o merge, apague a branch** (local e remota). Branch ja mesclada que fica para tras polui o historico e confunde o que ainda esta em andamento.

### Commits — pequenos, frequentes e descritivos

- **Sempre commite apos uma adicao concluida.** Nao acumule varias mudancas soltas sem commitar.
- **Commits pequenos, mas bem descritivos.** Cada commit e uma unidade coesa (uma ideia, um motivo). Se precisar de varios "e" para descrever, sao varios commits.
- **Mensagem no formato `tipo: descricao`** (Conventional Commits): `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` — explicando **o que** mudou e **por que**. Detalhes e exemplos em [`docs/GIT-POLITICA-DE-VERSIONAMENTO.md`](docs/GIT-POLITICA-DE-VERSIONAMENTO.md#3-commits--pequenos-frequentes-e-descritivos).

### Documentacao viva — no mesmo commit

- **Mantenha a documentacao atualizada e viva durante os commits.** Ao mudar comportamento, estrutura ou comandos, atualize no mesmo passo o `README.md`, os documentos em [`docs/`](docs/), os guias e o `IA.md` afetados — documentacao desatualizada conta como trabalho incompleto.
- A pasta [`docs/`](docs/) ja existe para documentacao por responsabilidade (core, guias, git, instalacao). Mantenha cada arquivo com **uma responsabilidade unica** e adicione novos documentos ali quando um tema nao couber naturalmente nos existentes.

---

## Licenca

Este projeto esta sob a licenca MIT — veja o arquivo `LICENSE`.

## Autor

**Felipe Martin**
- GitHub: [@Felipe-Alcantara](https://github.com/Felipe-Alcantara)

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositorio **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versao: 2026-06-12
> Sugestoes e pull requests sao bem-vindos.

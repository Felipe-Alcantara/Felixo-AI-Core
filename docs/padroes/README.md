# 🎨 Felixo System Design

<div align="center">

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![C#](https://img.shields.io/badge/C%23-512BD4?style=for-the-badge&logo=csharp&logoColor=white)
![Django](https://img.shields.io/badge/Django-0C4B33?style=for-the-badge&logo=django&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Docs](https://img.shields.io/badge/Docs-Guide-2084FF?style=for-the-badge&logo=read-the-docs&logoColor=white)

**Repositório central de padrões de design, qualidade de sistema, prompts estruturados, documentação operacional e guias reutilizáveis para IA.**

[🧱 Padrões de Design](#-padrões-de-design) • [🤖 IA.md](#-iamd--contexto-operacional-para-ia) • [🧰 Utils](#%EF%B8%8F-utils--padrões-específicos) • [🛠️ Stack](#%EF%B8%8F-minha-stack)

</div>

---

## 📋 Índice

- [📋 Sobre o Repositório](#-sobre-o-repositório)
- [🛠️ Minha Stack](#%EF%B8%8F-minha-stack)
- [📁 Estrutura do Repositório](#-estrutura-do-repositório)
- [🧱 Padrões de Design](#-padrões-de-design)
- [🤖 IA.md — Contexto Operacional para IA](#-iamd--contexto-operacional-para-ia)
- [🧰 Utils — Padrões Específicos](#-utils--padrões-específicos)
- [📥 Como Usar em Outros Projetos](#-como-usar-em-outros-projetos)
- [📝 Licença](#-licença)
- [👤 Autor](#-autor)

---

## 📋 Sobre o Repositório

Este repositório serve como **base centralizada** para registrar e padronizar tudo que envolve meus projetos de desenvolvimento:

- **🧱 Padrões de Design** — Guias de frontend, backend e README para padronizar arquitetura, qualidade e documentação
- **🚀 Prompts para IA** — Prompts estruturados para iniciar projetos e guiar execução com menos re-prompts
- **🛠️ Stack de Tecnologias** — Registro da stack preferida para priorizar em novos projetos
- **🤖 Template de Contexto para IA** — Memória operacional padronizada para manter contexto entre modelos de IA ao longo do projeto
- **📖 Padrão de Documentação** — Guia de como documentar repositórios com READMEs consistentes
- **🧰 Padrões Específicos (Utils)** — Guias reutilizáveis extraídos de implementações reais para casos de uso específicos

O objetivo é ter um **ponto de referência único** para garantir consistência, qualidade e agilidade em todos os novos projetos.

---

## 🛠️ Minha Stack

### Linguagens

| Tecnologia | Uso |
|------------|-----|
| **HTML5** | Estrutura e marcação web |
| **CSS3** | Estilização e layout |
| **JavaScript** | Lógica client-side e scripts |
| **TypeScript** | Tipagem forte, projetos escaláveis |
| **C#** | Back-end robusto, APIs .NET |
| **Python** | Back-end, automações, scripts |

### Frameworks & Bibliotecas

| Tecnologia | Uso |
|------------|-----|
| **React** | Interfaces de usuário reativas |
| **Tailwind CSS** | Estilização utilitária |
| **Bootstrap** | Prototipagem rápida, admin panels |
| **Django** | Back-end Python, APIs REST |
| **Vite** | Build tool e dev server rápido |

### Ferramentas & Infraestrutura

| Ferramenta | Uso |
|------------|-----|
| **Git** | Controle de versão |
| **GitHub** | Repositórios, CI/CD, colaboração |
| **VS Code** | IDE principal |
| **Windows** | Sistema operacional de desenvolvimento |

---

## 📁 Estrutura do Repositório

```
Felixo System Design/
│
├── PADRÕES DE DESIGN/            # Guias centrais de frontend, backend, README e prompts
│   ├── DESIGN_SYSTEM_PARA_FRONTEND.md
│   ├── DESIGN_SYSTEM_PARA_BACKEND.md
│   ├── PROMPT_BASE_PARA_BACKEND.md
│   └── DESIGN_SYSTEM_PARA_README.md
├── Utils/                        # Guias reutilizáveis extraídos de projetos reais
│   ├── GUIA-ARVORE-HIERARQUICA-REUTILIZAVEL-DO-FELIXO-TIME-TRACKER.md
│   ├── GUIA-BACKGROUND-SISTEMA-VISUAL-REUTILIZAVEL-DA-CALCULADORA-PRO-WEB-BRYTHON.md
│   ├── GUIA-BACKEND-REUTILIZAVEL-PARA-CPF-COM-TESTES-E-DADOS-REAIS-DO-GERADOR-DE-CPF-VALIDO-EM-PYTHON.md
│   ├── GUIA-HEATMAP-DE-ATIVIDADE-REUTILIZAVEL-DO-READING-TRACKER.md
│   ├── GUIA-INTEGRACAO-REUTILIZAVEL-COM-API-DO-GITHUB-PARA-COLETA-DE-REPOSITORIOS-PUBLICOS-E-PRIVADOS.md
│   ├── GUIA-ONBOARDING-E-AJUDA-REUTILIZAVEL-DO-READING-TRACKER.md
│   └── GUIA-SISTEMAS-DE-CRIPTOGRAFIA-REUTILIZAVEIS-DA-CIFRA-DE-CESAR-EM-PYTHON.md
├── IA.md                         # Contexto operacional e memória para IA
├── README.md                     # Este arquivo
└── LICENSE
```

---

## 🧱 Padrões de Design

A pasta `PADRÕES DE DESIGN/` concentra os artefatos principais do acervo. Ela separa o que é **padrão técnico de qualidade** do que é **prompt operacional para IA**, evitando documentos híbridos e facilitando reutilização.

### 🎨 Design System para Frontend

Guia completo de padronização visual para front-end, extraído do **FelixoVerse**. Documenta paleta, tipografia, layout, componentes, animações e padrões de interface.

📖 [Ver design system frontend](PADRÕES%20DE%20DESIGN/DESIGN_SYSTEM_PARA_FRONTEND.md)

### 🧱 Design System para Backend

Guia de **qualidade de sistema backend**. Define princípios de arquitetura, escolha de stack, modularização forte, separação de responsabilidades, estrutura por camadas, padrões de API, persistência, testes, TDD, SQLite como padrão inicial, Open/Closed, documentação viva e checklist de qualidade.

📖 [Ver design system backend](PADRÕES%20DE%20DESIGN/DESIGN_SYSTEM_PARA_BACKEND.md)

### 🚀 Prompt Base para Backend

Guia técnico para o desenvolvedor montar prompts de backend mais completos logo na primeira interação. Inclui stacks recomendadas, decisões técnicas por cenário, campos para problemas atuais e futuras features, e exige que a IA siga o `DESIGN_SYSTEM_PARA_BACKEND.md` como contrato de qualidade.

📖 [Ver prompt base backend](PADRÕES%20DE%20DESIGN/PROMPT_BASE_PARA_BACKEND.md)

### 📖 Design System para README

Guia de padronização para `README.md`, usado como referência para manter documentação consistente entre projetos.

📖 [Ver design system para README](PADRÕES%20DE%20DESIGN/DESIGN_SYSTEM_PARA_README.md)

---

## 🤖 IA.md — Contexto Operacional para IA

O arquivo `IA.md` funciona como **memória operacional viva do projeto**. Ele deve ser atualizado durante a execução assistida por IA para registrar:

- objetivo atual e milestones
- decisões técnicas
- stack e convenções
- bugs e correções relevantes
- testes importantes
- contexto necessário para outra IA retomar o trabalho sem reler tudo

Dentro deste repositório, ele serve como referência de como manter contexto acumulado entre sessões e modelos.

📖 [Ver IA.md](IA.md)

---

## 🧰 Utils — Padrões Específicos

Pasta com **guias reutilizáveis extraídos de projetos reais**. Diferente dos padrões gerais do repositório, os arquivos em `Utils/` isolam soluções concretas que nasceram em produtos específicos e foram documentadas aqui para reaproveitamento futuro.

Cada arquivo de `Utils/` responde a três perguntas:

- Qual problema ele resolve
- De qual projeto esse padrão foi extraído
- Em que tipo de sistema vale a pena reutilizá-lo

### 🌳 Árvore Hierárquica Reutilizável do Felixo Time Tracker

Este guia documenta o padrão de **exploração hierárquica de categorias** extraído do **Felixo Time Tracker**. O foco é reaproveitar a combinação entre modelo em árvore no backend e componente recursivo no frontend para qualquer interface com navegação parent-child.

**Quando usar:**
- Explorador de categorias/pastas
- Menus hierárquicos
- Estruturas organizacionais
- Qualquer dado em árvore (parent-child)

**O que contém:**
- Modelo Django com self-referential FK
- Serializer recursivo para API
- Componente React recursivo
- Animações e interações (expandir/recolher, seleção)
- Sistema de indentação visual

📖 [Ver guia completo](Utils/GUIA-ARVORE-HIERARQUICA-REUTILIZAVEL-DO-FELIXO-TIME-TRACKER.md)

### 🌌 Background de Sistema Visual Reutilizável da Calculadora Pro Web (Brython)

Este guia registra o padrão de **background visual em camadas** extraído da versão web da **Calculadora Científica Pro**. O documento transforma a composição de gradiente, símbolos matemáticos animados, densidade visual e troca de tema em um subsistema reaproveitável para outras interfaces com apelo técnico ou temático.

**Quando usar:** calculadoras, páginas educacionais, dashboards técnicos, experiências web com identidade visual forte e interfaces que precisem de profundidade visual sem atrapalhar a interação principal.

📖 [Ver guia completo](Utils/GUIA-BACKGROUND-SISTEMA-VISUAL-REUTILIZAVEL-DA-CALCULADORA-PRO-WEB-BRYTHON.md)

### 🪪 Backend Reutilizável para CPF com Testes e Dados Reais

Este guia registra um padrão de **backend lógico para CPF** extraído do projeto **Gerador de CPF Válido em Python**. Ele organiza algoritmo, contratos, fluxo de validação, matriz de testes e guardrails para uso de dados reais, permitindo reaproveitar a solução em serviços, APIs, formulários e automações.

**Quando usar:** geração sintética de CPF para testes, validação backend de documentos, normalização de entrada, formulários com CPF e fluxos que precisem tratar dados reais com mais cuidado.

📖 [Ver guia completo](Utils/GUIA-BACKEND-REUTILIZAVEL-PARA-CPF-COM-TESTES-E-DADOS-REAIS-DO-GERADOR-DE-CPF-VALIDO-EM-PYTHON.md)

### 📅 Heatmap de Atividade Reutilizável do Reading Tracker

Este guia isola o padrão de **calendário de atividade com intensidade visual** extraído do **Reading Tracker**. Ele serve como referência para qualquer produto que precise transformar eventos diários em uma leitura visual rápida de consistência, volume ou frequência.

**Quando usar:** visualização de atividade por dia/semana/mês, dashboards de uso, análise temporal rápida.

📖 [Ver guia completo](Utils/GUIA-HEATMAP-DE-ATIVIDADE-REUTILIZAVEL-DO-READING-TRACKER.md)

### 🐙 Integração Reutilizável com API do GitHub (Repositórios Públicos e Privados)

Este guia registra o padrão de **coleta robusta de repositórios no GitHub** extraído do **Git-Hub-Repositories**, incluindo autenticação por token, paginação, deduplicação, regra de privados, retry com backoff e tratamento de rate limit para uso em diferentes tipos de sistema.

**Quando usar:** importadores de portfólio, dashboards de projetos, sincronizadores, ETLs de inventário técnico e qualquer integração que precise buscar dados de repositórios públicos e privados com segurança operacional.

📖 [Ver guia completo](Utils/GUIA-INTEGRACAO-REUTILIZAVEL-COM-API-DO-GITHUB-PARA-COLETA-DE-REPOSITORIOS-PUBLICOS-E-PRIVADOS.md)

### 🧭 Onboarding e Ajuda Reutilizáveis do Reading Tracker

Este guia registra o padrão de **primeira experiência do usuário** extraído do **Reading Tracker**, combinando onboarding leve, destaque visual contextual e centro de ajuda permanente. O objetivo é reaproveitar a lógica de adoção e suporte sem precisar redesenhar esse fluxo do zero em cada produto.

**Quando usar:** produtos com múltiplas funcionalidades, interfaces com curva inicial de aprendizado, dashboards e apps que precisam educar o usuário sem poluir a navegação.

📖 [Ver guia completo](Utils/GUIA-ONBOARDING-E-AJUDA-REUTILIZAVEL-DO-READING-TRACKER.md)

### 🔐 Sistemas de Criptografia Reutilizáveis da Cifra de César em Python

Este guia consolida os sistemas reutilizáveis da **Cifra de César em Python**, cobrindo **cifra tradicional**, **cifra numérica**, **normalização de acentos** e **interface web integrada com Brython** como blocos reaproveitáveis.

**Quando usar:** apps educacionais de criptografia, playgrounds web, utilitários de encode/decode e ferramentas de transformação textual.

📖 [Ver guia completo](Utils/GUIA-SISTEMAS-DE-CRIPTOGRAFIA-REUTILIZAVEIS-DA-CIFRA-DE-CESAR-EM-PYTHON.md)

> 💡 **Nota**: Os arquivos em `Utils/` são **opcionais e específicos**. Use apenas se o seu projeto precisar daquela funcionalidade específica. Os padrões gerais da pasta `PADRÕES DE DESIGN/` e o `IA.md` devem acompanhar praticamente todos os projetos.

---

## 📥 Como Usar em Outros Projetos

Use os métodos abaixo do mais usual para o mais específico.

### 1. Sincronizar `felixo-standards` com a versão mais recente (Recomendado)

Melhor opção quando você quer manter uma pasta local sem vínculo com o git original e poder rodar o comando quantas vezes quiser para atualizar.

**Linux / macOS / Git Bash:**
```bash
tmp_dir="$(mktemp -d)" && git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git "$tmp_dir/repo" && rm -rf "$tmp_dir/repo/.git" && mkdir -p ./felixo-standards && rsync -a --delete "$tmp_dir/repo/" ./felixo-standards/ && rm -rf "$tmp_dir"
```

**PowerShell (Windows):**
```powershell
$tmpDir = Join-Path $env:TEMP ("felixo-standards-" + [guid]::NewGuid())
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git $tmpDir
Remove-Item -Recurse -Force (Join-Path $tmpDir ".git")
New-Item -ItemType Directory -Force -Path "./felixo-standards" | Out-Null
robocopy $tmpDir "./felixo-standards" /MIR | Out-Null
Remove-Item -Recurse -Force $tmpDir
```

**CMD (Windows):**
```cmd
set TMP_DIR=%TEMP%\felixo-standards-%RANDOM% && git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git %TMP_DIR% && rmdir /s /q %TMP_DIR%\.git && if not exist felixo-standards mkdir felixo-standards && robocopy %TMP_DIR% felixo-standards /MIR >nul && rmdir /s /q %TMP_DIR%
```

- **Use quando**: quer todos os arquivos como base independente para outro projeto, com atualização simples depois
- **Requisito**: Git
- **Vínculo com o git original?** Não

#### Atalho global `felixo` (Bash/Zsh)

Se você quiser um comando global para sincronizar em qualquer pasta:

```bash
felixo() {
  local dest="./felixo-standards"
  local repo_url="https://github.com/Felipe-Alcantara/Felixo-System-Design.git"
  local tmp_dir
  tmp_dir="$(mktemp -d)" || return 1
  git clone --depth 1 "$repo_url" "$tmp_dir/repo" || { rm -rf "$tmp_dir"; return 1; }
  rm -rf "$tmp_dir/repo/.git"
  mkdir -p "$dest"
  rsync -a --delete "$tmp_dir/repo/" "$dest/"
  rm -rf "$tmp_dir"
}
```

Esse comando sempre sincroniza a pasta com a versão mais recente do repositório (adiciona novos arquivos, atualiza alterados e remove os que não existem mais no remoto).

---

### 2. Baixar o repositório inteiro como ZIP

Melhor opção quando você só quer os arquivos rapidamente, sem `git` e sem Node.js.

**PowerShell (Windows):**
```powershell
Invoke-WebRequest -Uri "https://github.com/Felipe-Alcantara/Felixo-System-Design/archive/refs/heads/main.zip" -OutFile "felixo.zip"
Expand-Archive "felixo.zip" -DestinationPath .
Rename-Item "Felixo-System-Design-main" "felixo-standards"
Remove-Item "felixo.zip"
```

**CMD (Windows):**
```cmd
curl -L https://github.com/Felipe-Alcantara/Felixo-System-Design/archive/refs/heads/main.zip -o felixo.zip
tar -xf felixo.zip
ren Felixo-System-Design-main felixo-standards
del felixo.zip
```

**Linux / macOS:**
```bash
curl -L https://github.com/Felipe-Alcantara/Felixo-System-Design/archive/refs/heads/main.zip -o felixo.zip
unzip felixo.zip && mv Felixo-System-Design-main felixo-standards && rm felixo.zip
```

- **Use quando**: quer o repositório inteiro da forma mais simples possível
- **Vínculo com o git original?** Não
- **Limitação**: não baixa subpastas isoladas

---

### 3. Baixar o repositório inteiro com `npx degit`

Melhor opção quando você quer o repositório inteiro sem `.git`, mas prefere fazer isso pelo terminal com Node.js.

```bash
npx degit Felipe-Alcantara/Felixo-System-Design ./felixo-standards
```

- **Use quando**: quer o repositório inteiro, sem histórico
- **Requisito**: Node.js
- **Vínculo com o git original?** Não

---

### 4. Clonar o repositório inteiro com `git`

Melhor opção quando você quer manter vínculo com o repositório para atualizar depois.

```bash
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git ./felixo-standards
```

- **Use quando**: quer o repositório inteiro e pretende atualizar com `git pull`
- **Requisito**: Git
- **Vínculo com o git original?** Sim

---

### 5. Baixar apenas a pasta `Utils` com `npx degit`

Melhor opção quando você quer somente os guias reutilizáveis da pasta `Utils`, sem baixar o resto.

```bash
npx degit Felipe-Alcantara/Felixo-System-Design/Utils ./felixo-utils
```

- **Use quando**: precisa só dos padrões específicos extraídos de projetos reais
- **Requisito**: Node.js
- **Saída esperada**: o conteúdo de `Utils/` vai direto para a pasta de destino

---

### 6. Baixar apenas a pasta `PADRÕES DE DESIGN`

Como essa pasta tem espaço e acentuação no nome, a opção mais confiável é usar `git sparse-checkout` ou clonar o repositório inteiro e copiar a pasta manualmente.

**Se quiser manter atualização futura, prefira `sparse-checkout`:**

```bash
mkdir felixo-design-patterns
cd felixo-design-patterns
git init
git remote add -f origin https://github.com/Felipe-Alcantara/Felixo-System-Design.git
git sparse-checkout init --no-cone
git sparse-checkout set "PADRÕES DE DESIGN"
git pull origin main
```

- **Use quando**: quer apenas os padrões centrais de frontend, backend, README e prompts
- **Requisito**: Git
- **Vínculo com o git original?** Sim

---

### 7. Baixar apenas a pasta `Utils` com `git sparse-checkout`

Melhor opção quando você quer só `Utils` e também quer poder atualizar essa pasta depois com `git pull`.

```bash
mkdir felixo-utils
cd felixo-utils
git init
git remote add -f origin https://github.com/Felipe-Alcantara/Felixo-System-Design.git
git sparse-checkout init --no-cone
git sparse-checkout set Utils
git pull origin main
```

- **Use quando**: quer só `Utils` e quer atualização futura
- **Requisito**: Git
- **Vínculo com o git original?** Sim

---

### 8. Clonar o repositório inteiro e copiar só a pasta desejada

Fallback universal quando você quer uma pasta específica, mas prefere evitar sensibilidade de ferramenta por nome de pasta, shell ou encoding.

```bash
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git ./felixo-standards
```

Depois, copie manualmente apenas uma destas pastas:

- `./felixo-standards/Utils`
- `./felixo-standards/PADRÕES DE DESIGN`

- **Use quando**: quer a forma mais previsível para extrair uma pasta específica
- **Requisito**: Git

---

### 9. Baixar o ZIP do repositório inteiro e extrair só a pasta desejada

Fallback sem `git` para quando você quer apenas uma pasta, mas aceita baixar o repositório inteiro primeiro.

Fluxo:

1. Baixe o ZIP do repositório inteiro
2. Extraia
3. Copie apenas:
   - `Utils/`
   - `PADRÕES DE DESIGN/`

- **Use quando**: quer evitar `git`, mas precisa de uma pasta específica
- **Limitação**: baixa tudo, mesmo se você só usar uma pasta

---

### Escolha Rápida por Cenário

| Cenário | Melhor opção |
|--------|--------------|
| Quero o caso mais usual para reaproveitar tudo | sincronização sem `.git` (método 1 / atalho `felixo`) |
| Quero tudo da forma mais simples | ZIP |
| Quero tudo sem `.git` via terminal | `npx degit` |
| Quero tudo e depois atualizar | `git clone` |
| Quero só `Utils` sem `git` | `npx degit` em `Utils` |
| Quero só `Utils` com atualização futura | `git sparse-checkout` |
| Quero só `PADRÕES DE DESIGN` | `git sparse-checkout` ou clone completo + copiar |
| Quero uma opção universal e previsível | clone completo + copiar a pasta |

---

> 💡 **Dica**: Após copiar, os arquivos ficam independentes. Você pode editá-los, mover para outra pasta ou commitar junto com o seu projeto normalmente.

---

## 📝 Licença

Este projeto está sob a licença MIT — veja o arquivo `LICENSE`.

## 👤 Autor

**Felipe Martin**
- GitHub: [@Felipe-Alcantara](https://github.com/Felipe-Alcantara)

---

⭐ Se este repositório foi útil, considere dar uma estrela no GitHub!

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.

# Guia do Desenvolvedor — Felixo AI Core

Este guia descreve os padrões, arquitetura básica e os processos necessários para contribuir com o código-fonte do Felixo AI Core.

---

## 1. Setup de Desenvolvimento

Para contribuir com o projeto, você precisa configurar seu ambiente local:

### Requisitos Mínimos
- **Node.js**: Versão 20.x ou superior (recomendado o uso de NVM/Volta).
- **Gerenciador de Pacotes**: `npm` (ou `pnpm` se estiver configurado no repositório).
- **Git**: Para versionamento do código.
- **Terminal compatível**: Bash/Zsh (Linux/macOS) ou PowerShell/Git Bash (Windows).

### Passos de Instalação
1. Clone o repositório:
   ```bash
   git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
   cd Felixo-AI-Core
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```

---

## 2. Comandos Principais

Aqui estão os scripts mais comuns disponíveis no `package.json`:

- `npm run dev`: Inicia o aplicativo em modo de desenvolvimento (com hot-reload se aplicável).
- `npm run build`: Compila os arquivos fonte para o formato de produção (TypeScript/Babel/Vite).
- `npm run package` (ou `npm run make`): Empacota o build final em executáveis (`.exe`, `.AppImage`, `.dmg`).
- `npm run test`: Executa a suíte de testes.
- `npm run lint`: Executa a análise estática do código (ESLint/Prettier).

---

## 3. Estrutura de Pastas

A estrutura padrão do projeto segue:

- `/docs/`: Toda a documentação técnica, de usuário, arquitetura e testes.
- `/src/` ou equivalentes:
  - `/core/` (ou `/main/`): Lógica de background, integração com sistema operacional e APIs nativas (ex: Electron main process).
  - `/ui/` (ou `/renderer/`): Interface gráfica do usuário.
  - `/adapters/`: Camada adaptativa para diferentes sistemas operacionais (paths, shell, CLIs).
- `/scripts/`: Scripts auxiliares de build, CI e automação.

---

## 4. Como Testar em Cada SO

Ao criar uma nova feature que interage com o sistema (arquivos, terminal, processos), é necessário testar em todos os SOs suportados.

- **Linux:** Validar permissões, paths com barra normal `/` e uso do shell padrão (Bash).
- **Windows:** Validar paths com contra-barra `\`, espaços nos nomes de usuário (ex: `C:\Users\Felipe Alcantara`) e comandos no PowerShell/CMD.
- **macOS:** Validar comportamento do App Sandbox, permissões e paths no Apple Silicon vs Intel.

> **Dica:** Se você usar apenas um SO, utilize instâncias de Máquinas Virtuais (VMs) ou as Actions do GitHub (CI) para validar o build nos demais sistemas.

---

## 5. Política de Branch e Fluxo de Publicação

Seguimos um fluxo baseado no **GitHub Flow / Trunk Based Development** com algumas restrições:

- **`main` / `dev`:** Branch principal de desenvolvimento. Todo código novo entra aqui através de Pull Requests.
- **`feature/*`, `bugfix/*`:** Branches de trabalho temporárias criadas a partir da `main`.
- **`production`:** Branch OFICIAL de release.
  - **ATENÇÃO:** Qualquer `push` ou merge nesta branch **dispara automaticamente** o fluxo de CI/CD, compilando o app e publicando uma release para o usuário final.
  - Só envie código para `production` quando o build local estiver 100% testado e aprovado.

---

## 6. Padrão de Commits

O repositório utiliza o padrão do **Conventional Commits** (Commit Semântico). Todo commit deve seguir a estrutura:

```
<tipo>(<escopo>): <descrição curta no imperativo>

[corpo opcional explicando o porquê da mudança]
```

**Tipos mais comuns:**
- `feat:` Adiciona uma nova funcionalidade (ex: `feat(shell): suporte a powershell no windows`).
- `fix:` Corrige um bug (ex: `fix(paths): resolve erro de barra no linux`).
- `docs:` Alterações na documentação (ex: `docs(dev): atualiza guia do desenvolvedor`).
- `refactor:` Refatoração de código sem mudar funcionalidade.
- `chore:` Atualização de dependências, configurações de build ou CI.

---

## 7. Política de Release e Versionamento

O projeto adota um formato de versionamento simplificado baseado no SemVer (Semantic Versioning):
- Versões em formato `0.x.x` (enquanto experimental).
- Incremento **Minor** (`0.1.0` -> `0.2.0`) para novas features grandes ou marcos do projeto.
- Incremento **Patch** (`0.1.1` -> `0.1.2`) para correções de bugs urgentes.

O processo de empacotamento (`npm run package`) lê automaticamente a versão do `package.json`. Certifique-se de atualizar a versão antes de fazer o merge para a branch `production`.

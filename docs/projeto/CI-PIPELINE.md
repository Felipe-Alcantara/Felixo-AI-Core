# CI Pipeline

Status: concluido.

## Objetivo

Validar automaticamente o projeto em cada push e pull request, garantindo que o código compila, passa nos testes e segue os padrões do projeto.

---

## Workflow: `.github/workflows/ci.yml`

### Quando roda

- Em todo **pull request**.
- Em todo **push** nas branches `main` e `production`.

### Plataformas

A CI roda em paralelo em três sistemas operacionais:

| Runner | SO |
|--------|-----|
| `ubuntu-latest` | Linux |
| `windows-latest` | Windows |
| `macos-latest` | macOS |

### Passos

1. **Checkout** — clona o repositório.
2. **Setup Node** — instala Node.js 22 com cache de npm.
3. **Install dependencies** — `npm ci` (instalação limpa).
4. **Test** — `npm test` (testes unitários).
5. **Lint** — `npm run lint` (ESLint).
6. **Build renderer** — `npm run build` (TypeScript + Vite).
7. **Check documentation** — verifica existência de docs obrigatórios.
8. **Check sensitive files** — bloqueia build se `.env` existir.

### Docs obrigatórios verificados

- `docs/projeto/STATUS-ATUAL.md`
- `docs/projeto/ROADMAP.md`
- `docs/projeto/GUIA-DESENVOLVEDOR.md`
- `docs/projeto/GUIA-USUARIO-FINAL.md`

### Arquivos sensíveis bloqueados

- `.env`
- `.env.local`
- `.env.production`

---

## Workflow: `.github/workflows/release.yml`

### Quando roda

- Em todo **push** na branch `production`.
- Disparo manual via `workflow_dispatch`.

### Passos

1. Checkout.
2. Setup Node.js 22.
3. `npm ci`.
4. Gera versão de produção: `{base_version}.{GITHUB_RUN_NUMBER}`.
5. `npm run build`.
6. `npx electron-builder --publish always`.

### Artefatos gerados

| Runner | Artefatos |
|--------|----------|
| `ubuntu-latest` | AppImage (x64, arm64), .deb (x64) |
| `windows-latest` | .exe NSIS (x64) |
| `macos-latest` | .dmg, .zip (x64, arm64) |

---

## Status da CI no repositório

O status da CI fica visível no GitHub:
- Badge na lista de PRs.
- Checks na aba de commits.
- Status em cada branch.

---

## Execução local

Para simular a CI localmente:

```bash
cd app
npm ci
npm test
npm run lint
npm run build
```

Se todos passarem, o código está pronto para push.

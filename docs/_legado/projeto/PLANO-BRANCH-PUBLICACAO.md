# Plano de Branch e Fluxo de Publicação

Status: concluido.

## Objetivo

Definir como o código sai do desenvolvimento e chega até uma release pública.

---

## Branches oficiais

| Branch | Propósito | Proteção |
|--------|----------|----------|
| `main` | Desenvolvimento ativo | CI obrigatório |
| `production` | Release oficial | CI + build + release automático |

---

## Fluxo de trabalho

```
feature/xyz  →  main  →  production  →  GitHub Release
     ↑            ↑           ↑              ↑
 Desenvolvimento  Merge    Merge final    Build automático
                  + CI     (quando pronto)  + Publicação
```

### 1. Desenvolvimento de features

```bash
git checkout main
git pull origin main
git checkout -b feature/nome-da-feature
# ... desenvolver, testar, commitar ...
git push origin feature/nome-da-feature
# Abrir PR para main
```

### 2. Merge na main

- Pull request revisado (ou auto-merge para solo dev).
- CI roda testes, lint e build.
- Merge via squash ou merge commit.

### 3. Preparar release

Quando a `main` estiver pronta para publicação:

```bash
git checkout production
git merge main
git push origin production
```

### 4. Release automática

Push em `production` dispara `.github/workflows/release.yml`:
1. Checkout do código.
2. Setup Node.js 22.
3. Instalação de dependências (`npm ci`).
4. Geração de versão automática: `{base}.{run_number}`.
5. Build do renderer (`npm run build`).
6. Publicação via `electron-builder --publish always`.
7. Artefatos anexados ao GitHub Release.

---

## Regras

### Sobre a branch `production`

- **Nunca** commitar diretamente em `production`.
- Sempre usar merge de `main` para `production`.
- Qualquer push em `production` gera release.
- Releases acidentais devem ser tratadas deletando o release no GitHub.

### Sobre a branch `main`

- É a branch de integração de features.
- CI roda em todo push e PR.
- Deve estar sempre em estado funcional.

### Sobre branches de feature

- Prefixos: `feature/`, `fix/`, `refactor/`, `docs/`.
- Devem ser criadas a partir de `main`.
- Devem ser deletadas após merge.

---

## Rollback

Se uma release tiver problemas:

1. **Reverter na main:**
   ```bash
   git checkout main
   git revert <commit-problemático>
   git push origin main
   ```

2. **Publicar nova release:**
   ```bash
   git checkout production
   git merge main
   git push origin production
   ```

3. **Deletar release problemática** no GitHub (se necessário).

---

## Tags

Tags são criadas automaticamente pelo electron-builder ao publicar. O formato é `v{version}`.

Para criar tags manuais:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Resumo visual

```
                    ┌──────────────┐
                    │   feature/*  │
                    └──────┬───────┘
                           │ PR
                    ┌──────▼───────┐
                    │     main     │ ← CI (test + lint + build)
                    └──────┬───────┘
                           │ merge (quando pronto)
                    ┌──────▼───────┐
                    │  production  │ ← Release automática
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ GitHub       │
                    │ Releases     │ ← Artefatos Linux/Win/macOS
                    └──────────────┘
```

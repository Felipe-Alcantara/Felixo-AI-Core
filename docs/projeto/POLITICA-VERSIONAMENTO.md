# Política de Versionamento

Status: concluido.

## Objetivo

Definir como as versões do Felixo AI Core são numeradas e publicadas.

---

## Padrão adotado

O projeto segue **SemVer** (Semantic Versioning) com as seguintes regras:

```
MAJOR.MINOR.PATCH
```

### Enquanto experimental (0.x.x)

- `0.x.x` indica que o projeto está em fase experimental.
- Breaking changes podem acontecer entre qualquer versão minor.
- Releases iniciais são marcadas como **pre-release**.

### Incremento de versão

| Tipo | Quando | Exemplo |
|------|--------|---------|
| **Patch** (0.1.x) | Correções de bugs, ajustes menores | `0.1.0` → `0.1.1` |
| **Minor** (0.x.0) | Novas features, melhorias significativas | `0.1.0` → `0.2.0` |
| **Major** (x.0.0) | Mudanças estruturais grandes, API pública estável | `0.x` → `1.0.0` |

### Versão base

A versão base é mantida manualmente em `app/package.json`:

```json
{
  "version": "0.1.0"
}
```

### Versão de produção

O workflow de release gera versão automaticamente:

```bash
BASE_VERSION = "0.1"  # primeiros dois dígitos do package.json
VERSION = "${BASE_VERSION}.${GITHUB_RUN_NUMBER}"
# Exemplo: 0.1.42
```

Isso garante que cada push em `production` gere uma versão maior que a anterior.

---

## Tags

Tags são criadas automaticamente pelo electron-builder ao publicar releases. O formato é `v{version}` (ex: `v0.1.42`).

---

## Pre-releases

Enquanto o projeto estiver em `0.x.x`:
- Releases são consideradas experimentais.
- O campo `releaseType` no package.json é `"release"` (não `"draft"`).
- Pre-releases podem ser habilitadas no auto-updater via `FELIXO_UPDATE_PRERELEASE=1`.

---

## Changelog

Atualmente, o changelog é mantido manualmente via:
- Mensagens de commit descritivas.
- Documentação em `/docs/relatorios/`.
- Release notes geradas manualmente no GitHub.

Futuramente, pode-se adotar ferramentas como `conventional-changelog` ou `semantic-release`.

---

## Fluxo de publicação de versão

1. Desenvolvedor mescla features na branch `main`.
2. Quando pronto para release, faz merge de `main` para `production`.
3. Push em `production` dispara o workflow de release.
4. O workflow gera versão automática e publica artefatos.
5. O electron-updater detecta a nova versão em apps instalados.

---

## Sugestão de milestones

| Versão | Marco |
|--------|-------|
| `0.1.x` | Protótipo funcional com orquestração básica |
| `0.2.0` | Persistência SQLite + painel Git funcional |
| `0.3.0` | Workflows visuais + memória persistente |
| `0.4.0` | Relatórios automáticos + skills iniciais |
| `0.5.0` | Editor integrado + IDE leve |
| `1.0.0` | Estável para uso diário |

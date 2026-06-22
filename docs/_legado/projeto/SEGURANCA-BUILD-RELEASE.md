# Segurança do Build e Release

Status: concluido.

## Objetivo

Evitar que dados sensíveis, tokens, logs privados ou configurações pessoais sejam incluídos em releases públicas.

---

## Arquivos que NUNCA devem ser empacotados

| Arquivo/Padrão | Motivo |
|----------------|--------|
| `.env`, `.env.*` | Tokens, API keys, credenciais |
| `*.log`, `logs/` | Podem conter prompts, paths, nomes de usuário |
| `.git/` | Histórico completo do repositório |
| `docs/` | Documentação de desenvolvimento |
| `ai-clis/` | Scripts locais do desenvolvedor |
| `__pycache__/` | Cache Python |
| `.agents/`, `.claude/`, `.codex/`, `.sixth/` | Configs de IA pessoais |
| `felixo-standards/` | Padrões internos de desenvolvimento |
| `plan` | Arquivo de planejamento pessoal |
| `start_app.py` | Script de desenvolvimento |
| `requirements.txt` | Dependências Python de dev |
| `*.test.cjs` | Arquivos de teste |
| `release/` | Builds anteriores |

---

## O que é incluído no pacote

Apenas o mínimo necessário para execução:

| Incluído | Conteúdo |
|----------|----------|
| `dist/**/*` | Bundle Vite compilado (HTML/JS/CSS) |
| `electron/**/*` | Backend do main process |
| `package.json` | Metadados e dependências |
| `public/**/*` | Assets estáticos (logos, ícones) |

---

## Proteção do .gitignore

O `.gitignore` do app (`app/.gitignore`) já exclui:

```
node_modules
dist
release
```

O `.gitignore` raiz exclui:

```
__pycache__
```

---

## Variáveis de ambiente no CI

| Variável | Uso | Permissão |
|----------|-----|-----------|
| `GITHUB_TOKEN` | Publicar releases | `contents: write` |
| `CSC_IDENTITY_AUTO_DISCOVERY` | Desabilitar assinatura automática | Definido como `false` |

O workflow de release usa apenas `secrets.GITHUB_TOKEN` (token automático do GitHub Actions) com permissão `contents: write`. Nenhum token adicional é necessário.

---

## Verificações de segurança

### Antes do build

1. O CI roda `npm test` e `npm run lint` antes de publicar.
2. O CI roda `npm run build` para verificar integridade da compilação.

### Durante o empacotamento

1. O electron-builder empacota apenas os arquivos listados em `build.files`.
2. `devDependencies` são excluídas automaticamente do pacote final.
3. O asar (arquivo Electron) não inclui arquivos fora do diretório `app/`.

### Depois do empacotamento

1. Artefatos são publicados no GitHub Releases com checksums.
2. O electron-updater verifica integridade do download antes de instalar.

---

## Recomendações futuras

| Ação | Status | Prioridade |
|------|--------|-----------|
| Auditoria automática do conteúdo do pacote | Não implementada | Média |
| Assinatura de código Windows (code signing) | Não implementada | Alta para distribuição pública |
| Notarização macOS | Não implementada | Alta para distribuição pública |
| SBOM (Software Bill of Materials) | Não implementada | Baixa |
| Verificação de vulnerabilidades em deps | `npm audit` manual | Média |

---

## Checklist de segurança para releases

- [ ] Verificar que `.env` não existe no diretório de build.
- [ ] Verificar que nenhum token ou credencial está hardcoded no código.
- [ ] Verificar que logs locais não estão incluídos.
- [ ] Verificar que o diretório `ai-clis/` não foi empacotado.
- [ ] Verificar que testes e documentação de dev não foram incluídos.
- [ ] Rodar `npm audit` para vulnerabilidades conhecidas.
- [ ] Confirmar que o `GH_TOKEN` no CI tem permissões mínimas.

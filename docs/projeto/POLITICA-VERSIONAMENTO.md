# Política de Versionamento

Status: concluido.
Última revisão: 2026-08-31.

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

O workflow de release gera a versão publicada automaticamente:

```bash
BASE_VERSION = "0.1"  # primeiros dois dígitos do package.json
VERSION = "${BASE_VERSION}.${GITHUB_RUN_NUMBER}"
# Exemplo: 0.1.42
```

Isso garante uma sequência monotônica entre as execuções de release. A branch
de desenvolvimento e de release do projeto é `main`; `production` não é mais
o gatilho de publicação.

---

## Tags

O job de preparação cria a tag no GitHub antes dos builds. O formato é
`v{version}` (por exemplo, `v0.1.42`). O electron-builder publica os artefatos
nessa release, mas não decide sozinho a sequência da versão.

---

## Pre-releases

Enquanto o projeto estiver em `0.x.x`:
- Releases são consideradas experimentais.
- O campo `releaseType` em `app/package.json` é `"prerelease"`: a release nasce
  como pré-release para que os três sistemas possam publicar em paralelo.
- Depois que Linux, Windows e macOS terminam, o workflow promove a release para
  normal e atualiza o marcador `Latest` somente se ela for a mais recente.
- Pre-releases podem ser habilitadas no auto-updater via `FELIXO_UPDATE_PRERELEASE=1`.

---

## Changelog

Atualmente, as mudanças são rastreadas por:
- Mensagens de commit Conventional Commits.
- Entradas cronológicas no `IA.md` (sem reescrever registros anteriores).
- README e guias vigentes quando o comportamento observável muda.
- Release notes e artefatos publicados no GitHub Releases.

Os relatórios históricos que ficam em `docs/_legado/` não são a fonte vigente
do changelog. Ferramentas automáticas como `conventional-changelog` continuam
sendo uma possível melhoria, não uma etapa obrigatória do fluxo atual.

---

## Fluxo de publicação de versão

1. O desenvolvedor abre uma branch de trabalho e envia um PR para `main`.
2. O CI valida launcher, scripts de release e app nos três sistemas.
3. Depois de um CI verde para um commit em `main`, `release.yml` cria a
   pré-release, publica os artefatos de Linux, Windows e macOS e a promove.
4. Um `workflow_dispatch` pode repetir a publicação, mas exige o SHA exato de
   um commit que já passou no CI.
5. O `electron-updater` detecta a nova versão em apps instalados.

---

## Direção de evolução

O projeto continua em `0.x`, então não há promessa de compatibilidade de API
entre versões minor. A evolução do produto deve priorizar:

- robustez do canvas, dos terminais PTY e da coordenação entre agentes;
- medição e otimização de varreduras, build e carregamento da interface;
- cobertura de limites e uso por conta sem inventar números quando o provider
  não publica uma cota;
- melhorias de portabilidade, testes multi-SO e documentação para contribuidores;
- futuras capacidades de orquestração, memória e servidor como ideias de
  contribuição, sem tratá-las como funcionalidades já disponíveis.

O modo de chat está depreciado e não é uma frente de evolução: alterações nele
devem ser apenas correções de compatibilidade ou migração para o canvas.

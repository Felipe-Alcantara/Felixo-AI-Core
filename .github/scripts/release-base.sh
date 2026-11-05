#!/usr/bin/env bash
# Escolhe o commit de base contra o qual o Release gate compara o commit validado.
#
# O gate comparava só `HEAD^ HEAD`. Num push com vários commits o CI valida o
# último; se ele for só documentação, o commit de app que veio antes no mesmo
# push nunca era avaliado e nenhum instalador saía. A correção de 13/10/2026
# passou a comparar com o último commit que o PRÓPRIO GATE tinha avaliado com
# sucesso. Isso ainda deixava uma brecha: o gate aprovava o commit de app, o
# Release despachado falhava, e o commit de documentação seguinte comparava com
# esse commit "avaliado", via só documentação e não publicava nada, sem aviso.
#
# A base agora é o commit mais novo já COBERTO por um Release:
#   - publicado: a tag de uma release que saiu de pré-release (`gh release list`);
#   - em andamento: a run do `release.yml` ainda na fila ou rodando, cujo título
#     traz o SHA (`run-name` do release.yml). Sem isso, um commit de documentação
#     validado enquanto o Release do commit de app ainda roda despacharia outro
#     Release e cancelaria o primeiro (`concurrency` do release.yml).
# Um Release que falha deixa de cobrir o commit, e o próximo gate o inclui no diff.
#
# Uso: printf '%s\n' <SHAs cobertos, em qualquer ordem> | release_base <sha-do-head>
# Saída (stdout): o SHA de base, ou nada quando não há base confiável.
# Mensagens de diagnóstico vão para stderr.
set -u

is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

# Verdadeiro quando $1 existe no repositório e é ancestral de $2, sem ser o próprio $2.
is_strict_ancestor() {
  local candidate="$1" head="$2"
  [[ "$candidate" != "$head" ]] && git merge-base --is-ancestor "$candidate" "$head" 2>/dev/null
}

# SHAs cobertos por um Release, um por linha.
#   $1: títulos das runs do release.yml em andamento (um por linha). O SHA é o
#       que o `run-name` do release.yml põe no título; título sem SHA é ignorado.
#   $2: tags das releases publicadas (uma por linha); vira o commit da tag.
release_candidates() {
  local titulos="${1:-}" tags="${2:-}" tag sha
  printf '%s\n' "$titulos" | grep -oE '[0-9a-f]{40}' || true
  while IFS= read -r tag; do
    [[ -z "$tag" ]] && continue
    sha="$(git rev-list -n1 "$tag" 2>/dev/null)" || continue
    printf '%s\n' "$sha"
  done <<< "$tags"
}

# Verdadeiro quando $1 já é um dos SHAs cobertos (lista em $2, um por linha):
# o gate foi reexecutado para um commit que já foi, ou está sendo, publicado.
release_covered() {
  local head="$1" covered="$2"
  printf '%s\n' "$covered" | grep -qxF "$head"
}

# Dos SHAs cobertos (stdin), o mais novo que é ancestral do head. A ordem da
# lista não importa: um candidato só toma o lugar do atual se descende dele.
release_base() {
  local head="$1" candidate best=""

  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    is_sha "$candidate" && is_strict_ancestor "$candidate" "$head" || continue
    if [[ -z "$best" ]] || git merge-base --is-ancestor "$best" "$candidate" 2>/dev/null; then
      best="$candidate"
    fi
  done

  [[ -n "$best" ]] && printf '%s\n' "$best"
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  release_base "${1:-}"
fi

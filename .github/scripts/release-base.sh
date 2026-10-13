#!/usr/bin/env bash
# Escolhe o commit de base contra o qual o Release gate compara o commit validado.
#
# O gate comparava só `HEAD^ HEAD`. Num push com vários commits o CI valida o
# último; se ele for só documentação, o commit de app que veio antes no mesmo
# push nunca era avaliado e nenhum instalador saía. Comparar com o último commit
# que o gate já avaliou cobre tudo o que chegou desde então.
#
# Uso: printf '%s\n' <shas já avaliados, do mais novo ao mais antigo> | release_base <sha-do-head>
# Saída (stdout): o SHA de base, ou nada quando não há base confiável.
# Mensagens de diagnóstico vão para stderr.
set -u

is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

# Verdadeiro quando $1 existe no repositório e é ancestral de $2, sem ser o próprio $2.
is_strict_ancestor() {
  local candidate="$1" head="$2"
  [[ "$candidate" != "$head" ]] && git merge-base --is-ancestor "$candidate" "$head" 2>/dev/null
}

release_base() {
  local head="$1"
  local candidate

  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    if is_sha "$candidate" && is_strict_ancestor "$candidate" "$head"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  release_base "${1:-}"
fi

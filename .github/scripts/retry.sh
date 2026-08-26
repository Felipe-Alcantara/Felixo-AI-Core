#!/usr/bin/env bash
# Tenta um comando de novo, com espera crescente, quando ele falha.
#
# Existe porque a API do GitHub falha de vez em quando com um HTTP 500
# transitório que passa sozinho na tentativa seguinte — medido em 25 e
# 26/08/2026: duas releases do Felixo AI Core ficaram paradas por horas
# nesse mesmo erro, até alguém notar e mandar rodar de novo à mão. Comandos
# como `gh release create` já são idempotentes por natureza (quem chama
# confere `gh release view` antes de criar), então tentar de novo nunca
# duplica nada.
#
# Uso dentro de um step do workflow:
#   source "$GITHUB_WORKSPACE/.github/scripts/retry.sh"
#   retry 5 5 -- gh release create "$TAG" --target "$TARGET" ...
#
# Uso direto (também é o que os testes deste arquivo exercitam):
#   ./retry.sh <tentativas> <espera_inicial_s> -- comando arg1 arg2 ...
set -u

retry() {
  local tentativas="$1"
  local espera="$2"
  shift 2

  if [[ "${1:-}" != "--" ]]; then
    echo "retry: esperava '--' antes do comando" >&2
    return 2
  fi
  shift

  local tentativa=1
  while true; do
    if "$@"; then
      return 0
    fi

    if (( tentativa >= tentativas )); then
      echo "retry: \"$*\" falhou depois de $tentativas tentativa(s)." >&2
      return 1
    fi

    echo "retry: tentativa $tentativa de $tentativas falhou; aguardando ${espera}s antes de tentar de novo..." >&2
    sleep "$espera"
    espera=$(( espera * 2 ))
    tentativa=$(( tentativa + 1 ))
  done
}

# Permite `bash retry.sh 3 5 -- comando` direto no terminal, e também
# `source retry.sh` para só importar a função dentro de um step do workflow.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  retry "$@"
fi

#!/usr/bin/env bash
# Testes de `release-cleanup.sh`, sem framework, com um `gh` falso.
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
# shellcheck source=./release-cleanup.sh
source "$SCRIPT_DIR/release-cleanup.sh"

# Estado do `gh` falso: PRE = true|false|ausente; APAGADAS = tags apagadas.
PRE="true"
APAGADAS=()
gh() {
  case "$1 $2" in
    "release view")
      [[ "$PRE" == "ausente" ]] && return 1
      echo "$PRE"
      ;;
    "release delete") APAGADAS+=("$3") ;;
    "run view") echo "- **Publish windows-latest**: passo(s) com falha: Validate installed release artifact" ;;
  esac
}

falhas=0
assert_eq() {
  if [[ "$1" != "$2" ]]; then
    echo "FALHOU: $3 (esperado \"$1\", obtido \"$2\")" >&2
    falhas=$((falhas + 1))
  else
    echo "ok: $3"
  fi
}

PRE="true"; APAGADAS=()
apagar_prerelease "v0.1.700" >/dev/null
assert_eq "v0.1.700" "${APAGADAS[*]:-}" "apaga a pré-release deste run"

PRE="false"; APAGADAS=()
apagar_prerelease "v0.1.700" >/dev/null
assert_eq "" "${APAGADAS[*]:-}" "nunca apaga release já promovida"

PRE="ausente"; APAGADAS=()
apagar_prerelease "v0.1.700" >/dev/null
assert_eq "" "${APAGADAS[*]:-}" "release inexistente não apaga nada"

PRE="true"; APAGADAS=()
apagar_prerelease "" >/dev/null
assert_eq "" "${APAGADAS[*]:-}" "tag vazia (falha antes de criar) não apaga nada"

assert_eq "- **Publish windows-latest**: passo(s) com falha: Validate installed release artifact" \
  "$(resumir_falha 1 | tail -n 1)" "resumo lista o job e o passo que falharam"

if (( falhas > 0 )); then
  echo "$falhas verificação(ões) falharam." >&2
  exit 1
fi
echo "Todas as verificações passaram."

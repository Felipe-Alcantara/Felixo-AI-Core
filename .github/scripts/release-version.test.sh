#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
# shellcheck source=./release-version.sh
source "$SCRIPT_DIR/release-version.sh"

falhas=0
assert_true() {
  local descricao="$1"
  shift
  if "$@"; then
    echo "ok: $descricao"
  else
    echo "FALHOU: $descricao" >&2
    falhas=$((falhas + 1))
  fi
}
assert_false() {
  local descricao="$1"
  shift
  if "$@"; then
    echo "FALHOU: $descricao (deveria ter dado falso)" >&2
    falhas=$((falhas + 1))
  else
    echo "ok: $descricao"
  fi
}

# --- o caso real medido em 26/08/2026 -----------------------------------
assert_false "v0.1.80 (mais antiga) NÃO é mais nova que v0.1.81" \
  is_tag_newer "v0.1.80" "v0.1.81"
assert_true "v0.1.81 é mais nova que v0.1.80" \
  is_tag_newer "v0.1.81" "v0.1.80"

# --- ordem numérica, não alfabética (é o ponto de usar sort -V) --------
assert_true "v0.1.10 é mais nova que v0.1.9 (não é comparação de texto)" \
  is_tag_newer "v0.1.10" "v0.1.9"
assert_false "v0.1.9 não é mais nova que v0.1.10" \
  is_tag_newer "v0.1.9" "v0.1.10"

# --- casos de borda ------------------------------------------------------
assert_true "sem release 'latest' anterior, a candidata sempre vence" \
  is_tag_newer "v0.1.1" ""
assert_false "a mesma tag não é 'mais nova' que ela mesma" \
  is_tag_newer "v0.1.81" "v0.1.81"
assert_true "minor maior vence, mesmo com número de execução (patch) menor" \
  is_tag_newer "v0.2.1" "v0.1.99"

if (( falhas > 0 )); then
  echo "$falhas verificação(ões) falharam." >&2
  exit 1
fi
echo "Todas as verificações passaram."

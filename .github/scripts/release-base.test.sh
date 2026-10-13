#!/usr/bin/env bash
# Testes de release-base.sh: `bash .github/scripts/release-base.test.sh`
# Monta um repositório Git descartável com um histórico linear (A-B-C-D) e um
# commit fora dele (X), para os casos de ancestralidade serem reais.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/release-base.sh"

REPO_DIR="$(mktemp -d)"
trap 'rm -rf "$REPO_DIR"' EXIT
cd "$REPO_DIR" || exit 1
git init -q .
commit() {
  git -c user.name=teste -c user.email=teste@exemplo.invalid commit -q --allow-empty -m "$1"
  git rev-parse HEAD
}
A="$(commit A)"
B="$(commit B)"
C="$(commit C)"
D="$(commit D)"
# X nasce de A e não entra na linha de D: simula um histórico reescrito.
git checkout -q -b fora "$A"
X="$(commit X)"
git checkout -q -

falhas=0
esperar() {
  local nome="$1" esperado="$2" head="$3" candidatos="$4" obtido
  obtido="$(printf '%s' "$candidatos" | release_base "$head" 2>/dev/null)"
  if [[ "$obtido" != "$esperado" ]]; then
    echo "FALHOU: $nome — esperado '${esperado:0:7}', obtido '${obtido:0:7}'"
    falhas=$((falhas + 1))
  else
    echo "ok: $nome"
  fi
}

esperar "o último commit avaliado é a base" "$B" "$D" "$B"$'\n'
esperar "com vários avaliados, vale o mais novo que é ancestral" "$C" "$D" "$C"$'\n'"$B"$'\n'"$A"$'\n'
esperar "o próprio head na lista (gate reexecutado) é ignorado" "$B" "$D" "$D"$'\n'"$B"$'\n'
esperar "commit fora do histórico do head é pulado" "$B" "$D" "$X"$'\n'"$B"$'\n'
esperar "linha vazia e texto que não é SHA são ignorados" "$B" "$D" $'\n'"não-é-sha"$'\n'"$B"$'\n'

if (( falhas > 0 )); then
  echo "$falhas teste(s) falharam"
  exit 1
fi
echo "todos os testes passaram"

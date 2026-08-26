#!/usr/bin/env bash
# Testes de `retry.sh`, sem framework: cada `assert_*` imprime e sai 1 no
# primeiro erro, para o CI acusar exatamente qual comportamento quebrou.
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
# shellcheck source=./retry.sh
source "$SCRIPT_DIR/retry.sh"

# Espera nenhuma de verdade: os testes precisam ser rápidos, não medir
# backoff real. Sombrear o builtin com uma função é suportado pelo bash.
DORMIDAS=()
sleep() { DORMIDAS+=("$1"); }

falhas=0
assert_eq() {
  local esperado="$1" obtido="$2" descricao="$3"
  if [[ "$esperado" != "$obtido" ]]; then
    echo "FALHOU: $descricao (esperado \"$esperado\", obtido \"$obtido\")" >&2
    falhas=$((falhas + 1))
  else
    echo "ok: $descricao"
  fi
}

# --- comando que falha duas vezes e passa na terceira ------------------
CONTADOR_FILE="$(mktemp)"
echo 0 > "$CONTADOR_FILE"
comando_falha_duas_vezes() {
  local n
  n="$(<"$CONTADOR_FILE")"
  n=$((n + 1))
  echo "$n" > "$CONTADOR_FILE"
  [[ "$n" -ge 3 ]]
}

DORMIDAS=()
if retry 5 5 -- comando_falha_duas_vezes; then
  assert_eq "0" "0" "retry devolve sucesso quando o comando passa antes de esgotar as tentativas"
else
  assert_eq "sucesso" "falha" "retry deveria ter devolvido sucesso"
fi
assert_eq "3" "$(<"$CONTADOR_FILE")" "o comando foi chamado exatamente até a tentativa que passou (3), não mais"
assert_eq "5 10" "${DORMIDAS[*]}" "a espera dobra a cada tentativa (backoff exponencial), sem dormir depois de passar"

# --- comando que nunca passa: esgota as tentativas e devolve erro ------
CONTADOR_FILE2="$(mktemp)"
echo 0 > "$CONTADOR_FILE2"
comando_sempre_falha() {
  local n
  n="$(<"$CONTADOR_FILE2")"
  n=$((n + 1))
  echo "$n" > "$CONTADOR_FILE2"
  return 1
}

DORMIDAS=()
if retry 3 2 -- comando_sempre_falha; then
  assert_eq "falha" "sucesso" "retry deveria ter esgotado as tentativas e devolvido erro"
else
  assert_eq "1" "1" "retry devolve erro quando todas as tentativas falham"
fi
assert_eq "3" "$(<"$CONTADOR_FILE2")" "o comando foi tentado exatamente o número de vezes pedido, nem mais nem menos"
assert_eq "2 4" "${DORMIDAS[*]}" "só dorme entre tentativas, nunca depois da última (evita espera morta antes de desistir)"

# --- comando que passa de primeira: nunca dorme -------------------------
DORMIDAS=()
CHAMADAS=0
comando_passa_de_primeira() { CHAMADAS=$((CHAMADAS + 1)); return 0; }
retry 5 5 -- comando_passa_de_primeira >/dev/null
assert_eq "1" "$CHAMADAS" "comando que passa de primeira é chamado uma única vez"
assert_eq "" "${DORMIDAS[*]}" "nenhuma espera acontece quando não há retry nenhum"

# --- 1 tentativa é o mesmo que não ter retry ----------------------------
CHAMADAS2=0
comando_conta_e_falha() { CHAMADAS2=$((CHAMADAS2 + 1)); return 1; }
if retry 1 5 -- comando_conta_e_falha; then
  assert_eq "falha" "sucesso" "com 1 tentativa e falha, retry tem que devolver erro"
else
  assert_eq "1" "1" "com 1 tentativa, uma falha não é reexecutada"
fi
assert_eq "1" "$CHAMADAS2" "com tentativas=1, o comando roda exatamente uma vez"

if (( falhas > 0 )); then
  echo "$falhas verificação(ões) falharam." >&2
  exit 1
fi
echo "Todas as verificações passaram."

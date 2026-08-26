#!/usr/bin/env bash
# Decide se uma tag de release é mais nova que outra — para não repetir o
# defeito medido em 26/08/2026: a release v0.1.80 (de um commit mais antigo)
# terminou de publicar DEPOIS da v0.1.81 (mais nova, já promovida), e
# `gh release edit --latest` marcou a v0.1.80 como "Latest" só por ter
# rodado por último. Quem tivesse atualização automática ligada seria
# revertido para uma versão sem a correção que a v0.1.81 trazia.
#
# As tags são `v<major>.<minor>.<RUN_NUMBER>`, e `RUN_NUMBER` cresce sempre
# na ordem em que os workflows foram DISPARADOS (uma reexecução mantém o
# número original) — por isso comparar a tag basta, não precisa olhar
# commit nem data de publicação. `sort -V` entende essa ordem numérica
# (v0.1.9 < v0.1.10), o que uma comparação de texto simples erraria.
set -u

# Verdadeiro quando $1 é mais nova que $2. Ausência de "atual" (string
# vazia) conta como "não há nada pra perder" — a candidata sempre vence.
is_tag_newer() {
  local candidata="$1" atual="$2"

  if [[ -z "$atual" ]]; then
    return 0
  fi
  if [[ "$candidata" == "$atual" ]]; then
    return 1
  fi

  local maior
  maior="$(printf '%s\n%s\n' "$candidata" "$atual" | sort -V | tail -n1)"
  [[ "$maior" == "$candidata" ]]
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  is_tag_newer "$@"
fi

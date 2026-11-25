#!/usr/bin/env bash
# Corpo das notas de uma release: a seção mais recente do CHANGELOG.md (a
# primeira "## ..."), escrita para quem usa o app. Antes, 459 de 474 releases
# ficaram com o texto "Build em publicação", que nunca era trocado depois da
# promoção. Sem CHANGELOG ou sem seção, devolve um texto honesto em vez de vazio.
set -u

# Uso: release_notes_body <caminho do CHANGELOG.md>
release_notes_body() {
  local arquivo="$1" secao=""

  if [[ -f "$arquivo" ]]; then
    secao="$(tr -d '\r' < "$arquivo" | awk '
      /^## / { if (visto) exit; visto = 1 }
      visto { print }
    ')"
  fi

  if [[ -z "$secao" ]]; then
    printf '%s\n' "Notas desta versão ainda não foram escritas. O histórico está no git log do repositório."
    return 0
  fi
  printf '%s\n' "$secao"
}

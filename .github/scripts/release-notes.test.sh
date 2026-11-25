#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
# shellcheck source=./release-notes.sh
source "$SCRIPT_DIR/release-notes.sh"

falhas=0
confere() {
  local descricao="$1" esperado="$2" obtido="$3"
  if [[ "$obtido" == "$esperado" ]]; then
    echo "ok: $descricao"
  else
    echo "FALHOU: $descricao" >&2
    echo "  esperado: $esperado" >&2
    echo "  obtido:   $obtido" >&2
    falhas=$((falhas + 1))
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

printf '# Novidades\n\nIntro.\n\n## Semana B\n\n- B1\n\n### Correções\n\n- B2\n\n## Semana A\n\n- A1\n' > "$tmp/CHANGELOG.md"
confere "devolve só a seção mais recente, com os subtítulos" \
  $'## Semana B\n\n- B1\n\n### Correções\n\n- B2\n' \
  "$(release_notes_body "$tmp/CHANGELOG.md")"$'\n'

printf '## Semana B\r\n\r\n- B1\r\n' > "$tmp/crlf.md"
confere "aceita fim de linha CRLF" $'## Semana B\n\n- B1' "$(release_notes_body "$tmp/crlf.md")"

confere "sem arquivo, devolve o texto de reserva" \
  "Notas desta versão ainda não foram escritas. O histórico está no git log do repositório." \
  "$(release_notes_body "$tmp/nao-existe.md")"

printf '# Novidades\n\nSó a introdução.\n' > "$tmp/sem-secao.md"
confere "sem seção, devolve o texto de reserva" \
  "Notas desta versão ainda não foram escritas. O histórico está no git log do repositório." \
  "$(release_notes_body "$tmp/sem-secao.md")"

if (( falhas > 0 )); then
  echo "$falhas verificação(ões) falharam." >&2
  exit 1
fi
echo "Todas as verificações passaram."

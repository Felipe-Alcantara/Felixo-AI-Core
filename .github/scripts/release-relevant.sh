#!/usr/bin/env bash
# Decide se uma lista de arquivos alterados (um por linha, na entrada padrão)
# exige publicar um instalador novo. Imprime `true` ou `false`.
#
# Só é "irrelevante" o commit em que TODO arquivo é documentação, teste ou CI
# do workflow `ci.yml` — nada que vá dentro do instalador. Qualquer outro
# arquivo (código, package.json, lockfile, release.yml, scripts de release) OU
# uma lista vazia/ilegível vale `true`: na dúvida, publica. Perder um release
# de app é pior que publicar um a mais.
set -u

is_irrelevant() {
  case "$1" in
    docs/*|*.md) return 0 ;;
    *.test.ts|*.test.tsx|*.test.js|*.test.cjs|*.test.sh|*.test.py) return 0 ;;
    app/electron/__fixtures__/*) return 0 ;;
    tests/*) return 0 ;;
    .github/workflows/ci.yml) return 0 ;;
    *) return 1 ;;
  esac
}

release_relevant() {
  local file any=0
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    any=1
    if ! is_irrelevant "$file"; then
      echo true
      return 0
    fi
  done
  # Nenhum arquivo lido: não dá para afirmar que é só docs; publica.
  if [[ "$any" -eq 0 ]]; then
    echo true
  else
    echo false
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  release_relevant
fi

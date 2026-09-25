#!/usr/bin/env bash
# Decide se uma lista de arquivos alterados (um por linha, na entrada padrão)
# exige publicar um instalador novo. Imprime `true` ou `false`.
#
# A decisão é uma lista de INCLUSÃO: só é relevante o arquivo que entra no
# instalador ou que o workflow de Release executa como gate. A versão anterior
# fazia o contrário (lista do que é irrelevante, todo o resto publicava) e
# errava para os dois lados: um `*.md` era sempre irrelevante, então as skills
# empacotadas via `extraResources` (`app/resources/skills/*/SKILL.md`) nunca
# publicavam; e o launcher, os benchmarks do CI e workflows sem relação com o
# instalador publicavam versão sem mudança de app.
#
# A lista espelha `build.files`, `extraResources`, `beforePack`/`afterPack` do
# `app/package.json` e os scripts que `.github/workflows/release.yml` roda (com
# os `require` locais deles). Um arquivo novo que precise entrar no instalador
# tem de entrar aqui também. O teste `release-relevant.test.sh` fixa os casos e
# confere esta lista contra `release-inputs.cjs`, que deriva o que o Release
# executa direto do release.yml e do package.json — um script novo usado pelo
# Release quebra o teste até entrar aqui.
# Lista vazia/ilegível continua valendo `true`: sem diff não dá para afirmar
# que nada do app mudou, e perder um release de app é pior que publicar um a mais.
set -u

is_release_input() {
  case "$1" in
    # 1) Exclusões antes de tudo: testes e fixtures moram dentro de pastas
    #    incluídas abaixo (app/src, app/electron), mas o app não os carrega.
    *.test.*) return 1 ;;
    app/electron/__fixtures__/*) return 1 ;;

    # 2) O que entra no instalador. As pastas vêm ANTES de qualquer regra por
    #    extensão: um `.md` dentro delas (skills, docs empacotadas) é conteúdo
    #    do app.
    app/src/*|app/electron/*|app/public/*|app/resources/*) return 0 ;;
    # Entradas do build do renderer (`vite build`) e do manifesto empacotado.
    app/index.html|app/vite.config.ts|app/tsconfig*.json) return 0 ;;
    app/postcss.config.js|app/tailwind.config.js) return 0 ;;
    app/package.json|app/package-lock.json) return 0 ;;
    # Hooks do electron-builder (`beforePack`/`afterPack`).
    app/scripts/bundle-npm-runtime.cjs|app/scripts/fix-native-pty-permissions.cjs) return 0 ;;
    # Gates que o release.yml executa sobre o artefato (e o require local de
    # package-manager-alternatives-performance.cjs).
    app/scripts/release-smoke.cjs|app/scripts/package-inventory.cjs) return 0 ;;
    app/scripts/package-manager-alternatives-performance.cjs) return 0 ;;
    app/scripts/package-manager-operational-performance.cjs) return 0 ;;
    app/scripts/package-manager-selection.cjs) return 0 ;;
    app/scripts/npm-runtime-performance.cjs) return 0 ;;
    # Normalização de fim de linha: muda os bytes que o checkout do runner
    # Windows entrega ao empacotamento (ex.: SKILL.md em app/resources).
    .gitattributes) return 0 ;;
    # O próprio pipeline de publicação e os scripts que ele carrega.
    .github/workflows/release.yml) return 0 ;;
    .github/scripts/retry.sh|.github/scripts/release-version.sh) return 0 ;;

    # 3) Todo o resto (docs, launcher Python, CI, benchmarks, cópias locais).
    *) return 1 ;;
  esac
}

release_relevant() {
  local file any=0
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    any=1
    if is_release_input "$file"; then
      echo true
      return 0
    fi
  done
  # Nenhum arquivo lido: não dá para afirmar que nada do app mudou; publica.
  if [[ "$any" -eq 0 ]]; then
    echo true
  else
    echo false
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  release_relevant
fi

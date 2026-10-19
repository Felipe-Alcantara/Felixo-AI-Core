#!/usr/bin/env bash
# Decide o que o CI precisa rodar a partir da lista de arquivos alterados (um
# por linha, na entrada padrão). Imprime linhas `chave=valor` no formato do
# $GITHUB_OUTPUT:
#   app=true|false          testes do app (Validate e o smoke do canvas)
#   launcher=true|false     launcher Python (start_app.py, felixo_launcher/, tests/)
#   npm_deps=true|false     política de dependências do npm
#   python_deps=true|false  auditoria das dependências do launcher
#   scripts=true|false      testes dos scripts do pipeline (.github/scripts)
#
# Na dúvida, roda: lista vazia, arquivo que não se encaixa em nenhuma regra ou
# mudança no próprio CI ligam tudo. Documentação sozinha não liga nada, exceto
# o INVENTARIO-CANVAS.md, que é gerado e conferido por teste do app.
# Teste: bash .github/scripts/ci-scope.test.sh
set -u

ci_scope() {
  local file any=0 app=false launcher=false npm_deps=false python_deps=false scripts=false all=false
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    any=1
    case "$file" in
      # O próprio CI e este seletor: qualquer mudança aqui roda tudo.
      .github/workflows/ci.yml|.github/scripts/ci-scope.sh|.github/scripts/ci-reuse.sh) all=true ;;

      # Gerado a partir de app/src e travado por snapshot no Validate.
      docs/projeto/INVENTARIO-CANVAS.md) app=true ;;

      # Dependências: auditoria e também os testes do que depende delas.
      app/package.json|app/package-lock.json) npm_deps=true; app=true ;;
      requirements.txt|requirements.in) python_deps=true; launcher=true ;;

      app/*) app=true ;;
      start_app.py|felixo_launcher/*|tests/*) launcher=true ;;
      .github/scripts/*|.github/workflows/release.yml|.github/workflows/release-gate.yml) scripts=true ;;

      # Nada que o CI teste: documentação, licença, configuração de editor,
      # lançadores do KDE e workflows que não rodam no CI.
      *.md|docs/*|LICENSE|.gitignore|.vscode/*|ai-clis/*|.github/dependabot.yml) ;;
      .github/workflows/*) ;;

      *) all=true ;;
    esac
  done

  # Sem arquivo nenhum não dá para afirmar o que mudou.
  if [[ "$any" -eq 0 || "$all" == true ]]; then
    app=true launcher=true npm_deps=true python_deps=true scripts=true
  fi

  printf 'app=%s\nlauncher=%s\nnpm_deps=%s\npython_deps=%s\nscripts=%s\n' \
    "$app" "$launcher" "$npm_deps" "$python_deps" "$scripts"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  ci_scope
fi

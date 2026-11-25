#!/usr/bin/env bash
# Limpeza de um Release que falhou: apaga a pré-release e a tag DESTE run.
#
# Pré-release que fica para trás é publicação que falhou (43 delas, de 12/08 a
# 08/10/2026, foram apagadas à mão em 09/10). Este script faz isso sozinho, com
# duas travas para nunca encostar numa versão que o usuário pode estar usando:
#   - só apaga a tag que o próprio run calculou (`vX.Y.<run_number>`);
#   - só apaga se a release ainda for pré-release (`isPrerelease == true`);
#     release promovida (e, portanto, a `Latest`) nunca é tocada.
#
# Uso no workflow:
#   source "$GITHUB_WORKSPACE/.github/scripts/release-cleanup.sh"
#   resumir_falha "$GITHUB_RUN_ID" >> "$GITHUB_STEP_SUMMARY"
#   apagar_prerelease "$TAG" >> "$GITHUB_STEP_SUMMARY"
set -u

# Lista os jobs e passos que falharam no run (precisa de `actions: read`).
resumir_falha() {
  local run_id="$1"
  echo "### Release falhou"
  echo
  gh run view "$run_id" --json jobs \
    --jq '.jobs[] | select(.conclusion == "failure")
      | "- **\(.name)**: passo(s) com falha: " + ([.steps[] | select(.conclusion == "failure") | .name] | join(", "))' \
    || echo "- não foi possível ler os jobs do run $run_id."
}

# Apaga a release e a tag, mas só se for uma pré-release.
apagar_prerelease() {
  local tag="${1:-}"
  local eh_pre

  if [[ -z "$tag" ]]; then
    echo "Nenhuma tag calculada (falhou antes de criar a pré-release); nada a apagar."
    return 0
  fi

  if ! eh_pre="$(gh release view "$tag" --json isPrerelease --jq .isPrerelease 2>/dev/null)"; then
    echo "Release $tag não existe; nada a apagar."
    return 0
  fi

  if [[ "$eh_pre" != "true" ]]; then
    echo "Release $tag já foi promovida; mantida."
    return 0
  fi

  if gh release delete "$tag" --cleanup-tag --yes; then
    echo "Pré-release $tag e a tag apagadas. Os JSON de smoke e de inventário ficam nos artefatos do run."
  else
    echo "Não consegui apagar a pré-release $tag; apague à mão (gh release delete $tag --cleanup-tag)." >&2
    return 1
  fi
}

#!/usr/bin/env bash
# Decide se o CI de um push na main pode reaproveitar o CI verde do PR que
# gerou aquele commit, em vez de rodar tudo de novo.
#
# Uso: REPO=dono/repo bash .github/scripts/ci-reuse.sh <sha-do-commit-da-main>
# Saída (stdout, formato de $GITHUB_OUTPUT):
#   reuse=true|false
#   source_run=<id da run do PR>   (vazio quando reuse=false)
#   pr_head=<sha do head do PR>
#   main_tree=<sha da árvore do commit da main>
# Mensagens de diagnóstico vão para stderr. Sempre sai 0: qualquer dúvida vira
# reuse=false, e o CI completo roda — nunca o contrário.
#
# Só reaproveita quando TODAS valem:
#   1. o commit veio de um PR mergeado com base `main`;
#   2. a árvore Git do commit da main é idêntica à do head do PR (com a
#      proteção `strict` da main, o head já contém a main, então é o mesmo
#      conteúdo que o CI do PR testou);
#   3. existe run `pull_request` do workflow CI, concluída com sucesso, para
#      o SHA completo do head, e ela não é comprovadamente de um PR para outra
#      base (ver o comentário no laço de candidatas).
set -u

is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
is_run_id() { [[ "$1" =~ ^[0-9]+$ ]]; }
log() { echo "$*" >&2; }

decide_reuse() {
  local main_sha="$1"
  local reuse=false source_run= pr_head= main_tree= head_tree= candidates= candidate base_refs

  # Em erro HTTP o `gh api` escreve o corpo JSON do erro no stdout: sem
  # validar o formato, duas respostas de erro iguais pareceriam duas árvores
  # iguais. Por isso todo valor passa por is_sha/is_run_id antes de valer.
  if ! is_sha "$main_sha"; then
    log "SHA da main inválido ('$main_sha'); CI completo."
  else
    pr_head=$(gh api "repos/$REPO/commits/$main_sha/pulls" \
      --jq '[.[] | select(.merged_at != null and .base.ref == "main")][0].head.sha // empty' 2>/dev/null) || pr_head=
    if ! is_sha "$pr_head"; then
      pr_head=
      log "Nenhum PR mergeado em main aponta para $main_sha (push direto ou erro de API); CI completo."
    else
      main_tree=$(gh api "repos/$REPO/git/commits/$main_sha" --jq .tree.sha 2>/dev/null) || main_tree=
      head_tree=$(gh api "repos/$REPO/git/commits/$pr_head" --jq .tree.sha 2>/dev/null) || head_tree=
      log "Árvore do commit da main: ${main_tree:-?}; árvore do head do PR ($pr_head): ${head_tree:-?}"
      if ! is_sha "$main_tree" || [[ "$main_tree" != "$head_tree" ]]; then
        log "Árvores diferentes ou ilegíveis (ex.: PR desatualizado com a main no merge); CI completo."
      else
        # `--commit` exige o SHA completo: um prefixo abreviado não casa com nenhuma run.
        candidates=$(gh run list -R "$REPO" --workflow ci.yml --commit "$pr_head" \
          --event pull_request --status success --limit 5 --json databaseId --jq '.[].databaseId' 2>/dev/null) || candidates=
        for candidate in $candidates; do
          is_run_id "$candidate" || continue
          # A mesma branch pode ter PR para outra base: se a run informa as
          # bases e nenhuma é main, ela testou outra coisa. Lista VAZIA não é
          # evidência contra: a API esvazia `pull_requests` quando a branch do
          # PR é apagada, o que acontece em todo merge daqui (medido na run
          # 36170804309 do PR #90). Nesse caso vale o que já foi provado acima:
          # o PR mergeado em main tem este head e a mesma árvore.
          if ! base_refs=$(gh api "repos/$REPO/actions/runs/$candidate" \
            --jq '[.pull_requests[].base.ref] | join(" ")' 2>/dev/null); then
            continue
          fi
          if [[ -z "$base_refs" || " $base_refs " == *" main "* ]]; then
            source_run="$candidate"
            break
          fi
        done
        if [[ -z "$source_run" ]]; then
          log "Nenhuma run verde do CI (pull_request, base main) para o head $pr_head; CI completo."
        else
          reuse=true
        fi
      fi
    fi
  fi

  echo "reuse=$reuse"
  echo "source_run=$source_run"
  echo "pr_head=$pr_head"
  echo "main_tree=$main_tree"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  : "${REPO:?defina REPO=dono/repo}"
  decide_reuse "${1:-}"
fi

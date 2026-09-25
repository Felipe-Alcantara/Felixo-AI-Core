#!/usr/bin/env bash
# Testes de ci-reuse.sh: `bash .github/scripts/ci-reuse.test.sh`
# Um `gh` falso no PATH responde conforme o CENARIO, simulando a API do GitHub
# (já com o filtro `--jq` aplicado, como o `gh` real devolveria).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/ci-reuse.sh"

MAIN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
HEAD=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
TREE=cccccccccccccccccccccccccccccccccccccccc
OUTRA_TREE=dddddddddddddddddddddddddddddddddddddddd
ERRO_JSON='{"message":"Not Found","status":"404"}'

FAKE_BIN="$(mktemp -d)"
trap 'rm -rf "$FAKE_BIN"' EXIT
cat > "$FAKE_BIN/gh" <<EOF
#!/usr/bin/env bash
args="\$*"
case "\$CENARIO:\$args" in
  sem-pr:*"/commits/$MAIN/pulls"*) exit 0 ;;
  *:*"/commits/$MAIN/pulls"*) echo "$HEAD" ;;
  erro-api:*"/git/commits/"*) echo '$ERRO_JSON'; exit 1 ;;
  arvore-diferente:*"/git/commits/$HEAD"*) echo "$OUTRA_TREE" ;;
  *:*"/git/commits/"*) echo "$TREE" ;;
  sem-run:*"run list"*) exit 0 ;;
  erro-listagem:*"run list"*) echo '$ERRO_JSON'; exit 1 ;;
  outra-base:*"run list"*) echo "222" ;;
  outra-base-e-main:*"run list"*) printf '222\n333\n' ;;
  *:*"run list"*) echo "111" ;;
  erro-run:*"/actions/runs/"*) echo '$ERRO_JSON'; exit 1 ;;
  branch-apagada:*"/actions/runs/"*) echo "" ;;
  *:*"/actions/runs/222"*) echo "develop" ;;
  *:*"/actions/runs/"*) echo "main" ;;
  *) echo "gh falso: chamada inesperada: \$args" >&2; exit 2 ;;
esac
EOF
chmod +x "$FAKE_BIN/gh"
export PATH="$FAKE_BIN:$PATH"
export REPO=dono/repo

falhas=0
esperar() {
  local nome="$1" cenario="$2" sha="$3" reuse_esperado="$4" run_esperada="$5" saida reuse run
  saida="$(CENARIO="$cenario" decide_reuse "$sha" 2>/dev/null)"
  reuse="$(sed -n 's/^reuse=//p' <<< "$saida")"
  run="$(sed -n 's/^source_run=//p' <<< "$saida")"
  if [[ "$reuse" != "$reuse_esperado" || "$run" != "$run_esperada" ]]; then
    echo "FALHOU: $nome — esperado reuse=$reuse_esperado source_run=$run_esperada, obtido reuse=$reuse source_run=$run"
    falhas=$((falhas + 1))
  else
    echo "ok: $nome"
  fi
}

esperar "PR com mesma árvore e run verde para a main" ok "$MAIN" true 111
esperar "árvore diferente (PR desatualizado no merge)" arvore-diferente "$MAIN" false ""
esperar "push direto, sem PR" sem-pr "$MAIN" false ""
esperar "erro de API com corpo JSON igual nas duas árvores" erro-api "$MAIN" false ""
esperar "sem run verde do PR" sem-run "$MAIN" false ""
esperar "erro ao listar runs" erro-listagem "$MAIN" false ""
esperar "run verde é de PR para outra base" outra-base "$MAIN" false ""
esperar "primeira run é de outra base, a segunda é da main" outra-base-e-main "$MAIN" true 333
esperar "SHA da main inválido" ok "abc" false ""
esperar "branch do PR já apagada (pull_requests vazio, caso de todo merge)" branch-apagada "$MAIN" true 111
esperar "erro ao ler a run candidata" erro-run "$MAIN" false ""

saida_sempre_zero="$(CENARIO=erro-api bash "$DIR/ci-reuse.sh" "$MAIN" 2>/dev/null)"; codigo=$?
if [[ "$codigo" -ne 0 ]]; then
  echo "FALHOU: o script tem de sair 0 mesmo com erro de API (saiu $codigo)"
  falhas=$((falhas + 1))
else
  echo "ok: sai 0 mesmo com erro de API"
fi
grep -q '^reuse=false$' <<< "$saida_sempre_zero" || { echo "FALHOU: erro de API tem de resultar em reuse=false"; falhas=$((falhas + 1)); }

if [[ "$falhas" -ne 0 ]]; then
  echo "$falhas teste(s) falharam." >&2
  exit 1
fi
echo "Todos os testes passaram."

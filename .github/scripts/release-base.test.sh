#!/usr/bin/env bash
# Testes de release-base.sh: `bash .github/scripts/release-base.test.sh`
# Monta repositórios Git descartáveis: um histórico linear (A-B-C-D) com um
# commit fora dele (X), para os casos de ancestralidade serem reais, e outro com
# arquivos de verdade, para os cenários do gate (o que `release_relevant` diz do
# diff entre a base escolhida e o commit validado).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/release-base.sh"
source "$DIR/release-relevant.sh"

REPO_DIR="$(mktemp -d)"
trap 'rm -rf "$REPO_DIR"' EXIT
cd "$REPO_DIR" || exit 1
git init -q .
commit() {
  git -c user.name=teste -c user.email=teste@exemplo.invalid commit -q --allow-empty -m "$1"
  git rev-parse HEAD
}
A="$(commit A)"
B="$(commit B)"
C="$(commit C)"
D="$(commit D)"
# X nasce de A e não entra na linha de D: simula um histórico reescrito.
git checkout -q -b fora "$A"
X="$(commit X)"
git checkout -q -
git tag v1 "$B"

falhas=0
confere() {
  local nome="$1" esperado="$2" obtido="$3"
  if [[ "$obtido" != "$esperado" ]]; then
    echo "FALHOU: $nome — esperado '${esperado:0:7}', obtido '${obtido:0:7}'"
    falhas=$((falhas + 1))
  else
    echo "ok: $nome"
  fi
}
esperar() {
  local nome="$1" esperado="$2" head="$3" candidatos="$4"
  confere "$nome" "$esperado" "$(printf '%s' "$candidatos" | release_base "$head" 2>/dev/null)"
}

esperar "o último commit coberto é a base" "$B" "$D" "$B"$'\n'
esperar "com vários cobertos, vale o mais novo que é ancestral" "$C" "$D" "$C"$'\n'"$B"$'\n'"$A"$'\n'
esperar "a ordem da lista não importa: vale o mais novo da linha do head" "$C" "$D" "$A"$'\n'"$C"$'\n'"$B"$'\n'
esperar "o próprio head na lista (gate reexecutado) é ignorado" "$B" "$D" "$D"$'\n'"$B"$'\n'
esperar "commit fora do histórico do head é pulado" "$B" "$D" "$X"$'\n'"$B"$'\n'
esperar "linha vazia e texto que não é SHA são ignorados" "$B" "$D" $'\n'"não-é-sha"$'\n'"$B"$'\n'
esperar "sem nenhum candidato, não há base" "" "$D" ""

# release_candidates: o SHA do título de uma run em andamento e o commit de cada tag publicada.
confere "candidatos: título com SHA e tag publicada" "$C"$'\n'"$B" "$(release_candidates "Release $C"$'\n' "v1"$'\n')"
confere "candidatos: título sem SHA e tag inexistente são ignorados" "$B" "$(release_candidates $'Release\nRelease sem sha\n' $'v-que-nao-existe\nv1\n')"
confere "candidatos: nada em andamento e nada publicado" "" "$(release_candidates "" "")"

# release_covered: o gate reexecutado para um commit que já foi, ou está sendo, publicado.
confere_coberto() {
  local nome="$1" esperado="$2" head="$3" cobertos="$4" obtido=nao
  release_covered "$head" "$cobertos" && obtido=sim
  confere "$nome" "$esperado" "$obtido"
}
confere_coberto "coberto: o commit já está na lista" sim "$B" "$C"$'\n'"$B"$'\n'
confere_coberto "coberto: commit fora da lista não é coberto" nao "$D" "$C"$'\n'"$B"$'\n'
confere_coberto "coberto: lista vazia não cobre nada" nao "$D" ""

# Cenários do gate, com arquivos de verdade.
REPO2_DIR="$(mktemp -d)"
trap 'rm -rf "$REPO_DIR" "$REPO2_DIR"' EXIT
cd "$REPO2_DIR" || exit 1
git init -q .
arquivo() { mkdir -p "$(dirname "$1")" && printf '%s\n' "$2" > "$1"; }
salvar() {
  git add -A
  git -c user.name=teste -c user.email=teste@exemplo.invalid commit -q -m "$1"
  git rev-parse HEAD
}
# decide <head> <cobertos>: o que o gate responde para o head com esses commits cobertos.
decide() {
  local head="$1" cobertos="$2" base files
  base="$(printf '%s\n' "$cobertos" | release_base "$head")"
  if [[ -n "$base" ]]; then files="$(git diff --name-only "$base" "$head")"; else files=""; fi
  printf '%s\n' "$files" | release_relevant
}

arquivo app/electron/main.cjs "v1"; arquivo docs/projeto/IA.md "v1"
P="$(salvar "P: release publicado")"
git tag v0.1.1 "$P"
arquivo app/electron/main.cjs "v2"
R="$(salvar "R: muda o app")"
arquivo docs/projeto/IA.md "v2"
DOC="$(salvar "DOC: só documentação")"

# O cenário da task: o CI do commit de app falhou (o gate dele foi pulado) e o
# seguinte é de documentação. A base é o último publicado, então o app é visto.
confere "CI do commit de app falhou e o seguinte é só documentação: publica" true "$(decide "$DOC" "$(release_candidates "" "v0.1.1")")"
# A brecha de 13/10: o gate aprovou R, o Release despachado falhou (não há tag
# publicada de R). Comparar com R, "último avaliado", diria false e nada sairia.
confere "o Release de R falhou: o commit de documentação ainda publica" true "$(decide "$DOC" "$(release_candidates "" "v0.1.1")")"
confere "(o que a base antiga fazia: R como base não vê o app)" false "$(decide "$DOC" "$R")"
# R está publicado: o commit de documentação seguinte não publica nada.
git tag v0.1.2 "$R"
confere "R já publicado: o commit de documentação não publica" false "$(decide "$DOC" "$(release_candidates "" $'v0.1.2\nv0.1.1')")"
git tag -d v0.1.2 >/dev/null
# R ainda está rodando (o título da run traz o SHA): o commit de documentação
# não despacha outro Release, que cancelaria o de R.
confere "o Release de R está em andamento: o commit de documentação não publica" false "$(decide "$DOC" "$(release_candidates "Release $R" "v0.1.1")")"
# Nenhum Release publicado nem em andamento: sem base confiável, publica.
confere "sem base confiável: publica" true "$(decide "$DOC" "$(release_candidates "" "")")"
# Mudança de app e documentação no mesmo push: publica.
arquivo app/src/Tela.tsx "x"; arquivo docs/projeto/IA.md "v3"
APP="$(salvar "APP: tela e documentação")"
confere "app e documentação no mesmo commit: publica" true "$(decide "$APP" "$(release_candidates "Release $R" "v0.1.1")")"

if (( falhas > 0 )); then
  echo "$falhas teste(s) falharam"
  exit 1
fi
echo "todos os testes passaram"

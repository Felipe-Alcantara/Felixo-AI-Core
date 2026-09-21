#!/usr/bin/env bash
# Testes de release-relevant.sh: `bash .github/scripts/release-relevant.test.sh`
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/release-relevant.sh"

falhas=0
esperar() {
  local esperado="$1" nome="$2" entrada="$3" obtido
  obtido="$(printf '%s' "$entrada" | release_relevant)"
  if [[ "$obtido" != "$esperado" ]]; then
    echo "FALHOU: $nome — esperado $esperado, obtido $obtido"
    falhas=$((falhas + 1))
  else
    echo "ok: $nome"
  fi
}

esperar false "só documentação" $'docs/projeto/IA.md\ndocs/projeto/ARQUITETURA.md\n'
esperar false "só teste" $'app/src/features/canvas/services/x.test.ts\napp/electron/services/y.test.cjs\n'
esperar false "só fixtures e testes do launcher" $'app/electron/__fixtures__/text-divergence.cjs\ntests/test_launcher.py\n'
esperar false "só o ci.yml" $'.github/workflows/ci.yml\n'
esperar false "docs + teste + ci.yml juntos" $'docs/projeto/IA.md\napp/electron/services/pty.test.cjs\n.github/workflows/ci.yml\n'
esperar true "código do app" $'app/src/features/canvas/components/CanvasView.tsx\n'
esperar true "um arquivo de app no meio de docs" $'docs/projeto/IA.md\napp/electron/main.cjs\n'
esperar true "package.json" $'app/package.json\n'
esperar true "lockfile" $'app/package-lock.json\n'
esperar true "release.yml (o pipeline de release precisa ser exercitado)" $'.github/workflows/release.yml\n'
esperar true "scripts de release" $'.github/scripts/retry.sh\n'
esperar true "lista vazia (não dá para afirmar que é só docs)" ''
esperar true "só linhas em branco" $'\n\n'
esperar true "arquivo de app misturado com um README" $'app/electron/main.cjs\nREADME.md\n'

if [[ "$falhas" -ne 0 ]]; then
  echo "$falhas teste(s) falharam." >&2
  exit 1
fi
echo "Todos os testes passaram."

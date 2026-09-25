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
esperar false "smoke visual do canvas" $'app/scripts/canvas-smoke.cjs\napp/scripts/canvas-smoke-visual.cjs\napp/scripts/canvas-smoke-visual.test.cjs\n'
esperar false "só o ci.yml" $'.github/workflows/ci.yml\n'
esperar false "ajuste de caminhos no release gate" $'.github/workflows/release-gate.yml\n'
esperar false "metadados locais e cópia do padrão de qualidade" $'.gitignore\nPadr├úo de qualidade - Felixo System Design/README.md\nPadr├úo de qualidade - Felixo System Design/scripts/powershell/install-felixo-powershell.ps1\n'
esperar false "alteração no próprio seletor de release" $'.github/scripts/release-relevant.sh\n'
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

# Lista de inclusão: só publica o que entra no instalador ou gateia o release.
esperar false "gate de regressão de benchmark (só roda no CI)" $'app/scripts/benchmark-regression-gate.cjs\n'
esperar false "launcher Python (não vai no instalador)" $'start_app.py\n'
esperar false "launcher Python, pacote" $'felixo_launcher/cli.py\n'
esperar false "workflow de instalação das CLIs oficiais" $'.github/workflows/official-cli-install.yml\n'
esperar false "workflow nightly" $'.github/workflows/nightly.yml\n'
esperar false "README na raiz" $'README.md\n'
esperar false "teste dentro de app/electron" $'app/electron/foo.test.cjs\n'
esperar false "teste dentro de app/src" $'app/src/features/canvas/x.test.tsx\n'
esperar false "configuração só de teste e lint" $'app/vitest.config.ts\napp/eslint.config.js\n'
esperar true "configuração do PostCSS (entra no build do renderer)" $'app/postcss.config.js\n'
esperar true "configuração do Tailwind" $'app/tailwind.config.js\n'
esperar true "tsconfig do app" $'app/tsconfig.app.json\n'
esperar true "código do renderer" $'app/src/x.ts\n'
esperar true "skill empacotada via extraResources (era tratada como .md irrelevante)" $'app/resources/skills/x/SKILL.md\n'
esperar true "markdown dentro de app/public" $'app/public/docs/x.md\n'
esperar true "hook beforePack do electron-builder" $'app/scripts/bundle-npm-runtime.cjs\n'
esperar true "hook afterPack do electron-builder" $'app/scripts/fix-native-pty-permissions.cjs\n'
esperar true "smoke do artefato (gate do release)" $'app/scripts/release-smoke.cjs\n'
esperar true "require local da bancada de gerenciadores" $'app/scripts/npm-runtime-performance.cjs\n'
esperar true "script de versão usado no finalize" $'.github/scripts/release-version.sh\n'
esperar true "seleção de gerenciadores (require dos gates do release)" $'app/scripts/package-manager-selection.cjs\n'
esperar true "normalização de fim de linha (muda bytes empacotados no Windows)" $'.gitattributes\n'

# Sincronia: tudo que o Release executa ou empacota (derivado do release.yml e
# do bloco build do package.json, com os require locais) tem de disparar
# release. Sem isto a lista de inclusão diverge em silêncio quando um gate
# passa a exigir um script novo.
if ! command -v node >/dev/null 2>&1; then
  echo "FALHOU: node ausente — sem ele não dá para derivar as entradas do Release"
  falhas=$((falhas + 1))
else
  derivados="$(node "$DIR/release-inputs.cjs")" || { echo "FALHOU: release-inputs.cjs não executou"; falhas=$((falhas + 1)); }
  [[ -z "$derivados" ]] && { echo "FALHOU: release-inputs.cjs não derivou nenhuma entrada"; falhas=$((falhas + 1)); }
  while IFS= read -r entrada; do
    [[ -z "$entrada" ]] && continue
    esperar true "entrada derivada do Release: $entrada" "$entrada"$'\n'
  done <<< "$derivados"
fi

if [[ "$falhas" -ne 0 ]]; then
  echo "$falhas teste(s) falharam." >&2
  exit 1
fi
echo "Todos os testes passaram."

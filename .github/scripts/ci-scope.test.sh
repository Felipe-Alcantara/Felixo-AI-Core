#!/usr/bin/env bash
# Testes de ci-scope.sh: `bash .github/scripts/ci-scope.test.sh`
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/ci-scope.sh"

falhas=0
# esperar <nome> <entrada> <app> <launcher> <npm_deps> <python_deps> <scripts>
esperar() {
  local nome="$1" entrada="$2" esperado obtido
  esperado="$(printf 'app=%s\nlauncher=%s\nnpm_deps=%s\npython_deps=%s\nscripts=%s' "$3" "$4" "$5" "$6" "$7")"
  obtido="$(printf '%s' "$entrada" | ci_scope)"
  if [[ "$obtido" != "$esperado" ]]; then
    echo "FALHOU: $nome"
    echo "  esperado: $(tr '\n' ' ' <<< "$esperado")"
    echo "  obtido:   $(tr '\n' ' ' <<< "$obtido")"
    falhas=$((falhas + 1))
  else
    echo "ok: $nome"
  fi
}

#                                                                                          app   launcher npm   python scripts
esperar "só o IA.md" $'IA.md\n'                                                             false false    false false  false
esperar "README e guias" $'README.md\ndocs/guias/GUIA-USUARIO.md\n'                         false false    false false  false
esperar "arquivo do acervo" $'docs/ia-archive/IA-ARCHIVE-2026-09.md\n'                      false false    false false  false
esperar "inventário gerado é testado pelo app" $'docs/projeto/INVENTARIO-CANVAS.md\n'       true  false    false false  false
esperar "código do app" $'app/src/features/canvas/x.ts\n'                                   true  false    false false  false
esperar "markdown dentro do app é conteúdo do app" $'app/resources/skills/x/SKILL.md\n'     true  false    false false  false
esperar "app com documentação junto" $'IA.md\napp/electron/main.cjs\n'                      true  false    false false  false
esperar "lockfile liga a política e os testes" $'app/package-lock.json\n'                   true  false    true  false  false
esperar "launcher Python" $'felixo_launcher/cli.py\ntests/test_x.py\n'                       false true     false false  false
esperar "requirements liga auditoria e launcher" $'requirements.txt\n'                      false true     false true   false
esperar "scripts do pipeline" $'.github/scripts/retry.sh\n'                                 false false    false false  true
esperar "workflow de release" $'.github/workflows/release.yml\n'                            false false    false false  true
esperar "workflow noturno não roda no CI" $'.github/workflows/nightly.yml\n'                 false false    false false  false
esperar "o próprio ci.yml roda tudo" $'.github/workflows/ci.yml\n'                          true  true     true  true   true
esperar "o próprio seletor roda tudo" $'.github/scripts/ci-scope.sh\n'                      true  true     true  true   true
esperar "arquivo desconhecido roda tudo" $'package.json\n'                                  true  true     true  true   true
esperar "atributos do git rodam tudo" $'.gitattributes\n'                                   true  true     true  true   true
esperar "lista vazia roda tudo" ''                                                          true  true     true  true   true
esperar "só linhas em branco rodam tudo" $'\n\n'                                            true  true     true  true   true

if [[ "$falhas" -ne 0 ]]; then
  echo "$falhas teste(s) falharam." >&2
  exit 1
fi
echo "Todos os testes passaram."

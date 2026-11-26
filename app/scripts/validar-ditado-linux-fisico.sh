#!/usr/bin/env bash
# Valida o ditado no Linux com microfone físico e a sua voz, num comando só:
#   bash app/scripts/validar-ditado-linux-fisico.sh [pasta-de-saida]
# Prepara o que faltar (dependências do app, venv do faster-whisper), sobe o
# servidor local de transcrição, abre o app isolado e pede que você fale.
# Nada sai do computador. Sai com código 0 se todos os itens passarem.
set -euo pipefail
cd "$(dirname "$0")/.."

for programa in node npm python3 pactl parecord paplay curl; do
  command -v "$programa" >/dev/null || { echo "Falta o programa '$programa' (pactl, parecord e paplay vêm de pulseaudio-utils)." >&2; exit 2; }
done

saida="${1:-$HOME/ditado-validacao/$(date +%Y%m%d-%H%M%S)}"
venv="${FELIXO_DITADO_VENV:-$HOME/ditado-venv}"
mkdir -p "$saida"

[ -d node_modules ] || npm ci
if ! "$venv/bin/python" -c 'import faster_whisper' >/dev/null 2>&1; then
  echo "Instalando o faster-whisper em $venv..."
  python3 -m venv "$venv"
  "$venv/bin/pip" install --quiet faster-whisper "av<16"
fi

if curl -s -o /dev/null http://127.0.0.1:8765/; then
  echo "A porta 8765 já está em uso: feche o outro servidor de transcrição e rode de novo." >&2
  exit 2
fi
echo "Subindo o servidor local (na primeira vez baixa o modelo, cerca de 480 MB)..."
"$venv/bin/python" scripts/servidor-transcricao-local.py --registro "$saida/transcricoes.jsonl" >"$saida/servidor.log" 2>&1 &
servidor=$!
trap 'kill "$servidor" 2>/dev/null || true' EXIT
until curl -s -o /dev/null http://127.0.0.1:8765/; do
  kill -0 "$servidor" 2>/dev/null || { cat "$saida/servidor.log" >&2; exit 2; }
  sleep 2
done

node scripts/validar-ditado-linux.cjs "$saida" fisico

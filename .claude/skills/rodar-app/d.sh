#!/bin/bash
# Manda um comando para o REPL do driver (sessao tmux `felixo`) e imprime so a
# saida dele. Espera pelo `--done--` que o driver escreve ao fim de cada comando,
# em vez de dormir um tempo fixo.
#
#   ./d.sh launch
#   ./d.sh expand
#   ./d.sh paste image blue
#
# Variaveis: TMUX_SESSION (padrao: felixo), D_TICKS (esperas de 0,3s; padrao 200).
set -u

session="${TMUX_SESSION:-felixo}"

if ! tmux has-session -t "$session" 2>/dev/null; then
  echo "sessao tmux '$session' nao existe — veja o SKILL.md para inicia-la" >&2
  exit 1
fi

count_done() { tmux capture-pane -t "$session" -p -S -5000 | grep -c -- '--done--'; }

before=$(count_done)
tmux send-keys -t "$session" -l "$*"
tmux send-keys -t "$session" Enter

for _ in $(seq 1 "${D_TICKS:-200}"); do
  [ "$(count_done)" -gt "$before" ] && break
  sleep 0.3
done
sleep 0.3

# Imprime da linha do prompt ate o `--done--` mais recente, sem os dois.
tmux capture-pane -t "$session" -p -S -5000 | awk '
{ lines[NR] = $0 }
END {
  for (i = NR; i > 0; i--) if (lines[i] == "--done--") { end = i; break }
  for (i = end; i > 0; i--) if (lines[i] ~ /^driver> /) { start = i; break }
  for (i = start + 1; i < end; i++) print lines[i]
}'

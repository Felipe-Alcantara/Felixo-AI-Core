#!/bin/bash
# OpenClaude com Claude (Anthropic)
# Exige o Konsole (Linux/KDE). A CLI é resolvida pelo PATH; se ele vier reduzido
# (lançador gráfico), defina FELIXO_CLI_PATHS com a pasta onde ela está instalada.
export PATH="${FELIXO_CLI_PATHS:+$FELIXO_CLI_PATHS:}$HOME/.npm-global/bin:$PATH"
exec konsole --hold --workdir "$HOME" -e openclaude --provider anthropic

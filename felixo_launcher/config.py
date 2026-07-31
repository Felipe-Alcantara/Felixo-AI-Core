"""Reads and writes the launcher's local settings file.

The interactive menu's "Configurar" persists the environment-variable
overrides here so a person sets them once instead of exporting variables by
hand on every run. The file is gitignored: it holds machine-specific paths,
never secrets.
"""

from __future__ import annotations

import json

from .paths import CONFIG_FILE


CONFIG_FIELDS: tuple[dict[str, object], ...] = (
    {
        "key": "FELIXO_NODE_BIN",
        "label": "Pasta do Node.js/npm (forçar um caminho específico)",
        "kind": "text",
    },
    {
        "key": "FELIXO_CLI_PATHS",
        "label": "Pastas extras onde procurar as CLIs (claude/codex/gemini)",
        "kind": "text",
    },
    {
        "key": "FELIXO_CLAUDE_PERMISSION_MODE",
        "label": "Modo de permissão do Claude",
        "kind": "choice",
        "choices": ("default", "plan", "auto", "dontAsk", "acceptEdits", "off"),
    },
    {
        "key": "FELIXO_CODEX_FULL_ACCESS",
        "label": "Codex com acesso total (sem confirmações)",
        "kind": "choice",
        "choices": ("on", "off"),
    },
    {
        "key": "FELIXO_GEMINI_FULL_ACCESS",
        "label": "Gemini com acesso total (sem confirmações)",
        "kind": "choice",
        "choices": ("on", "off"),
    },
    {
        "key": "FELIXO_PRODUCTION_BRANCH",
        "label": "Branch de produção (usada em Atualizar)",
        "kind": "text",
        "default": "production",
    },
)


def load_config() -> dict[str, str]:
    if not CONFIG_FILE.exists():
        return {}

    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    if not isinstance(data, dict):
        return {}

    return {
        key: value
        for key, value in data.items()
        if isinstance(key, str) and isinstance(value, str) and value
    }


def save_config(config: dict[str, str]) -> None:
    cleaned = {key: value for key, value in config.items() if value}
    CONFIG_FILE.write_text(
        json.dumps(cleaned, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def apply_config_to_env(env: dict[str, str], config: dict[str, str]) -> None:
    for key, value in config.items():
        if value:
            env[key] = value

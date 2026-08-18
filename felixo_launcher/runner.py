"""Prepares the Node environment and runs the app without the menu.

`prepare_node_env` is the shared setup both the menu and the flag-driven path
depend on. `run_direct` is the non-interactive path kept for scripts and CI
that already invoke the launcher with flags.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .commands import run_command
from .config import apply_config_to_env, load_config
from .node import build_env, find_node_bin, read_minimum_node_version, read_node_version
from .node_deps import ensure_dependencies
from .paths import APP_DIR, DEFAULT_URL
from .python_deps import ensure_python_requirements
from .git import auto_update, update_source_from_branch


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Start the Felixo AI Core Electron app. Run with no arguments to open "
            "the interactive menu (recommended) — these flags exist for scripts/CI."
        )
    )
    parser.add_argument(
        "--web",
        action="store_true",
        help="Start only the web preview instead of the Electron desktop app.",
    )
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Do not install Python or npm dependencies automatically.",
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Fast-forward this checkout from the production branch before starting.",
    )
    parser.add_argument(
        "--branch",
        default=os.environ.get("FELIXO_PRODUCTION_BRANCH", "production"),
        help="Production branch used with --update. Defaults to production.",
    )
    parser.add_argument(
        "--no-auto-update",
        action="store_true",
        default=os.environ.get("FELIXO_AUTO_UPDATE", "").strip().lower()
        in {"0", "off", "false", "no"},
        help=(
            "Do not quietly fast-forward the current branch before starting. "
            "Set FELIXO_AUTO_UPDATE=off for the same effect. Use this in CI, "
            "which must build the commit it checked out."
        ),
    )
    return parser.parse_args()


def prepare_node_env() -> tuple[Path, dict[str, str]] | None:
    """Finds a working Node/npm and builds the subprocess env for it, applying
    any persisted config overrides. Prints a clear error and returns None on
    failure — callers just check for None instead of duplicating diagnostics."""
    if not APP_DIR.exists():
        print(f"[felixo] App directory not found: {APP_DIR}", file=sys.stderr)
        return None

    # A configuração entra ANTES da descoberta: FELIXO_NODE_BIN existe
    # justamente para apontar um Node que a busca automática não acha, e é
    # lido de os.environ lá dentro. Aplicá-la só depois deixava a opção do
    # menu "Configurar" sem efeito nenhum.
    #
    # setdefault, não atribuição: uma variável exportada no shell é um
    # override pontual e deve vencer o valor salvo.
    config = load_config()
    for chave, valor in config.items():
        if valor:
            os.environ.setdefault(chave, valor)

    node_version = read_node_version()
    minimum_node_version = read_minimum_node_version()
    node_bin = find_node_bin(node_version, minimum_node_version)

    if node_bin is None:
        minimum_hint = f" {minimum_node_version}+" if minimum_node_version else ""
        print(
            f"[felixo] A working Node.js/npm installation{minimum_hint} was not found.",
            file=sys.stderr,
        )
        if sys.platform == "darwin":
            print(
                "[felixo] On macOS, install Node with Homebrew, NVM, Volta, asdf, mise, fnm, or nodejs.org.",
                file=sys.stderr,
            )
        return None

    env = build_env(node_bin)
    apply_config_to_env(env, config)
    return node_bin, env


def run_direct(args: argparse.Namespace) -> int:
    """The non-interactive path: exactly what running with flags has always
    done. Kept for scripts/CI that already call `start_app.py --web` etc. —
    see docs/projeto/RODAR-VIA-CODIGO-FONTE.md. The interactive menu
    (`run_interactive_menu`) is the recommended way for a person at a
    terminal; this path never draws it."""
    prepared = prepare_node_env()
    if prepared is None:
        return 1
    node_bin, env = prepared
    print(f"[felixo] Using Node.js from {node_bin}")

    # A failure here only means the menu's own packages are missing, and this
    # path does not draw the menu at all — never let it stop the app from
    # starting. The install already printed what went wrong.
    if ensure_python_requirements(env, args.skip_install) != 0:
        print(
            "[felixo] Continuing without the launcher's Python packages; "
            "the app does not need them.",
            file=sys.stderr,
        )

    source_updated = False
    if args.update:
        # Explicit `--update` keeps its old contract: it targets the production
        # branch and a failure is a real failure worth stopping for.
        update_code, source_updated = update_source_from_branch(args.branch, env)
        if update_code != 0:
            return update_code
    elif not args.no_auto_update:
        source_updated = auto_update(env)

    install_code = ensure_dependencies(env, args.skip_install, source_updated)
    if install_code != 0:
        return install_code

    if args.web:
        print(f"[felixo] Opening web preview at {DEFAULT_URL}")
        return run_command(["npm", "run", "dev:web"], env)

    print("[felixo] Opening Felixo AI Core desktop app...")
    return run_command(["npm", "run", "dev"], env, debug_terminal=True)

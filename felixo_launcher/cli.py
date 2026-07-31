"""Entry point: decides between the interactive menu and the flag-driven path.

Running with no arguments opens the menu, which is the documented way in for a
person at a terminal. Any explicit flag keeps the original non-interactive
behaviour, so scripts and CI that already pass `--web` and friends are
unaffected.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .menu import run_interactive_menu
from .python_deps import ensure_tui_dependencies
from .runner import parse_args, run_direct


def main() -> int:
    # Any explicit flag (scripts/CI already using `start_app.py --web` etc.,
    # documented in docs/projeto/RODAR-VIA-CODIGO-FONTE.md) skips the menu and
    # behaves exactly as before. No arguments at all → interactive menu, the
    # recommended path per GUIA-START-APP-SCRIPT.md.
    if len(sys.argv) > 1:
        return run_direct(parse_args())

    if not ensure_tui_dependencies():
        # Falling through to `run_direct` here would silently launch Electron
        # instead of the menu the person asked for, hiding the real problem.
        # GUIA-START-APP-SCRIPT.md requires a readable failure that says what
        # to do, so stop and say it.
        print(
            "[felixo] Não foi possível preparar o menu interativo "
            "(questionary/rich) — veja a mensagem do pip acima.",
            file=sys.stderr,
        )
        print(
            "[felixo] Para rodar sem o menu enquanto isso: "
            f"{Path(sys.executable).name} start_app.py --skip-install",
            file=sys.stderr,
        )
        return 1

    return run_interactive_menu()

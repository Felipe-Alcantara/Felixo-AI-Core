#!/usr/bin/env python3
"""Start the Felixo AI Core desktop app.

The single entry point for the project, kept at the repository root as the
start-app contract requires. Run it with no arguments for the interactive menu:

    python3 start_app.py

The implementation lives in `felixo_launcher/`, split by responsibility — see
that package's docstring for the module map.
"""

from __future__ import annotations

import sys
from pathlib import Path


# Running this file directly puts its own directory on sys.path, not the
# repository root, so the package import has to be made possible explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from felixo_launcher import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
"""Shared locations and settings for the launcher.

Kept in one place because every other module needs at least one of these
paths, and duplicating them is how a launcher ends up looking in one
directory while installing into another.
"""

from __future__ import annotations

import re
from pathlib import Path


# `parents[1]` is the repository root: this file lives in felixo_launcher/.
ROOT_DIR = Path(__file__).resolve().parents[1]
APP_DIR = ROOT_DIR / "app"
DEFAULT_URL = "http://127.0.0.1:5173/"
REQUIREMENTS_FILE_NAMES = ("requirements.txt", "requeriments.txt")
NODE_SEARCH_PATHS_ENV = "FELIXO_NODE_SEARCH_PATHS"
# Matches the module specifier of an `import`/`export` statement. The clause
# between the keyword and `from` deliberately excludes quotes, semicolons and
# braces-past-the-end: an earlier `[\s\S]*?` version wandered across lines and
# paired a stray `import` with a quoted string much further down the file,
# reporting comment prose as a missing npm package.
SOURCE_IMPORT_PATTERN = re.compile(
    r"""(?:^|[;}])\s*(?:import|export)\s+
        (?:type\s+)?
        (?:[^'";]*?\sfrom\s+)?
        ['"]([^'"\n]+)['"]""",
    re.MULTILINE | re.VERBOSE,
)
CONFIG_FILE = ROOT_DIR / ".felixo-start-config.json"

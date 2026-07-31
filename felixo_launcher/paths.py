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
SOURCE_IMPORT_PATTERN = re.compile(
    r"(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['\"]([^'\"]+)['\"]"
)
CONFIG_FILE = ROOT_DIR / ".felixo-start-config.json"

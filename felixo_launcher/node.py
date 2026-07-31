"""Finds a working Node.js/npm and builds the environment to run it with.

This is the part that most often decides whether the app starts at all. A
GUI-launched process inherits a minimal PATH that usually omits Homebrew,
nvm, Volta and friends, so discovery cannot rely on PATH alone: it walks the
well-known install locations for every common version manager, on every
platform, and validates each candidate by actually running `node --version`
and `npm --version` before trusting it.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from .paths import NODE_SEARCH_PATHS_ENV, APP_DIR, ROOT_DIR


MACOS_NODE_BIN_DIRS = (
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
)

USER_NODE_BIN_DIRS = (
    ".volta/bin",
    ".local/share/mise/shims",
    ".asdf/shims",
    ".nodenv/shims",
    ".local/bin",
)

WINDOWS_USER_NODE_BIN_DIRS = (
    "AppData/Roaming/npm",
    "AppData/Local/Volta/bin",
    "scoop/shims",
)

def is_windows_platform() -> bool:
    return os.name == "nt"
def read_node_version() -> str | None:
    for candidate in (ROOT_DIR / ".nvmrc", APP_DIR / ".nvmrc"):
        if candidate.exists():
            version = candidate.read_text(encoding="utf-8").strip()
            return version.removeprefix("v") or None
    return None


def read_minimum_node_version() -> str | None:
    package_json = APP_DIR / "package.json"

    try:
        package_data = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    node_range = package_data.get("engines", {}).get("node")
    if not isinstance(node_range, str):
        return None

    match = re.search(r">=\s*v?(\d+(?:\.\d+){0,2})", node_range)
    if match:
        return normalize_version_string(match.group(1))

    return normalize_version_string(node_range)


def normalize_version_string(value: str | None) -> str | None:
    version = parse_semver(value)
    if version is None:
        return None

    return ".".join(str(part) for part in version)


def parse_semver(value: str | None) -> tuple[int, int, int] | None:
    if not value:
        return None

    match = re.search(r"v?(\d+)(?:\.(\d+))?(?:\.(\d+))?", value)
    if match is None:
        return None

    return tuple(int(part or 0) for part in match.groups())


def is_version_at_least(actual: str, minimum: str | None) -> bool:
    minimum_version = parse_semver(minimum)
    if minimum_version is None:
        return True

    actual_version = parse_semver(actual)
    if actual_version is None:
        return False

    return actual_version >= minimum_version


def find_node_bin(version: str | None, minimum_version: str | None = None) -> Path | None:
    for candidate in iter_node_bin_candidates(version):
        if is_working_node_bin(candidate, minimum_version):
            return candidate

    return None


def iter_node_bin_candidates(version: str | None) -> list[Path]:
    candidates: list[Path] = []
    seen: set[str] = set()

    def add(path: Path | str | None) -> None:
        if not path:
            return

        candidate = Path(path).expanduser()
        if candidate.name.lower() in {"node", "node.exe", "npm", "npm.cmd"}:
            candidate = candidate.parent

        key = str(candidate)
        if key and key not in seen:
            seen.add(key)
            candidates.append(candidate)

    custom_bin = os.environ.get("FELIXO_NODE_BIN")
    if custom_bin:
        add(custom_bin)

    for path in split_path_env(os.environ.get(NODE_SEARCH_PATHS_ENV)):
        add(path)

    add_version_manager_candidates(add, version)

    for path in split_path_env(get_path_env(os.environ)):
        add(path)

    home = Path.home()
    for relative_path in USER_NODE_BIN_DIRS:
        add(home / relative_path)

    if sys.platform == "darwin":
        for path in MACOS_NODE_BIN_DIRS:
            add(path)

    if is_windows_platform():
        for path in iter_windows_node_bin_dirs():
            add(path)

    return candidates


def split_path_env(value: str | None) -> list[str]:
    if not value:
        return []

    return [path for path in value.split(os.pathsep) if path]
def env_path(name: str, default: str) -> Path:
    return Path(os.environ.get(name) or default).expanduser()


def get_path_env(env: object) -> str:
    if hasattr(env, "items"):
        path_values = [
            (str(key), str(value))
            for key, value in env.items()
            if str(key).lower() == "path"
        ]

        preferred_key = "Path" if is_windows_platform() else "PATH"
        for key, value in path_values:
            if key == preferred_key and value:
                return value

        for _key, value in path_values:
            if value:
                return value

        if path_values:
            return path_values[0][1]

    return ""


def set_path_env(env: dict[str, str], value: str) -> None:
    existing_keys = [key for key in env if key.lower() == "path"]
    preferred_key = "Path" if is_windows_platform() else "PATH"
    path_key = next((key for key in existing_keys if key == preferred_key), None)
    path_key = path_key or (existing_keys[0] if existing_keys else preferred_key)

    for key in existing_keys:
        if key != path_key:
            env.pop(key, None)

    env[path_key] = value
NodeBinAdder = Callable[["Path | str | None"], None]
def add_version_manager_candidates(add: NodeBinAdder, version: str | None) -> None:
    if version:
        nvm_home = env_path("NVM_DIR", "~/.nvm")
        for dirname in (f"v{version}", version):
            add(nvm_home / "versions" / "node" / dirname / "bin")

        fnm_homes = [
            Path(path).expanduser()
            for path in (os.environ.get("FNM_DIR"), "~/.local/share/fnm", "~/.fnm")
            if path
        ]
        for fnm_home in fnm_homes:
            for dirname in (f"v{version}", version):
                add(fnm_home / "node-versions" / dirname / "installation" / "bin")
                add(fnm_home / "node-versions" / dirname / "bin")

        asdf_home = env_path("ASDF_DATA_DIR", "~/.asdf")
        for dirname in (version, f"v{version}"):
            add(asdf_home / "installs" / "nodejs" / dirname / "bin")

        mise_home = env_path("MISE_DATA_DIR", "~/.local/share/mise")
        for dirname in (version, f"v{version}", f"node@{version}"):
            add(mise_home / "installs" / "node" / dirname / "bin")

        nodenv_home = env_path("NODENV_ROOT", "~/.nodenv")
        for dirname in (version, f"v{version}"):
            add(nodenv_home / "versions" / dirname / "bin")

        if is_windows_platform():
            for nvm_windows_home in iter_nvm_windows_homes():
                for dirname in (f"v{version}", version):
                    add(nvm_windows_home / dirname)

    add(env_path("VOLTA_HOME", "~/.volta") / "bin")
    add(env_path("ASDF_DATA_DIR", "~/.asdf") / "shims")
    add(env_path("MISE_DATA_DIR", "~/.local/share/mise") / "shims")
    add(env_path("NODENV_ROOT", "~/.nodenv") / "shims")

    nvm_home = env_path("NVM_DIR", "~/.nvm")
    add_installed_version_bins(add, nvm_home / "versions" / "node", ("bin",))

    for fnm_home in (
        Path(path).expanduser()
        for path in (os.environ.get("FNM_DIR"), "~/.local/share/fnm", "~/.fnm")
        if path
    ):
        add_installed_version_bins(
            add,
            fnm_home / "node-versions",
            ("installation", "bin"),
        )
        add_installed_version_bins(add, fnm_home / "node-versions", ("bin",))

    asdf_home = env_path("ASDF_DATA_DIR", "~/.asdf")
    add_installed_version_bins(add, asdf_home / "installs" / "nodejs", ("bin",))

    mise_home = env_path("MISE_DATA_DIR", "~/.local/share/mise")
    add_installed_version_bins(add, mise_home / "installs" / "node", ("bin",))

    nodenv_home = env_path("NODENV_ROOT", "~/.nodenv")
    add_installed_version_bins(add, nodenv_home / "versions", ("bin",))

    if is_windows_platform():
        for nvm_windows_home in iter_nvm_windows_homes():
            add_installed_version_bins(add, nvm_windows_home, ())


def iter_nvm_windows_homes() -> list[Path]:
    homes: list[Path] = []

    def add(path: str | Path | None) -> None:
        if path:
            candidate = Path(path).expanduser()
            if candidate not in homes:
                homes.append(candidate)

    add(os.environ.get("NVM_HOME"))

    appdata = os.environ.get("APPDATA")
    if appdata:
        add(Path(appdata) / "nvm")

    return homes


def iter_windows_node_bin_dirs() -> list[Path]:
    candidates: list[Path] = []

    def add(path: str | None) -> None:
        if path:
            candidates.append(Path(path).expanduser())

    add(os.environ.get("NVM_SYMLINK"))
    add(os.environ.get("NVM_HOME"))
    add(os.environ.get("VOLTA_HOME"))

    for base_name in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        base = os.environ.get(base_name)
        if base:
            add(str(Path(base) / "nodejs"))

    appdata = os.environ.get("APPDATA")
    if appdata:
        add(str(Path(appdata) / "npm"))
        add(str(Path(appdata) / "nvm"))

    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        user_home = Path(userprofile)
        for relative_path in WINDOWS_USER_NODE_BIN_DIRS:
            add(str(user_home / relative_path))

    return candidates


def add_installed_version_bins(
    add: NodeBinAdder,
    versions_dir: Path,
    suffix: tuple[str, ...],
) -> None:
    try:
        version_dirs = [path for path in versions_dir.iterdir() if path.is_dir()]
    except OSError:
        return

    version_dirs.sort(key=lambda path: parse_semver(path.name) or (0, 0, 0), reverse=True)
    for version_dir in version_dirs:
        add(version_dir.joinpath(*suffix))


def is_working_node_bin(node_bin: Path, minimum_version: str | None) -> bool:
    node_command = find_command_in_bin("node", node_bin)
    npm_command = find_command_in_bin("npm", node_bin)

    if node_command is None or npm_command is None:
        return False

    env = build_env(node_bin)
    node_result = probe_command([str(node_command), "--version"], env)
    if node_result is None or node_result.returncode != 0:
        return False

    if not is_version_at_least(node_result.stdout, minimum_version):
        return False

    npm_result = probe_command([str(npm_command), "--version"], env)
    return npm_result is not None and npm_result.returncode == 0


def find_command_in_bin(command: str, node_bin: Path) -> Path | None:
    found = shutil.which(command, path=str(node_bin))
    return Path(found) if found else None


def probe_command(
    command: list[str],
    env: dict[str, str],
) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(
            command,
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def build_env(node_bin: Path | None) -> dict[str, str]:
    env = os.environ.copy()
    path_entries: list[str] = []

    if node_bin:
        path_entries.append(str(node_bin))

    path_entries.extend(split_path_env(env.get(NODE_SEARCH_PATHS_ENV)))

    home = Path.home()
    path_entries.extend(str(home / relative_path) for relative_path in USER_NODE_BIN_DIRS)

    if sys.platform == "darwin":
        path_entries.extend(MACOS_NODE_BIN_DIRS)

    if is_windows_platform():
        path_entries.extend(str(path) for path in iter_windows_node_bin_dirs())

    path_entries.extend(split_path_env(get_path_env(env)))
    set_path_env(env, os.pathsep.join(unique_path_entries(path_entries)))

    env.pop("ELECTRON_RUN_AS_NODE", None)
    env.pop("ELECTRON_NO_ATTACH_CONSOLE", None)
    return env


def unique_path_entries(path_entries: list[str]) -> list[str]:
    unique_entries: list[str] = []
    seen: set[str] = set()

    for path_entry in path_entries:
        if not path_entry or path_entry in seen:
            continue

        seen.add(path_entry)
        unique_entries.append(path_entry)

    return unique_entries

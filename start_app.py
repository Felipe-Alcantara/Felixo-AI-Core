#!/usr/bin/env python3
"""Start the Felixo AI Core desktop app."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
APP_DIR = ROOT_DIR / "app"
DEFAULT_URL = "http://127.0.0.1:5173/"
REQUIREMENTS_FILE_NAMES = ("requirements.txt", "requeriments.txt")
NODE_SEARCH_PATHS_ENV = "FELIXO_NODE_SEARCH_PATHS"

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


NodeBinAdder = Callable[[Path | str | None], None]


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


def resolve_subprocess_command(command: list[str], env: dict[str, str]) -> list[str]:
    if not command:
        return command

    resolved = resolve_executable(command[0], env)
    if resolved is None:
        return command

    return [str(resolved), *command[1:]]


def resolve_executable(executable: str, env: dict[str, str]) -> Path | None:
    command_path = Path(executable)
    if command_path.parent != Path("."):
        return command_path

    found = shutil.which(executable, path=get_path_env(env))
    return Path(found) if found else None


def call_command(command: list[str], cwd: Path, env: dict[str, str]) -> int:
    resolved_command = resolve_subprocess_command(command, env)
    try:
        return subprocess.call(resolved_command, cwd=cwd, env=env)
    except FileNotFoundError:
        print(f"[felixo] Command not found: {command[0]}", file=sys.stderr)
        return 1


def run_command(command: list[str], env: dict[str, str]) -> int:
    resolved_command = resolve_subprocess_command(command, env)
    print(f"[felixo] Running: {' '.join(resolved_command)}")

    try:
        process = subprocess.Popen(
            resolved_command,
            cwd=APP_DIR,
            env=env,
            start_new_session=(os.name != "nt"),
        )
    except FileNotFoundError:
        print(f"[felixo] Command not found: {command[0]}", file=sys.stderr)
        return 1

    previous_sigterm = signal.getsignal(signal.SIGTERM)

    def handle_sigterm(signum: int, _frame: object) -> None:
        print("\n[felixo] Stopping app...")
        stop_process(process)
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, handle_sigterm)

    try:
        return process.wait()
    except KeyboardInterrupt:
        print("\n[felixo] Stopping app...")
        stop_process(process)
        return 130
    finally:
        signal.signal(signal.SIGTERM, previous_sigterm)


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        if os.name == "nt":
            process.terminate()
        else:
            os.killpg(process.pid, signal.SIGTERM)

        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                process.kill()
            else:
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()

    cleanup_app_processes()


def cleanup_app_processes() -> None:
    if os.name == "nt":
        return

    marker = str(APP_DIR / "node_modules")

    try:
        output = subprocess.check_output(
            ["pgrep", "-f", marker],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return

    current_pid = os.getpid()
    pids = [
        int(line)
        for line in output.splitlines()
        if line.strip() and int(line) != current_pid
    ]

    if not pids:
        return

    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    time.sleep(1)

    for pid in pids:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            continue

        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def ensure_dependencies(
    env: dict[str, str],
    skip_install: bool,
    force_install: bool = False,
) -> int:
    if skip_install:
        return 0

    if not force_install and (APP_DIR / "node_modules").exists():
        return 0

    if force_install:
        print("[felixo] Source updated. Refreshing dependencies...")
    else:
        print("[felixo] node_modules not found. Installing dependencies...")

    return call_command(["npm", "install"], cwd=APP_DIR, env=env)


def ensure_python_requirements(env: dict[str, str], skip_install: bool) -> int:
    if skip_install:
        return 0

    requirements_file = find_python_requirements_file()

    if requirements_file is None:
        return 0

    if not has_installable_python_requirements(requirements_file):
        print(f"[felixo] No Python packages listed in {requirements_file.name}.")
        return 0

    if not has_pip(env):
        print(
            "[felixo] Python requirements were found, but pip is not available for this Python.",
            file=sys.stderr,
        )
        return 1

    print(f"[felixo] Installing Python requirements from {requirements_file.name}...")
    return subprocess.call(
        [sys.executable, "-m", "pip", "install", "-r", str(requirements_file)],
        cwd=ROOT_DIR,
        env=env,
    )


def find_python_requirements_file() -> Path | None:
    for file_name in REQUIREMENTS_FILE_NAMES:
        candidate = ROOT_DIR / file_name
        if candidate.exists():
            return candidate

    return None


def has_installable_python_requirements(requirements_file: Path) -> bool:
    try:
        lines = requirements_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False

    return any(line.strip() and not line.lstrip().startswith("#") for line in lines)


def has_pip(env: dict[str, str]) -> bool:
    return (
        subprocess.call(
            [sys.executable, "-m", "pip", "--version"],
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        == 0
    )


def update_source_from_branch(branch: str, env: dict[str, str]) -> tuple[int, bool]:
    if shutil.which("git") is None:
        print("[felixo] git was not found. Install Git first.", file=sys.stderr)
        return 1, False

    if not (ROOT_DIR / ".git").exists():
        print("[felixo] This folder is not a Git checkout.", file=sys.stderr)
        return 1, False

    dirty_files = get_dirty_files(env)
    if dirty_files:
        print(
            "[felixo] Local changes detected. Commit, stash or discard them before updating.",
            file=sys.stderr,
        )
        for line in dirty_files[:10]:
            print(f"[felixo]   {line}", file=sys.stderr)
        if len(dirty_files) > 10:
            print(f"[felixo]   ... and {len(dirty_files) - 10} more", file=sys.stderr)
        return 1, False

    before = get_current_revision(env)
    if not before:
        return 1, False

    print(f"[felixo] Updating source from origin/{branch}...")
    fetch_code = subprocess.call(["git", "fetch", "origin", branch], cwd=ROOT_DIR, env=env)
    if fetch_code != 0:
        return fetch_code, False

    pull_code = subprocess.call(
        ["git", "pull", "--ff-only", "origin", branch],
        cwd=ROOT_DIR,
        env=env,
    )
    if pull_code != 0:
        return pull_code, False

    after = get_current_revision(env)
    return 0, bool(after and after != before)


def get_dirty_files(env: dict[str, str]) -> list[str]:
    try:
        output = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=ROOT_DIR,
            env=env,
            text=True,
        )
    except subprocess.CalledProcessError:
        return ["Unable to read git status."]

    return [line for line in output.splitlines() if line.strip()]


def get_current_revision(env: dict[str, str]) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT_DIR,
            env=env,
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        print("[felixo] Unable to read current Git revision.", file=sys.stderr)
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start the Felixo AI Core Electron app."
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
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not APP_DIR.exists():
        print(f"[felixo] App directory not found: {APP_DIR}", file=sys.stderr)
        return 1

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
        return 1

    env = build_env(node_bin)
    print(f"[felixo] Using Node.js from {node_bin}")

    requirements_code = ensure_python_requirements(env, args.skip_install)
    if requirements_code != 0:
        return requirements_code

    source_updated = False
    if args.update:
        update_code, source_updated = update_source_from_branch(args.branch, env)
        if update_code != 0:
            return update_code

    install_code = ensure_dependencies(env, args.skip_install, source_updated)
    if install_code != 0:
        return install_code

    cleanup_app_processes()

    if args.web:
        print(f"[felixo] Opening web preview at {DEFAULT_URL}")
        return run_command(["npm", "run", "dev:web"], env)

    print("[felixo] Opening Felixo AI Core desktop app...")
    return run_command(["npm", "run", "dev"], env)


if __name__ == "__main__":
    raise SystemExit(main())

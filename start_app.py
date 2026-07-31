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
SOURCE_IMPORT_PATTERN = re.compile(
    r"(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['\"]([^'\"]+)['\"]"
)

# Local, gitignored file where the interactive menu's "Configurar" persists
# the environment-variable overrides documented in README.md (CLI paths,
# agent permission modes, production branch) — so the person configures them
# once via the menu instead of exporting env vars by hand every time.
CONFIG_FILE = ROOT_DIR / ".felixo-start-config.json"

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

    missing_dependencies = get_missing_node_dependencies(env)
    if not force_install and not missing_dependencies and node_modules_is_current():
        return 0

    if force_install:
        print("[felixo] Source updated. Refreshing dependencies...")
    elif missing_dependencies:
        preview = ", ".join(missing_dependencies[:8])
        remaining = len(missing_dependencies) - 8
        if remaining > 0:
            preview = f"{preview}, ... and {remaining} more"
        print(f"[felixo] Missing npm dependencies detected: {preview}")
        print("[felixo] Installing dependencies...")
    elif not (APP_DIR / "node_modules").exists():
        print("[felixo] node_modules not found. Installing dependencies...")
    else:
        print("[felixo] npm dependency metadata changed. Refreshing dependencies...")

    return call_command(["npm", "install"], cwd=APP_DIR, env=env)


def get_missing_node_dependencies(env: dict[str, str]) -> list[str]:
    package_json = APP_DIR / "package.json"
    node_modules = APP_DIR / "node_modules"

    if not node_modules.exists():
        return ["node_modules"]

    try:
        package_data = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    dependencies: list[str] = []
    for section in ("dependencies", "devDependencies", "optionalDependencies"):
        section_data = package_data.get(section)
        if isinstance(section_data, dict):
            dependencies.extend(
                name for name in section_data if isinstance(name, str)
            )

    missing_dependencies = [
        dependency
        for dependency in sorted(set(dependencies))
        if not node_dependency_exists(node_modules, dependency)
    ]
    missing_dependencies.extend(get_unresolved_node_imports(env))

    return sorted(set(missing_dependencies))


def node_dependency_exists(node_modules: Path, dependency: str) -> bool:
    parts = dependency.split("/")
    if dependency.startswith("@") and len(parts) == 2:
        return node_modules.joinpath(parts[0], parts[1], "package.json").exists()

    return (node_modules / dependency / "package.json").exists()


def get_unresolved_node_imports(env: dict[str, str]) -> list[str]:
    specifiers = collect_external_import_specifiers()
    if not specifiers:
        return []

    script = """
const specifiers = JSON.parse(process.argv[1]);
const unresolved = [];
for (const specifier of specifiers) {
  try {
    import.meta.resolve(specifier);
  } catch {
    unresolved.push(specifier);
  }
}
console.log(JSON.stringify(unresolved));
"""

    node_command = resolve_subprocess_command(
        ["node", "--input-type=module", "-e", script, json.dumps(specifiers)],
        env,
    )

    try:
        result = subprocess.run(
            node_command,
            cwd=APP_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    if result.returncode != 0:
        return []

    try:
        unresolved = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []

    return [
        specifier
        for specifier in unresolved
        if isinstance(specifier, str)
    ]


def collect_external_import_specifiers() -> list[str]:
    specifiers: set[str] = set()

    for source_file in iter_dependency_checked_source_files():
        try:
            source = source_file.read_text(encoding="utf-8")
        except OSError:
            continue

        for match in SOURCE_IMPORT_PATTERN.finditer(source):
            specifier = match.group(1)
            if is_external_import_specifier(specifier):
                specifiers.add(specifier)

    return sorted(specifiers)


def iter_dependency_checked_source_files() -> list[Path]:
    files = [APP_DIR / "vite.config.ts"]
    source_dir = APP_DIR / "src"
    if source_dir.exists():
        files.extend(
            path
            for path in source_dir.rglob("*")
            if path.suffix in {".js", ".jsx", ".ts", ".tsx"}
        )

    return files


def is_external_import_specifier(specifier: str) -> bool:
    return not (
        specifier.startswith(".")
        or specifier.startswith("/")
        or specifier.startswith("node:")
    )


def node_modules_is_current() -> bool:
    node_modules = APP_DIR / "node_modules"
    if not node_modules.exists():
        return False

    try:
        node_modules_mtime = node_modules.stat().st_mtime
    except OSError:
        return False

    for metadata_file in (APP_DIR / "package.json", APP_DIR / "package-lock.json"):
        try:
            if metadata_file.exists() and metadata_file.stat().st_mtime > node_modules_mtime:
                return False
        except OSError:
            return False

    return True


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
    return parser.parse_args()


def prepare_node_env() -> tuple[Path, dict[str, str]] | None:
    """Finds a working Node/npm and builds the subprocess env for it, applying
    any persisted config overrides. Prints a clear error and returns None on
    failure — callers just check for None instead of duplicating diagnostics."""
    if not APP_DIR.exists():
        print(f"[felixo] App directory not found: {APP_DIR}", file=sys.stderr)
        return None

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
    apply_config_to_env(env, load_config())
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


def ensure_tui_dependencies() -> bool:
    """The interactive menu needs `questionary` + `rich` to draw itself. Both
    are declared in requirements.txt, but a fresh clone may not have run
    Setup yet — bootstrap them here so `python start_app.py` works standalone,
    per GUIA-START-APP-SCRIPT.md ("o script faz um bootstrap minimo antes de
    desenhar o menu")."""
    try:
        import questionary  # noqa: F401
        import rich  # noqa: F401

        return True
    except ImportError:
        pass

    print("[felixo] Preparando dependências do menu (questionary, rich)...")
    result = subprocess.call(
        [sys.executable, "-m", "pip", "install", "questionary", "rich"],
        cwd=ROOT_DIR,
    )
    if result != 0:
        return False

    try:
        import questionary  # noqa: F401
        import rich  # noqa: F401

        return True
    except ImportError:
        return False


def run_interactive_menu() -> int:
    import questionary
    from rich.console import Console

    console = Console()

    while True:
        console.clear()
        _print_menu_header(console)

        choice = questionary.select(
            "O que você quer fazer?",
            choices=[
                questionary.Choice(
                    "Iniciar / Rodar   — sobe o app desktop ou o preview web",
                    value="start",
                ),
                questionary.Choice(
                    "Instalar / Setup  — instala dependências Python e Node",
                    value="install",
                ),
                questionary.Choice(
                    "Configurar        — CLIs, permissões dos agentes, branch de produção",
                    value="configure",
                ),
                questionary.Choice(
                    "Atualizar         — git pull da branch de produção",
                    value="update",
                ),
                questionary.Choice(
                    "Status            — o que está instalado e pronto agora",
                    value="status",
                ),
                questionary.Choice("Sair", value="exit"),
            ],
        ).ask()

        if choice is None or choice == "exit":
            console.print("[dim]Até mais![/dim]")
            return 0

        if choice == "start":
            _menu_start(console)
        elif choice == "install":
            _menu_install(console)
        elif choice == "configure":
            _menu_configure(console)
        elif choice == "update":
            _menu_update(console)
        elif choice == "status":
            _menu_status(console)

        questionary.press_any_key_to_continue(
            "Pressione uma tecla para voltar ao menu..."
        ).ask()


def _print_menu_header(console: object) -> None:
    from rich.panel import Panel

    console.print(
        Panel.fit(
            "[bold cyan]Felixo AI Core[/bold cyan]\n"
            "[dim]Centraliza ideias, agentes de IA e fluxos de trabalho num canvas único.[/dim]",
            border_style="cyan",
        )
    )


def _menu_start(console: object) -> None:
    import questionary

    target = questionary.select(
        "O que você quer iniciar?",
        choices=[
            questionary.Choice(
                "App desktop (Electron) — a experiência completa", value="desktop"
            ),
            questionary.Choice(
                f"Preview web — abre em {DEFAULT_URL} num navegador", value="web"
            ),
            questionary.Choice("Voltar", value=None),
        ],
    ).ask()

    if not target:
        return

    prepared = prepare_node_env()
    if prepared is None:
        console.print("[red]Não foi possível preparar o Node.js. Veja a mensagem acima.[/red]")
        return
    node_bin, env = prepared
    console.print(f"[dim]Usando Node.js de {node_bin}[/dim]")

    requirements_code = ensure_python_requirements(env, skip_install=False)
    if requirements_code != 0:
        console.print("[red]Falha instalando dependências Python.[/red]")
        return

    install_code = ensure_dependencies(env, skip_install=False)
    if install_code != 0:
        console.print("[red]Falha instalando dependências Node.[/red]")
        return

    cleanup_app_processes()

    if target == "web":
        console.print(f"[green]Abrindo o preview web em {DEFAULT_URL}...[/green]")
        run_command(["npm", "run", "dev:web"], env)
    else:
        console.print("[green]Abrindo o Felixo AI Core (desktop)...[/green]")
        run_command(["npm", "run", "dev"], env)


def _menu_install(console: object) -> None:
    prepared = prepare_node_env()
    if prepared is None:
        console.print("[red]Não foi possível preparar o Node.js. Veja a mensagem acima.[/red]")
        return
    node_bin, env = prepared
    console.print(f"[dim]Usando Node.js de {node_bin}[/dim]")

    requirements_code = ensure_python_requirements(env, skip_install=False)
    install_code = ensure_dependencies(env, skip_install=False)

    if requirements_code == 0 and install_code == 0:
        console.print("[green]Dependências prontas.[/green]")
    else:
        console.print("[red]Alguma instalação falhou — veja as mensagens acima.[/red]")


def _menu_configure(console: object) -> None:
    import questionary

    config = load_config()

    field_by_label = {
        f"{field['label']} [{config.get(field['key']) or 'não definido'}]": field
        for field in CONFIG_FIELDS
    }

    label = questionary.select(
        "O que você quer configurar? (Enter em 'Voltar' não muda nada)",
        choices=[*field_by_label.keys(), "Limpar todas as configurações", "Voltar"],
    ).ask()

    if not label or label == "Voltar":
        return

    if label == "Limpar todas as configurações":
        if questionary.confirm("Remover todos os valores configurados?", default=False).ask():
            save_config({})
            console.print("[green]Configurações limpas.[/green]")
        return

    field = field_by_label[label]
    key = str(field["key"])

    if field["kind"] == "choice":
        choices = [*field["choices"], "(limpar)"]  # type: ignore[list-item]
        value = questionary.select(f"{field['label']}:", choices=choices).ask()
    else:
        current = config.get(key, str(field.get("default", "")))
        value = questionary.text(f"{field['label']}:", default=current).ask()

    if value is None:
        return

    if value in ("(limpar)", ""):
        config.pop(key, None)
    else:
        config[key] = value

    save_config(config)
    console.print("[green]Configuração salva.[/green]")


def _menu_update(console: object) -> None:
    config = load_config()
    branch = config.get("FELIXO_PRODUCTION_BRANCH") or os.environ.get(
        "FELIXO_PRODUCTION_BRANCH", "production"
    )

    prepared = prepare_node_env()
    if prepared is None:
        console.print("[red]Não foi possível preparar o Node.js. Veja a mensagem acima.[/red]")
        return
    _node_bin, env = prepared

    update_code, source_updated = update_source_from_branch(branch, env)
    if update_code != 0:
        console.print("[red]Falha ao atualizar — veja as mensagens acima.[/red]")
        return

    if not source_updated:
        console.print("[green]Já estava atualizado.[/green]")
        return

    console.print("[green]Código atualizado.[/green] Atualizando dependências...")
    install_code = ensure_dependencies(env, skip_install=False, force_install=True)
    if install_code != 0:
        console.print("[red]Falha instalando dependências após atualizar.[/red]")


def _menu_status(console: object) -> None:
    from rich.table import Table

    table = Table(show_header=False, border_style="dim")
    table.add_column("Item", style="bold")
    table.add_column("Valor")

    node_version = read_node_version()
    minimum_node_version = read_minimum_node_version()
    node_bin = find_node_bin(node_version, minimum_node_version)

    if node_bin is not None:
        env = build_env(node_bin)
        node_result = probe_command(
            [str(find_command_in_bin("node", node_bin)), "--version"], env
        )
        table.add_row("Node.js", f"[green]{node_result.stdout.strip() if node_result else '?'}[/green] ({node_bin})")
    else:
        table.add_row("Node.js", "[red]não encontrado[/red]")

    node_modules_exists = (APP_DIR / "node_modules").exists()
    table.add_row(
        "Dependências Node",
        "[green]instaladas[/green]" if node_modules_exists else "[yellow]faltando[/yellow]",
    )

    if (ROOT_DIR / ".git").exists() and shutil.which("git"):
        env = os.environ.copy()
        branch_result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        current_branch = branch_result.stdout.strip() or "(detached)"
        dirty_files = get_dirty_files(env)
        table.add_row("Branch Git", current_branch)
        table.add_row(
            "Alterações locais",
            f"[yellow]{len(dirty_files)} arquivo(s)[/yellow]" if dirty_files else "[green]nenhuma[/green]",
        )
    else:
        table.add_row("Git", "[dim]não é um checkout Git[/dim]")

    config = load_config()
    configured = ", ".join(config.keys()) if config else "(padrão — nada configurado)"
    table.add_row("Configurações salvas", configured)

    console.print(table)


def main() -> int:
    # Any explicit flag (scripts/CI already using `start_app.py --web` etc.,
    # documented in docs/projeto/RODAR-VIA-CODIGO-FONTE.md) skips the menu and
    # behaves exactly as before. No arguments at all → interactive menu, the
    # recommended path per GUIA-START-APP-SCRIPT.md.
    if len(sys.argv) > 1:
        return run_direct(parse_args())

    if not ensure_tui_dependencies():
        print(
            "[felixo] Não foi possível instalar as dependências do menu interativo "
            "(questionary/rich). Rodando o app diretamente.",
            file=sys.stderr,
        )
        return run_direct(parse_args())

    return run_interactive_menu()


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Start the Felixo AI Core desktop app."""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
APP_DIR = ROOT_DIR / "app"
DEFAULT_URL = "http://127.0.0.1:5173/"
REQUIREMENTS_FILE_NAMES = ("requirements.txt", "requeriments.txt")


def read_node_version() -> str | None:
    for candidate in (ROOT_DIR / ".nvmrc", APP_DIR / ".nvmrc"):
        if candidate.exists():
            version = candidate.read_text(encoding="utf-8").strip()
            return version.removeprefix("v") or None
    return None


def find_node_bin(version: str | None) -> Path | None:
    custom_bin = os.environ.get("FELIXO_NODE_BIN")
    if custom_bin:
        path = Path(custom_bin).expanduser()
        if (path / "npm").exists():
            return path

    if version:
        nvm_home = Path(os.environ.get("NVM_DIR", "~/.nvm")).expanduser()
        for dirname in (f"v{version}", version):
            path = nvm_home / "versions" / "node" / dirname / "bin"
            if (path / "npm").exists():
                return path

    npm_path = shutil.which("npm")
    if npm_path:
        return Path(npm_path).resolve().parent

    return None


def build_env(node_bin: Path | None) -> dict[str, str]:
    env = os.environ.copy()

    if node_bin:
        env["PATH"] = f"{node_bin}{os.pathsep}{env.get('PATH', '')}"

    env.pop("ELECTRON_RUN_AS_NODE", None)
    env.pop("ELECTRON_NO_ATTACH_CONSOLE", None)
    return env


def run_command(command: list[str], env: dict[str, str]) -> int:
    print(f"[felixo] Running: {' '.join(command)}")

    process = subprocess.Popen(
        command,
        cwd=APP_DIR,
        env=env,
        start_new_session=(os.name != "nt"),
    )

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

    return subprocess.call(["npm", "install"], cwd=APP_DIR, env=env)


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
    node_bin = find_node_bin(node_version)

    if node_bin is None:
        print("[felixo] npm was not found. Install Node.js first.", file=sys.stderr)
        return 1

    env = build_env(node_bin)

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

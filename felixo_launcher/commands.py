"""Resolves and launches child commands.

Commands are resolved against the environment the launcher built (not the
ambient PATH) so the Node it found is the Node that actually runs. On Windows
this is also what turns `npm` into the `npm.cmd` the shell can execute.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path

from .node import get_path_env
from .paths import APP_DIR
from .process import stop_process


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

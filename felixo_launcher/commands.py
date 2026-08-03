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
from datetime import datetime
from pathlib import Path

from .node import get_path_env
from .paths import APP_DIR, ROOT_DIR
from .process import stop_process


DEBUG_LOG_DIR = ROOT_DIR / "logs" / "startup"


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


def run_command(
    command: list[str], env: dict[str, str], *, debug_terminal: bool = False
) -> int:
    resolved_command = resolve_subprocess_command(command, env)
    print(f"[felixo] Running: {' '.join(resolved_command)}")

    if debug_terminal and os.name == "nt":
        return run_in_dedicated_debug_terminal(resolved_command, env)

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


def create_debug_log_path() -> Path:
    """Returns a unique persistent log path for one desktop startup attempt."""
    DEBUG_LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    return DEBUG_LOG_DIR / f"felixo-desktop-{timestamp}.log"


def run_in_dedicated_debug_terminal(command: list[str], env: dict[str, str]) -> int:
    """Starts the desktop process in its own visible Windows console.

    The worker mirrors every stdout/stderr line to that console and to a file,
    avoiding shell quoting and profile/AutoRun side effects while preserving
    precisely the environment the launcher prepared for Node and the CLIs.
    """
    log_path = create_debug_log_path()
    debug_env = env.copy()
    debug_env.update(
        {
            "FELIXO_DEBUG_SESSION": "1",
            "ELECTRON_ENABLE_LOGGING": "1",
            "ELECTRON_ENABLE_STACK_DUMPING": "1",
        }
    )
    debug_command = [
        sys.executable,
        "-m",
        "felixo_launcher.debug_console",
        "--cwd",
        str(APP_DIR),
        "--log",
        str(log_path),
        "--keep-open",
        "--",
        *command,
    ]
    print(f"[felixo] Terminal de depuração aberto. Log: {log_path}")

    try:
        process = subprocess.Popen(
            debug_command,
            cwd=ROOT_DIR,
            env=debug_env,
            creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010),
        )
    except OSError as error:
        print(f"[felixo] Não foi possível abrir o terminal de depuração: {error}", file=sys.stderr)
        return 1

    return process.wait()

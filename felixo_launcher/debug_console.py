"""Visible Windows console worker for a desktop startup debug session.

The parent launcher creates this process in a new console. It starts the real
Node command, combines stdout/stderr, and mirrors every event to both the
visible console and a UTF-8 log file that can be attached to a bug report.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable


SpawnProcess = Callable[..., subprocess.Popen[str]]


def run_debug_session(
    command: list[str],
    cwd: Path,
    log_path: Path,
    env: dict[str, str],
    *,
    spawn: SpawnProcess = subprocess.Popen,
) -> int:
    """Runs one command and sends its complete combined stream to the log."""
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("w", encoding="utf-8", newline="") as log_file:
        def report(message: str) -> None:
            print(message, flush=True)
            log_file.write(f"{message}\n")
            log_file.flush()

        report("=" * 78)
        report(f"[felixo] Debug session started: {datetime.now().isoformat(timespec='seconds')}")
        report(f"[felixo] Working directory: {cwd}")
        report(f"[felixo] Command: {subprocess.list2cmdline(command)}")
        report(f"[felixo] Log file: {log_path}")
        report("=" * 78)

        try:
            process = spawn(
                command,
                cwd=cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except OSError as error:
            report(f"[felixo] Could not start command: {error}")
            return 1

        if process.stdout is not None:
            for line in process.stdout:
                # The child normally owns its newline. Keep the same visual
                # output while ensuring every record in the file ends once.
                report(line.rstrip("\r\n"))

        exit_code = process.wait()
        report(f"[felixo] Process exited with code {exit_code}")
        return exit_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Felixo desktop startup debug console")
    parser.add_argument("--cwd", type=Path, required=True)
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--keep-open", action="store_true")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        print("[felixo] No command was provided to the debug console.", file=sys.stderr)
        return 2

    exit_code = run_debug_session(command, args.cwd, args.log, os.environ.copy())
    if args.keep_open:
        try:
            input("\n[felixo] Press Enter to close this debug terminal...")
        except (EOFError, KeyboardInterrupt):
            pass
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

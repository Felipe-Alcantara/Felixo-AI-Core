"""Stops the app and clears leftover processes from previous runs.

Two subtleties drive this module. Signals go to the whole process group, so
the dev server and Electron stop together with `npm run dev`. And leftover
cleanup only ever targets processes this launcher itself starts — matching on
the app path alone would also match an editor or a shell that merely has that
path on its command line.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time

from .paths import APP_DIR


APP_PROCESS_EXECUTABLES = (
    "/electron",
    "/vite",
    "/concurrently",
    "/wait-on",
    "electron.app",
    "Electron.app",
)

def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        signal_process_group(process, signal.SIGTERM)

        if not wait_for_exit(process, timeout=8):
            signal_process_group(process, signal.SIGKILL)
            if not wait_for_exit(process, timeout=8):
                print(
                    "[felixo] The app process did not exit; it may still be running.",
                    file=sys.stderr,
                )

    cleanup_app_processes()


def wait_for_exit(process: subprocess.Popen[bytes], timeout: float) -> bool:
    """Waits for the child to exit, tolerating being called from a signal handler.

    `stop_process` also runs from the SIGTERM handler, which interrupts a main
    thread already blocked in `Popen.wait()`. In that state the Popen object is
    unusable for reaping: `wait(timeout=...)` and even `poll()` block on the
    internal lock the outer wait holds, so they never report the exit and always
    time out — turning a clean Ctrl+C into a long pause, a needless SIGKILL and
    a false "did not exit" error. `os.waitpid(..., WNOHANG)` bypasses that lock
    and reads the real status straight from the OS."""
    deadline = time.monotonic() + timeout

    while True:
        if process_has_exited(process):
            return True

        if time.monotonic() >= deadline:
            return False

        time.sleep(0.05)


def process_has_exited(process: subprocess.Popen[bytes]) -> bool:
    if process.returncode is not None:
        return True

    if os.name == "nt":
        return process.poll() is not None

    try:
        pid, _status = os.waitpid(process.pid, os.WNOHANG)
    except ChildProcessError:
        # Already reaped by the outer `wait()` — the process is gone.
        return True
    except OSError:
        return process.poll() is not None

    return pid != 0


def signal_process_group(process: subprocess.Popen[bytes], sig: int) -> None:
    """Signals the whole `start_new_session` group so Vite and Electron die with
    `npm run dev`, falling back to the single process when the group is already
    gone. `os.killpg` raises if the group vanished between poll and kill — a raw
    traceback on Ctrl+C is exactly the unclear failure the launcher must avoid."""
    if os.name == "nt":
        process.kill() if sig == signal.SIGKILL else process.terminate()
        return

    try:
        os.killpg(os.getpgid(process.pid), sig)
        return
    except (ProcessLookupError, PermissionError, OSError):
        pass

    try:
        process.kill() if sig == signal.SIGKILL else process.terminate()
    except (ProcessLookupError, OSError):
        pass


def cleanup_app_processes() -> None:
    """Kills leftover dev-server/Electron processes from a previous run of *this*
    checkout.

    `pgrep -f` matches the whole command line, so a bare `app/node_modules`
    marker also matches an editor, a shell, or a `grep` that merely has the path
    on its command line — killing a coworker's editor instead of a stale Vite.
    Only processes whose command line names a binary we actually launch are
    eligible, and never our own process tree."""
    if os.name == "nt":
        return

    pids = find_stale_app_pids()
    if not pids:
        return

    terminate_pids(pids, signal.SIGTERM)
    time.sleep(1)

    survivors = [pid for pid in pids if process_is_alive(pid)]
    if survivors:
        terminate_pids(survivors, signal.SIGKILL)


def find_stale_app_pids() -> list[int]:
    marker = str(APP_DIR / "node_modules")

    try:
        output = subprocess.check_output(
            ["pgrep", "-af", marker],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError, OSError):
        return []

    protected = own_process_tree_pids()
    pids: list[int] = []

    for line in output.splitlines():
        entry = parse_pgrep_line(line)
        if entry is None:
            continue

        pid, command_line = entry
        if pid in protected or pid in pids:
            continue

        if is_app_process_command(command_line, marker):
            pids.append(pid)

    return pids


def parse_pgrep_line(line: str) -> tuple[int, str] | None:
    """`pgrep -af` prints `<pid> <full command line>`."""
    stripped = line.strip()
    if not stripped:
        return None

    pid_text, _, command_line = stripped.partition(" ")
    try:
        return int(pid_text), command_line
    except ValueError:
        return None


def is_app_process_command(command_line: str, marker: str) -> bool:
    if marker not in command_line:
        return False

    return any(
        executable in command_line for executable in APP_PROCESS_EXECUTABLES
    )


def own_process_tree_pids() -> set[int]:
    """Our own PID and process group, so cleanup never kills the launcher or
    the shell/terminal that started it."""
    pids = {os.getpid(), os.getppid()}

    try:
        pids.add(os.getpgrp())
    except OSError:
        pass

    return pids


def terminate_pids(pids: list[int], sig: int) -> None:
    for pid in pids:
        try:
            os.kill(pid, sig)
        except (ProcessLookupError, PermissionError):
            continue


def process_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True

    return True

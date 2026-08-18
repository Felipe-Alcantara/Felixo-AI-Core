"""Stops the launcher child process tree.

Signals go to the whole process group, so the dev runner, Vite and Electron
stop together with `npm run dev`. Marker-based Vite reuse and cleanup belong to
`app/scripts/dev-runner.cjs`, where the HTTP contract can be checked before a
port owner is touched.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
# How long a well-behaved dev server gets to shut down on its own. Vite and
# Electron normally exit in well under a second; the rest of the budget is for
# a loaded machine. Anything still alive after this is not going to stop on
# request, so waiting longer only makes Ctrl+C feel broken.
GRACEFUL_STOP_TIMEOUT = 5.0

# SIGKILL is not catchable — this only covers the kernel reaping the process.
FORCED_STOP_TIMEOUT = 2.0


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        signal_process_group(process, signal.SIGTERM)

        if not wait_for_exit(process, timeout=GRACEFUL_STOP_TIMEOUT):
            signal_process_group(process, signal.SIGTERM, force=True)
            # SIGKILL cannot be caught, so the process is gone almost at once —
            # only the kernel reaping it takes any time. Waiting the full
            # graceful timeout again just added seconds to every Ctrl+C.
            if not wait_for_exit(process, timeout=FORCED_STOP_TIMEOUT):
                print(
                    "[felixo] The app process did not exit; it may still be running.",
                    file=sys.stderr,
                )


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
        # getattr, não os.WNOHANG direto: este ramo só roda de verdade em
        # POSIX (a checagem de os.name acima garante isso), mas o atributo é
        # lido antes de qualquer chamada, e o Windows não o tem — um teste
        # que força os.name = "posix" para exercitar esta lógica ali
        # estouraria AttributeError mesmo com os.waitpid mockado.
        pid, _status = os.waitpid(process.pid, getattr(os, "WNOHANG", 0))
    except ChildProcessError:
        # Already reaped by the outer `wait()` — the process is gone.
        return True
    except OSError:
        return process.poll() is not None

    return pid != 0


def signal_process_group(
    process: subprocess.Popen[bytes], sig: int, force: bool = False
) -> None:
    """Signals the whole `start_new_session` group so Vite and Electron die with
    `npm run dev`, falling back to the single process when the group is already
    gone. `os.killpg` raises if the group vanished between poll and kill — a raw
    traceback on Ctrl+C is exactly the unclear failure the launcher must avoid.

    `force` diz se este é o passo de parada forçada, em vez de o chamador ter
    que expressar isso escolhendo SIGKILL: no Windows esse sinal não existe no
    módulo `signal`, e traduzir "forçado" para o `kill()` do Popen é
    justamente o que aquela plataforma entende. Passar o sinal como única
    pista deixava o escalonamento indistinguível do pedido educado lá."""
    if os.name == "nt":
        force_process(process, force)
        return

    try:
        os.killpg(os.getpgid(process.pid), force_signal() if force else sig)
        return
    except (ProcessLookupError, PermissionError, OSError):
        pass

    try:
        force_process(process, force)
    except (ProcessLookupError, OSError):
        pass


def force_signal() -> int:
    """O sinal POSIX de parada forçada.

    Só é consultado no ramo POSIX — no Windows a força é expressa pelo
    `kill()` do Popen, não por um número de sinal."""
    return signal.SIGKILL


def force_process(process: subprocess.Popen[bytes], force: bool) -> None:
    """`kill()` quando é para forçar, `terminate()` para o pedido educado.

    No Windows os dois viram TerminateProcess, mas `kill()` é o caminho que a
    API do Popen expõe para "agora vai" — e `terminate()` continua sendo o
    primeiro passo, dando ao processo a chance de sair sozinho."""
    if force:
        process.kill()
    else:
        process.terminate()

"""Installs the launcher's own Python dependencies.

Homebrew's Python on macOS and the distro Python on Debian/Ubuntu are both
PEP 668 "externally managed" and refuse a plain `pip install`. That refusal is
the most common setup failure for this launcher, so it is detected and
recovered from here rather than surfaced as a bare exit code.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from .paths import REQUIREMENTS_FILE_NAMES, ROOT_DIR


PIP_EXTERNALLY_MANAGED_HINT = (
    "This Python does not allow installing packages system-wide. "
    "Create a virtual environment and run the launcher from it:\n"
    "[felixo]   python3 -m venv .venv && source .venv/bin/activate  "
    "(Windows: .venv\\Scripts\\activate)\n"
    "[felixo]   python3 start_app.py"
)

PIP_MISSING_HINT = (
    "Install pip for this Python (macOS: python3 -m ensurepip --upgrade, "
    "Debian/Ubuntu: sudo apt install python3-pip) or run the launcher from a "
    "virtual environment."
)

PIP_GENERIC_HINT = (
    "Check the pip output above. Running the launcher from a virtual "
    "environment avoids most permission and conflict errors."
)

# Fallback for a checkout whose requirements.txt is missing or empty — the menu
# still needs these two to draw itself.
TUI_PACKAGES = ("questionary>=2.0", "rich>=13.0")

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
        print(f"[felixo] {PIP_MISSING_HINT}", file=sys.stderr)
        return 1

    print(f"[felixo] Installing Python requirements from {requirements_file.name}...")
    result = run_pip_install(["-r", str(requirements_file)], env)

    if result.returncode != 0:
        report_pip_failure(result)

    return result.returncode


def run_pip_install(
    pip_args: list[str],
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Installs with pip, retrying under --user when the interpreter is an
    externally-managed environment (PEP 668).

    Homebrew's Python on macOS — and the distro Python on Debian/Ubuntu — refuse
    a plain `pip install` into the system interpreter, so the first attempt dies
    with `externally-managed-environment`. Inside a virtualenv that never
    happens and `--user` is actually invalid, so the retry is conditional on
    both the error and being outside a venv."""
    command = [sys.executable, "-m", "pip", "install", *pip_args]
    result = capture_pip(command, env)

    if result.returncode == 0 or is_running_in_virtualenv():
        return result

    if not is_externally_managed_error(result):
        return result

    print(
        "[felixo] This Python is externally managed (PEP 668). Retrying with --user...",
    )
    return capture_pip([*command, "--user"], env)


def capture_pip(
    command: list[str],
    env: dict[str, str] | None,
) -> subprocess.CompletedProcess[str]:
    """Runs pip, streaming its output live while also keeping a copy.

    Buffering until the end would make a slow first install look frozen, but
    the retry logic still needs the text to detect a PEP 668 refusal — so echo
    each line as it arrives and accumulate it at the same time."""
    lines: list[str] = []

    try:
        process = subprocess.Popen(
            command,
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except OSError as error:
        return subprocess.CompletedProcess(command, 1, str(error))

    with process:
        if process.stdout is not None:
            for line in process.stdout:
                lines.append(line)
                print(line, end="")

    return subprocess.CompletedProcess(command, process.returncode, "".join(lines))


def is_running_in_virtualenv() -> bool:
    return sys.prefix != getattr(sys, "base_prefix", sys.prefix)


def is_externally_managed_error(result: subprocess.CompletedProcess[str]) -> bool:
    return "externally-managed-environment" in (result.stdout or "").lower()


def report_pip_failure(result: subprocess.CompletedProcess[str]) -> None:
    print("[felixo] pip could not install the Python requirements.", file=sys.stderr)

    if is_externally_managed_error(result):
        print(f"[felixo] {PIP_EXTERNALLY_MANAGED_HINT}", file=sys.stderr)
    else:
        print(f"[felixo] {PIP_GENERIC_HINT}", file=sys.stderr)


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


def ensure_tui_dependencies() -> bool:
    """The interactive menu needs `questionary` + `rich` to draw itself. Both
    are declared in requirements.txt, but a fresh clone may not have run
    Setup yet — bootstrap them here so `python start_app.py` works standalone,
    per GUIA-START-APP-SCRIPT.md ("o script faz um bootstrap minimo antes de
    desenhar o menu")."""
    if tui_dependencies_importable():
        return True

    print("[felixo] Preparando dependências do menu (questionary, rich)...")

    requirements_file = find_python_requirements_file()
    pip_args = (
        ["-r", str(requirements_file)]
        if requirements_file is not None
        and has_installable_python_requirements(requirements_file)
        else list(TUI_PACKAGES)
    )

    result = run_pip_install(pip_args)
    if result.returncode != 0:
        report_pip_failure(result)
        return False

    return tui_dependencies_importable()


def tui_dependencies_importable() -> bool:
    try:
        import questionary  # noqa: F401
        import rich  # noqa: F401
    except ImportError:
        return False

    return True

"""Fast-forwards the checkout from the production branch.

Refuses to touch a dirty tree: the launcher updates code people are about to
run, so silently discarding local work would be the worst possible outcome.

Two entry points, with deliberately different manners. `update_source_from_branch`
is the explicit one behind the menu's "Atualizar" and the `--update` flag: it
reports every step and treats "could not update" as a failure. `auto_update`
runs on every start, so it is silent and advisory — it only fast-forwards the
branch you are already on, and any reason not to (offline, dirty tree, diverged
history) simply leaves the checkout alone and lets the app open.
"""

from __future__ import annotations

import shutil
import subprocess
import sys

from .paths import ROOT_DIR


# A start-up fetch must never turn into a long wait before the app opens. On a
# slow or captive network `git fetch` can hang far longer than anyone is willing
# to stare at a blank terminal, so it is cut off and the launch continues.
# Measured offline, this is the whole cost of the feature when there is no
# network: everything else short-circuits in milliseconds.
AUTO_UPDATE_TIMEOUT = 4.0


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


def auto_update(env: dict[str, str]) -> bool:
    """Quietly fast-forwards the current branch before the app starts.

    Returns True only when new commits were actually pulled in, so the caller
    knows to refresh dependencies. Every other outcome — no git, no network,
    local edits, a branch that has diverged — returns False without stopping
    anything: this runs on every launch, and a background convenience must
    never be the reason the app fails to open.
    """
    if not can_auto_update(env):
        return False

    branch = get_current_branch(env)
    if branch is None:
        # Detached HEAD: there is no branch to fast-forward, and guessing one
        # would move the checkout somewhere the person did not ask for.
        return False

    if not fetch_quietly(branch, env):
        return False

    if not is_behind_upstream(branch, env):
        return False

    print(f"[felixo] Nova versão disponível em origin/{branch}. Atualizando...")

    if run_git_quietly(["merge", "--ff-only", f"origin/{branch}"], env) != 0:
        # Diverged history: a fast-forward is impossible and anything stronger
        # would rewrite local commits. Leave it for the person to sort out.
        print(
            "[felixo] Não foi possível atualizar automaticamente "
            "(histórico divergiu). Seguindo com a versão local.",
            file=sys.stderr,
        )
        return False

    print("[felixo] Código atualizado.")
    return True


def auto_update_is_enabled(env: dict[str, str]) -> bool:
    """Honours FELIXO_AUTO_UPDATE=off, for CI and for anyone who wants their
    checkout left exactly where they put it."""
    setting = (env.get("FELIXO_AUTO_UPDATE") or "").strip().lower()
    return setting not in {"0", "off", "false", "no"}


def can_auto_update(env: dict[str, str]) -> bool:
    """Whether an unattended update is safe here.

    A dirty tree is the important case: `git merge --ff-only` would refuse and
    could leave the person mid-conflict on a launch they expected to just open
    the app. Their uncommitted work always wins over being up to date.
    """
    if not auto_update_is_enabled(env):
        return False

    if shutil.which("git") is None:
        return False

    if not (ROOT_DIR / ".git").exists():
        return False

    return not get_dirty_files(env)


def get_current_branch(env: dict[str, str]) -> str | None:
    try:
        branch = subprocess.check_output(
            ["git", "branch", "--show-current"],
            cwd=ROOT_DIR,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None

    return branch or None


def fetch_quietly(branch: str, env: dict[str, str]) -> bool:
    return run_git_quietly(["fetch", "origin", branch], env, AUTO_UPDATE_TIMEOUT) == 0


def is_behind_upstream(branch: str, env: dict[str, str]) -> bool:
    """True when origin has commits this checkout does not.

    Counting first means an already-current checkout — the common case — costs
    nothing and prints nothing.
    """
    try:
        output = subprocess.check_output(
            ["git", "rev-list", "--count", f"HEAD..origin/{branch}"],
            cwd=ROOT_DIR,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, ValueError, subprocess.CalledProcessError):
        return False

    try:
        return int(output) > 0
    except ValueError:
        return False


def run_git_quietly(
    arguments: list[str],
    env: dict[str, str],
    timeout: float | None = None,
) -> int:
    """Runs git without letting its output or its failures reach the person."""
    try:
        return subprocess.call(
            ["git", *arguments],
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
        )
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return 1


def get_dirty_files(env: dict[str, str]) -> list[str]:
    try:
        output = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=ROOT_DIR,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
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
            encoding="utf-8",
            errors="replace",
        ).strip()
    except subprocess.CalledProcessError:
        print("[felixo] Unable to read current Git revision.", file=sys.stderr)
        return None

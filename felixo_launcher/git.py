"""Fast-forwards the checkout from the production branch.

Refuses to touch a dirty tree: the launcher updates code people are about to
run, so silently discarding local work would be the worst possible outcome.
"""

from __future__ import annotations

import shutil
import subprocess
import sys

from .paths import ROOT_DIR


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

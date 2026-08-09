"""Shared helpers for the launcher tests.

Building fake Node installations and a stripped environment is needed by
several test modules, so it lives here instead of being copied around.
"""

from __future__ import annotations

import os
import stat
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch




NODE_ENV_KEYS = (
    "FELIXO_NODE_BIN",
    "FELIXO_NODE_SEARCH_PATHS",
    "NVM_DIR",
    "FNM_DIR",
    "VOLTA_HOME",
    "ASDF_DATA_DIR",
    "MISE_DATA_DIR",
    "NODENV_ROOT",
)

EXTERNALLY_MANAGED_OUTPUT = (
    "error: externally-managed-environment\n"
    "\n"
    "x This environment is externally managed\n"
)


def write_executable(path: Path, body: str) -> Path:
    """Cria um binário fake que o SO de teste realmente executa.

    `body` é uma linha de shell (`echo ...`, `exit 1`) — no Windows não existe
    shebang nem bit executável, então o arquivo vira um `.cmd`, que o CMD
    interpreta linha a linha da mesma forma. `shutil.which()` (usado pela
    descoberta em produção) resolve `PATHEXT` sozinho, então o nome base
    continua bastando para quem chama esta função.

    Devolve o Path REAL escrito (com a extensão no Windows), para os
    chamadores que precisam do caminho exato do arquivo.
    """
    if os.name == "nt":
        target = path.with_suffix(".cmd")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"@echo off\r\n{body}\r\n", encoding="utf-8")
        return target

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return path


def make_node_bin(bin_dir: Path, node_version: str = "v25.9.0") -> Path:
    write_executable(bin_dir / "node", f"echo {node_version}")
    write_executable(bin_dir / "npm", "echo 10.9.0")
    return bin_dir


def clean_node_env(home: Path, **overrides: str) -> dict[str, str]:
    env = {"HOME": str(home), "PATH": ""}
    env.update({key: "" for key in NODE_ENV_KEYS})
    env.update(overrides)
    return env


def pip_result(returncode: int, stdout: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(["pip"], returncode, stdout)


class QuietLauncherTestCase(unittest.TestCase):
    """Silences the launcher's progress messages.

    These tests exercise code paths that print installation progress for the
    person at the terminal. Letting that reach the test output buries real
    failures in CI, so it is captured for the duration of each test.

    Subclasses set `quiet_module` to the module whose output they trigger."""

    quiet_module = "felixo_launcher.python_deps"

    def setUp(self) -> None:
        super().setUp()
        patcher = patch(f"{self.quiet_module}.print")
        self.launcher_output = patcher.start()
        self.addCleanup(patcher.stop)

    def printed_text(self) -> str:
        return " ".join(
            str(call.args[0]) for call in self.launcher_output.call_args_list if call.args
        )


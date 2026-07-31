"""Tests for Windows-specific behaviour.

Windows spells the PATH variable `Path`, and `npm` is really `npm.cmd` — both
have to survive the environment the launcher builds for child processes.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from felixo_launcher import commands, node, process

from .support import clean_node_env


class StartAppWindowsTests(unittest.TestCase):
    def test_resolves_windows_npm_cmd_for_subprocesses(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            node_bin = root / "nodejs"
            npm_cmd = node_bin / "npm.cmd"
            npm_cmd.parent.mkdir(parents=True)
            npm_cmd.write_text("@echo off\r\n", encoding="utf-8")
            env = {"Path": str(node_bin)}

            with patch("felixo_launcher.node.is_windows_platform", return_value=True), patch(
                "felixo_launcher.node.shutil.which",
                return_value=str(npm_cmd),
            ):
                self.assertEqual(
                    commands.resolve_subprocess_command(["npm", "install"], env),
                    [str(npm_cmd), "install"],
                )

    def test_build_env_preserves_windows_path_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            node_bin = root / "nodejs"

            with patch("felixo_launcher.node.is_windows_platform", return_value=True), patch.dict(
                os.environ,
                clean_node_env(root, Path=str(root / "Windows" / "System32")),
                clear=True,
            ):
                env = node.build_env(node_bin)

            self.assertIn("Path", env)
            self.assertNotIn("PATH", env)
            self.assertTrue(env["Path"].startswith(str(node_bin)))

    def test_cleanup_is_a_noop_on_windows_where_pgrep_does_not_exist(self) -> None:
        with patch.object(process.os, "name", "nt"), patch(
            "felixo_launcher.process.subprocess.check_output"
        ) as check_output:
            process.cleanup_app_processes()

        check_output.assert_not_called()



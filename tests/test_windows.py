"""Tests for Windows-specific behaviour.

Windows spells the PATH variable `Path`, and `npm` is really `npm.cmd` — both
have to survive the environment the launcher builds for child processes.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from felixo_launcher import commands, node, process

from .support import clean_node_env


class StartAppWindowsTests(unittest.TestCase):
    def test_opens_desktop_debug_session_in_a_dedicated_console(self) -> None:
        env = {"Path": "C:\\Program Files\\nodejs"}
        resolved_command = ["C:\\Program Files\\nodejs\\npm.cmd", "run", "dev"]
        log_file = Path("C:/logs/felixo-startup.log")
        debug_process = MagicMock()
        debug_process.wait.return_value = 0

        with patch.object(commands.os, "name", "nt"), patch(
            "felixo_launcher.commands.resolve_subprocess_command",
            return_value=resolved_command,
        ), patch(
            "felixo_launcher.commands.create_debug_log_path", return_value=log_file
        ), patch("felixo_launcher.commands.subprocess.Popen", return_value=debug_process) as popen, patch(
            "felixo_launcher.commands.print"
        ):
            result = commands.run_command(["npm", "run", "dev"], env, debug_terminal=True)

        self.assertEqual(result, 0)
        launched_command = popen.call_args.args[0]
        self.assertEqual(launched_command[:2], [commands.sys.executable, "-m"])
        self.assertIn("felixo_launcher.debug_console", launched_command)
        self.assertIn(str(log_file), launched_command)
        self.assertEqual(launched_command[-3:], resolved_command)
        self.assertEqual(popen.call_args.kwargs["cwd"], commands.ROOT_DIR)
        self.assertEqual(popen.call_args.kwargs["env"]["FELIXO_DEBUG_SESSION"], "1")
        self.assertEqual(
            popen.call_args.kwargs["creationflags"],
            getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010),
        )

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

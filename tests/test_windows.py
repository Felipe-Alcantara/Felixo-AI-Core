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

    def test_build_env_nao_duplica_a_variavel_de_path_no_windows(self) -> None:
        """Um dict com "PATH" e "Path" ao mesmo tempo é ambíguo para o
        subprocess no Windows — qual das duas vale fica a critério da API, e
        a busca do Node pode acabar herdando a errada. Só pode sobrar uma."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            node_bin = root / "nodejs"

            with patch("felixo_launcher.node.is_windows_platform", return_value=True), patch.dict(
                os.environ,
                clean_node_env(root, PATH=str(root / "Windows" / "System32")),
                clear=True,
            ):
                env = node.build_env(node_bin)

            path_keys = [key for key in env if key.lower() == "path"]
            self.assertEqual(len(path_keys), 1, f"esperava uma única chave de PATH, veio {path_keys}")
            self.assertTrue(env[path_keys[0]].startswith(str(node_bin)))

    def test_set_path_env_preserva_a_caixa_da_chave_que_ja_existia(self) -> None:
        """`os.environ` do CPython no Windows normaliza toda chave para
        maiúscula (encodekey faz .upper()), então "PATH" é o que chega aqui na
        prática. Mas `build_env` também é usado com dicts montados à mão, e aí
        a caixa original tem que sobreviver em vez de virar uma segunda
        entrada — daí o teste ser sobre a função pura, e não via os.environ:
        no Windows real seria impossível injetar "Path" minúsculo ali."""
        env = {"Path": "C:/existente"}

        with patch("felixo_launcher.node.is_windows_platform", return_value=True):
            node.set_path_env(env, "C:/novo")

        self.assertEqual(env, {"Path": "C:/novo"})

    def test_set_path_env_colapsa_chaves_duplicadas_de_path(self) -> None:
        env = {"PATH": "C:/um", "Path": "C:/dois"}

        with patch("felixo_launcher.node.is_windows_platform", return_value=True):
            node.set_path_env(env, "C:/novo")

        self.assertEqual(env, {"Path": "C:/novo"})

    def test_cleanup_is_a_noop_on_windows_where_pgrep_does_not_exist(self) -> None:
        with patch.object(process.os, "name", "nt"), patch(
            "felixo_launcher.process.subprocess.check_output"
        ) as check_output:
            process.cleanup_app_processes()

        check_output.assert_not_called()

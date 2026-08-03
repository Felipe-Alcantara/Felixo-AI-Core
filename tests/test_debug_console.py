"""Tests for the Windows startup debug console worker."""

from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from felixo_launcher.debug_console import run_debug_session


class DebugConsoleTests(unittest.TestCase):
    def test_mirrors_child_output_to_the_console_and_log_file(self) -> None:
        class FakeProcess:
            stdout = io.StringIO("[VITE] ready\\n[ELECTRON] started\\n")

            def wait(self) -> int:
                return 7

        launched: dict[str, object] = {}

        def spawn(*args: object, **kwargs: object) -> FakeProcess:
            launched["args"] = args
            launched["kwargs"] = kwargs
            return FakeProcess()

        with tempfile.TemporaryDirectory() as tmpdir:
            log_file = Path(tmpdir) / "startup.log"
            with patch("felixo_launcher.debug_console.print"):
                exit_code = run_debug_session(
                    ["npm", "run", "dev"],
                    Path(tmpdir),
                    log_file,
                    {"FELIXO_DEBUG_SESSION": "1"},
                    spawn=spawn,
                )

            log = log_file.read_text(encoding="utf-8")

        self.assertEqual(exit_code, 7)
        self.assertEqual(launched["args"], (["npm", "run", "dev"],))
        self.assertEqual(launched["kwargs"]["cwd"], Path(tmpdir))  # type: ignore[index]
        self.assertIn("[VITE] ready", log)
        self.assertIn("[ELECTRON] started", log)
        self.assertIn("Process exited with code 7", log)
        self.assertEqual(launched["kwargs"]["encoding"], "utf-8")  # type: ignore[index]

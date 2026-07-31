"""Tests for what the Status screen reports.

Status must show real state rather than probe a path that no longer exists.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from felixo_launcher import menu

from .support import make_node_bin, pip_result


class StatusTests(unittest.TestCase):
    def test_reports_none_when_node_binary_vanished_after_discovery(self) -> None:
        with patch("felixo_launcher.menu.find_command_in_bin", return_value=None):
            self.assertIsNone(menu.describe_installed_node(Path("/tmp/bin")))

    def test_reports_none_when_node_is_not_installed(self) -> None:
        self.assertIsNone(menu.describe_installed_node(None))

    def test_reports_the_version_node_actually_prints(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            node_bin = make_node_bin(Path(tmpdir) / "bin")

            self.assertEqual(menu.describe_installed_node(node_bin), "v25.9.0")

    def test_reports_none_when_node_exits_with_an_error(self) -> None:
        with patch("felixo_launcher.menu.find_command_in_bin", return_value=Path("/bin/node")), patch(
            "felixo_launcher.menu.probe_command", return_value=pip_result(1, "")
        ):
            self.assertIsNone(menu.describe_installed_node(Path("/bin")))



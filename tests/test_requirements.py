"""Tests for the requirements file the launcher ships with."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from felixo_launcher import python_deps


class RequirementsFileTests(unittest.TestCase):
    def test_shipped_requirements_file_declares_the_menu_dependencies(self) -> None:
        requirements = python_deps.find_python_requirements_file()

        self.assertIsNotNone(requirements)
        content = requirements.read_text(encoding="utf-8")
        self.assertIn("questionary", content)
        self.assertIn("rich", content)

    def test_comment_only_requirements_file_is_not_installable(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            requirements = Path(tmpdir) / "requirements.txt"
            requirements.write_text("# nothing here\n\n", encoding="utf-8")

            self.assertFalse(
                python_deps.has_installable_python_requirements(requirements)
            )

    def test_requirements_file_with_a_package_is_installable(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            requirements = Path(tmpdir) / "requirements.txt"
            requirements.write_text("# comment\nrich>=13.0\n", encoding="utf-8")

            self.assertTrue(
                python_deps.has_installable_python_requirements(requirements)
            )



"""Tests for the requirements file the launcher ships with."""

from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

from felixo_launcher import paths, python_deps


class RequirementsFileTests(unittest.TestCase):
    LOCK_PACKAGES = {
        "markdown-it-py",
        "mdurl",
        "prompt-toolkit",
        "pygments",
        "questionary",
        "rich",
        "wcwidth",
    }

    def test_shipped_requirements_file_declares_the_menu_dependencies(self) -> None:
        requirements = python_deps.find_python_requirements_file()

        self.assertIsNotNone(requirements)
        content = requirements.read_text(encoding="utf-8")
        self.assertIn("questionary", content)
        self.assertIn("rich", content)

    def test_direct_requirements_are_kept_separate_from_the_generated_lock(self) -> None:
        source = paths.ROOT_DIR / "requirements.in"
        content = source.read_text(encoding="utf-8")

        self.assertIn("questionary>=2.0", content)
        self.assertIn("rich>=13.0", content)
        self.assertIn("human-edited", content)

    def test_lockfile_pins_every_transitive_package_with_hashes(self) -> None:
        lockfile = paths.ROOT_DIR / "requirements.txt"
        content = lockfile.read_text(encoding="utf-8")
        entries = self._lock_entries(content)

        self.assertIn(
            "uv pip compile --universal --python-version 3.9 --generate-hashes",
            content,
        )
        self.assertEqual({name for name, _ in entries}, self.LOCK_PACKAGES)

        for name, block in entries:
            with self.subTest(package=name, block=block):
                self.assertRegex(block, r"(?m)^" + re.escape(name) + r"==")
                self.assertGreaterEqual(
                    len(re.findall(r"--hash=sha256:[0-9a-f]{64}", block)),
                    2,
                )

    def test_lockfile_selects_dependencies_compatible_with_python_39(self) -> None:
        content = (paths.ROOT_DIR / "requirements.txt").read_text(
            encoding="utf-8"
        )

        self.assertIn(
            "markdown-it-py==3.0.0 ; python_full_version < '3.10'", content
        )
        self.assertIn(
            "prompt-toolkit==3.0.52 ; python_full_version < '3.10'", content
        )

    @staticmethod
    def _lock_entries(content: str) -> list[tuple[str, str]]:
        lines = content.splitlines()
        entries: list[tuple[str, str]] = []
        current_name: str | None = None
        current_start = 0

        for index, line in enumerate(lines):
            match = re.match(r"^([A-Za-z0-9_.-]+)==", line)
            if match is None:
                continue

            if current_name is not None:
                entries.append((current_name, "\n".join(lines[current_start:index])))

            current_name = match.group(1)
            current_start = index

        if current_name is not None:
            entries.append((current_name, "\n".join(lines[current_start:])))

        return entries

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

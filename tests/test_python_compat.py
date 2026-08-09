"""Tests that the launcher still imports on the oldest Python it must support.

macOS 12/13 ship Python 3.9 as the system `python3`, and that is the
interpreter someone runs `python3 start_app.py` with. PEP 604 unions
(`X | None`) are only legal there inside deferred annotations, so a union
evaluated at runtime breaks the import before the menu can even explain
itself — the failure mode is a bare traceback on the machines least able to
diagnose it.
"""

from __future__ import annotations

import ast
import unittest

from felixo_launcher import paths


class PythonCompatibilityTests(unittest.TestCase):
    def launcher_files(self) -> list[str]:
        """Every Python file that must import on the oldest supported version.

        Discovered rather than listed so a new module is covered the moment it
        is added, instead of silently escaping these checks."""
        # .as_posix(), não str(): no Windows, str(WindowsPath) usa "\" — este
        # módulo compara os caminhos com barra normal, então str() faria o
        # teste falhar ali por divergência de separador, não por um bug real.
        files = ["start_app.py"]
        files.extend(
            path.relative_to(paths.ROOT_DIR).as_posix()
            for path in sorted((paths.ROOT_DIR / "felixo_launcher").glob("*.py"))
        )
        files.extend(
            path.relative_to(paths.ROOT_DIR).as_posix()
            for path in sorted((paths.ROOT_DIR / "tests").glob("*.py"))
        )
        return files

    def module_ast(self, relative_path: str) -> tuple[ast.Module, str]:
        source = (paths.ROOT_DIR / relative_path).read_text(encoding="utf-8")
        return ast.parse(source), source

    def test_discovers_the_launcher_package(self) -> None:
        """Guards the discovery itself: a glob that silently matched nothing
        would make every other check in this module vacuously pass."""
        files = self.launcher_files()

        self.assertIn("start_app.py", files)
        self.assertIn("felixo_launcher/node.py", files)
        self.assertGreater(len(files), 10)

    def test_launcher_files_defer_annotations(self) -> None:
        for relative_path in self.launcher_files():
            with self.subTest(file=relative_path):
                tree, _ = self.module_ast(relative_path)
                defers = any(
                    isinstance(node, ast.ImportFrom)
                    and node.module == "__future__"
                    and any(alias.name == "annotations" for alias in node.names)
                    for node in tree.body
                )
                self.assertTrue(defers, "missing `from __future__ import annotations`")

    def test_no_union_types_are_evaluated_at_import_time(self) -> None:
        """Deferred annotations do not cover module-level assignments such as
        `NodeBinAdder`, which Python evaluates eagerly on import."""
        for relative_path in self.launcher_files():
            tree, source = self.module_ast(relative_path)

            for node in tree.body:
                if not isinstance(node, (ast.Assign, ast.AnnAssign)):
                    continue

                value = node.value
                if value is None:
                    continue

                for child in ast.walk(value):
                    if not isinstance(child, ast.BinOp):
                        continue

                    if not isinstance(child.op, ast.BitOr):
                        continue

                    if not self.is_type_union(child):
                        continue

                    self.fail(
                        f"{relative_path}:{child.lineno} evaluates a `|` union at "
                        f"import time, which fails on Python 3.9: "
                        f"{ast.get_source_segment(source, child)}"
                    )

    TYPE_NAMES = frozenset(
        {"str", "int", "float", "bool", "bytes", "None", "Path", "dict", "list",
         "tuple", "set", "frozenset", "object", "type"}
    )

    def is_type_union(self, node: ast.BinOp) -> bool:
        """Tells `str | None` (a PEP 604 union, 3.10+) from `re.M | re.VERBOSE`
        (an ordinary bitwise OR, legal everywhere).

        Only the former breaks on Python 3.9, so flagging every `|` would fire
        on valid code — flag operands that name types instead."""
        for side in (node.left, node.right):
            if isinstance(side, ast.Constant) and side.value is None:
                return True

            if isinstance(side, ast.Name) and side.id in self.TYPE_NAMES:
                return True

            if isinstance(side, ast.BinOp) and self.is_type_union(side):
                return True

        return False

    def test_launcher_compiles_under_the_oldest_supported_syntax(self) -> None:
        for relative_path in self.launcher_files():
            with self.subTest(file=relative_path):
                _, source = self.module_ast(relative_path)
                compile(source, relative_path, "exec")


if __name__ == "__main__":
    unittest.main()

"""Tests for Node.js/npm discovery.

Discovery is what decides whether the app starts at all, and it has to work
from a GUI-launched process whose PATH omits Homebrew, nvm, Volta and friends.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from felixo_launcher import node

from .support import clean_node_env, make_node_bin, write_executable


class StartAppNodeDiscoveryTests(unittest.TestCase):
    @unittest.skipIf(
        os.name == "nt",
        "Cenário exclusivo do Homebrew (macOS): depende de symlinks, que no "
        "Windows exigem privilégio elevado, e de um layout prefix/Cellar que "
        "não existe lá. Simular a plataforma não ajudaria — o que se testa "
        "aqui é a resolução de symlink real do sistema de arquivos.",
    )
    def test_preserves_homebrew_symlink_bin_instead_of_resolving_to_cellar(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            prefix_bin = root / "opt" / "homebrew" / "bin"
            cellar_bin = root / "opt" / "homebrew" / "Cellar" / "node" / "25.8.2" / "bin"
            prefix_bin.mkdir(parents=True)
            cellar_bin.mkdir(parents=True)

            write_executable(cellar_bin / "node", "echo v25.8.2")
            write_executable(
                cellar_bin / "npm",
                'case "$0" in *Cellar*) exit 1 ;; *) echo 10.9.0 ;; esac',
            )
            (prefix_bin / "node").symlink_to(cellar_bin / "node")
            (prefix_bin / "npm").symlink_to(cellar_bin / "npm")

            with patch.dict(
                os.environ,
                clean_node_env(root, PATH=str(prefix_bin)),
                clear=True,
            ):
                self.assertEqual(
                    node.find_node_bin(None, "22.12.0"),
                    prefix_bin,
                )

    def test_skips_broken_path_candidate_and_uses_next_working_node_bin(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            broken_bin = make_node_bin(root / "broken" / "bin")
            write_executable(broken_bin / "npm", "exit 1")
            working_bin = make_node_bin(root / "working" / "bin")

            with patch.dict(
                os.environ,
                clean_node_env(
                    root,
                    PATH=os.pathsep.join([str(broken_bin), str(working_bin)]),
                ),
                clear=True,
            ):
                self.assertEqual(
                    node.find_node_bin(None, "22.12.0"),
                    working_bin,
                )

    def test_finds_nvm_node_even_when_it_is_not_on_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            nvm_dir = root / ".nvm"
            nvm_bin = make_node_bin(nvm_dir / "versions" / "node" / "v25.9.0" / "bin")

            with patch.dict(
                os.environ,
                clean_node_env(root, NVM_DIR=str(nvm_dir)),
                clear=True,
            ):
                self.assertEqual(
                    node.find_node_bin("25.9.0", "22.12.0"),
                    nvm_bin,
                )

    def test_custom_search_paths_cover_gui_launchers_with_minimal_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            working_bin = make_node_bin(root / "custom" / "bin")

            with patch.dict(
                os.environ,
                clean_node_env(
                    root,
                    FELIXO_NODE_SEARCH_PATHS=str(working_bin),
                ),
                clear=True,
            ):
                self.assertEqual(
                    node.find_node_bin(None, "22.12.0"),
                    working_bin,
                )

    def test_rejects_node_versions_below_package_minimum(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            old_bin = make_node_bin(root / "old" / "bin", "v20.19.0")
            current_bin = make_node_bin(root / "current" / "bin", "v25.9.0")

            with patch.dict(
                os.environ,
                clean_node_env(
                    root,
                    PATH=os.pathsep.join([str(old_bin), str(current_bin)]),
                ),
                clear=True,
            ):
                self.assertEqual(
                    node.find_node_bin(None, "22.12.0"),
                    current_bin,
                )

    def test_macos_homebrew_dirs_are_searched_when_path_is_empty(self) -> None:
        """A GUI-launched process on macOS inherits a minimal PATH that omits
        /opt/homebrew/bin, which is where Apple Silicon Homebrew puts Node."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            homebrew_bin = make_node_bin(root / "opt" / "homebrew" / "bin")

            # os.name="posix" junto de sys.platform="darwin": a busca decide o
            # ramo do Windows por os.name, então sem fixar os dois o teste roda
            # o caminho do Windows no runner de lá e nunca olha o Homebrew.
            with patch.dict(os.environ, clean_node_env(root), clear=True), patch.object(
                node, "MACOS_NODE_BIN_DIRS", (str(homebrew_bin),)
            ), patch.object(node.sys, "platform", "darwin"), patch.object(
                node.os, "name", "posix"
            ):
                self.assertEqual(
                    node.find_node_bin(None, "22.12.0"),
                    homebrew_bin,
                )

    def test_build_env_puts_macos_dirs_on_path_for_child_processes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)

            with patch.dict(os.environ, clean_node_env(root), clear=True), patch.object(
                node.sys, "platform", "darwin"
            ):
                env = node.build_env(root / "node" / "bin")

            self.assertIn("/opt/homebrew/bin", node.get_path_env(env))



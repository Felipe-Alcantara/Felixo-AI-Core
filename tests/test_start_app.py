import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import start_app


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


def write_executable(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def make_node_bin(bin_dir: Path, node_version: str = "v25.9.0") -> Path:
    write_executable(bin_dir / "node", f"echo {node_version}")
    write_executable(bin_dir / "npm", "echo 10.9.0")
    return bin_dir


def clean_node_env(home: Path, **overrides: str) -> dict[str, str]:
    env = {"HOME": str(home), "PATH": ""}
    env.update({key: "" for key in NODE_ENV_KEYS})
    env.update(overrides)
    return env


class StartAppNodeDiscoveryTests(unittest.TestCase):
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
                    start_app.find_node_bin(None, "22.12.0"),
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
                    start_app.find_node_bin(None, "22.12.0"),
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
                    start_app.find_node_bin("25.9.0", "22.12.0"),
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
                    start_app.find_node_bin(None, "22.12.0"),
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
                    start_app.find_node_bin(None, "22.12.0"),
                    current_bin,
                )

    def test_resolves_windows_npm_cmd_for_subprocesses(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            node_bin = root / "nodejs"
            npm_cmd = node_bin / "npm.cmd"
            npm_cmd.parent.mkdir(parents=True)
            npm_cmd.write_text("@echo off\r\n", encoding="utf-8")
            env = {"Path": str(node_bin)}

            with patch("start_app.is_windows_platform", return_value=True), patch(
                "start_app.shutil.which",
                return_value=str(npm_cmd),
            ):
                self.assertEqual(
                    start_app.resolve_subprocess_command(["npm", "install"], env),
                    [str(npm_cmd), "install"],
                )

    def test_build_env_preserves_windows_path_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            node_bin = root / "nodejs"

            with patch("start_app.is_windows_platform", return_value=True), patch.dict(
                os.environ,
                clean_node_env(root, Path=str(root / "Windows" / "System32")),
                clear=True,
            ):
                env = start_app.build_env(node_bin)

            self.assertIn("Path", env)
            self.assertNotIn("PATH", env)
            self.assertTrue(env["Path"].startswith(str(node_bin)))


if __name__ == "__main__":
    unittest.main()

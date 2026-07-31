"""Tests for the quiet start-up update.

This runs on every launch, before the app opens, so the requirements are as
much about what it must *not* do as what it does: never discard local work,
never block the launch, never take a visible amount of time.
"""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from felixo_launcher import git


class AutoUpdateSafetyTests(unittest.TestCase):
    """Conditions under which the update must decline to run at all."""

    def test_never_updates_when_there_is_uncommitted_work(self) -> None:
        """The most important guarantee: a launch must not put someone's
        uncommitted changes at risk, and `merge --ff-only` would refuse anyway."""
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            checkout = Path(tmpdir)
            (checkout / ".git").mkdir()

            with patch(
                "felixo_launcher.git.shutil.which", return_value="/usr/bin/git"
            ), patch("felixo_launcher.git.ROOT_DIR", checkout), patch(
                "felixo_launcher.git.get_dirty_files",
                return_value=[" M app/src/App.tsx"],
            ):
                self.assertFalse(git.can_auto_update({}))

    def test_does_not_run_without_git_installed(self) -> None:
        with patch("felixo_launcher.git.shutil.which", return_value=None):
            self.assertFalse(git.can_auto_update({}))

    def test_does_not_run_outside_a_git_checkout(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch(
                "felixo_launcher.git.shutil.which", return_value="/usr/bin/git"
            ), patch("felixo_launcher.git.ROOT_DIR", Path(tmpdir)):
                self.assertFalse(git.can_auto_update({}))

    def test_env_switch_turns_the_feature_off(self) -> None:
        for value in ("off", "0", "false", "no", "OFF"):
            with self.subTest(value=value):
                self.assertFalse(git.auto_update_is_enabled({"FELIXO_AUTO_UPDATE": value}))

    def test_feature_is_on_by_default(self) -> None:
        self.assertTrue(git.auto_update_is_enabled({}))
        self.assertTrue(git.auto_update_is_enabled({"FELIXO_AUTO_UPDATE": "on"}))

    def test_skips_a_detached_head_rather_than_guessing_a_branch(self) -> None:
        """With no current branch there is nothing to fast-forward, and picking
        one would move the checkout somewhere nobody asked for."""
        with patch("felixo_launcher.git.can_auto_update", return_value=True), patch(
            "felixo_launcher.git.get_current_branch", return_value=None
        ), patch("felixo_launcher.git.fetch_quietly") as fetch:
            self.assertFalse(git.auto_update({}))

        fetch.assert_not_called()


class AutoUpdateBehaviourTests(unittest.TestCase):
    def test_updates_the_branch_the_person_is_actually_on(self) -> None:
        """Not the production branch: someone working on `main` must not be
        silently dragged onto `production`."""
        with patch("felixo_launcher.git.can_auto_update", return_value=True), patch(
            "felixo_launcher.git.get_current_branch", return_value="main"
        ), patch("felixo_launcher.git.fetch_quietly", return_value=True) as fetch, patch(
            "felixo_launcher.git.is_behind_upstream", return_value=True
        ), patch(
            "felixo_launcher.git.run_git_quietly", return_value=0
        ) as run_git, patch("felixo_launcher.git.print"):
            self.assertTrue(git.auto_update({}))

        self.assertEqual(fetch.call_args.args[0], "main")
        self.assertEqual(run_git.call_args.args[0], ["merge", "--ff-only", "origin/main"])

    def test_reports_no_update_when_already_current(self) -> None:
        with patch("felixo_launcher.git.can_auto_update", return_value=True), patch(
            "felixo_launcher.git.get_current_branch", return_value="main"
        ), patch("felixo_launcher.git.fetch_quietly", return_value=True), patch(
            "felixo_launcher.git.is_behind_upstream", return_value=False
        ), patch("felixo_launcher.git.run_git_quietly") as run_git, patch(
            "felixo_launcher.git.print"
        ) as printed:
            self.assertFalse(git.auto_update({}))

        run_git.assert_not_called()
        printed.assert_not_called()

    def test_a_failed_fetch_is_not_an_error_the_person_has_to_deal_with(self) -> None:
        """Being offline is normal. The app still has to open."""
        with patch("felixo_launcher.git.can_auto_update", return_value=True), patch(
            "felixo_launcher.git.get_current_branch", return_value="main"
        ), patch("felixo_launcher.git.fetch_quietly", return_value=False), patch(
            "felixo_launcher.git.run_git_quietly"
        ) as run_git, patch("felixo_launcher.git.print") as printed:
            self.assertFalse(git.auto_update({}))

        run_git.assert_not_called()
        printed.assert_not_called()

    def test_diverged_history_is_left_alone_with_an_explanation(self) -> None:
        with patch("felixo_launcher.git.can_auto_update", return_value=True), patch(
            "felixo_launcher.git.get_current_branch", return_value="main"
        ), patch("felixo_launcher.git.fetch_quietly", return_value=True), patch(
            "felixo_launcher.git.is_behind_upstream", return_value=True
        ), patch(
            "felixo_launcher.git.run_git_quietly", return_value=1
        ), patch("felixo_launcher.git.print") as printed:
            self.assertFalse(git.auto_update({}))

        message = " ".join(str(call.args[0]) for call in printed.call_args_list if call.args)
        self.assertIn("divergiu", message)

    def test_fetch_is_bounded_so_a_slow_network_cannot_stall_the_launch(self) -> None:
        with patch("felixo_launcher.git.run_git_quietly", return_value=0) as run_git:
            git.fetch_quietly("main", {})

        self.assertEqual(run_git.call_args.args[2], git.AUTO_UPDATE_TIMEOUT)

    def test_a_hanging_git_command_is_treated_as_failure_not_a_crash(self) -> None:
        with patch(
            "felixo_launcher.git.subprocess.call",
            side_effect=subprocess.TimeoutExpired("git", 4),
        ):
            self.assertEqual(git.run_git_quietly(["fetch"], {}, 4.0), 1)

    def test_unreadable_commit_count_means_no_update(self) -> None:
        with patch(
            "felixo_launcher.git.subprocess.check_output", return_value="not-a-number\n"
        ):
            self.assertFalse(git.is_behind_upstream("main", {}))

    def test_counts_commits_to_decide_whether_an_update_is_needed(self) -> None:
        with patch(
            "felixo_launcher.git.subprocess.check_output", return_value="3\n"
        ) as check_output:
            self.assertTrue(git.is_behind_upstream("main", {}))

        self.assertIn("HEAD..origin/main", check_output.call_args.args[0])


class AutoUpdateIntegrationTests(unittest.TestCase):
    """Drives real `git` against throwaway repositories, because the whole
    feature is about how git actually behaves."""

    def make_repos(self, tmpdir: str) -> tuple[Path, Path]:
        root = Path(tmpdir)
        origin, clone = root / "origin", root / "clone"

        def run(*arguments: str, cwd: Path) -> None:
            subprocess.run(
                arguments, cwd=cwd, check=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

        origin.mkdir()
        run("git", "init", "-q", "-b", "main", ".", cwd=origin)
        run("git", "config", "user.email", "t@example.com", cwd=origin)
        run("git", "config", "user.name", "Test", cwd=origin)
        (origin / "app.txt").write_text("v1\n", encoding="utf-8")
        run("git", "add", "-A", cwd=origin)
        run("git", "commit", "-qm", "v1", cwd=origin)

        run("git", "clone", "-q", str(origin), str(clone), cwd=root)
        run("git", "config", "user.email", "t@example.com", cwd=clone)
        run("git", "config", "user.name", "Test", cwd=clone)
        return origin, clone

    def publish(self, origin: Path, content: str) -> None:
        (origin / "app.txt").write_text(content, encoding="utf-8")
        subprocess.run(
            ["git", "commit", "-qam", content.strip()], cwd=origin, check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

    def test_pulls_a_new_commit_and_reports_that_it_did(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            origin, clone = self.make_repos(tmpdir)
            self.publish(origin, "v2\n")

            with patch("felixo_launcher.git.ROOT_DIR", clone), patch(
                "felixo_launcher.git.print"
            ):
                updated = git.auto_update({})

            self.assertTrue(updated)
            self.assertEqual((clone / "app.txt").read_text(encoding="utf-8"), "v2\n")

    def test_leaves_uncommitted_work_untouched(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            origin, clone = self.make_repos(tmpdir)
            self.publish(origin, "v2\n")
            (clone / "app.txt").write_text("meu trabalho\n", encoding="utf-8")

            with patch("felixo_launcher.git.ROOT_DIR", clone), patch(
                "felixo_launcher.git.print"
            ):
                updated = git.auto_update({})

            self.assertFalse(updated)
            self.assertEqual(
                (clone / "app.txt").read_text(encoding="utf-8"), "meu trabalho\n"
            )

    def test_does_nothing_when_the_checkout_is_already_current(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            _origin, clone = self.make_repos(tmpdir)

            with patch("felixo_launcher.git.ROOT_DIR", clone), patch(
                "felixo_launcher.git.print"
            ) as printed:
                self.assertFalse(git.auto_update({}))

            printed.assert_not_called()


if __name__ == "__main__":
    unittest.main()

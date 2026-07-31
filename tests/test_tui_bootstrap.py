"""Tests for the interactive menu's bootstrap.

The menu has to install what it needs to draw itself, and fail readably when
it cannot — falling through to launching the app would hide the setup error.
"""

from __future__ import annotations

from unittest.mock import patch

from felixo_launcher import cli, paths, python_deps

from .support import EXTERNALLY_MANAGED_OUTPUT, QuietLauncherTestCase, pip_result


class TuiBootstrapTests(QuietLauncherTestCase):
    quiet_module = "felixo_launcher.python_deps"
    def test_skips_install_when_menu_dependencies_are_already_importable(self) -> None:
        with patch("felixo_launcher.python_deps.tui_dependencies_importable", return_value=True), patch(
            "felixo_launcher.python_deps.run_pip_install"
        ) as run_pip:
            self.assertTrue(python_deps.ensure_tui_dependencies())

        run_pip.assert_not_called()

    def test_bootstraps_from_requirements_file_rather_than_hardcoded_names(self) -> None:
        requirements = paths.ROOT_DIR / "requirements.txt"

        with patch(
            "felixo_launcher.python_deps.tui_dependencies_importable", side_effect=[False, True]
        ), patch(
            "felixo_launcher.python_deps.find_python_requirements_file", return_value=requirements
        ), patch(
            "felixo_launcher.python_deps.has_installable_python_requirements", return_value=True
        ), patch(
            "felixo_launcher.python_deps.run_pip_install", return_value=pip_result(0)
        ) as run_pip:
            self.assertTrue(python_deps.ensure_tui_dependencies())

        self.assertEqual(run_pip.call_args.args[0], ["-r", str(requirements)])

    def test_falls_back_to_package_names_when_requirements_file_is_absent(self) -> None:
        with patch(
            "felixo_launcher.python_deps.tui_dependencies_importable", side_effect=[False, True]
        ), patch(
            "felixo_launcher.python_deps.find_python_requirements_file", return_value=None
        ), patch(
            "felixo_launcher.python_deps.run_pip_install", return_value=pip_result(0)
        ) as run_pip:
            self.assertTrue(python_deps.ensure_tui_dependencies())

        self.assertEqual(run_pip.call_args.args[0], list(python_deps.TUI_PACKAGES))

    def test_reports_failure_when_pip_cannot_install_the_menu(self) -> None:
        with patch(
            "felixo_launcher.python_deps.tui_dependencies_importable", return_value=False
        ), patch(
            "felixo_launcher.python_deps.find_python_requirements_file", return_value=None
        ), patch(
            "felixo_launcher.python_deps.run_pip_install",
            return_value=pip_result(1, EXTERNALLY_MANAGED_OUTPUT),
        ), patch("felixo_launcher.python_deps.report_pip_failure") as report:
            self.assertFalse(python_deps.ensure_tui_dependencies())

        report.assert_called_once()

    def test_install_that_reports_success_but_stays_unimportable_is_a_failure(
        self,
    ) -> None:
        with patch(
            "felixo_launcher.python_deps.tui_dependencies_importable", side_effect=[False, False]
        ), patch(
            "felixo_launcher.python_deps.find_python_requirements_file", return_value=None
        ), patch("felixo_launcher.python_deps.run_pip_install", return_value=pip_result(0)):
            self.assertFalse(python_deps.ensure_tui_dependencies())

    def test_menu_failure_exits_instead_of_silently_launching_the_app(self) -> None:
        """Falling through to the desktop app would hide the setup error the
        person needs to see — the documented contract is a clear failure."""
        with patch.object(cli.sys, "argv", ["start_app.py"]), patch(
            "felixo_launcher.cli.ensure_tui_dependencies", return_value=False
        ), patch("felixo_launcher.cli.run_direct") as run_direct, patch(
            "felixo_launcher.cli.run_interactive_menu"
        ) as run_menu, patch("felixo_launcher.cli.print"):
            self.assertEqual(cli.main(), 1)

        run_direct.assert_not_called()
        run_menu.assert_not_called()

    def test_explicit_flags_still_bypass_the_menu_for_scripts_and_ci(self) -> None:
        with patch.object(cli.sys, "argv", ["start_app.py", "--web"]), patch(
            "felixo_launcher.cli.run_direct", return_value=0
        ) as run_direct, patch("felixo_launcher.cli.ensure_tui_dependencies") as ensure_tui:
            self.assertEqual(cli.main(), 0)

        run_direct.assert_called_once()
        ensure_tui.assert_not_called()



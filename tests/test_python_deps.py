"""Tests for installing the launcher's own Python dependencies.

PEP 668 refusal is the most common setup failure on macOS (Homebrew Python)
and Debian/Ubuntu, so the retry and the hints are pinned here.
"""

from __future__ import annotations

from unittest.mock import patch

from felixo_launcher import paths, python_deps

from .support import EXTERNALLY_MANAGED_OUTPUT, QuietLauncherTestCase, pip_result


class PipInstallTests(QuietLauncherTestCase):
    """PEP 668 refusal is the most common setup failure on macOS (Homebrew
    Python) and Debian/Ubuntu, so the retry and the hints are pinned here."""

    def test_retries_with_user_flag_when_environment_is_externally_managed(self) -> None:
        results = [
            pip_result(1, EXTERNALLY_MANAGED_OUTPUT),
            pip_result(0, "Successfully installed rich"),
        ]

        with patch("felixo_launcher.python_deps.capture_pip", side_effect=results) as capture_pip, patch(
            "felixo_launcher.python_deps.is_running_in_virtualenv", return_value=False
        ):
            result = python_deps.run_pip_install(["-r", "requirements.txt"])

        self.assertEqual(result.returncode, 0)
        self.assertEqual(capture_pip.call_count, 2)
        self.assertNotIn("--user", capture_pip.call_args_list[0].args[0])
        self.assertIn("--user", capture_pip.call_args_list[1].args[0])

    def test_does_not_retry_with_user_flag_inside_a_virtualenv(self) -> None:
        """`--user` is rejected outright inside a venv, so retrying there would
        turn a recoverable error into a confusing second failure."""
        with patch(
            "felixo_launcher.python_deps.capture_pip",
            return_value=pip_result(1, EXTERNALLY_MANAGED_OUTPUT),
        ) as capture_pip, patch(
            "felixo_launcher.python_deps.is_running_in_virtualenv", return_value=True
        ):
            result = python_deps.run_pip_install(["rich"])

        self.assertEqual(result.returncode, 1)
        self.assertEqual(capture_pip.call_count, 1)

    def test_does_not_retry_when_failure_is_unrelated_to_pep_668(self) -> None:
        with patch(
            "felixo_launcher.python_deps.capture_pip",
            return_value=pip_result(1, "ERROR: Could not find a version"),
        ) as capture_pip, patch(
            "felixo_launcher.python_deps.is_running_in_virtualenv", return_value=False
        ):
            python_deps.run_pip_install(["rich"])

        self.assertEqual(capture_pip.call_count, 1)

    def test_successful_install_runs_pip_only_once(self) -> None:
        with patch(
            "felixo_launcher.python_deps.capture_pip", return_value=pip_result(0, "ok")
        ) as capture_pip:
            result = python_deps.run_pip_install(["rich"])

        self.assertEqual(result.returncode, 0)
        self.assertEqual(capture_pip.call_count, 1)

    def test_capture_pip_survives_a_missing_python_interpreter(self) -> None:
        with patch("felixo_launcher.python_deps.subprocess.Popen", side_effect=OSError("boom")):
            result = python_deps.capture_pip(["python", "-m", "pip"], None)

        self.assertEqual(result.returncode, 1)

    def test_externally_managed_failure_reports_the_virtualenv_hint(self) -> None:
        python_deps.report_pip_failure(pip_result(1, EXTERNALLY_MANAGED_OUTPUT))

        self.assertIn("venv", self.printed_text())

    def test_generic_failure_does_not_claim_the_environment_is_managed(self) -> None:
        python_deps.report_pip_failure(pip_result(1, "ERROR: no matching distribution"))

        self.assertNotIn("externally managed", self.printed_text().lower())

    def test_requirements_install_reports_failure_and_propagates_exit_code(self) -> None:
        with patch(
            "felixo_launcher.python_deps.find_python_requirements_file",
            return_value=paths.ROOT_DIR / "requirements.txt",
        ), patch(
            "felixo_launcher.python_deps.has_installable_python_requirements", return_value=True
        ), patch("felixo_launcher.python_deps.has_pip", return_value=True), patch(
            "felixo_launcher.python_deps.run_pip_install",
            return_value=pip_result(1, EXTERNALLY_MANAGED_OUTPUT),
        ), patch("felixo_launcher.python_deps.report_pip_failure") as report:
            code = python_deps.ensure_python_requirements({}, skip_install=False)

        self.assertEqual(code, 1)
        report.assert_called_once()

    def test_skip_install_never_touches_pip(self) -> None:
        with patch("felixo_launcher.python_deps.run_pip_install") as run_pip:
            self.assertEqual(
                python_deps.ensure_python_requirements({}, skip_install=True), 0
            )

        run_pip.assert_not_called()

    def test_missing_pip_is_reported_as_actionable_instead_of_crashing(self) -> None:
        with patch(
            "felixo_launcher.python_deps.find_python_requirements_file",
            return_value=paths.ROOT_DIR / "requirements.txt",
        ), patch(
            "felixo_launcher.python_deps.has_installable_python_requirements", return_value=True
        ), patch("felixo_launcher.python_deps.has_pip", return_value=False), patch(
            "felixo_launcher.python_deps.run_pip_install"
        ) as run_pip:
            code = python_deps.ensure_python_requirements({}, skip_install=False)

        self.assertEqual(code, 1)
        run_pip.assert_not_called()



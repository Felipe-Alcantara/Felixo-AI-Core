"""Tests for platform-specific source-update choices in the launcher menu."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from felixo_launcher import menu


class MenuSourceUpdateTests(unittest.TestCase):
    def test_force_update_choice_is_offered_only_on_macos(self) -> None:
        self.assertTrue(menu.should_offer_force_update("darwin"))
        self.assertFalse(menu.should_offer_force_update("linux"))
        self.assertFalse(menu.should_offer_force_update("win32"))

    def test_macos_confirmation_runs_force_update_and_reports_changed_source(self) -> None:
        confirm_options = {}

        def confirm(*_args, **kwargs):
            confirm_options.update(kwargs)
            return SimpleNamespace(ask=lambda: True)

        questionary = SimpleNamespace(
            confirm=confirm
        )
        console = SimpleNamespace(print=lambda *_args, **_kwargs: None)

        with patch.object(menu, "sys") as platform, patch.object(
            menu, "get_current_branch", return_value="main"
        ), patch.object(
            menu, "force_update_from_github", return_value=(0, True)
        ) as force_update, patch.object(menu, "auto_update") as auto_update:
            platform.platform = "darwin"
            result = menu.update_source_before_start(console, questionary, {})

        self.assertTrue(result)
        self.assertTrue(confirm_options["default"])
        force_update.assert_called_once_with("main", {})
        auto_update.assert_not_called()

    def test_explicit_auto_update_off_disables_macos_force_prompt(self) -> None:
        questionary = SimpleNamespace(confirm=lambda *_args, **_kwargs: None)
        console = SimpleNamespace(print=lambda *_args, **_kwargs: None)

        with patch.object(menu, "sys") as platform, patch.object(
            menu, "get_current_branch"
        ) as get_branch, patch.object(menu, "auto_update") as auto_update:
            platform.platform = "darwin"
            result = menu.update_source_before_start(
                console, questionary, {"FELIXO_AUTO_UPDATE": "off"}
            )

        self.assertFalse(result)
        get_branch.assert_not_called()
        auto_update.assert_not_called()

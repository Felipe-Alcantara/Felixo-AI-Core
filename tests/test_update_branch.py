"""A atualização explícita usa a `main` quando ninguém escolheu outra branch.

A `production` foi aposentada e não existe mais no remoto: a `main` é a única
branch de longa duração do projeto. Com o padrão antigo, "Atualizar" no menu e
`--update` faziam `git fetch origin production` e falhavam para quem nunca
configurou nada.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from felixo_launcher import menu, runner
from felixo_launcher.config import DEFAULT_UPDATE_BRANCH

BRANCH_KEY = "FELIXO_PRODUCTION_BRANCH"


class _Console:
    def print(self, *_args: object, **_kwargs: object) -> None:
        pass


def _parse(argv: list[str]) -> str:
    with patch("sys.argv", ["start_app.py", *argv]):
        return runner.parse_args().branch


class UpdateBranchTest(unittest.TestCase):
    def test_o_padrao_e_a_main(self) -> None:
        self.assertEqual(DEFAULT_UPDATE_BRANCH, "main")

    def test_update_sem_configuracao_usa_a_main(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(BRANCH_KEY, None)
            self.assertEqual(_parse(["--update"]), "main")

    def test_variavel_vazia_nao_vira_branch_vazia(self) -> None:
        with patch.dict(os.environ, {BRANCH_KEY: ""}, clear=False):
            self.assertEqual(_parse(["--update"]), "main")

    def test_ambiente_e_flag_continuam_valendo(self) -> None:
        with patch.dict(os.environ, {BRANCH_KEY: "minha-branch"}, clear=False):
            self.assertEqual(_parse(["--update"]), "minha-branch")
            self.assertEqual(_parse(["--update", "--branch", "outra"]), "outra")

    def _branch_do_menu(self, config: dict[str, str]) -> str:
        chamadas: list[str] = []

        def fake_update(branch: str, _env: dict[str, str]) -> tuple[int, bool]:
            chamadas.append(branch)
            return 0, False

        with patch.object(menu, "load_config", return_value=config), patch.object(
            menu, "prepare_node_env", return_value=("/node/bin", {})
        ), patch.object(menu, "update_source_from_branch", side_effect=fake_update):
            menu._menu_update(_Console())
        self.assertEqual(len(chamadas), 1)
        return chamadas[0]

    def test_menu_atualizar_sem_configuracao_usa_a_main(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(BRANCH_KEY, None)
            self.assertEqual(self._branch_do_menu({}), "main")

    def test_menu_respeita_a_branch_salva(self) -> None:
        # Um valor salvo no "Configurar" é escolha explícita e não é trocado.
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(BRANCH_KEY, None)
            self.assertEqual(self._branch_do_menu({BRANCH_KEY: "production"}), "production")


if __name__ == "__main__":
    unittest.main()

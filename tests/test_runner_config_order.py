"""A configuração salva precisa valer antes da descoberta do Node.

O menu "Configurar" grava FELIXO_NODE_BIN em .felixo-start-config.json
justamente para resgatar quem tem o Node num lugar que a descoberta
automática não acha. Se a config só for aplicada depois de já ter escolhido
um Node, essa opção não faz nada — que era o bug.
"""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from felixo_launcher import runner


class PrepareNodeEnvConfigOrderTest(unittest.TestCase):
    def test_config_node_bin_reaches_discovery(self) -> None:
        configurado = Path("/opt/node-do-usuario/bin")
        vistos: list[str | None] = []

        def fake_find_node_bin(_version, _minimum):
            import os

            vistos.append(os.environ.get("FELIXO_NODE_BIN"))
            return configurado

        with patch.dict("os.environ", {}, clear=False) as _env:
            import os

            os.environ.pop("FELIXO_NODE_BIN", None)
            with patch.object(runner, "load_config", return_value={"FELIXO_NODE_BIN": str(configurado)}), patch.object(
                runner, "find_node_bin", side_effect=fake_find_node_bin
            ), patch.object(runner, "read_node_version", return_value=None), patch.object(
                runner, "read_minimum_node_version", return_value=None
            ), patch.object(
                runner, "build_env", return_value={}
            ):
                runner.prepare_node_env()

        self.assertEqual(
            vistos,
            [str(configurado)],
            "a descoberta do Node deveria enxergar o FELIXO_NODE_BIN salvo na configuração",
        )

    def test_ambiente_explicito_vence_a_configuracao(self) -> None:
        # Exportar a variável na mão é o override pontual documentado no
        # .env.example; ela não pode ser sobrescrita pelo valor salvo.
        vistos: list[str | None] = []

        def fake_find_node_bin(_version, _minimum):
            import os

            vistos.append(os.environ.get("FELIXO_NODE_BIN"))
            return Path("/qualquer/bin")

        with patch.dict("os.environ", {"FELIXO_NODE_BIN": "/do/shell/bin"}, clear=False):
            with patch.object(runner, "load_config", return_value={"FELIXO_NODE_BIN": "/da/config/bin"}), patch.object(
                runner, "find_node_bin", side_effect=fake_find_node_bin
            ), patch.object(runner, "read_node_version", return_value=None), patch.object(
                runner, "read_minimum_node_version", return_value=None
            ), patch.object(
                runner, "build_env", return_value={}
            ):
                runner.prepare_node_env()

        self.assertEqual(vistos, ["/do/shell/bin"])


if __name__ == "__main__":
    unittest.main()

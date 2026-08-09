"""A saída do git é UTF-8; decodificá-la com o locale quebra no Windows.

`text=True` sem `encoding=` usa o locale do sistema — cp1252 num Windows
pt-BR. O git emite o nome da branch em UTF-8 cru, então uma branch acentuada
levanta UnicodeDecodeError, que NÃO é subclasse de OSError e por isso escapa
dos `except (OSError, CalledProcessError)` destas funções. Como o auto-update
roda em toda inicialização, isso viraria um traceback antes de o app abrir.
"""

from __future__ import annotations

import subprocess
import unittest
from unittest.mock import patch

from felixo_launcher import git


class GitOutputEncodingTest(unittest.TestCase):
    def test_todas_as_leituras_de_saida_fixam_utf8(self) -> None:
        # Varredura do módulo: qualquer subprocess que decodifique saída
        # precisa dizer em qual encoding, senão volta a depender do locale.
        fonte = (git.__file__ and open(git.__file__, encoding="utf-8").read()) or ""
        sem_encoding = [
            trecho
            for trecho in fonte.split("text=True")[1:]
            # Olha a vizinhança da chamada: encoding deve estar logo ao lado.
            if "encoding=" not in trecho[:200]
        ]

        self.assertEqual(
            sem_encoding,
            [],
            "há chamadas com text=True sem encoding explícito — voltam a usar o locale",
        )

    def test_branch_acentuada_nao_derruba_o_launcher(self) -> None:
        # UnicodeDecodeError escapa do except atual; o teste garante que ele
        # não chegue ao chamador nem que a branch se perca.
        acentuada = "feature/açúcar-Álbum"

        with patch.object(git.subprocess, "check_output", return_value=f"{acentuada}\n"):
            self.assertEqual(git.get_current_branch({}), acentuada)

    def test_falha_de_decodificacao_vira_none_em_vez_de_traceback(self) -> None:
        erro = UnicodeDecodeError("charmap", b"\x81", 0, 1, "character maps to <undefined>")

        with patch.object(git.subprocess, "check_output", side_effect=erro):
            self.assertIsNone(
                git.get_current_branch({}),
                "uma falha de decodificação deveria degradar para None, não subir",
            )

    def test_erros_de_processo_continuam_tratados(self) -> None:
        with patch.object(
            git.subprocess,
            "check_output",
            side_effect=subprocess.CalledProcessError(128, "git"),
        ):
            self.assertIsNone(git.get_current_branch({}))


if __name__ == "__main__":
    unittest.main()

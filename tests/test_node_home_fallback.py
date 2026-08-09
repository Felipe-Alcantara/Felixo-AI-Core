"""Path.home() não pode derrubar a descoberta do Node quando o ambiente não
tem HOME/USERPROFILE definido.

No Windows, Path.home() delega a os.path.expanduser('~'), que procura
USERPROFILE (ou HOMEDRIVE+HOMEPATH) — nunca HOME. O runner do GitHub Actions
para windows-latest não define nenhum dos dois no ambiente de teste, e
Path.home() levanta RuntimeError em vez de degradar. Isso derrubava a suíte
inteira do launcher nesse job, mascarando o resultado dos testes reais atrás
de um problema de ambiente que não é do código sendo testado.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from felixo_launcher import node


class HomeDirectoryFallbackTests(unittest.TestCase):
    def test_build_env_nao_estoura_sem_home_no_ambiente(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(node.Path, "home", side_effect=RuntimeError("Could not determine home directory.")):
                env = node.build_env(None)

        # Não é sobre o conteúdo do PATH aqui — é sobre a função ter
        # devolvido algo em vez de propagar a exceção.
        self.assertIn("PATH", {node.get_path_env.__name__: None} and env or env)

    def test_find_node_bin_nao_estoura_sem_home_no_ambiente(self) -> None:
        # O ponto não é o valor devolvido (Path.expanduser() cai para o home
        # real do usuário do SO mesmo com o ambiente limpo, via pwd no
        # Linux/macOS) — é que a função não propague o RuntimeError que
        # Path.home() levantaria num Windows sem USERPROFILE.
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(node.Path, "home", side_effect=RuntimeError("Could not determine home directory.")):
                node.find_node_bin(None, None)

    def test_home_dir_degrada_para_none_em_vez_de_propagar(self) -> None:
        with patch.object(node.Path, "home", side_effect=RuntimeError("Could not determine home directory.")):
            self.assertIsNone(node.home_dir())

    def test_home_dir_devolve_o_caminho_quando_disponivel(self) -> None:
        self.assertIsNotNone(node.home_dir())


class EnvPathExpanduserFallbackTests(unittest.TestCase):
    """`Path.expanduser()` (o método do pathlib, não `os.path.expanduser`)
    verifica se o resultado ainda começa com "~" e levanta `RuntimeError`
    nesse caso — diferente de `os.path.expanduser`, que devolve o texto sem
    expandir quando não sabe o home.

    No POSIX isso é inatingível na prática: sem $HOME, o expanduser do
    pathlib cai para `pwd.getpwuid()`, então o teste tem que mockar
    `Path.expanduser` diretamente para simular o Windows real, onde não há
    esse fallback via syscall — sem USERPROFILE/HOMEPATH, o método levanta de
    verdade. `env_path()` monta `Path("~/.volta")` e chama esse método
    direto, então herdava a mesma falha: qualquer um dos ~6 gerenciadores de
    versão consultados (Volta, asdf, mise, nodenv, nvm, fnm) derrubava a
    descoberta inteira do Node.
    """

    def test_env_path_nao_estoura_quando_expanduser_falha(self) -> None:
        with patch.object(
            node.Path, "expanduser", side_effect=RuntimeError("Could not determine home directory.")
        ):
            # Não deve levantar — um candidato a menos na busca é uma
            # resposta válida, um RuntimeError não tratado não é.
            node.env_path("VOLTA_HOME", "~/.volta")

    def test_add_version_manager_candidates_nao_estoura_quando_expanduser_falha(self) -> None:
        # O caminho que derrubou a suíte inteira no CI: iter_node_bin_candidates
        # chama isto, que por sua vez chama env_path várias vezes.
        with patch.object(
            node.Path, "expanduser", side_effect=RuntimeError("Could not determine home directory.")
        ):
            list(node.iter_node_bin_candidates("22.12.0"))


if __name__ == "__main__":
    unittest.main()

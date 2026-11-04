"""Subcaminho de pacote que só existe para o bundler ou para o TypeScript não
pode contar como dependência faltando.

O `@excalidraw/excalidraw` 0.18 exporta `./*` só na condição `types` e
`./index.css` só em `development`/`production`. O Node, com as condições
padrão, não resolve nenhum dos dois, e o launcher acusava os três imports do
canvas como faltando a cada abertura, rodando `npm install` à toa (relato de
25/09/2026, reproduzido no Windows em 04/11/2026). Um pacote ausente ou um
arquivo que não existe continuam acusados.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from felixo_launcher import node_deps


@unittest.skipIf(shutil.which("node") is None, "node não está no PATH")
class ImportsNaoResolvidosTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app_dir = Path(tempfile.mkdtemp(prefix="felixo-node-deps-"))
        self.addCleanup(shutil.rmtree, self.app_dir, ignore_errors=True)
        pacote = self.app_dir / "node_modules" / "@fx" / "desenho"
        arquivos = {
            "dist/prod/index.js": "export const Desenho = 1\n",
            "dist/dev/index.js": "export const Desenho = 1\n",
            "dist/prod/index.css": "",
            "dist/dev/index.css": "",
            "dist/types/desenho/index.d.ts": "export declare const Desenho: number\n",
            "dist/types/desenho/types.d.ts": "export type Estado = {}\n",
            "dist/types/desenho/element/types.d.ts": "export type Elemento = {}\n",
        }
        for relativo, conteudo in arquivos.items():
            destino = pacote / relativo
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(conteudo, encoding="utf-8")
        # Mesmo formato do `exports` do @excalidraw/excalidraw 0.18.1.
        (pacote / "package.json").write_text(json.dumps({
            "name": "@fx/desenho",
            "version": "1.0.0",
            "type": "module",
            "exports": {
                "./*": {"types": "./dist/types/desenho/*.d.ts"},
                "./index.css": {"development": "./dist/dev/index.css", "production": "./dist/prod/index.css"},
                ".": {
                    "types": "./dist/types/desenho/index.d.ts",
                    "development": "./dist/dev/index.js",
                    "production": "./dist/prod/index.js",
                    "default": "./dist/prod/index.js",
                },
            },
        }), encoding="utf-8")
        (self.app_dir / "src").mkdir()
        (self.app_dir / "src" / "Desenho.tsx").write_text(
            "import { Desenho } from '@fx/desenho'\n"
            "import '@fx/desenho/index.css'\n"
            "import type { Estado } from '@fx/desenho/types'\n"
            "import type { Elemento } from '@fx/desenho/element/types'\n"
            "import '@fx/desenho/nao-existe.css'\n"
            "import { nada } from 'pacote-que-falta'\n",
            encoding="utf-8",
        )

    def test_so_acusa_o_que_falta_de_verdade(self) -> None:
        with patch.object(node_deps, "APP_DIR", self.app_dir):
            faltando = node_deps.get_unresolved_node_imports(dict(os.environ))

        self.assertEqual(sorted(faltando), ["@fx/desenho/nao-existe.css", "pacote-que-falta"])


if __name__ == "__main__":
    unittest.main()

# Distribuicao e Atualizacoes

Status: base implementada.

## Objetivo

O Felixo AI Core deve funcionar em dois modos de uso:

- codigo-fonte: pessoa clona o repositorio, instala dependencias e roda o app;
- release instalada: pessoa baixa um instalador/AppImage/DMG/NSIS do GitHub Releases.

Nos dois modos, a fonte de verdade para producao e a branch `production`.

## CLIs e modelos

O app nao deve depender dos scripts locais em `ai-clis/` para funcionar em outros computadores.

Contrato atual:

- o app oferece perfis padrao para `codex`, `claude`, `gemini`, `codex app-server` e `gemini` ACP;
- o usuario instala e autentica as CLIs no proprio sistema operacional;
- os adapters Electron chamam os comandos reais (`codex`, `claude`, `gemini`) e nao caminhos absolutos do computador de desenvolvimento;
- `FELIXO_CLI_PATHS` pode ser usado para adicionar diretorios extras ao `PATH`.

Caminhos comuns de npm, NVM, Volta, asdf, Homebrew e Windows npm global sao adicionados automaticamente quando existem.

## Rodando pelo codigo-fonte

Primeira instalacao:

```bash
git clone -b production https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core
python3 start_app.py
```

Atualizacao explicita:

```bash
python3 start_app.py --update
```

Esse fluxo executa:

```bash
git fetch origin production
git pull --ff-only origin production
```

Se houver alteracoes locais nao commitadas, a atualizacao e bloqueada para nao sobrescrever trabalho do usuario. Quando o codigo muda, `npm install` e executado novamente para sincronizar dependencias.

## Releases instaladas

O app usa:

- `electron-builder` para gerar artefatos;
- `electron-updater` para verificar, baixar e instalar novas versoes;
- GitHub Releases como provider de publicacao.

Scripts principais:

```bash
cd app
npm run pack
npm run dist
npm run publish:github
```

`npm run pack` cria uma pasta empacotada local sem instalador. `npm run dist` gera instaladores. `npm run publish:github` publica no GitHub Releases quando `GH_TOKEN` esta disponivel.

## Workflow de producao

`.github/workflows/release.yml` roda em push na branch `production`.

Passos:

1. instala dependencias com `npm ci`;
2. gera uma versao de producao baseada em `package.json` + `GITHUB_RUN_NUMBER`;
3. compila o renderer;
4. roda `electron-builder --publish always` em Linux, Windows e macOS.

Cada push em `production` publica uma versao maior que a anterior, permitindo que o `electron-updater` detecte a atualizacao.

## Limites atuais

- Auto-update dentro do app fica ativo apenas no app empacotado, nao no `npm run dev`.
- No Linux, o fluxo de update dentro do app deve usar AppImage. `.deb` e mantido para instalacao tradicional.
- macOS e Windows ainda precisam de assinatura/notarizacao para distribuicao publica com menos atrito.
- Usuarios que rodam pelo codigo-fonte nao recebem update silencioso; eles usam `python3 start_app.py --update` para manter controle sobre alteracoes locais.

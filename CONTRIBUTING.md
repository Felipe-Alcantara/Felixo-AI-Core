# Contribuindo

O guia completo está em [`docs/guias/GUIA-DESENVOLVEDOR.md`](docs/guias/GUIA-DESENVOLVEDOR.md). O essencial:

## Como rodar

Você precisa de Node.js (a versão da [`.nvmrc`](.nvmrc); o `engines` de `app/package.json` aceita 22.12 ou mais), Git e, só para o menu de início, Python 3.9 ou mais.

```bash
git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core/app
npm install
npm run dev
```

Prefere o menu que instala, configura e abre o app? Na raiz do repositório, `python3 start_app.py`. Passo a passo por sistema em [`docs/projeto/RODAR-VIA-CODIGO-FONTE.md`](docs/projeto/RODAR-VIA-CODIGO-FONTE.md).

## Como testar

Dentro de `app/`:

```bash
npm run lint           # ESLint
npm run typecheck      # TypeScript
npm test               # testes Node: processo principal e scripts
npm run test:frontend  # testes da interface (Vitest)
```

Testes de interface de componente (`*.test.tsx`) rodam no vitest com `jsdom` e `@testing-library/react`: o arquivo declara `// @vitest-environment jsdom` na primeira linha e usa os helpers de `app/src/features/shared/test-support/` (`jsdom-storage.ts` para o `localStorage` em memória, `jsdom-shims.ts` para `scrollIntoView` e `ResizeObserver`). O jsdom não calcula layout nem desenha xterm: posição, sobreposição e o terminal de verdade continuam no smoke do canvas (`npm run test:canvas-smoke`). Componentes só de apresentação também podem ser testados em Node, sem DOM, chamando a função e percorrendo a árvore com `test-support/react-tree.ts`.

Durante o trabalho, rode só os arquivos da área que você mexeu (`npx vitest run <arquivo>`, `node --test <arquivo>`) e a suíte inteira uma vez no fim. Se mexeu no launcher Python, na raiz: `python3 -m unittest discover -s tests -t .`. O `npm run test:native` exercita o PTY de verdade e precisa da toolchain C++ do `node-pty`.

## Regras do projeto

- **Commits:** Conventional Commits em português (`feat`, `fix`, `perf`, `docs`, `test`, `chore`), pequenos e um tema por commit. Mensagens como `wip` e `update` não passam.
- **Histórico linear:** `rebase` e `fast-forward`; a `main` não aceita merge commit nem push forçado.
- **Antes de enviar:** `npm run lint`, `npm run typecheck` e os testes da área que você mexeu, dentro de `app/`. O CI roda tudo em Windows, macOS e Linux.
- **Segredos e dados pessoais:** nunca entram em commit, log ou issue. Caminhos de usuário real viram `os.homedir()` ou fixture neutra.
- **Falha de segurança:** não abra issue pública; veja [`SECURITY.md`](SECURITY.md).

## Arquivos para agentes de IA

O Felixo AI Core também é desenvolvido com agentes de IA (Claude Code, Codex e outros). As instruções e a configuração desses agentes não fazem parte do repositório: `CLAUDE.md`, `AGENTS.md`, `IA.md`, `.claude/`, `.agents/`, `.codex`, `.gemini/`, `.cursor/`, `GEMINI.md`, `.ai-memory.toml` e similares ficam na máquina de quem desenvolve, fora do controle de versão. O `.gitignore` já os deixa de fora.

Cada contribuidor usa as próprias instruções de agente, localmente. Se o seu agente pede um arquivo de regras, crie-o no seu checkout: ele não entra em commit, e nenhum teste nem o build dependem dele. A exceção é `docs/projeto/IA.md`, que continua versionado porque o CI confere que ele existe.

`docs/_legado/` (documentação da fase anterior do projeto) e `docs/overnight/` (relatório de uma sessão noturna) são histórico: não descrevem o produto atual.

Antes de cada `git add`, confira o `git status`. A configuração pessoal da sua ferramenta (permissões, contas, memória e sessões, como `.claude/settings.local.json`) é só da sua máquina.

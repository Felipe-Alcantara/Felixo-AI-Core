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

Durante o trabalho, rode só os arquivos da área que você mexeu (`npx vitest run <arquivo>`, `node --test <arquivo>`) e a suíte inteira uma vez no fim. Se mexeu no launcher Python, na raiz: `python3 -m unittest discover -s tests -t .`. O `npm run test:native` exercita o PTY de verdade e precisa da toolchain C++ do `node-pty`.

## Regras do projeto

- **Commits:** Conventional Commits em português (`feat`, `fix`, `perf`, `docs`, `test`, `chore`), pequenos e um tema por commit. Mensagens como `wip` e `update` não passam.
- **Histórico linear:** `rebase` e `fast-forward`; a `main` não aceita merge commit nem push forçado.
- **Antes de enviar:** `npm run lint`, `npm run typecheck` e os testes da área que você mexeu, dentro de `app/`. O CI roda tudo em Windows, macOS e Linux.
- **Segredos e dados pessoais:** nunca entram em commit, log ou issue. Caminhos de usuário real viram `os.homedir()` ou fixture neutra.
- **Falha de segurança:** não abra issue pública; veja [`SECURITY.md`](SECURITY.md).

## Arquivos para agentes de IA

O Felixo AI Core também é desenvolvido por agentes de IA (Claude Code, Codex e outros), e alguns arquivos existem só para eles. Quem contribui à mão pode ignorá-los:

| Arquivo | O que é |
| --- | --- |
| `CLAUDE.md`, `AGENTS.md` | Instruções do projeto para os agentes. O conteúdo é o mesmo nos dois; cada ferramenta lê o seu. |
| `.claude/skills/`, `.agents/skills/` | Skills dos agentes: a memória de longo prazo (ai-memory) e a `rodar-app`, que abre o app sem interromper a área de trabalho. As do ai-memory são idênticas nas duas pastas. |
| `IA.md`, `docs/projeto/IA.md` | Linha do tempo de decisões e mudanças, para um agente retomar o contexto. O guia manda acrescentar uma entrada datada e nunca reescrever as antigas. |
| `docs/ia-archive/` | Registros antigos dos `IA.md`, movidos para lá sem edição. |
| `docs/_legado/`, `docs/overnight/` | Documentação da fase anterior do projeto e de uma sessão noturna autônoma. São histórico; não descrevem o produto atual. |

A configuração pessoal da sua ferramenta (permissões, contas, memória e sessões, como `.claude/settings.local.json`, `.cursor/` e `.gemini/`) fica fora do repositório, e o `.gitignore` já cobre os casos comuns. Confira o `git status` antes do `git add`.

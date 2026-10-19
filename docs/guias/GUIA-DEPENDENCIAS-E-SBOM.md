# Guia de auditoria de dependências e SBOM

Como o CI audita as dependências do app e do launcher, gera o SBOM e inventaria o pacote, e como repetir tudo localmente.

## Auditoria de dependências e SBOM

O CI executa separadamente o `npm audit` completo e `npm audit --omit=dev`, gera
um SBOM CycloneDX e inventaria o `app.asar` junto do `npm-runtime` que realmente
entra no pacote. A árvore de produção precisa estar sem vulnerabilidades e o
grafo completo não pode conter advisories críticos; advisories não críticos de
ferramentas continuam registrados para as atualizações do Dependabot. O launcher
Python também é auditado com `pip-audit` e publica seu SBOM. Em PR, cada
auditoria só roda quando as dependências dela mudam: o `package.json` ou o
lockfile do app, ou o `requirements.txt`/`.in` do launcher. O workflow
`nightly.yml` roda esses audits todo dia, com os mesmos gates, para que um
advisory publicado sem nenhum commit novo apareça sem esperar um PR.

Para repetir localmente:

```bash
cd app
npm audit --json
npm audit --omit=dev --json
npm sbom --package-lock-only --sbom-format=cyclonedx --sbom-type=application
npm run pack
npm run inventory:package -- --release-dir release --out build/dependency-policy/package-inventory.json
```

`npm test` executa os testes Node unitários; o segundo comando é o gate explícito
de PTY nativa: ele inicia fixtures reais
no runner atual e valida a fila de escrita, EOF, Unicode e a consulta
interativa `/status` do Claude. A matriz do CI executa esse mesmo gate em
Linux, macOS e Windows/ConPTY; incompatibilidade de shell ou do addon nativo
falha com diagnóstico no log, em vez de ser ocultada por `skip`. O comando
serializa as fixtures para não criar uma disputa artificial entre múltiplos
handles ConPTY no mesmo runner.

Launcher (`start_app.py`) — não precisa de Node nem de dependências instaladas:

```bash
python3 -m unittest discover -s tests -t .
```

Os testes do launcher cobrem o que costuma quebrar entre sistemas operacionais: descoberta de Node no macOS (Homebrew Apple Silicon/Intel, gerenciadores de versão, `PATH` reduzido de apps de GUI), `Path`/`npm.cmd` no Windows, instalação de pacotes em Python "externally managed" (PEP 668) e a limpeza de processos, que só pode encerrar processos iniciados pelo próprio launcher. O CI roda esses testes em Linux, Windows e macOS.

---

Voltar ao [README](../../README.md).

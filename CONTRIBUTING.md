# Contribuindo

O guia completo está em [`docs/guias/GUIA-DESENVOLVEDOR.md`](docs/guias/GUIA-DESENVOLVEDOR.md). O essencial:

- **Commits:** Conventional Commits em português (`feat`, `fix`, `perf`, `docs`, `test`, `chore`), pequenos e um tema por commit. Mensagens como `wip` e `update` não passam.
- **Histórico linear:** `rebase` e `fast-forward`; a `main` não aceita merge commit nem push forçado.
- **Antes de enviar:** `npm run lint`, `npm run typecheck` e os testes da área que você mexeu, dentro de `app/`. O CI roda tudo em Windows, macOS e Linux.
- **Segredos e dados pessoais:** nunca entram em commit, log ou issue. Caminhos de usuário real viram `os.homedir()` ou fixture neutra.
- **Falha de segurança:** não abra issue pública; veja [`SECURITY.md`](SECURITY.md).

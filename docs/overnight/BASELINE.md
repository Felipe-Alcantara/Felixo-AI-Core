# BASELINE — sessão autônoma noturna

Início: 2026-09-12 22:xx (horário local, Windows)
Máquina: Windows 10 Pro 19045, Node 24.16.0, Electron 41.10.7

## Estado do repositório ao assumir a sessão

- Branch: `codex/felixo-visual-polish` (não `main` — trabalho contínuo de sessões
  anteriores, incluindo a feature de Source Control/GitPanel).
- **Concorrência real detectada**: Codex CLI ativo (dezenas de processos node do
  runtime OpenAI), uma instância Electron real rodando (PID 33336 + 4
  subprocessos), e um `dev-runner.cjs --web`. `origin/codex/felixo-visual-polish`
  estava 3 commits à frente do HEAD local (outra sessão fez merge de `main` nele
  e adicionou trabalho de performance). `origin/main` também havia avançado 4
  commits desde a última sincronização local.
- Working tree: 11 arquivos modificados + 6 untracked, todos meu trabalho não
  commitado da sessão anterior (extensão do git-service, reconstrução do
  GitPanel como Source Control completo). Nada do Codex estava em working tree
  — ele opera por commit direto, não por edição solta.

Ação tomada antes de qualquer correção nova: commitei meu trabalho pendente em
4 commits pequenos e lógicos (canvas icon toggle, backend git-service, UI
GitPanel, fix de tipagem `GitFileDiff`), verifiquei que os 3 commits remotos
não tocavam nenhum arquivo em comum, e fiz `git merge` (não rebase — branch
compartilhada) sem conflito.

## Pipeline após consolidar (HEAD pós-merge)

| Comando | Resultado |
|---|---|
| `npx tsc -b --pretty false` | **PASS** — exit 0 |
| `npm run lint` (eslint .) | **PASS** — exit 0 |
| `npm run build` | **PASS** — exit 0 |
| `node scripts/run-node-unit-tests.cjs` (`npm test`) | **PASS** — 1212 pass / 0 fail / 0 skipped |
| `npm run test:native` (PTY real) | **PASS** — 5 pass / 0 fail / 0 skipped |
| `npx vitest run` (frontend) | em andamento — ver VALIDATION.md |

## Achado de tipagem corrigido nesta fase

`vite-env.d.ts` referenciava `GitFileDiff` (retorno de `git:get-file-diff`) sem
nunca declará-lo ou importá-lo. `skipLibCheck: true` no `tsconfig` faz o
TypeScript pular a checagem semântica de arquivos `.d.ts`, então o nome não
resolvido virou `any` implícito em silêncio — `GitPanel.tsx` estava sem
nenhuma segurança de tipo no acesso a `diff.diff`. Corrigido declarando o tipo
em `chat/types.ts`, ao lado de `GitProjectSummary` (mesma origem:
`git-service.cjs`). Varredura heurística do resto do arquivo não achou outro
caso da mesma classe.

## Trabalho de sessões anteriores já validado (não repetido aqui)

Estas áreas foram investigadas e corrigidas em sessões anteriores desta mesma
tarefa, com evidência registrada nos commits e nesta branch. Não vou re-auditar
do zero — apenas revalidar com testes quando eu tocar algo próximo:

- **PTY / ConPTY no Windows**: causa raiz encontrada e corrigida — o ConPTY só
  entrega stdin a um filho depois que ele produz alguma saída; a fixture de
  teste `pty-write-queue.integration.test.cjs` era silenciosa e travava até o
  timeout. Corrigido com um marcador de prontidão. `npm run test:native`
  passou de 3 falhas/4 para 5/5 (ver commit "fix(test): respeita junction
  apenas no Windows" e a correção de ConPTY que o antecede no histórico).
- **EPERM de symlink no Windows** (`package-inventory.test.cjs` e outros 4
  arquivos de teste): centralizado em `electron/__fixtures__/link-fixtures.cjs`
  — capability-check real (tenta symlink, cai para junction só se necessário),
  nunca condicional cega de plataforma. Um teste de segurança que antes
  **engolia o EPERM e reportava PASS sem verificar nada** agora executa de
  verdade.
- **`HOME` ausente no Windows**: 3 sites (`terminal-launcher.cjs`,
  `cli-request-policy.cjs`, `gemini-acp-adapter.cjs`) caíam em `process.cwd()`
  porque `HOME` não existe no Windows (nem User, nem Machine, nem Process — só
  `USERPROFILE`). Corrigido com `os.homedir()` como fallback portátil.
- **DEP0190** (`cli-detector.cjs`): `execFile` com `shell: true` emitia aviso
  de depreciação do Node ao consultar versão de CLI. Corrigido movendo o flag
  para dentro da linha de comando citada em vez do array de args.
- **Retrocompatibilidade de banco**: não havia teste provando que um banco de
  uma versão antiga migra sem perder dado ao abrir com o binário atual.
  Adicionado em `backward-compatibility.test.cjs`.
- Discovery e ciclo de vida completo de CLI (`claude`, `codex`) provados via
  ponte real: spawn, cwd, env, entrada, saída, exit code, cleanup — 0
  processos órfãos mesmo em queda abrupta do processo main do Electron.

## Próximos passos desta fase

Ver `VALIDATION.md` para os resultados de frontend/Electron/PTY desta sessão
específica, e `FIXES.md` para o que for corrigido a partir daqui.

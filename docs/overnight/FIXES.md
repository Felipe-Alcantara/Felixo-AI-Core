# FIXES — sessão autônoma noturna

Ordem cronológica real. Ver `BASELINE.md` para o estado ao assumir a sessão e
para o resumo do que sessões anteriores já haviam corrigido (não repetido
aqui).

## 1. `fix(canvas): remove keyboard-shortcut hint and make canvas icon toggle the rail`

Commit `f3ad6a1`.

- Removido o `<kbd>Ctrl K</kbd>` literal da barra de busca do topbar (o atalho
  continua funcionando, só não é mais anunciado ali) e o helper
  `usesCommandKey` que só existia para decidir o ícone desse `<kbd>`.
- O ícone "Canvas" na barra de atividades, que só disparava `onFitView`
  (redundante com o botão "Enquadrar" em ORGANIZAR), passou a alternar a
  sidebar aberta/fechada — padrão de ícone de seção de editor. Estado ativo e
  `aria-expanded` acompanham o real estado da sidebar.
- Verificado com clique real via CDP (não evento sintético, que já havia dado
  falso negativo antes nesta mesma sessão): 288px ↔ 52px, opacidade 1 ↔ 0.

## 2. `feat(git): add per-file diff, stage and unstage to the git service`

Commit `fbc8953`.

- `git-service.cjs`: `getFileDiff()`, `stageFile()`, `unstageFile()`,
  `parseGitStatusEntries()`, `assertSafeRepoRelativePath()`.
- Allowlist de argumentos do git estendida (não afrouxada): o caminho variável
  é validado por função própria (rejeita absoluto, `..`, NUL, flag disfarçada
  de caminho) e o `--` na invocação é a segunda camada.
- Achado durante a implementação: `os.devNull` no Windows resolve para
  `\\.\nul`, que o git não consegue abrir (`Could not access`) — o literal
  `/dev/null` funciona nos três sistemas porque o próprio git trata esse
  caminho como "lado vazio" do diff. Documentado em comentário para não ser
  "corrigido" de volta por engano.
- `--untracked-files=all` adicionado ao status: sem isso uma pasta nova
  colapsava numa única linha `pasta/` e não dava para abrir nem adicionar um
  arquivo individual de dentro dela.
- 7 tentativas de escape testadas manualmente contra um repositório git real
  (`../`, absoluto, injeção de flag, NUL) — todas bloqueadas.
- 9/9 testes do serviço passam, incluindo os 4 novos.

## 3. `feat(canvas): rebuild GitPanel as a full source-control view`

Commit `9e796ac`.

- O painel antigo mostrava linhas cruas de `git status --short` como texto; o
  novo separa em grupos Stage/Alterações por arquivo, com badge de status
  (M/A/D/R/U), ação por arquivo no hover, e leitor de diff com numeração de
  linha dos dois lados.
- `git-status.ts` e `git-diff.ts` extraídos como módulos `.ts` puros (não
  `.tsx`) porque um arquivo de componente que exporta não-componente quebra
  `react-refresh/only-export-components` — mesmo padrão já usado em
  `CliMark.tsx`/`cli-vendor.ts` nesta base de código.
- Rótulo da ferramenta renomeado de "Git" para "Controle de versão" nos dois
  lugares onde aparece (seção da sidebar e menu de ferramentas).
- 15 testes novos de frontend cobrindo casos de borda reais: diff com dois
  hunks, marcador de fim de arquivo sem quebra de linha, caminho acentuado
  (escape octal do git), renomeação, e o caso de um arquivo aparecer nos dois
  grupos ao mesmo tempo (editado depois de adicionado).
- Verificado ao vivo contra este próprio repositório pela ponte IPC real:
  branch lido, diff por arquivo, diff de arquivo novo, tentativa de escape
  bloqueada na fronteira do IPC.

## 4. `fix(types): declare GitFileDiff instead of leaving it unresolved`

Commit `d28ec50`.

- `vite-env.d.ts` referenciava `GitFileDiff` sem nunca declará-lo ou
  importá-lo. `skipLibCheck: true` faz o TypeScript pular a checagem
  semântica de `.d.ts`, então o nome não resolvido virou `any` implícito em
  silêncio — `GitPanel.tsx` estava sem nenhuma segurança de tipo no acesso a
  `diff.diff`. Descoberto ao revisar o próprio trabalho antes de commitar
  (não por acaso: parte do hábito de nunca dar `git add -A` sem olhar o
  diff primeiro).
- Corrigido declarando o tipo em `chat/types.ts`, ao lado de
  `GitProjectSummary` (mesma origem: `git-service.cjs`).
- Varredura heurística de todo o `vite-env.d.ts` por outros nomes de tipo não
  resolvidos: nenhum outro caso encontrado (os outros "suspeitos" da
  varredura resolviam via um segundo bloco de import que a heurística não
  cobria na primeira passada).

## 5. Integração com o remoto

Durante a sessão, `origin/codex/felixo-visual-polish` avançou **duas vezes**
por outra sessão ativa (confirmada: processos reais do Codex CLI rodando)
enquanto eu trabalhava. Em ambos os casos:

1. `git fetch` para ver o que chegou;
2. verificação de sobreposição de arquivo entre os dois lados
   (`git diff --name-only <merge-base> <cada-lado>` comparados) — zero
   sobreposição nas duas vezes;
3. `git merge --no-edit` (nunca rebase, branch compartilhada) — merge trivial
   sem conflito nas duas vezes;
4. pipeline completo revalidado após cada merge antes de push.

Os commits recebidos foram de performance (`energy-measurement.cjs`,
`terminal-responsiveness-during-install.cjs`) e um ajuste de determinismo em
`claude-usage-query.integration.test.cjs` — nenhum deles do meu escopo, todos
integrados sem perda de trabalho de nenhum dos dois lados.

# REMAINING — o que fica para decisão humana ou sessão futura

## Decisão humana necessária

### 1. 21 arquivos `preview-*.png` na raiz do repositório, já commitados
Confirmado via `git ls-files` — não são untracked, já entraram no histórico em
algum commit anterior (provavelmente um `git add -A` de outra sessão). Não
apaguei: removê-los agora seria reescrever histórico versionado sem saber se
são referência de QA intencional ou lixo de sessão de screenshot. **Ação
sugerida**: se forem descartáveis, um commit dedicado `chore: remove ad-hoc
preview screenshots` removendo os arquivos, e opcionalmente um padrão
específico (`/preview-*.png`, nunca `*.png` genérico) no `.gitignore` para não
repetir. Isso é decisão de produto, não técnica.

### 2. Merge para `main` — concluído
O código da branch `codex/felixo-visual-polish` foi integrado pelo PR #34 e a
manutenção das actions Node 24 foi integrada pelo PR #37. O merge commit atual
é `92b5708`; `main` local e `origin/main` apontam para o mesmo commit. A
execução pós-merge CI #494 terminou com **13/13 jobs aprovados** e 0
annotations. Não há decisão de merge pendente para o código desta sessão.

### 3. Branches de trabalho — limpeza opcional
As branches `codex/felixo-visual-polish` e
`docs/overnight-report-20260912` continuam no remoto para preservar o
histórico e a auditoria. Removê-las é opcional e deve ser feito somente após
confirmar que os PRs e os documentos não serão mais necessários.

## Sem bloqueio, mas fora do escopo desta sessão

- **Release `v0.1.332`**: workflow #332 concluído com sucesso e publicação
  oficial confirmada com 28 assets. Não há ação restante neste item.
- **Chunk de 1.821 kB do Excalidraw**: investigado com evidência, confirmado
  como fontes internas da biblioteca, já lazy, fora do startup. Reduzir mais
  exigiria vendoring ou patch da própria dependência — não é "ganho seguro"
  no sentido do mandato.
- **`gemini` CLI**: não instalada nesta máquina, nunca testada em nenhuma
  sessão. Quando disponível: discovery, spawn, cwd, env, entrada, streaming,
  saída, exit, cancel, cleanup — mesmo roteiro já aplicado a `claude` e
  `codex`.
- **macOS e Linux**: sem máquina disponível para execução real nesta sessão.
  Revisão estática limpa (nenhuma mudança desta sessão é platform-específica).
  CI cobre os três sistemas a cada push.

## Não é bug, documentado para não ser redescoberto

- O app tem **dois shells de topo distintos** (Canvas e Chat), não uma barra
  de atividades sempre montada — "Voltar para o canvas" é o controle correto
  para sair do chat, não um botão de rail. Um script de teste desta própria
  sessão assumiu errado e reportou falso "canvas sumiu"; corrigido ao
  investigar antes de declarar bug.

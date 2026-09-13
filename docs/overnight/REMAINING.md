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

### 2. Merge para `main`
Esta branch (`codex/felixo-visual-polish`) está com pipeline 100% verde e
sincronizada com o remoto. O projeto usa fluxo de PR (CI dispara em
`pull_request`, commits referenciam `#32`, `#36` etc.) e `gh` CLI não está
instalado nesta máquina — não tentei abrir PR via API manual nem push direto
em `main`, que seria contornar o processo estabelecido. **READY FOR MERGE**:
falta apenas abrir o PR (`git push` já feito, é só criar o PR no GitHub) ou
alguém com `gh` configurado rodar `gh pr create`.

### 3. `main` local está desatualizada
`main` local (`3f121f6`) está 4 commits atrás de `origin/main` (trabalho de
performance/energia mesclado por outra sessão) e não foi tocada nesta sessão
— nenhuma necessidade de mexer nela já que o trabalho acontece na feature
branch.

## Sem bloqueio, mas fora do escopo desta sessão

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

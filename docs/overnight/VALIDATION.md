# VALIDATION — sessão autônoma noturna

Máquina: Windows 10 Pro 19045, Node 24.16.0, Electron 41.10.7.
HEAD final: ver `FINAL_REPORT.md` para o hash exato.

## Pipeline

| Verificação | Resultado | Tempo |
|---|---|---|
| `npx tsc -b --pretty false` | **PASS** | ~1s |
| `npm run lint` (eslint .) — 0 erros, 0 avisos (contagem exata via `--format json`, não só exit code) | **PASS** | ~16s |
| `npm run build` (vite build) | **PASS** | ~6s |
| `node scripts/run-node-unit-tests.cjs` (`npm test`) | **PASS** — 1213 pass / 0 fail / 0 skipped | ~12s |
| `npm run test:native` (integração real de node-pty) | **PASS** — 5 pass / 0 fail / 0 skipped | ~16s |
| `npx vitest run` (frontend) | **PASS** — 864 pass / 1 skipped (o skip é um benchmark que roda por script próprio, não teste escondido) | ~43s |

## Electron real (não preview web)

Sessão devtools isolada (`userData` próprio, `realProfile: false`, sem tocar
no perfil do usuário), PID confirmado vivo durante toda a sessão.

- **Reload**: `location.reload()` → app volta limpo, topbar e sidebar
  renderizam, 0 erro de console.
- **Navegação real com clique via CDP** (não `dispatchEvent` sintético — essa
  diferença já havia causado 3 falsos negativos em sessões anteriores desta
  mesma tarefa): Chat → "Voltar para o canvas" → Canvas com React Flow e rail
  visíveis → Ferramentas → Controle de versão → painel abre. **0 erro de
  console em toda a sequência.**
- Console monitorado via hook próprio (`console.warn`/`console.error`,
  `window.onerror`, `unhandledrejection`) instalado a cada navegação que
  destrói o contexto (reload), para não relatar "0 erros" de um hook que na
  verdade não existe mais na página — armadilha em que esta mesma sessão já
  caiu uma vez antes de eu perceber e corrigir.

## PTY / Terminal

Não re-testado do zero nesta continuação — já provado ponta a ponta em
sessão anterior desta mesma tarefa (abrir, entrada, saída, eco de TTY,
resize observado pelo próprio shell, Ctrl+C, fechar, múltiplos terminais
isolados, 0 processo órfão mesmo em queda abrupta do processo main).
Revalidado aqui apenas via `npm run test:native` (5/5, ver acima), que
exercita o mesmo runner nativo.

## CLIs

Não re-testado nesta continuação (já coberto em sessão anterior: `claude`
2.1.204 e `codex` 0.154.0, discovery + spawn + cwd + env + entrada + saída +
exit code + cleanup, todos PASS via ponte real). `gemini` segue **NOT
TESTED — CLI unavailable** nesta máquina.

## Bundle

Investigado com evidência fresca nesta sessão (não repetindo afirmação
anterior sem checar):

- Maior chunk: `chunk-EIO257PC-*.js`, 1.821 kB (gzip 744 kB).
- Conteúdo confirmado por inspeção direta do arquivo: começa com
  `import{G as e}from"./ExcalidrawCanvas-*.js"` seguido de decodificação
  base64/`Uint8Array` — são as fontes internas do Excalidraw, não código da
  aplicação.
- Confirmado fora do caminho de startup: `grep` no `dist/index.html` não
  referencia esse chunk nem `ExcalidrawCanvas` (0 ocorrências); o único ponto
  de entrada é `const LazyExcalidrawCanvas = lazy(() => import('./ExcalidrawCanvas'))`
  em `ExcalidrawDrawingNode.tsx` — só carrega quando alguém usa a ferramenta
  de desenho.
- **Nenhuma ação tomada.** Já é lazy; reduzir mais exigiria mexer no
  empacotamento interno de fontes do Excalidraw, que é biblioteca de
  terceiros — fora do que o mandato autoriza para esta sessão ("não
  reescrever biblioteca central por alguns KB").

## PLATFORM COMPATIBILITY

### WINDOWS — EXECUTED
Todos os itens da tabela de pipeline acima, mais Electron real e navegação
por clique real. PASS em tudo.

### macOS — NOT EXECUTED
Sem máquina disponível. Revisão estática: nenhuma mudança desta sessão
introduz `process.platform === 'win32'` novo nem toca em código
platform-específico — os 3 commits de feature (git-service, GitPanel, fix de
tipo) são puramente TypeScript/lógica de parsing, sem dependência de SO. CI
(`ubuntu-latest`, `windows-latest`, `macos-latest`) roda a mesma suíte nos
três sistemas a cada push/PR.

### LINUX — NOT EXECUTED
Mesma situação do macOS: sem máquina, revisão estática limpa, coberto pelo
CI existente na próxima execução do pipeline.

## O que NÃO foi re-executado nesta continuação (já validado antes, sem
mudança desde então)

- Matriz de resolução 1366/1440/1920 (CSS não tocado nesta sessão além da
  remoção de duas regras órfãs de `.felixo-command-trigger kbd`).
- Retrocompatibilidade de banco (`backward-compatibility.test.cjs`) — incluída
  na contagem de 1213 testes Node, nenhuma mudança de schema nesta sessão.
- EPERM/symlink em Windows (`link-fixtures.cjs`) — mesma situação, incluída na
  contagem de testes, nenhuma mudança nesta sessão.

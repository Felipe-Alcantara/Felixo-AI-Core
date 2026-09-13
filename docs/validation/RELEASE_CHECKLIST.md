# Checklist de release — Felixo AI Core

Este checklist existe porque o produto é desktop e roda em três sistemas
operacionais. Teste verde num só sistema não é evidência de release: a maior
parte do que quebra aqui (PTY, spawn, PATH, symlink, permissão, empacotamento)
tem comportamento diferente em Windows, macOS e Linux.

Regra que atravessa o documento inteiro: **não marque PASS sem ter executado.**
Quando o ambiente não permitir, use `REVIEWED, NOT EXECUTED` ou
`NOT TESTED — indisponível`, dizendo o motivo. Um item honesto como
"não executado" vale mais do que um verde inventado.

## 1. Pipeline

Rode na raiz de `app/`:

| Comando | Espera-se |
| --- | --- |
| `npx tsc -b --pretty false` | sem saída, exit 0 |
| `npm run lint` | 0 erros, 0 avisos |
| `npm test` | todos passam, **0 skipped** |
| `npm run test:native` | integrações de node-pty passam |
| `npm run test:frontend` | todos passam |
| `npm run build` | exit 0 |

Sobre o `0 skipped`: um teste pulado por plataforma é cobertura que ninguém
tem. Se um skip aparecer, descubra se ele esconde uma regra sem verificação
antes de aceitar o release. Ver `electron/__fixtures__/link-fixtures.cjs`, que
existe exatamente para eliminar essa classe de skip.

## 2. Matriz de sistemas

O CI (`.github/workflows/ci.yml`, job `validate`) já roda em
`ubuntu-latest`, `windows-latest` e `macos-latest`. Antes de publicar,
confirme que os três passaram — não só o que você usa.

| Item | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Build | | | |
| Testes | | | |
| PTY / terminal real | | | |
| Descoberta de CLI | | | |
| Empacotamento | | | |

## 3. Terminal e PTY

Área crítica: é o núcleo do produto e a que mais diverge entre sistemas.
Exercite no app de verdade, não só em teste unitário.

- [ ] Abrir terminal — nasce no shell padrão certo da plataforma
- [ ] Saída — o prompt aparece
- [ ] Entrada — um comando executa (use um cuja saída **não** apareça no texto
      digitado, senão você mede eco e não execução)
- [ ] Eco de TTY — digitar sem newline devolve os caracteres
- [ ] Resize — o shell enxerga a largura nova, não só a API retornar `ok`
- [ ] Ctrl+C — interrompe processo longo e devolve o prompt
- [ ] Fechar — dispara `onExit`
- [ ] Limpeza — o PID filho some do sistema operacional (verifique pelo host)
- [ ] Múltiplos terminais — sessões isoladas, sem vazar saída entre elas
- [ ] Reabrir depois de fechar

Armadilha do ConPTY, aprendida na marra: **no Windows o filho só começa a
receber stdin depois que ele próprio escreve algo no console.** Um processo
silencioso nunca recebe o que você manda, e a sessão fica pendurada até o
timeout — sem erro, sem pista. Shells e CLIs de verdade não sofrem disso
porque imprimem prompt ou banner ao nascer; fixtures de teste silenciosas,
sim. Se escrever num filho e nada acontecer, faça-o anunciar prontidão e
espere por esse sinal antes de escrever, em vez de dormir um tempo arbitrário.

No mesmo terreno: em modo cozido o console do Windows so entrega a linha no
`\r`. Um `\n` sozinho nao termina linha nenhuma, e a carga fica presa
no buffer de edicao do console.

## 4. CLIs

Para cada uma (Claude Code, Codex, Gemini): descoberta, spawn, working
directory, environment, entrada, saída, saída de processo, limpeza.

CLI ausente da máquina **não é falha do produto** — marque
`NOT TESTED — CLI unavailable`.

No Windows, confira que a resolução acha a extensão certa (`.cmd`, `.exe`,
`.ps1`), não só o shim sem extensão.

## 5. Portabilidade

- [ ] Nenhum path absoluto novo (`C:\Users\...`, `/Users/...`, `/home/...`)
      fora de dado de teste
- [ ] Caminhos montados com `path.join` / `path.resolve`, não concatenação
- [ ] Home do usuário via `os.homedir()` — no Windows `HOME` não existe,
      só `USERPROFILE`
- [ ] Casing de import confere com o disco (Linux é case-sensitive; Windows
      perdoa e esconde o defeito até o CI)
- [ ] `process.env` preservado ao spawnar; variáveis novas entram por merge
- [ ] Nenhuma condicional de plataforma nova espalhada — centralize em
      `electron/core/platform/`

## 6. Empacotamento

- [ ] `npm run build` passa
- [ ] Config de `build` cobre win/mac/linux
- [ ] `asarUnpack` continua incluindo `node-pty` (módulo nativo não roda de
      dentro do asar)
- [ ] Ícone referenciado existe, com a grafia exata
- [ ] Versões de Electron, node-pty e `engines` inalteradas sem decisão
      explícita

## 7. Dados

- [ ] Chats, projetos, canvas, configurações de agente e estado de terminal
      abrem normalmente após a mudança
- [ ] Campo novo tem default seguro; dado antigo não vira inválido

## 8. Interface

- [ ] 1366×768, 1440×900 e 1920×1080 sem scroll horizontal e sem sobreposição
- [ ] Console sem erro nem aviso durante um fluxo real
- [ ] Selects: abre por clique, ESC fecha, teclado navega, clique fora fecha,
      só um aberto por vez, lista dentro da janela

Ao medir layout numa janela offscreen ou minimizada, **desligue transição e
animação antes de ler**: o compositor throttled devolve o valor inicial da
propriedade animada e produz falso negativo. O mesmo vale para interação:
evento sintético via `dispatchEvent` não dispara `mousedown`, então
"clique fora" e ESC parecem quebrados quando estão corretos. Use input real.

## 9. Antes de publicar

- [ ] `git status` revisado; nada de artefato solto entrando no commit
- [ ] Sem `console.log`, `debugger` ou TODO nas linhas adicionadas
- [ ] Sem segredo (`.env`, token, chave, cookie) versionado
- [ ] Relatório final diz explicitamente **READY** ou **NOT READY**, e o que
      não foi executado

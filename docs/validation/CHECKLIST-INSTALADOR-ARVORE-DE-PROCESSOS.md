# Checklist manual — instalador sem processo órfão (Windows, macOS e Linux)

Cancelar uma instalação de CLI, ou deixar o tempo limite de 10 minutos acabar, tem de
encerrar **toda** a árvore do `npm` (npm → shell → script de pós-instalação → o que ele
subiu), não só o `npm`. O PR #84 (`app/electron/core/process-tree.cjs`) corrigiu isso, e o
mesmo cenário agora roda sempre no CI, dentro de `app/scripts/release-smoke.cjs`, contra o
app empacotado nos três sistemas.

Este roteiro é para o que o CI não dá: **ver rodando numa máquina real**, com o app
empacotado de verdade e a evidência de que nada sobrou. Ele usa o mesmo cenário
(`app/scripts/installer-kill-smoke.cjs`), então a prova que você gera é a mesma do CI,
só que fora dele.

## O que o cenário faz

1. Abre o executável do app **empacotado** como Node (`ELECTRON_RUN_AS_NODE`) e carrega de
   dentro do `app.asar` o `managed-cli-installer` que o app usa de verdade, com o npm que
   vai dentro do pacote.
2. Instala um pacote local cujo `postinstall` sobe um processo neto e fica esperando. A
   árvore real é `app (npm) → shell → script → neto`.
3. Tira a fotografia da árvore (`ps` no macOS e no Linux, `Get-CimInstance` no Windows).
4. **Cancela** (`AbortController`) e, em outro cenário, **deixa o tempo limite estourar**.
5. Quem confere é o runner, depois que o driver saiu, pid a pid e pelo nome do processo
   (pid reaproveitado por outro programa não conta). Sobrou alguém: o smoke falha e o
   runner encerra o que sobrou.

## Requisitos

- Node 22.12 ou mais novo e o repositório clonado. O script só usa Node: não precisa de
  `npm install` para rodá-lo.
- Um app empacotado:
  - **macOS:** o `.zip` ou o `.dmg` da release (o script abre ele sozinho, em pasta
    descartável), ou um `.app` gerado por `npm run pack`.
  - **Linux:** o `.AppImage` da release (o script extrai) ou `linux-unpacked`.
  - **Windows:** a pasta `win-unpacked` de `npm run pack`. **Não instale o `.exe` NSIS**: ele
    registraria a cópia de teste como a instalação do Felixo nesta máquina. Sem o
    Visual Studio (o `node-pty` não recompila), use `npx electron-builder --dir
    -c.npmRebuild=false` depois de `npm run build`; o `node-pty` vem dos binários prontos.

## Roteiro

1. **Rodar o cenário.**

   ```bash
   cd app
   node scripts/installer-kill-smoke.cjs --artifact <app empacotado> --report evidencia.json
   ```

   Esperado: `"result": "passed"` e, em cada cenário, `"survivors": 0`:
   - `cancel` com `outcome: "cancelled"`;
   - `timeout` com `outcome: "timeout"`;
   - `treeSize` de pelo menos 3 e `treeDepth` de pelo menos 3 (npm, shell e script).
2. **Controle negativo.** Mata só o npm, como o `child.kill()` de antes do PR #84:

   ```bash
   node scripts/installer-kill-smoke.cjs --artifact <app empacotado> --only cancel --control
   ```

   Esperado: `"survivors"` **maior que zero**. Se der zero, o sistema limpou os órfãos
   sozinho e esta máquina não prova nada sobre o kill de árvore: anote isso na evidência.
   O runner encerra os órfãos do controle ao terminar.
3. **Olho humano (opcional).** Em outro terminal, durante o passo 1, liste os processos do
   app. O pico é de uns 5 processos por uns segundos; no fim não pode sobrar nenhum que
   tenha subido depois do começo:
   - macOS: `ps -axo pid,ppid,comm | grep -i "Felixo AI Core"`;
   - Linux: `ps -eo pid,ppid,comm | grep -i felixo`;
   - Windows (PowerShell): `Get-Process "Felixo AI Core" | Select-Object Id, StartTime`.
4. **Registrar.** Anexe o `evidencia.json` e diga a máquina (sistema, versão e se o app
   era o `.dmg`, o `.zip` ou a pasta desempacotada). O JSON não traz caminho pessoal.

## Referência medida (Windows, 21/10/2026)

Windows 11 Pro, pasta `win-unpacked` gerada do commit `85d688d` (sem rebuild do `node-pty`),
copiada para um caminho sem acento:

| Cenário | Resultado | Medidas |
| --- | --- | --- |
| `cancel` | `cancelled`, 0 sobreviventes | script de pós-instalação no ar em 5,8 s; árvore de 5 processos e 4 níveis (`app` → `cmd.exe` → `conhost.exe` → `app` → `app`); tudo resolvido 182 ms depois do cancelamento |
| `timeout` | `timeout`, 0 sobreviventes | prazo de 20 s (o mínimo, calculado a partir do tempo do `cancel`); mesma árvore |
| `cancel --control` | 2 sobreviventes | matar só o npm deixou o script e o neto vivos (os dois `Felixo AI Core.exe`) |

## Pontos de atenção

- **Caminho com acento no Windows.** O atalho `node.cmd` que o app gera grava o caminho do
  executável em UTF-8, e o `cmd.exe` lê na página de código OEM do console (cp850/cp437
  quando não há console visível, como na instalação). Com acento no caminho o `node` não é
  encontrado ("O sistema não pode encontrar o caminho especificado"). O cenário recusa esse
  caso logo no começo; rode a partir de uma pasta sem acento, como no CI. Isso é um defeito
  do produto, medido em 21/10/2026 e aberto como task própria.
- **Job object do Windows.** O libuv põe os filhos de um processo Node num job object que
  mata tudo quando o pai morre. Por isso, só um neto que escapou do job (ou a árvore real
  do npm, que passa pelo `cmd.exe`) deixa órfão no Windows; o controle do passo 2 mostra
  se ele ficou discriminante naquela máquina.
- **O cenário não toca na sua instalação.** Tudo roda em pasta descartável, com um prefixo
  e um cache de npm próprios. Nenhuma CLI sua é instalada ou removida.
- Se o smoke inteiro (`scripts/release-smoke.cjs`) falhar localmente antes do cenário, na
  etapa de entrega de catálogo do PTY, isso não é do instalador: use o
  `installer-kill-smoke.cjs` direto.

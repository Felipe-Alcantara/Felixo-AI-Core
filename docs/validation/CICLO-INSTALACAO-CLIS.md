# Ciclo de instalação das CLIs no Windows (runner e workflow)

O app instala as CLIs de IA (Claude, Gemini e Codex) sozinho na abertura. O defeito que mais
incomoda quem usa é ele **reinstalar a cada abertura** ou a cada atualização do app. Os testes
unitários do ciclo (`cli-auto-install.test.cjs`) usam instalador e detecção falsos; este runner roda
o **módulo de produção de verdade**, com o npm de verdade, e prova o ciclo inteiro. Ele roda sozinho
no CI, num Windows descartável, no workflow `Ciclo de instalação das CLIs (Windows)`
(`.github/workflows/ciclo-instalacao-clis.yml`).

## O que o runner prova

Quatro rodadas, cada uma abrindo o serviço de instalação automática (`registerCliAutoInstallHandlers`)
num perfil isolado:

| Rodada | Situação | Esperado |
| --- | --- | --- |
| 1 | primeira abertura, CLI ausente | **instala** |
| 2 | segunda abertura, mesma versão do app | **não reinstala** |
| 3 | "upgrade" (a versão do app muda), binário intacto | **não reinstala** |
| 4 | "upgrade" com o binário apagado | **reinstala** |

"Não reinstalar" é conferido por dois sinais: o estado devolvido (`idle`) **e** o número de chamadas
ao instalador (zero). Só o estado esconderia uma reinstalação adiada por arquivo travado, que
também termina em `idle`.

O alvo (`latest` do registry) é consultado uma vez e **fixado** nas quatro rodadas. O Gemini publica
um `nightly` por dia (o alvo medido em 22/10/2026 foi `0.67.0-nightly.20261022…`); sem fixar, uma
publicação no meio do script faria o app reinstalar com razão e o runner acusaria uma regressão que
não existe.

## Quando o workflow roda

- **Push na `main`**, só quando muda código que o ciclo executa (a lista está em `on.push.paths`, sem
  os testes) ou o próprio workflow. É onde nasce "alguém muda o `planAutoInstall` e volta a
  reinstalar sempre".
- **Toda segunda-feira, 09:30 UTC.** Pega uma publicação nova da CLI de terceiros que quebre a
  instalação vista pelo app, sem depender de commit nosso.
- **Sob demanda:** Actions > *Ciclo de instalação das CLIs (Windows)* > *Run workflow*. A opção
  `controle` liga o controle negativo (abaixo).

Fica **fora do CI de PR** (rede real, minutos de duração, falha por instabilidade do registry) e
**fora do Release** (uma falha de rede de terceiros atrasaria a publicação do instalador e deixaria
um pré-release órfão). O `official-cli-install.yml` também roda instalação real fora do PR, mas com
`npm install -g` cru: prova que o npm instala a CLI, não que o Felixo decide certo sobre reinstalar.

A matriz é `gemini` e `claude`. O **Codex fica de fora** de propósito: no Windows ele tem o caso
conhecido da dependência nativa opcional (`@openai/codex-win32-x64`) e misturaria outro sinal.

## Veredito e código de saída

Em CI, "falhou" tem dois donos muito diferentes: o ciclo do Felixo regrediu, ou o registry do npm e a
rede do runner tropeçaram. O runner termina com um veredito, e o workflow o transforma numa anotação
que diz de quem é o problema:

| Código | Veredito | Significa | O que fazer |
| --- | --- | --- | --- |
| 0 | `ok` | as 4 rodadas como esperado | nada |
| 1 | `regressao` | reinstalou quando não devia (rodadas 2 e 3) ou não reinstalou quando devia (rodada 4) | **defeito do Felixo.** Olhar o último commit que mexeu em `cli-auto-install*`, `managed-cli-*` ou no catálogo |
| 2 | `infra` | a instalação falhou **só** com assinatura de rede passageira, mesmo depois das repetições do app | **não é regressão.** O workflow já repetiu até 3 vezes; rodar de novo, e olhar o status do registry do npm se persistir |
| 3 | `falha-de-instalacao` | a instalação falhou sem sinal de rede | pacote publicado quebrado, dependência nativa ou defeito do Felixo; a saída do npm está no resumo da run |
| 4 | `erro-do-runner` | o ambiente isolado não estava limpo, a instalação automática estava desligada ou o script quebrou | o resultado não prova nada sobre o ciclo; ver o log |

A distinção entre 2 e 3 usa o resultado **cru** do instalador (`output`, `timedOut`, `errorCode`) e a
mesma regra do retry do app (`isTransientNetworkFailure`, em `electron/core/install-retry.cjs`), não
o texto de status da interface. Uma falha de rede misturada com uma de outro tipo conta como 3.

**Só o código 2 é repetido** (até 3 tentativas, com 60 s e 120 s de espera). Uma regressão nunca é
repetida: repetir mascararia o vermelho que importa.

A página da run mostra o veredito na primeira linha, a tabela das rodadas e a saída do npm das
tentativas que falharam. Log, relatório JSON e resumo ficam no artefato `ciclo-instalacao-<cli>`
(30 dias), também quando a run passa.

## Controle negativo

`--control-regressao` (no workflow, a opção `controle`) apaga o binário **antes** da rodada 2, então
ela reinstala. O runner PRECISA terminar em `regressao` (código 1). Serve para provar que o vermelho
é visível: se uma execução de controle terminar em qualquer outro veredito, o runner deixou de
enxergar o defeito e nada do que ele diz vale.

## Rodar à mão

```
cd app
npm ci --ignore-scripts          # basta: o ciclo só precisa do node_modules/npm
node scripts/cli-auto-install-real-repro.cjs --cli gemini
node scripts/cli-auto-install-real-repro.cjs --cli claude --report relatorio.json --summary resumo.md
node scripts/cli-auto-install-real-repro.cjs --cli gemini --control-regressao   # sai com 1
```

(`npm run repro:cli-auto-install -- --cli gemini` faz o mesmo.) Faz chamadas reais ao registry do npm.
Tudo acontece em pastas temporárias, com `HOME`, `APPDATA`, `LOCALAPPDATA` e `FELIXO_USER_DATA_DIR`
apontando para fora do que existe, só neste processo: **suas CLIs e o seu perfil do Felixo não são
tocados**, e o npm global do sistema nunca é consultado.

O teste offline do próprio runner (`app/scripts/cli-auto-install-real-repro.test.cjs`, 42 testes) roda
no CI de cada PR, sem rede: um instalador falso grava os arquivos que o npm gravaria e o módulo de
produção toma as decisões de verdade.

## Referência medida

| Onde | gemini | claude |
| --- | --- | --- |
| Windows 11 de desenvolvimento, Node 25 (22/10/2026) | 32 s / 3,6 s / 3,2 s / 45 s (rodadas 1 a 4) | 17 s / 2,1 s / 1,8 s / 36 s |
| `windows-latest`, Node 22.23.3 (run 39793776727) | ciclo de **237 s**; instalação de 131 s e de 65 s | ciclo de **42 s** |
| `windows-latest`, controle (run 39795135591) | 375 s, com a instalação extra | 78 s |

O job inteiro do gemini levou 5 min na run normal e perto de 7 na de controle; o `timeout-minutes`
(30 no job, 25 no passo) cobre o pior caso legítimo, que é o de infra com 3 tentativas.

## O que este runner não cobre

- **O app empacotado instalado pelo NSIS.** O runner usa o `node_modules/npm` do projeto, que mexe no
  mesmo código e no mesmo mecanismo, mas não passa por `process.resourcesPath` nem por
  `resources/npm-runtime`. Há uma task própria para isso.
- **macOS e Linux.** O isolamento do ambiente e o layout são escritos pensando no Windows; o código
  roda em outros sistemas, mas não há workflow nem medição para eles.
- **O Codex** (ver acima) e o **Openia**, que não passa pela instalação automática (instala por
  `pip`, sob confirmação).

# Guia do Usuário Final - Felixo AI Core

Status: concluido.
Última revisão: 2026-09-29.

Este guia é para quem quer instalar e usar o Felixo AI Core como aplicativo
desktop. O Felixo centraliza CLIs de IA instaladas no seu computador, como
Claude Code, Codex e Gemini, e organiza agentes, arquivos, notas, projetos e
ferramentas num canvas visual.

O canvas é o modo principal e recomendado. O modo de chat foi depreciado e
permanece acessível apenas para compatibilidade com sessões e exportações
antigas; novos fluxos devem ser iniciados por blocos e terminais do canvas.

## 1. Modos de uso

O Felixo AI Core pode ser usado de duas formas:

- **App instalado:** baixe um artefato em GitHub Releases e abra como aplicativo desktop. Este é o fluxo recomendado para usuários finais.
- **Código-fonte:** clone o repositório e rode `python3 start_app.py`. Este fluxo é voltado para desenvolvimento, testes e contribuição.

Em qualquer instalação, o app abre diretamente no canvas. O botão **Chat** da
barra continua disponível para consultar uma sessão legada, mas não é a
superfície indicada para iniciar trabalho novo.

No modo instalado, o auto-update fica ativo apenas quando o app está empacotado. No modo código-fonte, o launcher tenta atualizar a branch atual antes de iniciar; no macOS, o prompt de atualização forçada vem confirmado por padrão. A atualização manual continua disponível com `python3 start_app.py --update`.

## 2. Instalação por sistema operacional

Acesse a página de Releases do projeto:

https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases

### Linux

Artefatos configurados:

- `.AppImage` para `x64` e `arm64`.
- `.deb` para `x64`.

Use o AppImage quando quiser o fluxo mais simples e compatível com auto-update:

```bash
chmod +x Felixo-AI-Core-*.AppImage
./Felixo-AI-Core-*.AppImage
```

Use o `.deb` quando quiser instalação tradicional em Debian/Ubuntu:

```bash
sudo dpkg -i Felixo-AI-Core-*.deb
```

Observação: o `.deb` é útil para instalação tradicional, mas o fluxo de atualização dentro do app deve priorizar AppImage.

### Windows

Artefato configurado:

- `.exe` com instalador NSIS para `x64`.

Baixe o arquivo `Felixo-AI-Core-*-win-x64.exe`, execute o instalador e siga as etapas. Como a distribuição pública ainda pode não estar assinada digitalmente, o Windows SmartScreen pode exibir um alerta. Nesse caso, clique em **Mais informações** e depois em **Executar assim mesmo**, desde que você tenha baixado o arquivo da página oficial de Releases.

Ainda não há versão portátil oficial em `.zip` para Windows.

#### Instalação silenciosa (script)

Para instalar ou atualizar sem janelas, rode o instalador com `/S` (e, se quiser outra pasta, `/D=C:\caminho`, sempre por último). Se o Felixo estiver aberto, o instalador **fecha o app** e segue. Isso vale também quando a instalação anterior está numa pasta registrada com nome curto do Windows (`C:\Users\FULANO~1\...`). Se mesmo assim a versão anterior não puder ser removida, o instalador termina com **código de saída 2** em vez de esperar indefinidamente.

Instalação "para todos os usuários" pede administrador. Um usuário sem admin rodando `/S` numa máquina com instalação para todos fica parado no pedido de elevação do Windows (UAC). Em script, rode o instalador elevado ou use a instalação por usuário, que é o padrão do Felixo.

### macOS

Artefatos configurados:

- `.dmg`.
- `.zip`.

Baixe o arquivo adequado à arquitetura publicada na release, abra o `.dmg` e arraste o app para **Aplicativos**.

#### A primeira abertura é bloqueada — isso é esperado

A distribuição pública **não é assinada nem notarizada** pela Apple. O macOS marca todo arquivo baixado da internet com um atributo de quarentena e, como o app não tem assinatura reconhecida, o Gatekeeper recusa abri-lo.

A mensagem varia conforme a versão do macOS, e nem sempre ela deixa claro que se trata de bloqueio de segurança. Você pode ver:

- "Não é possível abrir porque a Apple não pode verificar se ele está livre de malware."
- "O app está danificado e não pode ser aberto."
- Uma janela pedindo para **escolher um aplicativo na App Store** para abrir o arquivo.

A terceira é a mais confusa: o macOS não reconhece o `.app` como aplicativo executável e o trata como um arquivo qualquer. Não significa que o Felixo precise ser instalado pela App Store, nem que o download esteja corrompido.

**Para abrir (escolha um caminho):**

*Caminho 1 — Ajustes do Sistema (macOS Ventura ou mais recente):*

1. Tente abrir o app normalmente e feche o aviso.
2. Vá em **Ajustes do Sistema > Privacidade e Segurança**.
3. Role até o final: haverá uma linha citando o Felixo AI Core, com o botão **Abrir Assim Mesmo**.
4. Clique nele e confirme com sua senha ou Touch ID.

Este passo só é necessário uma vez por versão instalada.

*Caminho 2 — Terminal (funciona em qualquer versão, inclusive quando o app aparece como "danificado"):*

```bash
xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"
```

O comando remove o atributo de quarentena do app já instalado. Depois disso ele abre normalmente pelo Launchpad ou pelo Finder.

*Caminho 3 — Botão direito (macOS mais antigos):*

Clique com o botão direito no app, escolha **Abrir** e confirme novamente em **Abrir**. Em versões recentes do macOS este caminho deixou de funcionar de forma confiável; use o caminho 1 ou 2.

> **Só faça isso com arquivos baixados da [página oficial de Releases](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases).** Esses passos desativam uma proteção real do sistema — a verificação existe justamente para barrar software de origem desconhecida. Confira o `sha256` publicado na release se quiser validar o download.

Cada atualização baixada recria a quarentena, então o procedimento pode precisar ser repetido quando você instalar uma versão nova manualmente.

## 3. CLIs externas e contas de IA

O Felixo AI Core não inclui modelos de IA pagos. Ele detecta e executa CLIs disponíveis no sistema operacional e, no gerenciador de modelos, pode acionar instaladores oficiais via `npm` para Codex, Claude Code e Gemini.

Perfis padrão atuais:

- `Codex CLI` com comando `codex`.
- `Claude Code CLI` com comando `claude`.
- `Gemini CLI` com comando `gemini`.
- `Codex App Server` com comando `codex app-server`.
- `Gemini ACP` com comando `gemini --experimental-acp`.
- `Openia` como launcher das interfaces compatíveis com OpenRouter.

CLIs e ferramentas detectadas pelo app:

- `claude`, `codex`, `gemini` e `ollama`, como providers de IA.
- `git`, para operações Git e contexto de repositório.
- `node` e `python3`, para runtimes auxiliares quando algum fluxo precisar deles.

Autentique cada CLI no terminal, seguindo a documentação oficial do provider. O Felixo pode abrir o comando de login em um terminal do sistema, mas a configuração de chaves/API, login ou assinatura continua acontecendo na própria CLI ou no ambiente do sistema. A exceção é o launcher Openia: sua chave do OpenRouter é configurada no formulário do agente, sem ser exibida novamente ou armazenada no canvas.

No configurador do Openia, **Login do sistema** usa a chave global do Openia. Ao escolher ou criar uma conta, a chave digitada fica cifrada e vinculada somente àquele perfil; uma conta sem chave não herda a chave global e é bloqueada antes da abertura do terminal. O campo mostra apenas se existe uma chave, nunca o valor dela. Se o sistema estiver sem chaveiro seguro, o Felixo recusa guardar a chave.

Antes de abrir a ferramenta, o Openia testa a chave no OpenRouter. Se ela for recusada (inválida, revogada, sem permissão ou com o limite esgotado), o terminal mostra a resposta do OpenRouter em cerca de um segundo e o bloco ganha a faixa **O OpenRouter recusou a chave**, que diz onde trocá-la: Agente → Openia → a conta do bloco (ou **Login do sistema**, quando o bloco não usa conta) → Chave do OpenRouter. Sem internet, o Openia só avisa que não conseguiu testar a chave e abre a ferramenta mesmo assim. Com o saldo zerado, ele avisa que modelos pagos vão falhar e também abre: os modelos gratuitos (`:free`) continuam funcionando.

Ao remover uma conta, o Felixo pede confirmação e tenta apagar a pasta de login
do perfil. Se essa pasta já tiver sido removida (`ENOENT`), a remoção continua;
em qualquer outra falha, a conta e sua credencial são preservadas, um diagnóstico
seguro é exibido e o botão pode ser tentado novamente depois de corrigir o
bloqueio.

Links oficiais úteis:

- Claude Code: https://docs.anthropic.com/en/docs/claude-code/getting-started
- Codex CLI: https://developers.openai.com/codex/cli
- Gemini CLI: https://google-gemini.github.io/gemini-cli/docs/get-started/
- Git: https://git-scm.com/downloads
- Ollama: https://ollama.com/

Se uma CLI estiver instalada, mas não for detectada, confirme no terminal:

```bash
claude --version
codex --version
gemini --version
git --version
```

Se o comando funcionar no terminal, mas não no app, reinicie o Felixo. Em instalações fora do `PATH` padrão, defina `FELIXO_CLI_PATHS` com uma ou mais pastas extras onde os executáveis ficam instalados. Para ver em quais pastas o app procura, use o diagnóstico de CLIs: a lista **PATH que o app enxerga** fica no fim dele (veja "Uma CLI não foi detectada" em [Solução de problemas](#7-solução-de-problemas)).

### Cadeia de contas: seguir em outra conta com a sua confirmação

Com mais de uma conta cadastrada (duas do Codex, ou uma do Claude e uma do
Codex, por exemplo), a **cadeia de contas** ajuda a continuar um trabalho em
outra conta quando a atual bate o limite de uso, perde o login ou fica sem
crédito. Ela vem **desligada** e nunca troca de conta sozinha: toda troca mostra
de qual conta sai, para qual vai e por quê, e só acontece depois que você
confirma. A regra completa está na
[Política de Contas](../projeto/POLITICA-CONTAS.md).

**Como ligar.**

1. Abra **Ferramentas → Limites e uso** e escolha a aba **Cadeia**.
2. Ligue **Cadeia de contas**. Ela começa na estratégia **Ordem manual**, com
   todas as contas **desabilitadas**: habilite as que podem receber uma troca.
   Nenhuma conta passa a ser usada sem uma ação sua.
3. Ordene a lista pelos botões **↑** e **↓** (ou Alt+↑/↓ na linha focada). A
   lista pode misturar provedores.
4. Se quiser, declare em cada conta a **cobrança** (Assinatura ou Uso) e o
   **multiplicador** do plano, de 1 a 100 (20 para um plano "20x", por exemplo).
   Sem declaração, o multiplicador vale 1 e aparece como "não declarado".

As contas do Gemini aparecem travadas, com o motivo "Fora da cadeia até o app
conferir o login do Gemini". O **Login do sistema** nunca entra na cadeia nem
recebe uma troca, porque a identidade dele muda por fora do app.

**Quando uma conta está apta.** Uma conta só recebe uma troca quando está
habilitada, fora de espera, sem uma janela de uso zerada numa medição recente e
com o login **conferido pela própria CLI, naquela conta, nos últimos 15
minutos**. O botão **Conferir agora** faz essa checagem. Ela é local: prova que a
credencial existe na pasta da conta, não que o servidor vai aceitá-la. O app
nunca confere login em segundo plano. Numa proposta, ele confere no máximo 3
contas, com no máximo 2 CLIs rodando ao mesmo tempo.

**Estratégias.** Todas escolhem só entre as contas aptas. O empate fica com a
ordem manual.

| Estratégia | Qual conta vem primeiro |
| --- | --- |
| **Ordem manual** (padrão ao ligar) | A primeira apta na ordem da lista |
| **Rodízio** | A primeira apta depois da última que de fato recebeu uma troca. Recusar ou uma abertura que falhou não gastam a vez |
| **Mais quota primeiro** | A de maior capacidade, com `capacidade = restante% × multiplicador`. O restante% é o da janela mais apertada (5 h com 90% e semanal com 5% dá 5%). Assim, 50% num plano 20x (1.000) vem antes de 100% num plano 1x (100). Contas sem medição recente vão depois de todas as medidas, na ordem manual |
| **Assinatura antes de uso** | Primeiro as de assinatura, depois as de cobrança desconhecida, por último as de cobrança por uso. Cobrança desconhecida nunca é tratada como assinatura |

"Mais quota" usa só as medições feitas nos últimos 15 minutos. O diálogo de troca
tem o botão **Medir agora**. Comparar capacidade entre provedores diferentes é
uma aproximação, por isso o diálogo mostra os números e a fonte, e a decisão é
sua.

**Quando uma conta bate o limite.**

- O bloco mostra uma faixa, por exemplo "Limite da conta Pessoal às 14:32 · em
  espera até 16:40", com **Ver opções** e **Não era limite**. O painel
  **Notificações** ganha um item fixo com as propostas pendentes. Nenhuma janela
  abre sozinha, então um Enter digitado em outro terminal não confirma nada.
- A conta entra **em espera** até o horário de volta: o que a CLI imprimiu, o de
  uma medição recente ou, sem nenhum dos dois, uma estimativa (5 h no Claude,
  15 min nos demais). Reiniciar o app não tira a conta da espera. **Não era
  limite** libera a espera e silencia aquele aviso.
- **Ver opções** abre **Trocar de conta?**. O diálogo mostra a conta de origem, o
  horário da detecção, a linha que a CLI imprimiu (com segredos mascarados), até
  quando a conta fica em espera e de onde veio esse horário. Mostra também as
  contas aptas na ordem da estratégia, com a primeira marcada como
  **Recomendada** e o motivo da posição, as contas que estão fora e por quê, e o
  custo: o tamanho do contexto que será enviado e quem paga (a assinatura da
  conta de destino ou créditos por uso).
- O foco começa na opção recomendada, e Enter sobre ela não confirma. Os botões
  são **Abrir bloco novo em ‹destino›**, **Agora não** (também com Esc), **Não era
  limite** e **Fixar este bloco na conta atual**.
- Num bloco no **Login do sistema**, o app só avisa: não há conta própria para
  pôr em espera nem para trocar.

**O bloco novo leva o contexto.** Confirmar abre um bloco **novo** na conta de
destino, com o histórico do terminal antigo como ponto de partida, com segredos
mascarados e uma única vez. O último pedido não é redigitado: o agente é
orientado a conferir o estado real do repositório antes de refazer qualquer
ação. A caixa **Pedir para o agente continuar assim que abrir** vem marcada;
desmarcada, o contexto chega sem ser enviado. Se a troca muda de provedor, o
diálogo avisa que a retomada nativa não vale entre provedores e que o histórico
irá para o outro provedor.

O terminal antigo fica **parado e intacto**. O app não escreve nele, não o pausa
e não o fecha. A faixa dele passa a apontar para o bloco que continuou o
trabalho, e só você o fecha. Dois cuidados:

- Se o terminal antigo ainda estiver produzindo saída, a confirmação pede um
  segundo "abrir mesmo assim".
- O Claude pode estar programado para continuar sozinho na conta antiga
  ("continuing automatically at …"). O diálogo avisa, porque isso poria dois
  agentes no mesmo trabalho. Se não quiser isso, pressione Esc no terminal antigo
  ou feche-o; o botão **Ir para o terminal antigo** só leva o foco até ele.

**Bloco fixo e bloco na cadeia.** O campo **Conta** de cada bloco tem um modo:

- **Fixa** é o padrão. Um bloco aberto com uma conta escolhida à mão continua
  nela, inclusive os blocos que já existiam antes da atualização. Quando bate o
  limite, recebe o aviso e a conta entra em espera, mas **nunca** recebe uma
  proposta de troca. A faixa oferece **Passar responsabilidade…**, com o motivo
  já preenchido, para você escolher o próximo agente e a próxima conta.
- **Cadeia** vale para o bloco aberto com **Automática (cadeia)** e para o bloco
  criado como continuação confirmada.
- O selo do bloco mostra "Pessoal · fixa", "Pessoal · cadeia" ou "Login do
  sistema". Nos detalhes do terminal, **Fixar nesta conta** e **Voltar para a
  cadeia** mudam o modo a qualquer momento. Desligar a cadeia faz todos os
  blocos pararem de receber propostas. Nada disso muda um processo que já está
  rodando.

**Automática (cadeia).** Com a cadeia ligada, o campo **Conta** ganha essa opção
nos provedores com checagem de login. Antes de abrir, a tela mostra qual conta
será usada (por exemplo, "A cadeia vai usar: Trabalho, primeira apta na ordem
manual"), e o clique em **Abrir** é a confirmação. Um bloco novo só considera
contas do mesmo provedor do agente escolhido. Sem conta apta, a abertura é
recusada com os motivos: ela **nunca** cai no Login do sistema.

**Falhas que não são limite.** Queda de rede, servidor sobrecarregado e tempo
esgotado mostram um aviso curto ("trocar de conta não resolve"), sem espera e
sem proposta. O limite de um **modelo** do Codex ("usage limit for ‹modelo›")
pede troca de modelo, não de conta. Um caso ambíguo (um 403, por exemplo)
pergunta: **Tratar como limite?**

**Registro de trocas.** A aba **Trocas** do painel **Limites e uso** lista as
últimas 50 trocas, avisos e decisões, com data e hora, origem → destino, motivo e
estado, e o botão **Ir para o bloco**. O registro nunca guarda o histórico do
terminal, chaves ou caminhos de perfil.

**O que o app nunca faz sozinho.**

- Trocar de conta sem a sua confirmação.
- Trocar a conta de um terminal que já está rodando.
- Escrever, pausar ou fechar o terminal antigo.
- Reenviar o último pedido ao bloco novo.
- Abrir um bloco no Login do sistema porque a lista de contas falhou.
- Conferir login ou medir uso em segundo plano.

**Mudanças que você pode notar ao atualizar.**

- **Credenciais herdadas.** Um terminal com conta própria não herda mais as
  chaves de API do ambiente do app: saem `ANTHROPIC_API_KEY`,
  `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` e
  `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (Claude); `OPENAI_API_KEY`,
  `CODEX_API_KEY` e `CODEX_ACCESS_TOKEN` (Codex); `GEMINI_API_KEY`,
  `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` e
  `GOOGLE_GENAI_USE_VERTEXAI` (Gemini). Antes, uma chave de API no ambiente fazia,
  por exemplo, o Claude de uma conta de assinatura cobrar por uso, e a conta
  escolhida deixava de ser quem paga. Se você usava um perfil de conta junto com
  uma chave de API de propósito, abra o terminal no **Login do sistema**, que
  continua igual, ou faça o login por chave dentro da própria CLI naquele perfil.
  A aba **Cadeia** mostra só os **nomes** dessas variáveis quando estão no
  ambiente do app, nunca os valores.
- **Troca silenciosa corrigida.** Antes, se a lista de contas falhasse ou a conta
  salva tivesse sido removida, o configurador abria o bloco no Login do sistema
  sem avisar. Agora aparece "Não foi possível carregar as contas; o bloco não vai
  abrir no login do sistema por engano." (com **Tentar de novo**) ou "A conta
  salva "‹nome›" não existe mais. Escolha outra conta ou o login do sistema.", e
  a abertura fica bloqueada até você escolher.
- **Retomada na mesma conta.** Uma conversa só é retomada na conta em que foi
  aberta. Se o bloco estiver em outra conta, o cartão mostra **A conversa é de
  outra conta** e você escolhe entre a lista da CLI e uma conversa nova (ver
  [Retomar conversas de agentes](#retomar-conversas-de-agentes)).
- **Codex reiniciado após se atualizar.** O texto de uma passagem de
  responsabilidade não é reenviado, para o agente não recomeçar a tarefa nem
  cobrar de novo. O bloco avisa e sugere `/resume` ou reenviar à mão.
- **Sessão viva de outra conta.** Se a interface recarregar e o bloco apontar
  para uma conta diferente da do processo que está rodando, o app recusa
  reanexar ("A sessão viva deste bloco está em outra conta") e oferece reiniciar
  o terminal na conta do bloco.
- **Remover conta com terminal aberto** pede confirmação e lista os blocos
  afetados. A conta sai também da cadeia, e o registro de trocas continua com o
  nome dela.

**O orquestrador do chat também pede confirmação.** Quando o orquestrador
precisaria trocar de família de provedor (de Claude para Codex, por exemplo), no
fallback, no último recurso ou no meio de uma tarefa, a conversa mostra um card
com de → para (provedor e modelo), o motivo, a regra, o prazo e o custo ("muda de
provedor e de conta de cobrança; roda no login do sistema do destino"), com
**Trocar para ‹provedor›** e **Não trocar**. Enquanto isso, a linha de status diz
"Aguardando sua confirmação…". Sem resposta em 10 minutos, vale como recusa: a
tarefa falha com uma mensagem clara e nenhum provedor é trocado. Trocas dentro da
mesma família (outro modelo, ou Codex → Codex App Server) seguem sem pergunta. O
orquestrador continua no Login do sistema e não usa as contas da cadeia.

## 4. Configuração dentro do app

### Modelos

O gerenciador **Gerenciar modelos** abre pela tela Chat, no ícone **Configurar
modelos** da barra lateral. No canvas, **Ferramentas → Modelos** lista os modelos
importados e permite remover um.

Você pode:

- Ver os modelos/CLIs importados.
- Detectar CLIs oficiais instaladas.
- Diagnosticar por que uma CLI não aparece, sem instalar nada: em **CLIs oficiais**, o ícone **Diagnosticar CLIs** (ao lado de **Atualizar detecção**) mostra, em cada cartão de Codex, Claude Code e Gemini, a causa ("Não instalada", "Instalada, mas invisível ao app", "Bloqueada por permissão"…) e a próxima ação. Com o diagnóstico na tela, **Instalar** só aparece onde reinstalar resolve. Abaixo dos cartões, **PATH que o app enxerga** (recolhido) lista as pastas em que o app procurou as CLIs, na ordem em que são consultadas — a primeira que tem o comando vence — e de onde cada uma veio: `FELIXO_CLI_PATHS`, pasta pessoal, sistema, PATH herdado, ferramentas do app ou CLIs instaladas pelo app. **Copiar texto para o suporte** copia um resumo com essa lista e a posição da pasta de cada CLI, sem nome de usuário (a pasta pessoal vira `~` e o nome vira `<usuario>`, também fora dela), URL nem segredo. Fechar o gerenciador descarta o diagnóstico.
- Instalar CLIs oficiais usando o instalador configurado para cada provider.
- Abrir login oficial da CLI no terminal do sistema.
- Adicionar uma CLI pelo comando, por exemplo `codex`, `claude` ou `gemini`.
- Remover modelos cadastrados.
- Clicar em um modelo no painel **Modelos** para configurar o modelo do provider e o effort quando o adapter suportar. No Claude Code, os níveis são os do `claude --help` (2.1.285): low, medium, high, xhigh e max; no Codex, dependem do modelo.

Para o Openia, a configuração do agente consulta interfaces e modelos em tempo
real. A validação da chave acontece novamente no momento de abrir o terminal:
sem conta, consulta o login global; com conta, consulta a chave cifrada daquele
perfil. Assim, trocar de perfil não reaproveita silenciosamente a credencial de
outra origem.

### Orquestrador

Abra **Ferramentas → Orquestrador** para ajustar:

- modo de operação;
- workflow padrão;
- skills;
- contexto personalizado;
- limites de agentes, turnos, tempo, custo estimado e tokens;
- modelos preferidos ou bloqueados para spawn;
- confirmação para ações sensíveis.

### Felixo

Abra **Configurações** (a engrenagem no pé da faixa de ícones do canvas) para ajustar:

- memórias globais do orquestrador;
- tema visual;
- informações locais do app, como quantidade de projetos, automações e runtime.

As configurações de CLIs ficam em **Modelos**. A área **Felixo** não é uma tela de cadastro de chaves de API.

### Modo Performance em computador mais fraco

Em **Configurações**, o **Modo Performance** desliga o céu animado, o minimapa e
as transições de painéis, sem mudar nada de lugar. Em computadores com até 4
processadores lógicos, o Felixo sugere ligá-lo uma vez (**Ligar o Modo
Performance?**): o modo só liga se você clicar em **Ligar Modo Performance**, e
**Agora não** faz a sugestão não aparecer de novo. Dá para ligar ou desligar
depois nas Configurações.

### Placa de vídeo (opção avançada)

Em computadores com duas placas de vídeo (por exemplo, uma integrada e uma
dedicada), **Configurações → Renderização e recuperação → Opções avançadas:
placa de vídeo** permite escolher:

- **Automático** — o sistema decide, como sempre foi. É o padrão.
- **Integrada** — gasta menos bateria.
- **Dedicada (experimental)** — costuma deixar a interface mais fluida, mas
  gasta mais bateria.

A escolha vale a partir da **próxima abertura** do Felixo. A mesma tela mostra a
placa que está desenhando o app agora ("Em uso agora") e o que vale nesta
abertura e na próxima. Com uma placa só, a opção não aparece (o adaptador de
vídeo por software que o Windows sempre lista, e a NPU de alguns processadores,
não contam como placa); no modo compatível (sem GPU), ela fica salva mas não
tem efeito. Se você já tinha escolhido Integrada ou Dedicada e o Felixo não vê
mais duas placas (por exemplo, no modo compatível ou com a placa externa
desconectada), a opção continua aparecendo, só com **Automático** disponível,
para você poder desfazer a escolha.

**Volta automática.** Quando a escolha muda o jeito como o app liga a placa (a
Dedicada em qualquer sistema; a Integrada no Windows e no macOS), cada abertura
é conferida: se o Felixo não terminar de abrir (travou ou fechou antes), se a
placa subir sem aceleração ou se o processo de vídeo cair, a escolha volta
sozinha para **Automático** e o app mostra o aviso **Placa de vídeo voltou para
Automático**. Depois de ler, clique em **Entendi**. Dá para escolher de novo
quando quiser.

Como cada sistema escolhe a placa:

- **Linux**: a Dedicada usa o ANGLE sobre Vulkan. A Integrada usa o caminho
  gráfico padrão; se o app foi aberto com variáveis que mandam o vídeo para a
  placa dedicada (como o `prime-run` ou o "abrir com a placa de vídeo dedicada"
  do ambiente gráfico), o Felixo fecha e reabre sozinho uma vez, com essas
  variáveis limpas (no AppImage e no `.deb`). Se você abrir o Felixo de novo
  enquanto ele ainda reabre (nenhuma janela apareceu), essa abertura fica no
  Automático e não muda a sua escolha. Se a reabertura não acontecer, a
  próxima vez que você abrir o Felixo a escolha volta para **Automático**, com
  o aviso, e ele não tenta reabrir de novo; para usar a Integrada nesse caso,
  abra o Felixo sem essas variáveis.
- **Windows e macOS**: o app pede ao Chromium a placa de alto desempenho ou a de
  baixo consumo. Num Mac com placa NVIDIA, a **Dedicada** aparece desligada: o
  Chromium sempre usa a placa de baixo consumo nesses Macs, então ela não teria
  efeito. Automático e Integrada continuam disponíveis.
- Em outros sistemas a opção aparece desligada, com o motivo.

### System Design (guias dos agentes)

Em **Configurações** (a engrenagem no pé da faixa de ícones do canvas), o bloco **System Design** sincroniza
os repositórios de padrões que os agentes seguem e mostra o índice de cada um. A sincronização
de repositórios privados usa a autenticação segura já configurada no Git
(credential helper, Keychain do macOS, Credential Manager do Windows ou
equivalente). Não coloque usuário, senha, token ou parâmetro secreto na URL do
repositório; quando uma configuração legada contém esse formato, o app remove
essas partes antes de salvar e de chamar o Git.

**Seus guias.** É uma lista, então dá para seguir dois padrões ao mesmo tempo (por
exemplo, o Felixo e o Doktor). Em **Adicionar guia**, cole a URL do repositório e a
branch; o guia é sincronizado em seguida. Cada guia mostra o próprio estado
(sincronizado, ainda não sincronizado ou sem acesso à fonte — usando o último
conteúdo), a contagem de documentos e o índice. A lixeira tira um guia da lista.

**Guia privado.** Quando você clica (Sincronizar, Adicionar guia, a lixeira, Voltar ao
padrão ou "Usar estes guias"), o Git pode abrir a janela de login do sistema — no
Windows, a do Git Credential Manager. No macOS e no Linux essa janela só existe com o
Git Credential Manager instalado; sem ele, salve a credencial do Git pelo terminal (por
exemplo, com `gh auth login`) e sincronize de novo. A sincronização que o app faz
sozinho nunca abre essa janela: se um guia pede login, aparece no canto de baixo o
aviso **Um guia do System Design pede login**, e **Fazer login e sincronizar** tenta
de novo podendo pedir. O GitHub também pede login para um endereço que não existe, então confira o
endereço antes de entrar. Enquanto isso, os agentes seguem com o último conteúdo
baixado.

- **Padrão do app:** sem escolha sua, vale o Felixo System Design. Se o padrão do app
  mudar numa atualização, você passa a recebê-lo.
- **Lista escolhida por você:** nunca é trocada por um novo padrão do app. O botão
  **Voltar ao padrão do app** descarta a lista e sincroniza de novo.
- **Instalação anterior a esta versão:** configuração igual ao padrão vira "segue o
  padrão"; qualquer outra vira uma lista com aquela fonte, preservada como estava.
- Uma URL inválida é recusada com o motivo, sem alterar nada.

**Guias por projeto.** Um projeto pode trazer os próprios guias, e aí eles valem nos
terminais daquele projeto **no lugar dos seus** — o lembrete do agente avisa isso. São
três caminhos, que somam:

- **Arquivo no repositório** `.felixo/system-design.json`, versionado junto com o
  projeto (quem clona recebe). Formato: `{ "guias": [ { "url": "https://github.com/conta/guia", "branch": "main" } ] }`.
  Como ele vem de fora, **nunca vale sozinho**: em **Por projeto**, o cartão do projeto
  mostra as URLs que o arquivo pede, e só depois de **Usar estes guias** elas são
  buscadas e passam a valer. **Ignorar arquivo** para de perguntar. Se o arquivo mudar
  depois, a confirmação cai e ele volta a pedir conferência.
- **Pasta de guias** na raiz do repositório, chamada `Padrão de qualidade - <nome>/`.
  Vale por padrão, sem rede (o agente lê os arquivos dali); a chave no cartão desliga.
- **Escolha no app:** em **Por projeto**, adicione guias só para aquele projeto.

A seção **Por projeto** lista os projetos em uso: no canvas, as pastas dos terminais;
no chat, os projetos ativos. O app só lê projetos registrados em **Projetos** (ou uma
pasta escolhida no seletor). Terminais já abertos não mudam de texto; os próximos já
nascem com os guias certos. O bloco enviado ao orquestrador do chat também diz quais
guias valem em cada projeto ativo.

Se o clone, fetch ou reset falhar, a mensagem preserva a etapa, o código, o
branch e o repositório sem a credencial. O stderr, cabeçalhos de autorização e
a linha de comando completa não são persistidos no SQLite, enviados ao QA
Logger nem devolvidos ao renderer.

Para ler um guia sem sair do app, abra **Ver índice (N documentos)** e clique no
guia (ou use Enter/Espaço com o foco nele). Ele abre renderizado logo abaixo do
item, numa moldura com rolagem própria. Fica um guia aberto por vez: abrir outro
fecha o anterior, e clicar de novo fecha. O conteúdo vem do cache da última
sincronização, então a leitura funciona sem rede. Pelo teclado, Tab entra no
texto e as setas ou PageDown rolam. A mesma seção aparece nas Configurações do
canvas (engrenagem no rodapé do rail) e no modal de Configurações do chat.

### Projetos, Code, Notas e Exportação

- **Projetos:** adicione um repositório individual ou detecte vários repositórios dentro de um workspace. A lista aparece em ordem alfabética, e o mesmo vale para os arquivos ao abrir um projeto (pastas primeiro). A ordenação ignora acento e maiúscula — `Álbum` fica junto de `alfa`, não no fim — e compara número por valor, então `projeto2` vem antes de `projeto10`.

  Ao navegar os arquivos de um projeto, **clicar num arquivo o abre num editor de terminal** para ler e editar ali mesmo. O editor é o do seu `$VISUAL`/`$EDITOR`, se você tiver um configurado; senão o app usa o primeiro que encontrar instalado (`nano`, `micro`, `vim`, `vi`; `notepad` no Windows). Passando o mouse sobre a linha aparecem duas ações extras: **rodar num terminal**, oferecida só em arquivos que o app sabe executar (`.py`, `.js`, `.ts`, `.sh`, `.ps1`, executáveis), e **abrir num bloco do canvas**, para deixar o arquivo visível enquanto você trabalha em outra coisa.
- **Code:** veja status, branch, diff e commits recentes dos projetos ativos. O painel atual é read-only.
- **Notas:** registre notas associadas ao uso do app/projetos. Elas são a
  superfície de memória recomendada no canvas; o modo de chat legado também
  consegue consultar as notas persistidas.
- **Exportar:** exporte sessões de chat legadas em JSON compacto, Markdown ou
  texto simples.
- **Excluir uma conversa do chat legado:** passe o mouse (ou chegue com Tab) na
  linha da conversa em **Recentes**, ou no painel **Pesquisar** para as mais
  antigas, e clique na lixeira. Depois de confirmar, a conversa é arquivada no
  banco local e some da lista. Se estava aberta, a tela volta para um chat novo.
  Ainda não há como restaurá-la pela interface.

Para usar um arquivo de um projeto no canvas, a pasta precisa ter sido escolhida
no seletor nativo de projetos. Caminhos digitados ou enviados por outro fluxo
nao viram raizes de projeto; o app resolve a pasta real e bloqueia a raiz do
disco, pastas inexistentes e links que saiam dela. Arquivos fora dos projetos
continuam podendo ser escolhidos explicitamente pelo seletor de arquivos.

### Abrir arquivos de texto no canvas

Um bloco de arquivo pode apontar para um arquivo que já existe no disco, para ler e editar sem sair do canvas. Duas formas de abrir:

- na aba **Projetos**, navegue até o arquivo e use o botão de abrir no canvas (ao lado do de rodar);
- no botão **Arquivo** da barra, escolha **Abrir arquivo existente…** para pegar qualquer arquivo pelo seletor do sistema.

O bloco não é dono desse arquivo: ele não cria nem apaga nada, só lê e grava no lugar. O caminho aparece logo abaixo do título, e o bloco acompanha o arquivo ao vivo — se um agente editar por fora, o conteúdo se atualiza sozinho.

No topo do bloco, o lápis alterna entre editar e visualizar. Em `.md`, `.markdown` e `.mdx` a visualização mostra o markdown formatado; em qualquer outro arquivo mostra o texto como está, em fonte monoespaçada, preservando indentação e quebras de linha — formatar markdown num `.py` comeria justamente a indentação, que ali é o programa.

O preview de Markdown trata o conteúdo recebido de agentes, arquivos e
histórico como externo: sequências ANSI de terminal são removidas, o texto é
limitado a 200.000 caracteres antes do parser e HTML bruto é sanitizado antes
de virar interface, sem scripts, iframes, CSS remoto ou atributos de evento.
Links aceitam somente `http:`, `https:`, `mailto:` e âncoras locais; um
`mailto:` só pode trazer destinatário, cópia, cópia oculta, assunto e corpo. Um
link recusado continua aparecendo como texto, sem abrir nada. Imagens
remotas viram texto alternativo e não geram request automático; uma imagem
`data:` precisa ser rasterizada e ter no máximo 2 MiB. Imagens relativas só
viram `file://` quando o bloco tem o `baseDir` de um arquivo já autorizado; sem
essa origem, o preview mostra o texto alternativo em vez de tentar acessar o
disco.

Por segurança, o app só abre arquivos que estejam dentro de um projeto registrado ou que você tenha escolhido no seletor. As escolhas do seletor valem enquanto o app estiver aberto: ao reabrir, um bloco apontando para fora dos projetos pede que você escolha o arquivo de novo.

### Nomes dos blocos

- Todo bloco (terminal, nota, arquivo, grupo) pode ser **renomeado pelo cabeçalho** — clique no título e digite.
- Ao **criar** um bloco, os botões da barra (Nota, Arquivo, Grupo) abrem um campo de nome opcional; o menu do Terminal também tem o campo "Nome". Deixar vazio usa o nome padrão.
- O nome alimenta a **Pesquisa** do canvas e, em terminais com agente, é informado ao próprio agente na inicialização: ele sabe seu nome, o diretório/projeto em que está e que trabalha num ambiente multi-agente (deve se identificar nos arquivos compartilhados e não assumir que está sozinho no repositório).
- Renomear um terminal **depois** que o agente já iniciou envia uma única atualização de nome ao agente quando a edição é confirmada.

### Abrir agentes e seguir planos

- O botão grande **Agente** abre imediatamente outro terminal com as últimas configurações reutilizáveis: CLI, modelo, esforço, permissões, projeto e arquivo de planejamento. O nome do terminal continua pontual para evitar criar vários blocos com o mesmo nome sem intenção.
- A seta ao lado de **Agente** abre as configurações completas. Em **Arquivo de planejamento**, informe um caminho ou selecione qualquer tipo de arquivo no explorador.
- Quando houver um arquivo de planejamento, o agente recebe no primeiro prompt a instrução para lê-lo antes de começar e seguir suas funções, etapas e decisões. O conteúdo do arquivo não é copiado para o app; o agente recebe apenas o caminho e decide como lê-lo.
- Ao montar uma **Fila** e iniciar vários agentes de uma vez, os blocos entram em uma grade próxima de quadrada, crescendo por linhas e colunas e evitando os blocos já existentes no canvas.
- O botão **Organizar**, ao lado de **Agente**, também monta essa matriz para agentes já abertos em momentos diferentes. Ele move apenas agentes no nível principal do canvas; shells, arquivos, notas, grupos e agentes dentro de grupos permanecem onde estão.
- Ao reabrir o aplicativo, um terminal de agente que já existia tenta voltar para a conversa anterior em vez de receber o prompt inicial. Ele só volta sozinho quando é, com certeza, a mesma conversa; nos outros casos o cartão explica o motivo e você escolhe. Veja [Retomar conversas de agentes](#retomar-conversas-de-agentes).
- O prompt inicial de contexto (padrão de qualidade, identidade no canvas, arquivos ligados) é **digitado sem Enter**: ele fica na linha de entrada do agente esperando que você escreva o pedido depois dele, e vai junto quando você enviar. Só `/resume` e a passagem de responsabilidade são enviados sozinhos, porque carregam uma instrução de verdade.
- Esse contexto é digitado quando a CLI mostra que a entrada dela está pronta, e não num tempo fixo depois da abertura — em agentes que abrem uma tela de aviso ou de confiança antes do prompt, ele espera essa tela ser respondida. Em modo yolo, o app responde sozinho o aviso do Claude Code, que aparece uma vez por máquina.
- Ao trocar de agente no configurador, a conta e a lista do agente anterior são limpas imediatamente. Consultas antigas que terminarem depois são descartadas, e o processo principal ainda confere conta, provedor e comando antes de criar o PTY; uma combinação incompatível não inicia o terminal.
- Ao reiniciar um terminal pelo drawer lateral, o app reaproveita o `accountId` e o provedor persistidos no bloco. O restart continua no perfil selecionado; sem `accountId`, o terminal usa o login do sistema.
- O histórico visual usa 20.000 linhas quando há até 9 terminais e 5.000 linhas quando o canvas já tem 10 ou mais. O limite é escolhido ao criar a sessão; terminais que já estavam abertos não são redimensionados nem perdem linhas quando outro terminal é adicionado.
- Se o histórico visual ultrapassar o limite, o cartão e a gaveta avisam. Fechar e reabrir o terminal reaplica o replay vivo mantido pelo processo principal, de até 200.000 caracteres; **Copiar** e **Handoff** usam o trecho que ainda está no buffer visual.

### Retomar conversas de agentes

Enquanto um agente trabalha, o bloco anota qual conversa está aberta nele: o
agente, a pasta, a conta e quando a conversa foi vista. Quando o app reabre com
esse bloco, ou quando você usa **Reiniciar terminal** (no cartão ou na gaveta),
o Felixo usa essa anotação
para tentar voltar à mesma conversa. Ele só volta sozinho quando tem certeza de
que é a mesma. Quando não tem, ele não adivinha e não abre outra conversa no
lugar: o cartão do bloco mostra o motivo e você escolhe.

**Os quatro desfechos.**

1. **Retomada exata.** O agente volta para a mesma conversa, com o histórico
   dela. Acontece no Claude Code, no Codex e no Gemini CLI a partir da versão
   0.57, e só quando o bloco está no mesmo agente, na mesma pasta e na mesma
   conta em que a conversa nasceu. Enquanto o agente sobe, o cartão mostra
   *Retomando a conversa anterior…*; o motivo fica registrado em **Detalhes do
   terminal → Retomada**.
2. **Lista da CLI.** Quando o bloco não guardou qual conversa estava aberta, o
   app digita `/resume` e a própria CLI mostra a lista de conversas daquela pasta
   para você escolher. Isso é automático, como antes, e acontece também depois de
   **Esquecer associação da conversa**. O título é **Sem conversa associada**.
3. **Escolha antes de abrir.** Quando o bloco guardou uma conversa, mas ela não
   pode ser retomada com certeza (outra pasta, outra conta, outro agente, uma
   versão do Gemini que não retoma pelo ID, ou a CLI já respondeu que ela não
   existe), o agente **não é aberto**. O
   cartão mostra a conversa (o agente, a pasta, o dia e a hora da conversa, e se
   ela é de uma conta própria ou do login do sistema) e o motivo, com os botões:
   - **Escolher na lista (/resume)**: abre o agente e digita `/resume`, para você
     escolher a conversa na lista da CLI;
   - **Abrir conversa nova**: abre o agente numa conversa nova. O agente recebe,
     como contexto e sem Enter, um aviso de que esta não é a conversa anterior e
     o motivo, para não presumir o que foi dito antes;
   - **Tentar retomar de novo**: aparece só quando a falha da última tentativa
     (a CLI não encontrou a conversa ou pediu login) é o único obstáculo. Tenta
     a mesma conversa outra vez, por exemplo depois de você fazer login. Se além
     da falha a pasta ou a conta também não batem, o botão não aparece, porque
     tentar de novo cairia no mesmo impedimento.
   - **Dispensar aviso**: aparece quando o aviso de falha está sobre um agente
     que continua aberto (por exemplo, você fez login no próprio terminal e a
     conversa seguiu). Tira o aviso sem reiniciar nada.
4. **Deixar para depois.** Não clicar em nada também vale: o bloco fica parado,
   sem abrir o agente, e o canvas continua como estava. Nada é apagado e os
   outros blocos seguem funcionando. Você escolhe quando quiser.

Se uma retomada exata falhar (a CLI responde que a conversa não existe ou pede
login), o app anota a falha para aquela conversa e o cartão passa a mostrar o
motivo e os botões. A partir daí, **Reiniciar terminal** e a próxima abertura do app não
repetem a mesma tentativa: o bloco espera a sua escolha.

O app confere a pasta e a conta **antes** de abrir o agente, pela anotação do
bloco, porque o Claude Code e o Codex respondem com o mesmo texto para uma
conversa de outra conta e para uma conversa que não existe. Pela resposta da CLI
não daria para saber qual dos dois aconteceu.

**A versão de cada agente.** O jeito de voltar a uma conversa muda de uma versão
para outra da CLI. Por isso o app lê a versão instalada de cada agente (com
`--version`, com tempo-limite, nunca abrindo a CLI de verdade) e decide por ela:

- **Claude Code e Codex** voltam pelo ID da conversa em qualquer versão, porque
  o `--help` dos dois documenta isso. Se a versão não responder a tempo, eles
  seguem do mesmo jeito.
- **Gemini CLI** volta pelo ID da conversa a partir da 0.57, onde isso foi
  provado (medido na 0.57.0 e na 0.62.0). Numa versão anterior, ou quando o app
  não consegue ler a versão, o bloco espera você escolher, e o texto diz qual é
  a versão e o que fazer (atualizar o Gemini CLI).
- A conversa fica anotada com a versão em que foi vista. Se você atualizar o
  agente depois, o app recalcula o jeito de voltar pela versão nova e **não
  apaga a conversa**. **Detalhes do terminal → Capacidade da CLI** mostra a
  versão instalada, o jeito de voltar e, quando a versão mudou, em qual versão
  a conversa foi gravada (por exemplo, *Gemini CLI 0.62.0: pelo ID da conversa
  (gravada na 0.56.2)*).
- Ao abrir o app, um bloco do Gemini com conversa anotada espera alguns
  segundos pela versão antes de subir; os do Claude Code e do Codex sobem na
  hora.

**Os motivos.** Quando é preciso escolher, o título aparece na faixa do
cartão e na gaveta, com o texto que explica o caso embaixo dele. Nos outros
casos, o título fica em **Detalhes do terminal → Retomada**.

| Título (faixa do cartão ou Detalhes → Retomada) | Quando aparece | O que acontece |
| --- | --- | --- |
| **Retomando a conversa anterior** | É a mesma conversa, na mesma pasta e na mesma conta (Claude Code, Codex, ou Gemini CLI a partir da 0.57) | Retomada exata |
| **Sem conversa associada** | O bloco não guardou qual conversa estava aberta | A CLI mostra a lista (`/resume`) |
| **Retomada pelo ID indisponível nesta versão do Gemini CLI** | O Gemini CLI instalado é anterior à 0.57, ou o app não conseguiu ler a versão. Sem a 0.57, o Gemini CLI só garante retomar a conversa mais recente ou pela posição na lista, e a posição muda quando surgem conversas novas; o app não adivinha. Atualize o Gemini CLI para voltar direto à conversa | Escolha antes de abrir |
| **A conversa nasceu em outra pasta** | A conversa foi aberta numa pasta e o bloco está em outra. A lista da CLI filtra por pasta, então ela pode não aparecer ali | Escolha antes de abrir |
| **Bloco sem pasta de trabalho** | O bloco não tem pasta de trabalho definida, então não dá para confirmar que é a mesma conversa | Escolha antes de abrir |
| **A conversa é de outra conta** | Retomar ali abriria o histórico de uma conta na cobrança de outra. Volte o bloco para a conta original para retomá-la | Escolha antes de abrir |
| **A conversa é de outro agente** | A conversa foi aberta num agente (no Codex, por exemplo) e o bloco agora usa outro | Escolha antes de abrir |
| **Registro da conversa ilegível** | O registro salvo da conversa não está num formato que o app reconheça. Nada foi apagado | Escolha antes de abrir |
| **A CLI não encontrou a conversa** | Na última tentativa, a CLI respondeu que essa conversa não existe mais (apagada, arquivada, ou de outra pasta ou conta). O app não repete a mesma retomada | Escolha antes de abrir, com **Tentar retomar de novo** |
| **A CLI pediu login ao retomar** | Na última tentativa, a CLI pediu login antes de retomar. Faça login na CLI desta conta e tente retomar de novo; o registro da conversa continua salvo. Trocar a conta do bloco não ajuda: a conversa só retoma na conta em que nasceu | Escolha antes de abrir, com **Tentar retomar de novo** |

Quando vale mais de um motivo (outra pasta **e** outra conta, por exemplo), o
título mostra o primeiro e o texto explica todos. A ordem é: registro ilegível,
outro agente, falha na última tentativa (conversa não encontrada ou login),
versão do Gemini, pasta (sem pasta ou outra pasta) e, por último, conta.

**Nada é apagado.**

- O registro da conversa nunca é apagado para esconder um erro: nem uma falha,
  nem a sua escolha o removem.
- Quando o bloco passa a outra conversa (depois de **Abrir conversa nova**, por
  exemplo), a anterior continua registrada em **Detalhes do terminal**, com a data
  em que foi substituída.
- Só o botão **Esquecer associação da conversa**, em **Detalhes do terminal**,
  apaga a associação, e ele pede confirmação antes. Ele leva a conversa atual e
  a falha registrada para ela; a conversa anterior, se houver, continua em
  **Detalhes do terminal**.
- Se o bloco ainda não tinha anotado a conversa quando você mandou a primeira
  mensagem (o Claude Code e o Codex só criam a conversa nessa hora), o app volta
  a procurá-la quando você envia a mensagem, até três vezes, para ela não ficar
  sem registro.
- O cartão e o aviso que o agente recebe não mostram o ID da conversa nem o da
  conta: para decidir, bastam o agente, a pasta, a data e a conta. O ID completo
  fica em **Detalhes do terminal**, com o botão de copiar, para quem precisar dele
  (num relato de problema, por exemplo).

**Limites de cada agente.** Para quem quiser conferir no próprio terminal, estes
são os comandos e as respostas de cada CLI, medidos em 29/09/2026 e conferidos no
app instalado (empacotado) em 30/09/2026, no Windows, sem nenhuma conta conectada.
O Gemini CLI foi medido de novo em 30/09/2026, no Linux, na 0.57.0 e na 0.62.0,
e a retomada dele pelo ID foi conferida no app com uma pasta de usuário isolada:

| | Claude Code 2.1.283 (npm) / 2.1.250 (gerenciada) | Codex 0.159.2 (npm) / 0.150.1 (gerenciada) | Gemini CLI 0.57.0 e 0.62.0 |
| --- | --- | --- | --- |
| Retomar por ID | `--resume <id>` | `codex resume <id>` (UUID ou nome) | `--resume <id>`: o `--help` só cita `latest` e o índice, mas a própria mensagem de erro da CLI ensina `--resume {uuid}`, e a retomada pelo ID foi medida. O app usa da 0.57 em diante |
| Retomar a última | `-c`/`--continue` (por pasta) | `resume --last` | `--resume latest` (sem conversa na pasta, abre uma conversa nova sem avisar) |
| Listar | Seletor interativo (`/resume` ou `--resume` sem valor) | Seletor por pasta (`--all` mostra todas) | `--list-sessions` (exige login) |
| Conversa inexistente | `No conversation found with session ID: …`, antes de qualquer login (também na 2.1.285) | `No saved session found with ID …`, só depois do login: sem conta conectada, a tela de login vem antes | `Error resuming session: Invalid session identifier "…"` (a pasta tem outras conversas) ou `Error resuming session: No previous sessions found for this project.` (não tem nenhuma), antes do login e saindo com o código 42 |
| Primeira execução | Numa pasta de configuração nova, o onboarding (tema, confiança na pasta) aparece antes de a CLI olhar o `--resume` | A tela de login aparece antes de a CLI resolver o ID | O ID é resolvido antes de tudo; depois vêm a confiança na pasta e o login. O login é exigido para listar |
| Pasta | O seletor e o `-c` são por pasta | O seletor filtra por pasta | Conversas por projeto (pasta) |
| Conta | Conversas por perfil (`CLAUDE_CONFIG_DIR`); outra conta dá o mesmo texto de conversa inexistente | Conversas por `CODEX_HOME` | Conversas pela HOME do perfil |

A versão que roda depende do `PATH`: com duas instalações, vale a que vier
primeiro (na máquina medida, a do npm global vinha antes da gerenciada). Confira
com `claude --version` ou `codex --version` no terminal.

No Codex 0.159, uma pasta de conta (`CODEX_HOME`) com caminho longo impede a CLI
de abrir: ela responde `path must be shorter than SUN_LEN` antes de qualquer
retomada. Medido no app instalado com uma pasta de 156 caracteres; com 25, a CLI
abriu normalmente.

O Gemini CLI apaga sozinho, ao abrir, as conversas com mais de 30 dias e as que
ele não consegue ler (a opção `general.sessionRetention` das configurações dele,
ligada por padrão). Uma conversa apagada assim aparece no cartão como **A CLI não
encontrou a conversa**. O Gemini CLI também se atualiza sozinho ao abrir
(`general.enableAutoUpdate`, ligada por padrão): a versão pode mudar de um dia
para o outro, e o app acompanha pela leitura da versão.

### Leitura: a resposta do agente como texto formatado

As CLIs de agente desenham a resposta no terminal: título em negrito, código colorido, tabela com traços. A aba **Leitura** da gaveta do terminal mostra essa mesma resposta como texto formatado, com títulos, listas, blocos de código, tabelas, citações e links de verdade.

- Na gaveta, troque entre **Terminal** e **Leitura** pelas abas (ou pelas setas, com o foco nelas). Cada bloco guarda a escolha; o padrão é o Terminal.
- A Leitura só mostra. Para digitar, volte ao **Terminal**. O agente continua rodando por baixo, no mesmo tamanho, e nada se perde ao trocar de aba.
- Cada fala aparece separada: **Você** (o seu pedido), **Agente** e **Aviso da CLI** (um erro ou uma interrupção). O logotipo, as dicas, o status ("Working…", contagem de tokens) e a caixa de digitação ficam de fora.
- O botão de copiar da Leitura leva o texto selecionado ou, sem seleção, o texto de todas as falas como o terminal mostra.
- Se você rolar para cima para ler, a Leitura não pula para o fim quando chega texto novo. Parada no fim, ela acompanha a resposta.
- Com a Leitura ligada, o cartão do bloco no canvas também mostra o fim da última resposta já formatado.
- Os links da Leitura seguem a mesma regra de todo o app (ver [Links: escolher onde abrir](#links-escolher-onde-abrir)).

A Leitura reconhece o Claude Code e o Codex. Para outros programas (Gemini, Openia, o terminal comum), ela mostra o texto como veio, sem formatação nova, e avisa isso no topo. Os limites estão em [Limitações conhecidas](#6-limitações-conhecidas).

### Links: escolher onde abrir

Nenhum link abre direto. Ao abrir um link, aparece um menu curto com o destino escrito: primeiro o site (ou o e-mail) e, embaixo, o endereço inteiro. Um link pode exibir um texto e apontar para outro endereço, e o menu mostra para onde ele leva de verdade. Um endereço muito longo é cortado no meio, nunca no fim, porque é no fim que está o domínio de verdade. Depois, é só escolher:

- **Abrir no navegador**: abre no navegador do sistema. Num link de e-mail, o botão vira **Abrir no app de e-mail**, e o menu mostra também quem vai em cópia (Cc) e em cópia oculta (Cco).
- **Abrir como Página Web**: cria um bloco Página Web ao lado do bloco de onde o link veio e leva o foco até ele. Quando o link vem de um painel, o bloco nasce numa área livre da tela. Aberto a partir de outra Página Web, o bloco novo fica no mesmo perfil do navegador interno (com os mesmos logins). Na tela do chat não há canvas, então essa opção não aparece.
- **Copiar link** (ou **Copiar endereço**, num e-mail): copia e não abre nada.

O jeito de chamar o menu depende de onde o link está:

- **Terminal**: `Ctrl`+clique (`Cmd`+clique no macOS), um toque na tela ou o clique direito sobre o link. No macOS, o `Ctrl`+clique é o clique direito do sistema e também abre o menu. Um clique simples continua sendo do terminal (foco, seleção de texto). Pelo teclado, a tecla de menu abre o menu do link sob o ponteiro. `Shift+F10` não serve no terminal, porque o `F10` é do programa que roda nele.
- **Notas, arquivos `.md`, respostas do chat e painel do Notion**: clique no link, `Enter` com o link em foco, ou o clique direito. O clique do meio não abre nada.
- **Dentro de uma Página Web**: clique direito sobre um link da página, inclusive de e-mail. O clique simples continua navegando dentro do bloco, e um link de script da própria página (`javascript:`) não abre o menu. Para levar a página atual ao navegador do sistema, use o botão **Abrir esta página no navegador**, ao lado da barra de endereço.

O menu funciona pelo teclado: setas, `Home` e `End` escolhem, `Enter` confirma, e `Esc` ou `Tab` fecham e devolvem o foco para onde você estava. Segurar o `Enter` não escolhe nada: só um `Enter` novo confirma. O menu fecha sozinho se você rolar o canvas, mudar o tamanho da janela ou levar o foco para outro lugar.

Se o sistema não conseguir abrir o navegador (por exemplo, sem um navegador padrão configurado), aparece um aviso embaixo, no meio da janela: **Não foi possível abrir no navegador**, com o endereço e o botão **Copiar link**, para você colar no navegador que quiser. O aviso não tira o foco de onde você estava e fica até você copiar, fechar no **×** ou apertar `Esc` com o foco nele. O botão **Abrir esta página no navegador** da Página Web usa o mesmo aviso.

Se o app recusar um link, o menu diz por quê e oferece só **Copiar link**. O motivo pode ser, por exemplo:

- um tipo de endereço que o app não abre (como `file:`);
- caracteres invisíveis que disfarçam o destino (eles aparecem no menu com o código deles, como `⟨U+200B⟩`);
- usuário e senha no endereço.

No texto (notas, arquivos, chat), o link recusado vira texto comum, com o motivo na dica, e um botão pequeno ao lado (**Por que este link não abre**) abre o menu. Isso vale também para o link cujo endereço tem caracteres invisíveis: a dica e o menu mostram o endereço com cada invisível pelo código (`exa⟨U+200B⟩mple.com`), e nunca o endereço disfarçado. No terminal, a dica sobre um link recusado também traz o motivo. A barra de endereço da Página Web faz o mesmo: um endereço recusado mostra o motivo em vez de simplesmente não abrir, e o texto fica na barra para você corrigir.

Quando um agente pede para abrir uma página (`felixo browser open`), nada abre sozinho. Um cartão aparece no alto do canvas com três informações:

- o endereço inteiro (se for longo, dá para rolar);
- de onde veio o pedido;
- o destino que o agente sugeriu.

Você escolhe **Abrir no navegador**, **Abrir como Página Web** ou **Recusar**, e o agente consegue consultar a resposta. Alguns detalhes do cartão:

- Os botões esperam meio segundo depois que um pedido novo aparece. Assim um duplo clique não decide o pedido seguinte sem você ler.
- Com vários pedidos na fila, **Recusar todos** limpa a fila de uma vez.
- Se o navegador não abrir, o cartão diz o motivo e o pedido continua esperando outra escolha.
- O cartão não pega o foco nem responde a teclas, para um `Enter` digitado no terminal não confirmar nada sem querer. Responder nele também não fecha a gaveta do terminal.
- Ele aparece no canvas. Com a tela do chat aberta, o pedido fica esperando até você voltar.
- Um pedido sem resposta por uma hora expira e sai do cartão, e o agente vê que ele expirou.

O cartão cobre o pedido feito pelo app. Um agente que roda comandos no terminal continua podendo abrir o navegador por conta própria, com os comandos do sistema, como qualquer programa que você roda.

### Colar imagens em um agente

Cole com o atalho normal do sistema (`Ctrl+V`, ou `Cmd+V` no macOS) dentro do terminal do agente. Se houver uma imagem na área de transferência, o app a salva junto dos outros anexos e digita o caminho do arquivo na linha de entrada, seguido de um espaço, para você continuar escrevendo o pedido. Colar texto continua funcionando como antes.

Vale tanto para uma imagem copiada (captura de tela, "copiar imagem" no navegador) quanto para um arquivo de imagem copiado no gerenciador de arquivos. O app lê a área de transferência pelo próprio sistema operacional, então não é preciso instalar `xclip` ou `wl-paste` no Linux, e o atalho é o mesmo em todos os sistemas e para qualquer CLI de agente — que passa a receber sempre um caminho de arquivo, a única forma de imagem que um terminal consegue transportar.

### Ditado por voz

Aperte `Ctrl+Shift+M` (`Cmd+Shift+M` no macOS), fale e aperte de novo. O texto entra na linha de entrada do terminal aberto e **não é enviado sozinho**: você revisa e aperta Enter. Sem terminal aberto, o texto vai para a área de transferência e um aviso diz isso. Enquanto grava, o botão do microfone na barra de cima mostra um ponto vermelho e o tempo. O **X** ao lado descarta a gravação. Se algo falhar, a mensagem aparece logo abaixo do botão.

Em **Configurações → Ditado por voz** você escolhe o motor:

- **Nuvem:** qualquer API compatível com a da OpenAI, com a sua chave. A chave fica cifrada pelo sistema. No Linux, isso exige um keyring, como o GNOME Keyring ou o KWallet. Sem keyring, o app recusa guardar a chave em vez de gravá-la em texto puro.
- **Servidor local:** o áudio não sai do computador, não há chave e não há custo por minuto. O app não traz um motor embutido. Você roda o servidor de exemplo `app/scripts/servidor-transcricao-local.py`, que usa o faster-whisper, e aponta o endereço `http://127.0.0.1:8765/v1`. Instale numa venv com `pip install faster-whisper "av<16"` e rode `python servidor-transcricao-local.py --registro transcricoes.jsonl`. O modelo padrão é o **`small`**. No campo **Modelo**, `base` ou `tiny` trocam precisão por velocidade. Na primeira vez, o modelo é baixado (o `small` tem cerca de 480 MB); depois, tudo funciona sem internet.

Quanto custa esperar, num notebook de 2 núcleos e 4 threads (i5-6200U), com voz humana em português em frases de 3 a 10 s:

| Modelo | Tempo por frase, máquina livre | Tempo por frase, no app, com o navegador e outros programas abertos | Palavras erradas |
| --- | --- | --- | --- |
| `small` | cerca de 7 s | 13 a 17 s | 13% |
| `base` | cerca de 2,5 s | 4,5 a 9 s | 22% (31% em vozes femininas) |
| `tiny` | cerca de 1,4 s | — | 31% |

Boa parte dos "erros" contados é só formatação, como "10 km" escrito "10 quilômetros" ou "nove e vinte e cinco" escrito "9h25". Os erros de verdade aparecem em nomes próprios e palavras raras. O tempo cresce bastante quando o computador está ocupado. Medido em 05/10/2026: com o `small`, a mesma frase de 7 s levou 8 s com a máquina livre e 15 s com o navegador tocando vídeo e outros programas abertos.

No Linux, o caminho inteiro foi conferido com um microfone virtual: gravação, texto no terminal, avisos, permissão negada, erros de endereço e de chave, e o microfone liberado ao parar, cancelar ou fechar o app. O ditado também foi conferido **sem internet**, no app instalado, com o servidor local. Microfone físico, Windows e macOS ainda não foram conferidos.

### Gerar uma imagem no canvas

Na seção **Criar** da barra lateral, **Gerar imagem** (logo abaixo de **Abrir imagem**) abre um painel com dois campos:

1. **Descrição da imagem**, obrigatória, com até 4.000 caracteres.
2. **Modelo de imagem**, escolhido no catálogo público do OpenRouter (tem busca).

Depois, clique em **Gerar** ou use Ctrl/Cmd+Enter. Quem gera é o Openia, com a chave do OpenRouter configurada nele. O Felixo não lê essa chave, e cada geração pode consumir créditos da sua conta. Por isso, na primeira vez nenhum modelo vem escolhido; depois, o último escolhido é lembrado.

Enquanto gera, o painel mostra o tempo decorrido, e **Cancelar** interrompe o pedido. Esc ou um clique fora fecham o painel sem interromper a geração. A imagem pronta entra no canvas como um bloco de imagem temporário; **Remover temporário** apaga o bloco e o arquivo. Se faltar a chave, o crédito acabar, o modelo sair do catálogo ou a rede cair, o painel diz qual foi o problema. É preciso ter o Openia instalado e configurado.

### Notificações dos agentes

O botão **Notificações** registra, enquanto o app estiver aberto, agentes que terminaram um trabalho, encerraram a sessão ou estão aguardando aprovação/resposta. Quando há itens, ele recebe borda vermelha e um contador externo, sem cobrir o ícone ou o texto. O painel abre ao lado do botão com animação; cada item mostra o agente e a última mensagem útil do terminal. Clique nele para abrir o terminal e remover o aviso. O histórico é limpo ao fechar o app.
Quando uma nova notificação surgir, o app reproduz um alerta sonoro curto; notificações já existentes ao iniciar não repetem o som.

### Conectar agentes

Ao arrastar uma conexão entre dois blocos de agentes, ambos recebem uma instrução de colaboração. Se usam o mesmo diretório de trabalho, o app informa que atuam no mesmo projeto; caso usem diretórios diferentes, a conexão declara que os contextos são relacionados. A conexão não copia conversas entre terminais: use arquivos `.md` e notas do canvas para coordenar decisões, progresso e bloqueios.

### Ferramentas do canvas

A seção **Ferramentas** da barra lateral do canvas (fechada por padrão; clique no título para abrir) reúne painéis que flutuam sobre o quadro sem escondê-lo, em três grupos:

- **Workspace:** Projetos, Notas, Modelos, Prompts, Skills e Source Control;
- **Operação:** Fetch All, Tarefas Notion, Limites e uso, Orquestrador, QA Logger, Pedidos de escrita e Presets de agente;
- **Transferência:** Exportar canvas e Importar canvas.

Escolher uma ferramenta abre o painel correspondente. **Buscar**, **Notificações**, **Ajuda** e **Configurações** não ficam nessa seção: são botões da faixa de ícones à esquerda da barra, onde também estão **Chat** e um atalho para **Projetos**. Se as configurações de **Agente** ou **Notificações** também estiverem abertas, elas se deslocam para a coluna seguinte para não cobrir as opções de Ferramentas. A barra pode ser recolhida; nesse estado, a faixa de ícones continua visível, com as notificações e o botão **Expandir sidebar**.

- **Tarefas Notion** abre como bloco do canvas, com a tabela da database escolhida. A primeira aba, **Painel**, mostra um cartão por repositório: nome, barra de progresso, quantas tarefas estão abertas e o total. O agrupamento usa a coluna de escolha cujo nome lembra "Repositório" (ou "Projeto"). Quando as tarefas têm uma coluna de ligação para uma database de repositórios, o cartão também mostra o link e etiquetas como a linguagem. A ligação reconhece títulos no formato `dono/repositório`. Na tabela, o seletor à direita das abas (**Todos os repositórios**) escolhe de qual repositório vêm as tarefas, com a quantidade de abertas de cada um, e vale para todas as abas. Clicar num cartão do Painel abre a tabela já com aquele repositório escolhido. As tarefas concluídas ficam escondidas por padrão, e a barra mostra só **Abertas** e as suas visualizações. O botão com o olho, ao lado da sincronização, mostra as concluídas de volta, junto com as abas **Todas** e **Concluídas**. O repositório escolhido e o olho ficam gravados por database. A busca, no Painel, filtra os cartões pelo nome. Em **Configurar painel** dá para trocar a coluna de agrupamento (escolha, múltipla escolha, status ou ligação), a ligação de onde vêm os detalhes e as etiquetas, e mostrar também os repositórios que ainda não têm tarefas. Cada bloco lembra a conexão, a database e essas escolhas, e reabre no Painel se ele era a aba aberta. A barra só chega a 100% quando todas as tarefas do cartão estão concluídas. As tarefas sem a coluna preenchida ficam juntas no cartão **Sem <coluna>**, sempre no fim.
- **Notas** tem duas seções: **Notas no canvas** lista os blocos de nota do quadro — clicar num item centraliza e seleciona o bloco, e "Nova nota" cria um bloco direto no canvas; **Notas salvas** são as notas persistidas, editáveis ali mesmo e também legíveis pelo modo de chat legado.
- **Source Control** mostra branch e status do projeto escolhido, com stage all e commit; erros do repositório aparecem no próprio painel, e o botão de atualizar recarrega o status.
- **Prompts** e **Skills** **digitam** o texto no terminal aberto, **sem Enter**: ele fica na linha de entrada do agente para você revisar, completar e enviar. Só `/resume` e a passagem de responsabilidade são enviados sozinhos. O terminal aberto é o da gaveta, que precisa estar fixada (botão **Fixar terminal**, no topo da gaveta) para continuar aberta enquanto você usa o painel, porque um clique fora dela a fecha. Sem terminal aberto, o texto vai para a área de transferência. Cada uso mostra o resultado embaixo do item:
  - **Digitado no terminal aberto. Revise e aperte Enter para enviar.**;
  - a mesma coisa com **direto no texto**, quando o arquivo temporário do contexto falhou (o cartão do bloco mostra o aviso);
  - **copiado para a área de transferência**;
  - ou **O terminal não confirmou o recebimento**, que fica na tela até você tentar de novo.

  Marcar vários prompts e usar **Enviar conjunto** digita os textos juntos, na ordem do catálogo; a contagem só inclui prompts com texto. O cartão do bloco mostra o nome do prompt (ou da lista combinada, da skill ou do arquivo do canvas) também quando você completa o pedido antes de apertar Enter; Ctrl+C, Ctrl+U ou apagar o texto tiram esse nome, e o que você enviar depois aparece como o próprio texto. Um prompt sem nome aparece como **Prompt do catálogo**.
- **Skills** lista, em **Skills do sistema**, as skills que todo agente novo recebe. O ícone de olho cortado ao lado de **Ativar** ("Não enviar aos agentes") tira uma skill dessa lista. O recolhível **Ocultas (N)**, logo abaixo, mostra as que foram tiradas, e o X de cada uma a devolve. A escolha vale para os próximos agentes, sem reiniciar o app, e continua valendo nas próximas sessões. Uma skill oculta também sai dos presets que a citam.
- **Fetch All** mostra primeiro o escopo efetivo, as raízes configuradas, o motivo da escolha e o custo esperado. As pastas-raiz se escolhem no próprio cartão **Escopo da varredura**: **Adicionar pasta** abre o seletor do sistema (dá para escolher uma ou várias pastas), e o X ao lado de cada raiz a tira da lista. Cada linha mostra o nome da pasta e o caminho completo. Não é preciso editar `fetch-all-settings.json` à mão. Prefira escolher as pastas onde ficam os seus repositórios, porque varrer os discos inteiros é bem mais caro, sobretudo numa máquina modesta. Com pelo menos uma raiz, a varredura fica só nelas e não pede confirmação. Quando nenhuma foi configurada, os discos locais aparecem apenas como alternativa ("Ou varra todos os discos locais") e a interface exige uma confirmação explícita antes de iniciar uma varredura ampla. Sem essa confirmação, nenhuma varredura recursiva começa — em particular, a configuração vazia nunca dispara `/` silenciosamente. Pull (sempre `--ff-only`), push e o commit automático dos repositórios cuja única pendência é commitar acontecem num segundo passo, depois de você revisar o plano e confirmar — e o estado de cada repositório é conferido de novo imediatamente antes de qualquer escrita. Cada passada gera um relatório em Markdown na pasta de relatórios do app. A varredura **rápida** reaproveita a lista da última varredura completa somente se raízes, exclusões, ignorados, montagens e discos detectados forem os mesmos (é mais rápida, mas não encontra repositórios novos), e o ícone ao lado de um repositório passa a **ignorar** aquela pasta nas próximas varreduras — a lista de ignoradas fica no rodapé do painel.
- Se uma execução confirmada falhar, o painel mostra o diagnóstico, mantém o pedido pendente e preserva o plano para uma nova revisão; o pedido só sai da fila depois que `resultado.ok` confirma a execução.

No Windows, o Fetch All considera as unidades locais fixas e removíveis que
respondem como diretórios; unidades de rede ficam fora. No macOS, volumes
virtuais, `/System/Volumes` e pastas `Library/CloudStorage` ficam fora para
evitar varredura duplicada ou I/O de rede desnecessário.

Agentes abertos pelo canvas também podem consultar essa ferramenta pelo terminal:
`felixo fetch-all varrer`, `estado` e `ver-pedido` apenas informam; `varrer` usa
as raízes configuradas e, sem elas, exige `--todos-discos` para confirmar a
varredura ampla; para pedir
uma sincronização, usam `felixo fetch-all pedir-execucao` (ou `--com-commit`).
O pedido aparece no painel **Fetch All**, mas nunca executa pull, push ou commit
sozinho: você primeiro faz uma varredura, revisa o plano atual e confirma a
aplicação na tela. O comando usa o mesmo perfil de dados do app, inclusive no
macOS e no Windows, para que o pedido chegue ao painel correto.

### Navegação no canvas

- **Selecionar / Mover tela:** o botão da barra (ou a tecla `Q`, com o canvas em foco) alterna entre arrastar uma caixa de seleção e arrastar a tela. Dentro do conteúdo de um bloco (nota, terminal, arquivo), o arrasto não move a tela — interaja normalmente com o bloco.
- **Scroll:** a roda do mouse sobre o conteúdo de um bloco rola o conteúdo; sobre o fundo do canvas, controla o zoom.
- **Ver tudo:** enquadra todos os blocos na tela de uma vez.
- **Remover o que está selecionado:** clique numa conexão ou no cabeçalho de um bloco (Shift+clique ou a caixa de seleção para vários). A barra de status do rodapé diz o que está selecionado ("1 conexão selecionada", "N blocos selecionados" ou "N itens selecionados") e mostra o botão **Remover [Delete]**. O botão faz o mesmo que as teclas Delete e Backspace: remover blocos leva junto as conexões ligadas a eles, e não há confirmação nem desfazer. Com o canvas travado (cadeado na pílula de zoom), o botão fica desativado.
- **Largura da gaveta do terminal:** arraste o grip da borda esquerda da gaveta. Dois cliques nele (ou **Home**, com o foco nele) voltam à largura padrão; as setas ajustam pelo teclado, e com Shift o passo é maior.
- Blocos fora da área visível não são renderizados, o que mantém o canvas leve mesmo com muitos terminais abertos.

O canvas considera como área útil o espaço que sobra depois da barra superior,
sidebar, painel aberto, inspector **Elementos** e barra de status. Por isso
**Ver tudo**, a busca e a criação de blocos posicionam o conteúdo longe dessas
superfícies, inclusive quando a gaveta de um terminal está aberta. A gaveta é
uma coluna do layout e não cobre o quadro.

O teclado segue o mesmo fluxo dos cliques: abrir um terminal foca seu conteúdo,
fechar a gaveta devolve o foco ao botão de expansão, e `Escape` fecha
notificações ou diálogos com retorno ao controle que os abriu. Botões, campos e
separadores do canvas têm rótulos para leitores de tela. Ao recarregar o app,
os nós e as conexões persistidos voltam uma única vez; a validação automatizada
usa um PTY fake para não executar comandos externos.

### Tutorial e Ajuda

Na primeira vez que o app abre num computador, com o canvas vazio, um tutorial
curto aparece sozinho ao lado da barra lateral, depois que o canvas termina de
carregar. São seis passos: **Projeto**, **Agente**, **Contexto**, **Terminais**,
**Ferramentas** e **Onde rever**. Cada passo destaca um controle de verdade com um
contorno e explica para que ele serve.

- O tutorial só mostra. Ele não clica, não abre seção nem painel e não cria nada:
  não abre agente, não roda comando e não gasta crédito.
- Ele não bloqueia o canvas: dá para continuar trabalhando com ele aberto, sem
  escurecer a tela. **Pular tutorial**, **Voltar**, **Próximo** e **Concluir** ficam
  no rodapé do card, e `Esc` com o foco no card fecha o tutorial. Se um diálogo
  estiver aberto por cima (a pergunta de um agente, por exemplo), o card fica
  inativo até ele fechar: sai do `Tab`, não responde a teclas nem a cliques e
  continua no mesmo passo, e o teclado é do diálogo. Quando o diálogo fecha, o
  foco volta ao botão do card onde estava, a não ser que você o tenha levado para
  outro lugar.
- Pelo teclado: no primeiro uso o foco entra no card, a não ser que você já esteja
  digitando em outro lugar. `Tab` percorre os botões e segue para o canvas, e
  `Shift+Tab` volta para a barra lateral; nada prende o foco. Um leitor de tela
  ouve o nome e o texto do passo, e a troca de passo é anunciada.
- Com a barra lateral recolhida ou uma seção fechada, o passo aponta para o botão
  que a abre (o menu do canvas) e diz o que abrir. Quando você abre, o destaque vai
  para o controle certo. O tutorial nunca abre nada por você.
- Dá para rolar a barra lateral com o tutorial aberto, com a roda do mouse ou com
  `Tab`: ele não puxa a rolagem de volta. O destaque acompanha o controle e some se
  ele sair de vista; no passo seguinte, o tutorial rola até o controle novo.
- Em janela pequena (ou com zoom alto), o card vira uma folha na borda da janela, ou
  numa coluna ao lado do controle destacado quando a borda o cobriria, e o texto rola
  por dentro; os botões e o controle destacado ficam sempre visíveis.
- Recarregar a janela no meio do tutorial retoma no mesmo passo, sem puxar o foco.
  Ir ao chat e voltar também. Fechar o app e abrir de novo não reabre nada: o
  tutorial aparece como "Interrompido" na Ajuda.
- Quem já usava o app antes desta versão não recebe o tutorial automático; ele fica
  disponível na Ajuda. No lugar dele aparece uma vez um aviso pequeno ao lado da
  Ajuda ("Novidade: Ajuda"), com **Ver** e **Agora não**. O aviso não tira o foco de
  onde você está digitando e não some sozinho: fica até você responder, abrir a
  Ajuda ou apertar `Esc` com o foco nele.

**Ajuda** é o botão com o ponto de interrogação na barra de ícones da esquerda,
logo abaixo de Notificações. Ela reúne:

- **Tutorial do canvas**, com o estado (Não visto, Em andamento, Interrompido no
  passo n, Pulado, Concluído em uma data ou Atualizado) e a ação que faz sentido:
  Iniciar, Continuar do passo n, Rever ou Recomeçar.
- **Novidades**: funções novas que ganharam um tour curto. Uma novidade que você
  ainda não viu aparece como "Novo" e deixa um ponto no botão Ajuda.
- **Redefinir tutoriais**, que pede confirmação na própria tela e abre o tutorial do
  começo. As novidades que já foram anunciadas não voltam a aparecer.

Pelo teclado, o foco entra no menu ao abrir e `Tab` percorre as ações. `Tab`
depois da última, `Shift+Tab` antes da primeira ou `Esc` fecham o menu, e o foco
volta ao botão Ajuda.

Quando o progresso não pode ser salvo (por exemplo, abrindo uma versão mais antiga
do app depois de usar uma mais nova), a Ajuda avisa "O progresso não será salvo
nesta sessão." O tutorial funciona normalmente naquela sessão e nada do que a
versão mais nova gravou é apagado.

O progresso fica no banco local (`database/felixo.sqlite`, na chave
`onboarding.state`). Reinstalar o app por cima, inclusive pelo instalador do
Windows, preserva a pasta de dados, então o tutorial não reabre. Só um perfil novo
(a pasta de dados apagada à mão ou outro usuário do sistema) conta como primeiro
uso. Várias janelas, ou duas instâncias do app abertas ao mesmo tempo, nunca
mostram o tutorial automático duas vezes. Os textos existem só em português por
enquanto.

### Zoom da janela

O menu **Exibir** tem **Aumentar zoom** (Ctrl/Cmd + `+` ou `=`), **Diminuir zoom**
(Ctrl/Cmd + `-`) e **Tamanho real** (Ctrl/Cmd + `0`). Esse zoom aumenta ou diminui a
interface inteira, em passos pequenos e com limite de cerca de 58% a 173%. Se a
interface ficou pequena ou grande sem querer, **Exibir → Tamanho real** ou Ctrl+0 a
devolve ao normal.

Ele é diferente do zoom do canvas, que é a pílula com a porcentagem e a roda do
mouse sobre o fundo do canvas e só aproxima ou afasta os blocos.

Ctrl+Shift+- (Ctrl+_) não muda o zoom: a combinação chega ao terminal, onde é o
"desfazer" do readline, do emacs e de várias CLIs de agente.

### Canvas portátil

Use **Exportar** na barra do canvas para gerar um arquivo `.fxcanvas`. Esse arquivo é
um manifesto portátil que registra blocos, conexões e o conteúdo dos arquivos `.md`
associados aos blocos de arquivo.

Para levar o canvas a outro computador:

1. Clique em **Exportar** e salve o arquivo `.fxcanvas`.
2. Transfira esse arquivo para o outro computador.
3. No Felixo do computador de destino, clique em **Importar** e selecione o manifesto.
4. Confira o aviso e confirme a substituição do canvas atual.

A importação valida o manifesto antes da confirmação e recria os `.md` registrados na
pasta local do Felixo. Arquivos registrados que estavam ausentes são recriados vazios.
Caminhos de projeto, argumentos de terminal e comandos desconhecidos não são
transportados, pois dependem da máquina de origem ou poderiam executar instruções não
confiáveis.

O botão **Limpar** pede confirmação e exclui permanentemente todos os blocos,
conexões e arquivos `.md` pertencentes ao canvas. Essa ação não remove outros tipos de
arquivo que eventualmente estejam na pasta de dados.

## 5. Dados locais, banco e logs

O app resolve diretórios pelo `app.getPath()` do Electron e cria subpastas para configurações, banco, exports, notas, relatórios, logs, scratchpads do canvas e arquivos temporários de contexto entregues aos agentes.

Locais comuns de dados do app:

- Linux: `~/.config/felixo-ai-core/`
- Windows: `%APPDATA%\felixo-ai-core\`
- macOS: `~/Library/Application Support/felixo-ai-core/`

Os arquivos em `context-deliveries/` são artefatos temporários somente leitura:
o app os cria fora do repositório para entregar prompts longos sem digitá-los
inteiros na PTY, remove-os quando a sessão termina e limpa sobras com mais de
24 horas na inicialização. Eles não são os scratchpads editáveis de
`canvas-files/` e não devem ser versionados.
Para funcionar quando o contexto atravessa Linux, macOS ou Windows, a
referência enviada ao terminal contém somente o nome do artefato e o comando
`felixo context read "<nome>"` (também `felixo contexto ler "<nome>"`). O
comando resolve a pasta nativa do perfil Felixo ativo; caminhos absolutos de
outra máquina/perfil não devem ser copiados nem usados. Se a leitura falhar,
o agente deve informar o nome e o erro exatos, sem trocar silenciosamente pelo
artefato "equivalente" de outra sessão. Se o processo do app não conseguir
criar o arquivo, o terminal volta ao fallback inline e mostra um aviso.

Todo caminho de arquivo ou pasta que o app escreve para o agente vai entre
aspas: o comando `felixo`, a skill ativada, a lista de skills, os arquivos
`.md` ligados, o arquivo de planejamento e a pasta de trabalho. Assim, um
caminho com espaço ou acento (`C:\Users\Ana Maria\…`) continua inteiro quando
o agente o copia para um comando. No Windows, a referência traz também a linha
do PowerShell, com `&` na frente (`& "C:\…\felixo.cmd" context read "<nome>"`):
lá, um caminho entre aspas seguido de argumentos não roda sem o `&`. O `cmd.exe`
e o Git Bash usam a linha comum.

Arquivos e pastas úteis:

- Banco SQLite: `database/felixo.sqlite` dentro do diretório de dados do app.
- Arquivos Markdown do canvas: pasta `canvas-files` dentro do diretório de dados do app.
- Logs do Electron: pasta `logs` dentro do diretório de dados/logs resolvido pelo Electron.
- QA Logger: painel dentro do app com eventos recentes de execução, mantido em memória durante a sessão.

Se estiver reportando um problema, inclua a versão do app, sistema operacional, CLI usada e o erro exibido no Terminal ou no QA Logger.

## 6. Limitações conhecidas

- O app depende das CLIs externas estarem instaladas, autenticadas e acessíveis no `PATH`.
- O modo de chat está depreciado: pode ser usado para compatibilidade, exportação de histórico e exclusão de conversas antigas, mas não recebe novos fluxos de produto; use o canvas para trabalho novo.
- No painel **Logs da CLI** do chat, a tela mostra uma janela limitada para permanecer navegável. A exportação **Markdown para análise** conserva o histórico completo da execução enquanto o app estiver aberto; limpar os logs ou encerrar o app remove esse arquivo temporário. Uma linha que a CLI imprime fora do formato esperado aparece ali como **Linha não reconhecida**, do jeito que veio, e a resposta continua.
- **Leitura do terminal:**
  - só o Claude Code e o Codex têm leitura formatada. As regras vêm de gravações
    das versões 2.1.286 e 0.156.1; uma versão nova pode desenhar diferente. O
    Gemini não pôde ser gravado (a conta pessoal do Google não entra mais no
    Gemini CLI 0.62) e, como os outros programas, aparece como texto puro;
  - a Leitura vê o que o terminal tem na tela e no histórico, até 2000 linhas.
    Por padrão, o Claude desenha a conversa numa tela sem histórico: o que já
    rolou para fora da tela do Claude não aparece na Leitura. Com a opção
    **Rolagem no terminal do Claude Code** ligada, os terminais novos do Claude
    guardam a conversa no histórico, e a Leitura alcança o começo dela;
  - o reconhecimento olha o estilo das letras. Um título sem negrito ou um
    código sem cor pode sair como parágrafo, e um parágrafo que começa com
    código pode sair como bloco de código. O texto nunca some: quando a
    estrutura não confere com a tela, a fala aparece como texto puro;
  - quando a CLI quebra uma palavra no meio por falta de largura, a Leitura junta
    as duas partes com um espaço;
  - o app não tem busca dentro do terminal; na Leitura, o texto pode ser
    selecionado e copiado como qualquer texto.
- O auto-update silencioso também existe no launcher do código-fonte; no macOS, o prompt de atualização forçada vem confirmado por padrão. `npm run dev` direto não executa atualização Git.
- No Linux, prefira AppImage para o fluxo de auto-update. `.deb` exige reinstalação/atualização tradicional.
- **macOS bloqueia a primeira execução.** Os artefatos não são assinados nem notarizados, então o Gatekeeper barra o app até que ele seja liberado manualmente (ver a [seção de instalação para macOS](#macos)). Não há como evitar isso sem uma conta paga do Apple Developer Program.
- No Windows, o SmartScreen pode exibir um alerta enquanto a distribuição não tiver assinatura, mas o app abre após confirmar.
- Ambientes corporativos com antivírus, bloqueio de shell ou políticas rígidas podem impedir automações locais.
- O painel Code atual é read-only; ações Git com escrita ainda dependem de política de confirmação.
- **Cadeia de contas:**
  - a detecção usa as frases de falha conhecidas das versões instaladas de cada
    CLI. Uma versão nova, uma quebra de linha num bloco estreito ou a repintura
    do terminal podem esconder a mensagem. O efeito é o app **não** detectar,
    nunca trocar por engano; nesse caso, use **Passar responsabilidade** à mão;
  - o Gemini fica fora da cadeia até o app ter uma checagem de login para ele;
  - no Openia, a falta de crédito não é detectada no terminal, só pela medição
    de créditos do painel;
  - a checagem de login é local: a credencial existe na pasta da conta, mas o
    servidor ainda pode recusá-la. Uma falha de login ou de cobrança logo
    depois da troca fica registrada e põe a conta de destino em espera;
  - a cadeia reage a uma falha; ela não troca de conta antes do limite;
  - "Mais quota primeiro" só compara contas com medição recente, e comparar
    capacidade entre provedores é uma aproximação;
  - o Claude pode continuar sozinho na conta antiga depois do reset. O app avisa,
    mas não cancela essa continuação por você;
  - a **Passar responsabilidade** feita à mão ainda não mascara segredos no
    histórico enviado; só a continuação confirmada pela cadeia mascara.
- **Retomada de conversas:**
  - a falha de uma retomada (conversa não encontrada ou pedido de login) é
    reconhecida pelas frases que as versões medidas das CLIs imprimem. Uma versão
    nova pode mudar o texto; nesse caso o app não anota a falha, a mensagem da
    CLI continua visível no terminal, e o próximo **Reiniciar terminal** tenta a mesma
    conversa de novo;
  - o Gemini não é retomado pelo ID: um bloco do Gemini com conversa registrada
    sempre pede a escolha (ver a tabela de limites em
    [Retomar conversas de agentes](#retomar-conversas-de-agentes));
  - o app só registra uma conversa quando consegue identificá-la sem dúvida. Duas
    conversas abertas ao mesmo tempo na mesma pasta ficam sem registro, e o bloco
    cai na lista da CLI;
  - a lista da CLI (`/resume`) filtra pela pasta, e cada conta tem as suas
    conversas: uma conversa de outra pasta ou de outra conta pode não aparecer
    nela.

## 7. Solução de problemas

**O app não abre no Windows.**

Verifique se o instalador veio da página oficial de Releases, se o antivírus não colocou o executável em quarentena e se o SmartScreen permitiu a execução.

**A janela abre preta ou a interface não termina de carregar.**

Abra **Configurações > Renderização e recuperação** (a engrenagem no pé da faixa
de ícones do canvas). O modo
**Automático** preserva a aceleração da GPU e ativa o fallback de software
automaticamente em Windows com pouca memória. Se o driver antigo continuar
causando a tela preta, escolha **Modo compatível (sem GPU)** e clique em
**Salvar modo gráfico**; a escolha vale a partir da próxima abertura do app.

Se a interface já estiver visível, o botão **Recarregar interface** recarrega
somente o renderer, mantendo o processo principal e os terminais abertos. Isso
permite recuperar a tela sem encerrar o aplicativo inteiro.

Se o problema começou depois de escolher uma **placa de vídeo** (opção avançada
na mesma seção), feche e abra o app de novo: um início que não termina (ou que
fecha sem mostrar a janela, ao tentar reabrir na Integrada) faz a escolha voltar
sozinha para **Automático** na abertura seguinte.

**O app não abre no Linux.**

Se estiver usando AppImage, confirme a permissão de execução com `chmod +x Felixo-AI-Core-*.AppImage`.

**O macOS bloqueou a primeira abertura.**

Esperado: a distribuição pública ainda não é notarizada. Libere o app em **Ajustes do Sistema > Privacidade e Segurança > Abrir Assim Mesmo**, ou rode `xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"`. O procedimento completo está na [seção de instalação para macOS](#macos).

**O macOS pede para escolher um aplicativo na App Store.**

É o mesmo bloqueio acima, com outra mensagem: o sistema não reconhece o `.app` como executável porque ele não tem assinatura. O Felixo não é distribuído pela App Store e não precisa de nenhum aplicativo adicional — siga os passos da [seção de instalação para macOS](#macos).

**O macOS diz que o app está "danificado".**

Também é o mesmo bloqueio, e o download não está corrompido. Neste caso o botão **Abrir Assim Mesmo** costuma não aparecer; use `xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"`.

**Uma CLI não foi detectada.**

Primeiro, peça o diagnóstico ao próprio app. Ele fica no ícone **Diagnosticar CLIs** do **Gerenciar modelos** (tela Chat → **Configurar modelos** → **CLIs oficiais**) ou no botão **Ver diagnóstico** do aviso de falha da instalação. Ele diz se a CLI não está instalada, está fora do `PATH` que o app enxerga, está sem permissão de execução, tem um atalho quebrado ou não respondeu, e indica o que fazer. Nada é instalado nesse passo.

Depois, rode `claude --version`, `codex --version`, `gemini --version` ou `git --version` no terminal. Se funcionar fora do app, veja em que pasta a CLI está (`command -v codex` no Linux e no macOS, `where codex` no Windows) e procure essa pasta em **PATH que o app enxerga**, no fim do diagnóstico. Se ela não estiver na lista, reinicie o Felixo ou configure `FELIXO_CLI_PATHS` com ela.

**Um arquivo `.PY` não inicia no macOS.**

O Felixo executa arquivos Python com `python3`, inclusive quando a extensão
está em maiúsculas. Confirme `python3 --version` no Terminal, instale o Python
3 se necessário e reinicie o app para que o shell de login carregue o PATH.

**O agente não voltou para a conversa anterior.**

Leia o título e o texto no cartão do bloco: eles dizem o motivo (a tabela está em
[Retomar conversas de agentes](#retomar-conversas-de-agentes)). Se o bloco mudou
de pasta ou de conta, volte para a pasta ou a conta em que a conversa nasceu. Se
a CLI pediu login, faça o login na CLI daquela conta e use **Tentar retomar de
novo**. Se preferir seguir sem a conversa antiga, **Abrir conversa nova** não
apaga o registro dela. Para relatar um problema, copie o ID da conversa em
**Detalhes do terminal**; ele não aparece nas mensagens do cartão.

**A IA retorna erro de login/autenticação.**

Abra a CLI diretamente no terminal e refaça o login ou a configuração conforme o provider. O Felixo apenas chama a CLI já autenticada.

**A atualização não aparece.**

No app empacotado, o update usa GitHub Releases. No código-fonte, use o
launcher; no macOS, confirme o prompt padrão de atualização forçada. Também é
possível atualizar manualmente com `python3 start_app.py --update`.

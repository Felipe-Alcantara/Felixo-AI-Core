# Guia do Usuário Final - Felixo AI Core

Status: concluido.
Última revisão: 2026-09-28.

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

Se o comando funcionar no terminal, mas não no app, reinicie o Felixo. Em instalações fora do `PATH` padrão, defina `FELIXO_CLI_PATHS` com uma ou mais pastas extras onde os executáveis ficam instalados.

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
  aberta. Se o bloco estiver em outra conta, vale o aviso de `/resume` manual.
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
- Diagnosticar por que uma CLI não aparece, sem instalar nada: em **CLIs oficiais**, o ícone **Diagnosticar CLIs** (ao lado de **Atualizar detecção**) mostra, em cada cartão de Codex, Claude Code e Gemini, a causa ("Não instalada", "Instalada, mas invisível ao app", "Bloqueada por permissão"…) e a próxima ação. Com o diagnóstico na tela, **Instalar** só aparece onde reinstalar resolve. **Copiar texto para o suporte** copia um resumo sem nome de usuário, URL nem segredo. Fechar o gerenciador descarta o diagnóstico.
- Instalar CLIs oficiais usando o instalador configurado para cada provider.
- Abrir login oficial da CLI no terminal do sistema.
- Adicionar uma CLI pelo comando, por exemplo `codex`, `claude` ou `gemini`.
- Remover modelos cadastrados.
- Clicar em um modelo no painel **Modelos** para configurar o modelo do provider e o effort quando o adapter suportar.

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

### Felixo System Design

Em **Configurações** (a engrenagem no pé da faixa de ícones do canvas), o bloco **Felixo System Design** sincroniza
o repositório de padrões e mostra o índice usado pelos agentes. A sincronização
de repositórios privados usa a autenticação segura já configurada no Git
(credential helper, Keychain do macOS, Credential Manager do Windows ou
equivalente). Não coloque usuário, senha, token ou parâmetro secreto na URL do
repositório; quando uma configuração legada contém esse formato, o app remove
essas partes antes de salvar e de chamar o Git.

O bloco mostra três coisas que costumam ser confundidas: a **fonte** (repositório e
branch), o **estado da sincronização** e **de onde vem o conteúdo que os agentes
estão recebendo agora**. Depois de trocar a fonte, ou quando a sincronização falha,
o conteúdo em cache ainda é o da fonte anterior — e a tela diz isso, em vez de
afirmar que a nova já vale. O texto do lembrete de padrão de qualidade e o bloco
enviado ao orquestrador citam a mesma fonte, com o mesmo estado.

- **Padrão do app:** sem escolha sua, o Felixo segue o padrão dele. Se o padrão do
  app mudar numa atualização, você passa a recebê-lo.
- **Fonte escolhida por você:** nunca é trocada por um novo padrão do app. O botão
  **Voltar ao padrão do app** descarta a escolha e sincroniza de novo.
- **Instalação anterior a esta versão:** configuração igual ao padrão vira "segue o
  padrão"; qualquer outra vira "escolhida por você" e é preservada como estava.
- Uma URL inválida é recusada com o motivo, sem alterar nada.

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
- Ao reiniciar o aplicativo, um terminal de agente que já existia recebe `/resume` seguido de Enter como primeira instrução, em vez do prompt inicial, para retomar a conversa anterior.
- O prompt inicial de contexto (padrão de qualidade, identidade no canvas, arquivos ligados) é **digitado sem Enter**: ele fica na linha de entrada do agente esperando que você escreva o pedido depois dele, e vai junto quando você enviar. Só `/resume` e a passagem de responsabilidade são enviados sozinhos, porque carregam uma instrução de verdade.
- Esse contexto é digitado quando a CLI mostra que a entrada dela está pronta, e não num tempo fixo depois da abertura — em agentes que abrem uma tela de aviso ou de confiança antes do prompt, ele espera essa tela ser respondida. Em modo yolo, o app responde sozinho o aviso do Claude Code, que aparece uma vez por máquina.
- Ao trocar de agente no configurador, a conta e a lista do agente anterior são limpas imediatamente. Consultas antigas que terminarem depois são descartadas, e o processo principal ainda confere conta, provedor e comando antes de criar o PTY; uma combinação incompatível não inicia o terminal.
- Ao reiniciar um terminal pelo drawer lateral, o app reaproveita o `accountId` e o provedor persistidos no bloco. O restart continua no perfil selecionado; sem `accountId`, o terminal usa o login do sistema.
- O histórico visual usa 20.000 linhas quando há até 9 terminais e 5.000 linhas quando o canvas já tem 10 ou mais. O limite é escolhido ao criar a sessão; terminais que já estavam abertos não são redimensionados nem perdem linhas quando outro terminal é adicionado.
- Se o histórico visual ultrapassar o limite, o cartão e a gaveta avisam. Fechar e reabrir o terminal reaplica o replay vivo mantido pelo processo principal, de até 200.000 caracteres; **Copiar** e **Handoff** usam o trecho que ainda está no buffer visual.

### Links: escolher onde abrir

Nenhum link abre direto. Ao abrir um link, aparece um menu curto com o destino escrito: primeiro o site (ou o e-mail) e, embaixo, o endereço inteiro. Um link pode exibir um texto e apontar para outro endereço, e o menu mostra para onde ele leva de verdade. Depois, é só escolher:

- **Abrir no navegador**: abre no navegador do sistema. Num link de e-mail, o botão vira **Abrir no app de e-mail**.
- **Abrir como Página Web**: cria um bloco Página Web no canvas, ao lado de onde o link estava. Na tela do chat não há canvas, então essa opção não aparece.
- **Copiar link**: copia o endereço e não abre nada.

O jeito de chamar o menu depende de onde o link está:

- **Terminal**: `Ctrl`+clique (`Cmd` no macOS), um toque na tela ou o clique direito sobre o link. Um clique simples continua sendo do terminal (foco, seleção de texto).
- **Notas, arquivos `.md`, respostas do chat e painel do Notion**: clique no link, `Enter` com o link em foco, ou o clique direito. O clique do meio não abre nada.
- **Dentro de uma Página Web**: clique direito sobre um link da página. O clique simples continua navegando dentro do bloco. Para levar a página atual ao navegador do sistema, use o botão **Abrir esta página no navegador**, ao lado da barra de endereço.

O menu funciona pelo teclado: setas, `Home` e `End` escolhem, `Enter` confirma, e `Esc` ou `Tab` fecham e devolvem o foco para onde você estava.

Se o app recusar um link, o menu diz por quê e oferece só **Copiar link**. O motivo pode ser um tipo de endereço que o app não abre (como `file:`), caracteres invisíveis que disfarçam o destino ou usuário e senha no endereço. Caracteres invisíveis aparecem no menu com o código deles, como `⟨U+200B⟩`. A dica sobre um link recusado (no terminal ou no texto) também traz o motivo. A barra de endereço da Página Web faz o mesmo: um endereço recusado mostra o motivo em vez de simplesmente não abrir.

Quando um agente pede para abrir uma página (`felixo browser open`), nada abre sozinho. Um cartão aparece no alto do canvas com o endereço inteiro, de onde veio o pedido e o destino que o agente sugeriu. Você escolhe **Abrir no navegador**, **Abrir como Página Web** ou **Recusar**, e o agente consegue consultar a resposta. Com vários pedidos na fila, **Recusar todos** limpa a fila de uma vez. O cartão não pega o foco nem responde a teclas, para um `Enter` digitado no terminal não confirmar nada sem querer.

### Colar imagens em um agente

Cole com o atalho normal do sistema (`Ctrl+V`, ou `Cmd+V` no macOS) dentro do terminal do agente. Se houver uma imagem na área de transferência, o app a salva junto dos outros anexos e digita o caminho do arquivo na linha de entrada, seguido de um espaço, para você continuar escrevendo o pedido. Colar texto continua funcionando como antes.

Vale tanto para uma imagem copiada (captura de tela, "copiar imagem" no navegador) quanto para um arquivo de imagem copiado no gerenciador de arquivos. O app lê a área de transferência pelo próprio sistema operacional, então não é preciso instalar `xclip` ou `wl-paste` no Linux, e o atalho é o mesmo em todos os sistemas e para qualquer CLI de agente — que passa a receber sempre um caminho de arquivo, a única forma de imagem que um terminal consegue transportar.

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

- **Notas** tem duas seções: **Notas no canvas** lista os blocos de nota do quadro — clicar num item centraliza e seleciona o bloco, e "Nova nota" cria um bloco direto no canvas; **Notas salvas** são as notas persistidas, editáveis ali mesmo e também legíveis pelo modo de chat legado.
- **Source Control** mostra branch e status do projeto escolhido, com stage all e commit; erros do repositório aparecem no próprio painel, e o botão de atualizar recarrega o status.
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

Arquivos e pastas úteis:

- Banco SQLite: `database/felixo.sqlite` dentro do diretório de dados do app.
- Arquivos Markdown do canvas: pasta `canvas-files` dentro do diretório de dados do app.
- Logs do Electron: pasta `logs` dentro do diretório de dados/logs resolvido pelo Electron.
- QA Logger: painel dentro do app com eventos recentes de execução, mantido em memória durante a sessão.

Se estiver reportando um problema, inclua a versão do app, sistema operacional, CLI usada e o erro exibido no Terminal ou no QA Logger.

## 6. Limitações conhecidas

- O app depende das CLIs externas estarem instaladas, autenticadas e acessíveis no `PATH`.
- O modo de chat está depreciado: pode ser usado para compatibilidade, exportação de histórico e exclusão de conversas antigas, mas não recebe novos fluxos de produto; use o canvas para trabalho novo.
- No painel **Logs da CLI** do chat, a tela mostra uma janela limitada para permanecer navegável. A exportação **Markdown para análise** conserva o histórico completo da execução enquanto o app estiver aberto; limpar os logs ou encerrar o app remove esse arquivo temporário.
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

Depois, rode `claude --version`, `codex --version`, `gemini --version` ou `git --version` no terminal. Se funcionar fora do app, reinicie o Felixo ou configure `FELIXO_CLI_PATHS`.

**Um arquivo `.PY` não inicia no macOS.**

O Felixo executa arquivos Python com `python3`, inclusive quando a extensão
está em maiúsculas. Confirme `python3 --version` no Terminal, instale o Python
3 se necessário e reinicie o app para que o shell de login carregue o PATH.

**A IA retorna erro de login/autenticação.**

Abra a CLI diretamente no terminal e refaça o login ou a configuração conforme o provider. O Felixo apenas chama a CLI já autenticada.

**A atualização não aparece.**

No app empacotado, o update usa GitHub Releases. No código-fonte, use o
launcher; no macOS, confirme o prompt padrão de atualização forçada. Também é
possível atualizar manualmente com `python3 start_app.py --update`.

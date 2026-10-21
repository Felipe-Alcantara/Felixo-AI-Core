# Guia de contas, limites e diagnóstico das CLIs

Ver e trocar a conta da CLI oficial, entender por que uma CLI não aparece, acompanhar limites e uso por conta, usar uma conta por terminal e continuar o trabalho em outra conta quando o limite acaba.

## Conta da CLI oficial: ver e trocar

No gerenciador de CLIs (Modelos > CLIs oficiais), uma CLI que expõe operações de conta — hoje o Codex — ganha dois botões:

- **Status da conta** roda o comando de status da própria CLI (`codex login status`) e mostra o que ela responder. Identidade (conta, plano, organização) só aparece quando a CLI a imprime; quando ela informa apenas "conectado", a tela diz exatamente isso, em vez de sugerir qual conta está em uso. O app não lê arquivo de credencial nem deduz identidade por caminho no disco, e a saída do comando é redigida antes de virar mensagem ou linha de log.
- **Trocar conta** abre uma confirmação antes de qualquer coisa: ela mostra a conta autenticada, lista os terminais do canvas que estão rodando aquela CLI e explica o efeito. Só depois de confirmar é que o app executa o logout e abre o login oficial em um terminal do sistema. Cancelar não desconecta nada.

**Efeito sobre terminais abertos.** O app não encerra nenhum processo durante a troca: o cartão, o diretório e o histórico do terminal continuam no canvas. Isso não é o mesmo que preservar a autenticação — um processo que já estava rodando pode perder a autorização no meio do trabalho, porque a credencial que ele carregou é a da conta anterior. Quando isso acontecer, reinicie aquele terminal pelo botão de reiniciar do próprio cartão: o nó e o diretório são reaproveitados; o contexto interno da CLI, não.

**Recuperação manual.** Se o app não conseguir abrir um terminal para o login, a troca informa o comando a rodar à mão (`codex login`). Para conferir o estado a qualquer momento, `codex login status` no terminal responde o mesmo que o botão.

## Diagnóstico das CLIs

Quando uma CLI de IA não aparece, o app explica o motivo sem instalar nada. Há dois caminhos:

- em **Gerenciar modelos** (tela Chat, ícone **Configurar modelos** da barra lateral), seção **CLIs oficiais**, o ícone **Diagnosticar CLIs**, ao lado de **Atualizar detecção**;
- no aviso **Não foi possível instalar as CLIs de IA**, que só aparece quando a instalação automática falha, o botão **Ver diagnóstico**.

Cada CLI com instalação automática (Codex, Claude Code e Gemini) ganha uma linha com a causa e a próxima ação. As causas possíveis são: pronta, não instalada, instalada mas invisível ao app (fora do `PATH`), bloqueada por permissão, sem resposta a tempo, atalho que não executa, falha ao responder, instalação incompleta ou falha de rede. Com o diagnóstico na tela, **Instalar** só continua onde reinstalar resolve, isto é, em "não instalada" e "instalação incompleta". **Copiar texto para o suporte** copia um resumo que o processo principal já limpa: sem nome de usuário, URL nem segredo.

O diagnóstico é uma fotografia. Fechar o gerenciador o descarta, e **Atualizar detecção** o refaz se ele estiver na tela. O Openia não entra no diagnóstico e mantém o **Instalar** de sempre.

## Limites e uso por conta

O painel **Limites e uso** (menu **Ferramentas** do canvas) reúne as contas
detectadas de cada CLI instalada, agrupadas por provedor. Cada provedor abre com
um **resumo**: para cada conta, o identificador numa linha própria e, logo
abaixo dele, o plano, quanto sobra em cada janela de uso da conta e o status da
leitura — dá para comparar as contas do mesmo provedor de uma vez. Logo abaixo,
o **/status completo** de cada conta fica recolhido e abre com um clique: as
barras com o horário do reset, a fonte, os resets bancados e todos os dados que
a CLI publica. O identificador da conta aparece inteiro, mesmo com o painel
estreito, para dar para dizer qual linha é qual; quem separa as contas
por dentro é um fingerprint SHA-256, não esse texto. Nenhum token, cookie,
chave ou senha é lido para o painel ou gravado por ele.

Cada número mostra de onde veio e **quando foi medido**, que nem sempre é quando
o app leu — uma fonte que só é atualizada durante a sessão continua exibindo o
último valor conhecido, marcado como antigo em vez de apresentado como atual.
Onde a CLI não oferece cota consultável sem interação, o painel diz isso por
extenso, em vez de mostrar zero. As fontes declaradas com consulta ao vivo são
executadas em cada atualização e por conta/perfil: o Codex lê o app-server
autenticado e a tela do `/status` (ver abaixo), o Claude abre uma sessão PTY
descartável e executa o `/status`, e o Openia chama seu `statusline`. Por
isso o painel não copia o limite do login do sistema para outra linha. Ao
abrir, o painel mostra o que já tem e só consulta de novo se a última coleta
completa tiver 5 minutos ou mais (ou se ainda não houve coleta desde que o app
abriu). Abaixo disso, a coleta recente vale para aquela abertura, e o selo
**ao vivo** mostra a hora dela: abrir e fechar o painel várias vezes não refaz
a consulta de todas as contas. O botão **Atualizar** sempre repete a consulta,
e a atualização automática pode ser configurada em intervalos de 5, 15 ou 30
minutos.

No Claude Code, cada linha também traz **Dados completos do /status**: versão,
sessão, peer, pasta, método de login, organização, e-mail, modelo, fontes de
configuração, custo, duração, alterações, uso por modelo, janelas, resets,
promoção, explicação/atribuição das últimas 24 horas e créditos de uso. Esses
campos são extraídos e redigidos antes de serem armazenados; a saída bruta do
terminal nunca vai para o renderer.

No Codex, o `/status` completo de cada conta vem de duas leituras feitas ao
mesmo tempo, com o login daquela conta:

- **app-server** (`codex app-server --stdio`, só leituras): as janelas de 5 h e
  semanal, a reserva semanal de um modelo (marcada **só este modelo** — zerada,
  ela para aquele modelo, não a conta, e a cadeia de contas não a usa), o
  limite de gasto individual de workspace quando existe, créditos avulsos,
  resets bancados, tipo de login e plano, a configuração de modelos (modelo,
  esforço, resumo, verbosidade, provedor, nível de serviço, aprovação,
  sandbox, janela de contexto, compactação e busca na web — "padrão da CLI"
  quando não definida), os modelos disponíveis, o histórico de tokens da conta
  e os avisos de bloqueio de uso (que também aparecem no resumo);
- **tela do `/status`**: o texto exato que a CLI imprime — a linha do modelo
  com esforço e resumos, o provedor, a conta e o rótulo de cada limite — e o
  link da página de uso. A leitura abre o Codex escondido numa pasta temporária
  marcada como confiável só naquela execução (`-c projects=...`), espera os
  servidores MCP subirem e só digita com o campo de mensagem vazio, nunca
  responde a um diálogo com Enter e não envia mensagem nenhuma: o `config.toml`,
  o histórico e as sessões do Codex ficam como estavam. A leitura reconhece o
  `/status` com moldura (até o Codex 0.158) e sem moldura (0.159 em diante). Se
  a tela não for lida, os números continuam valendo e os detalhes dizem por quê.

Ficam de fora **de propósito** os campos do `/status` que descrevem a conversa
aberta em um terminal, não a conta: pasta, permissões da pasta, Agents.md,
nome e modo da conversa, ID da sessão e janela de contexto usada. O cartão do
Codex avisa isso. E-mail, IDs de conta/workspace, caminhos e instruções do
`config.toml` também nunca chegam ao painel.

O que cada CLI publica hoje:

| CLI | Fonte | O que aparece |
|-----|-------|---------------|
| Codex | app-server ao vivo (limites, conta, configuração, modelos e histórico de tokens) e a tela do `/status`, por conta/perfil; rollout local só como fallback | janelas de 5 h e semanal, reserva semanal por modelo, resets, créditos, plano, configuração, modelos, histórico de tokens, avisos de bloqueio e o texto do `/status` |
| Claude Code | `/status` interativo ao vivo por conta/perfil | Status + Usage completos, janelas de 5 h e semanal, resets, estatísticas e atribuição |
| Openia | `openia statusline` ao vivo (créditos da conta no OpenRouter) | usado, restante e total em US$ |
| Gemini | — | sem endpoint não interativo seguro: a quota só existe no `/stats model` interativo e fica explicitamente indisponível |

A coleta de status line do Claude Code continua **opcional e explícita** e serve
como fallback local: pelo botão do painel, o app registra um script no arquivo
de configuração do Claude Code, preserva uma status line que já exista (recusa
sobrescrever), continua imprimindo uma linha útil, e desligar a coleta devolve
a configuração ao estado anterior. A consulta principal do painel não depende
dessa instalação: ela usa o `/status` ao vivo.

## Conta por terminal

Cada conta cadastrada ganha uma pasta de login própria dentro do perfil do app,
e o terminal nasce autenticado nela. Não há logout entre contas: duas sessões
da mesma CLI, em contas diferentes, rodam ao mesmo tempo. O campo **Conta**
aparece no configurador de qualquer agente compatível; ele começa em **Login do
sistema**, oferece **+ Nova conta…** e mostra o botão **Remover** depois que um
perfil é selecionado. O padrão continua sendo o login que você já tem no
sistema.

O nome do perfil é único dentro de cada provedor: espaços repetidos, espaços nas
extremidades e diferenças de maiúsculas e minúsculas não criam uma segunda conta.
Para cadastrar outro login, use um nome diferente.

Na atualização do app, registros antigos que já tenham o mesmo nome são
corrigidos automaticamente: a primeira conta mantém seu identificador, os
perfis e as referências antigas são reapontados para ela e a lista deixa de
mostrar a duplicata. O perfil duplicado é preservado em uma cópia de segurança
local durante a migração; nenhuma credencial é descartada.

O login em si é feito pela própria CLI, dentro do terminal, na primeira vez que
você abre um perfil novo — o app não intermedeia credencial. A exceção é o
Openia: a chave digitada no configurador é guardada cifrada pelo chaveiro do
sistema. Sem conta selecionada ela atualiza o login global; com conta
selecionada ela fica vinculada somente àquela conta.

Para impedir que uma conta sem chave use acidentalmente a chave global, o
configurador consulta a lista atual da conta, que só expõe o booleano
`secretConfigured`. Antes de criar o PTY, o renderer consulta novamente o
estado e o processo principal repete a validação; conta Openia sem chave é
recusada antes do processo nascer. A chave nunca atravessa o renderer e o
estado falso não revela o conteúdo do segredo.

Ao trocar de agente no configurador, a conta e a lista anterior são limpas
imediatamente; respostas assíncronas antigas não podem repopular o campo. O
provedor acompanha o terminal até o processo principal, que confere comando,
provedor e conta antes de montar o ambiente do PTY. Uma combinação stale é
recusada sem iniciar processo nem expor o perfil errado.

Como cada CLI isola o login (medido, não presumido):

| CLI | Isolamento | Observação |
|-----|-----------|------------|
| Codex | `CODEX_HOME` | variável dedicada |
| Claude Code | `CLAUDE_CONFIG_DIR` | variável dedicada |
| Gemini | `HOME` próprio | não tem variável dedicada; o perfil recebe cópia de `.gitconfig`, `.ssh` e `.npmrc` para o trabalho no repositório continuar funcionando |
| Openia | `OPENROUTER_API_KEY` por conta; chave global sem conta | é o único caso em que o app guarda um segredo, cifrado pelo `safeStorage` do sistema; sem chaveiro disponível, o app recusa guardar em vez de salvar em texto |

Um terminal com conta própria não herda as chaves de API do ambiente do app
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` e afins): quem paga é a
conta escolhida, não uma chave que estava no ambiente. O Login do sistema
continua igual. A lista completa está na
[Política de Contas](../projeto/POLITICA-CONTAS.md#isolamento-de-credenciais).

Se um terminal for reiniciado pelo drawer lateral, o `accountId` e o provedor
persistidos no bloco acompanham o novo PTY. Assim, o restart mantém o perfil
selecionado; quando o bloco não tem `accountId`, ele continua usando o login do
sistema.

Remover uma conta pede confirmação e apaga a pasta de login dela — manter
credencial órfã seria pior que refazer o login. A pasta já ausente (`ENOENT`) é
tratada como removida; se o sistema devolver qualquer outra falha, a conta e a
credencial são preservadas, um diagnóstico seguro aparece na interface e a
remoção pode ser tentada novamente. Terminais já abertos podem perder esse
login; a ação é separada de **Remover do painel**, que aparece em **Limites e
uso** e arquiva somente o histórico local de uso, sem apagar o perfil de login.

Cada conta cadastrada também vira uma linha própria no painel **Limites e uso**,
com a quota lida da pasta dela — é assim que duas contas do mesmo provedor
aparecem com números separados. Enquanto a conta não tiver sido usada, a linha
diz isso em vez de mostrar zero.

### Claude por chave de API (bloco de conversa)

No agente **Claude**, o campo **Conta** tem **Nova conta por chave de API…**. A
conta guarda a chave do Console da Anthropic, cifrada pelo `safeStorage`, como a
do Openia. Ela não abre terminal: **Abrir conversa** cria um **bloco de
conversa** no canvas.

**Por que um bloco e não o terminal.** Medido em 19/10/2026 com o Claude Code
2.1.303, com uma organização que tinha saldo comprado zerado e crédito
promocional disponível:

| Jeito de rodar | Usa crédito promocional do Agent SDK? |
|---|---|
| Claude Code interativo (terminal), com login ou com chave | não: "Credit balance too low" |
| Claude Code sem tela (`claude -p`, o motor do Agent SDK), com a chave | sim |
| API direta / Playground | sim |

**O que o bloco faz**
- Roda o mesmo Claude Code, sem a tela dele:
  `claude -p --input-format stream-json --output-format stream-json`.
- Usa a pasta do projeto escolhido e o perfil da conta
  (`CLAUDE_CONFIG_DIR` + `ANTHROPIC_API_KEY`). As credenciais do Claude herdadas
  do ambiente do app são removidas antes.
- Mostra:
  - as respostas em Markdown;
  - cada ferramenta usada, com o resultado recolhível;
  - o gasto em US$ acumulado da conversa, informado pelo Claude Code a cada resposta.
- Aceita **imagem colada** (Ctrl+V) ou **solta** no campo de mensagem:
  - aparece em miniatura, com × para tirar, e vai junto da mensagem;
  - vale mandar só a imagem, sem texto;
  - até 10 por mensagem, em PNG, JPEG, GIF ou WebP;
  - outro formato (BMP, SVG, AVIF) vira PNG;
  - imagem acima de 5 MB ou de 8000 px é reduzida até caber;
  - a imagem vai em base64 dentro da mensagem, como a API recebe;
  - cada imagem pesa no gasto do turno e volta no contexto dos turnos seguintes.
- Usa **Modelo**, **Esforço** e **Yolo** do painel de agentes.
- **Sem Yolo**, cada ação que pede permissão (editar arquivo, rodar comando)
  aparece no bloco com **Permitir** e **Negar**.
- **Com Yolo**, roda em `bypassPermissions`.
- O contexto do canvas (padrão de qualidade, identidade, preset, arquivo de
  planejamento) vai como instrução de sistema (`--append-system-prompt-file`),
  sem gastar um turno; ele aparece recolhido no topo do bloco.
- O Claude Code abre assim que o bloco aparece, sem esperar a primeira
  mensagem (abrir não chama a API, então não gasta). Depois de 15 minutos sem
  uso o processo fecha sozinho; a próxima mensagem reabre na mesma conversa.
- **Parar** interrompe o turno sem fechar a conversa.
- A conversa fica gravada no bloco. Reabrir o app continua a mesma sessão do
  Claude (`--resume`).
- Remover o bloco encerra o processo dele.

**`/model` no bloco**
- O bloco atende o comando ele mesmo, porque sem a tela o `/model` do Claude Code não existe.
- `/model` sozinho mostra o modelo atual e as opções.
- `/model sonnet`, `opus`, `haiku` ou um nome completo (`claude-sonnet-5-5`) troca o modelo. `/model default` volta ao padrão da conta.
- A troca vale a partir da próxima mensagem: o processo reabre com o modelo novo e `--resume`, e a conversa continua.

**`/resume` no bloco**
- `/resume` lista as conversas anteriores desta conta neste projeto, da mais recente para a mais antiga, com data, número de mensagens e a primeira pergunta.
- `/resume <número>` (ou o id completo) carrega o histórico daquela conversa no bloco. A próxima mensagem continua dela (`--resume`).
- A lista vem da pasta do perfil da conta (`projects/` do `CLAUDE_CONFIG_DIR`), então só aparecem conversas desta conta.
- O gasto em US$ recomeça do zero na conversa retomada, porque o arquivo do Claude Code não guarda o custo.

O processo do bloco não herda as variáveis `CLAUDE*` e `ANTHROPIC_*` do ambiente do app; ficam só `CLAUDE_CONFIG_DIR` e `ANTHROPIC_API_KEY` da conta. Com o Felixo aberto de dentro de um Claude Code, o `CLAUDE_CODE_SESSION_ID` herdado fazia todo bloco gravar na mesma conversa.

**Avisos na conversa**
- Chave recusada (401): orienta a remover a conta e criar de novo com a chave certa.
- Sem saldo: orienta a conferir saldo e créditos no Console.
- Limite de requisições, API sobrecarregada, CLI ausente e processo que caiu também viram aviso.

**Ficam de fora desta versão**
- Os outros comandos de barra do Claude Code (`/usage`, `/compact`…). O `/model` e o `/resume` funcionam: veja abaixo.
- O modo fast (exige liberação no modo sem tela).
- A cadeia de contas: conta por chave não entra na cadeia.
- A linha da conta no painel **Limites e uso**, porque conta por chave não tem quota de assinatura.
- Ligar arquivos `.md` ao bloco depois de criado.

**Onde a conta por chave não serve**
- Terminal: é recusada com uma mensagem que aponta para o bloco.
- Agente na nuvem: também é recusada, porque ele exige uma conta com login.
- Exportar o canvas leva o bloco vazio: só o nome e as escolhas de modelo, sem
  conta, pasta, contexto nem conversa.

## Cadeia de contas

Quando a conta de um terminal bate o limite de uso, perde o login ou fica sem
crédito, a **cadeia de contas** propõe continuar o trabalho em outra conta
cadastrada, inclusive de outro provedor. Ela vem **desligada** e nunca troca
sozinha: toda troca mostra de qual conta sai, para qual vai e por quê, e só
acontece depois da sua confirmação. Para ligar, abra **Ferramentas → Limites e
uso → Cadeia** e habilite as contas que podem receber uma troca.

- **Quatro estratégias:** Ordem manual, Rodízio, Mais quota primeiro e
  Assinatura antes de uso. "Mais quota" compara a capacidade absoluta
  (`restante% × multiplicador do plano`): 50% num plano 20x vem antes de 100%
  num plano 1x.
- **Só conta apta recebe uma troca:** login conferido pela própria CLI naquela
  conta nos últimos 15 minutos, fora de espera. Quota só pesa com medição
  recente.
- **O terminal antigo fica intacto.** A troca abre um bloco novo na conta de
  destino, com o histórico mascarado como contexto; o processo que está rodando
  nunca troca de conta, e o app não escreve nele.
- **Limite não se confunde com rede.** Queda de rede, servidor sobrecarregado e
  tempo esgotado não põem a conta em espera nem geram proposta.
- **Um bloco escolhido à mão continua fixo** na conta dele, e toda troca fica
  registrada com motivo e horário na aba **Trocas**.
- O orquestrador do chat também pede confirmação antes de trocar de provedor.

Como usar, passo a passo, no [Guia do Usuário](GUIA-USUARIO.md#cadeia-de-contas-seguir-em-outra-conta-com-a-sua-confirmação);
a regra completa na [Política de Contas](../projeto/POLITICA-CONTAS.md); as
camadas e o fluxo na [Arquitetura](../projeto/ARQUITETURA.md#cadeia-de-contas).

Ideias para quem quiser contribuir: checagem de login por conta para o Gemini
(que hoje fica fora da cadeia), captura do aviso de limite como ele aparece de
verdade no terminal em Linux, macOS e Windows, e medição de uso por conta sob
demanda para "Mais quota" comparar mais contas.

---

Voltar ao [README](../../README.md).

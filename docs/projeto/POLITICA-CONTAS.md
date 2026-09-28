# Política de Contas — cadeia, elegibilidade e troca confirmada

Define como o Felixo AI Core decide **se** e **para onde** um trabalho pode
continuar quando a conta de uma CLI de agente bate o limite, perde o login ou
fica sem crédito. Não é uma proposta: é a regra que o código implementa e que
os testes protegem. O desenho completo, com o mapa de arquivos, a sequência de
commits e o mapa de testes, está em
[`PLANO-CADEIA-CONTAS.md`](PLANO-CADEIA-CONTAS.md).

Escopo: terminais de agente do canvas (Claude, Codex, Gemini e Openia, com
conta própria ou no Login do sistema) e o orquestrador do chat. Linux, macOS e
Windows.

Estado: implementação em andamento na branch `feat/cadeia-contas`, a partir de
`origin/main` `116f0569`. Enquanto a cadeia estiver desligada (o padrão), nenhum
bloco troca de conta.

## Decisões do dono (fechadas)

1. **Confirmação: sempre.** Toda troca mostra a conta de origem, a conta de
   destino e o motivo. Nenhuma troca acontece sozinha.
2. **Qualquer provedor.** Codex, Claude, Gemini e Openia (OpenRouter) podem ser
   membros, e a troca pode mudar de provedor.
3. **Quatro estratégias:** Ordem manual, Rodízio, Mais quota primeiro e
   Assinatura antes de uso. "Mais quota" compara capacidade absoluta:
   `restante% × multiplicador do plano` ("50% com 20x é maior que 100% com 1x").
4. **Desligada por padrão**, ao instalar e ao atualizar. Ao ligar, começa em
   Ordem manual.
5. **Conta escolhida à mão continua fixa.** A pessoa pode fixar a conta de um
   bloco ou desligar a cadeia.
6. **Sessão ativa que bate o limite:** o app avisa, põe a conta em espera e,
   com confirmação, abre um bloco **novo** na próxima conta levando o contexto.
   O terminal antigo fica parado e intacto. Processo vivo nunca troca de conta.
7. **Orquestrador do chat** pede confirmação antes de trocar de provedor.
8. **Entrega:** tudo junto.

Derivadas do aceite:

- uma conta só é **apta** com login conferido pela própria CLI, naquela conta,
  há pouco tempo;
- a quota só pesa com **medição atual** (valor antigo nunca prova nada);
- o Gemini fica fora da cadeia até o app ter checagem de login para ele.

## Princípios (cada um com teste)

| # | Princípio | O que garante |
|---|---|---|
| P1 | Trava no serviço | Só o processo principal cria proposta e ticket; um ticket vale uma vez e só para a conta confirmada. |
| P2 | Processo vivo não troca de conta | O ambiente é montado só no spawn; reanexar um bloco a uma sessão de outra conta é recusado. |
| P3 | Elegibilidade conservadora | Sem login recente conferido pela CLI, a conta fica fora. Ausência de dado nunca vira 0 nem 100. |
| P4 | Classe errada nunca troca | Rede, servidor, tempo esgotado e cancelamento não põem conta em espera nem geram proposta. Caso ambíguo pede escolha. |
| P5 | Nada é reenviado sem prova | O bloco novo recebe o contexto uma única vez; o último pedido não é redigitado. |
| P6 | Decisão só no SQLite, com compare-and-set | Um reinício invalida o que estava pendente e nunca o executa. |
| P7 | Segredo não sai | Evidência, motivo e contexto passam por redação; a identidade circula só como impressão digital. |
| P8 | Caminho quente barato | A leitura da saída do terminal é adiada, limitada em bytes e tem teto de custo medido. |
| P9 | Sem laço | Uma proposta aberta por sessão, a mesma evidência nunca gera duas propostas e há teto de saltos por linhagem. |

## Classes de falha

A classificação acontece no processo principal, num classificador único. O
renderer só consome o resultado.

Precedência quando mais de uma classe aparece:
`cancelado > login > cobrança > limite > servidor > rede > tempo > desconhecido`.

| Classe | Exemplos | Conta entra em espera? | Bloco na cadeia (ligada) | Bloco fixo ou cadeia desligada | Login do sistema |
|---|---|---|---|---|---|
| limite (da conta) | "Usage limit reached · continuing automatically at …", "You’ve hit your usage limit." | sim, até o reset | aviso + proposta | aviso + espera + "Passar responsabilidade…" | só aviso |
| limite (de um modelo) | "You’ve hit your usage limit for ‹modelo›" | não | aviso: trocar de modelo resolve | idem | idem |
| login | "Not logged in · Please run /login" | sim, até checagem OK | aviso + proposta | aviso + espera | só aviso |
| cobrança | "Credit balance is too low", "You're out of credits" | sim, até ação + checagem | aviso + proposta, com destaque de custo | aviso + espera | só aviso |
| ambíguo (ex.: 403) | — | só se a pessoa disser que é limite | "Tratar como limite?" | idem | só aviso |
| servidor, rede, tempo | 529, `server_overloaded`, ECONNRESET, "stream disconnected" | **nunca** | aviso curto: trocar de conta não resolve | idem | idem |
| cancelado, desconhecido | — | nunca | nada | nada | nada |

Regras do terminal:

- No terminal só valem frases **inteiras e por provedor**, conferidas nos
  pacotes instalados das CLIs e versionadas como fixture
  (`app/electron/__fixtures__/cli-failure-vocabulary.json`). Um agente pode
  imprimir "401 Unauthorized" ou "rate limit" como parte do trabalho; isso não é
  falha da conta.
- Exclusões vencem inclusões na mesma linha ("Usage limit reached · wrapping
  up" é a janela de tolerância do Claude, com o agente ainda trabalhando).
- Um código de status isolado (`429`, "line 429") nunca basta.
- O Openia não tem mensagem própria de falta de crédito: fica **sem** detecção
  no terminal, e a falta de crédito só aparece pela medição de créditos.

## Quem pode receber uma troca (elegibilidade)

A primeira razão que bloqueia decide, nesta ordem. Toda razão tem texto na UI.

1. Cadeia desligada ou membro desabilitado.
2. Conta removida.
3. Provedor sem checagem de login (hoje, o Gemini).
4. Openia sem chave.
5. Em espera, ou com espera vencida sem checagem posterior.
6. Esgotada por medição atual (alguma janela em 0%), até o reset dela.
7. Login não conferido nos últimos 15 minutos.
8. Deslogada, CLI ausente ou checagem com tempo esgotado.
9. Identidade diferente da esperada, ou a mesma identidade de outra conta.
10. É a origem, ou já foi visitada nesta linhagem.

**Checagem de login.** Roda só o comando de status da própria CLI, com o mesmo
ambiente do spawn daquela conta. É preguiçosa: no máximo 3 checagens por
proposta e 2 CLIs ao mesmo tempo, nunca em timer de fundo. É uma checagem
**local** (prova que a credencial existe, não que o servidor a aceita); por isso
uma falha de login logo depois da troca volta ao registro e põe o destino em
espera.

## Estratégias e capacidade

Todas recebem só as contas aptas, na ordem manual, com desempate por posição e
depois pelo identificador da conta.

| Estratégia | Regra |
|---|---|
| Ordem manual (padrão ao ligar) | a primeira apta na ordem |
| Rodízio | a primeira apta depois do último destino que de fato abriu; recusa e falha de spawn não gastam a vez |
| Mais quota primeiro | maior capacidade primeiro; contas sem medição atual vão depois de todas as medidas |
| Assinatura antes de uso | assinatura, depois cobrança desconhecida, depois uso |

**Medição atual:** amostra com estado `current`, horário válido e até 15
minutos. Horário ausente ou inválido **não** é atual.

**Capacidade:** `menor restante% entre as janelas × multiplicador`. A janela
mais apertada manda. O multiplicador vem, nesta ordem, do campo de plano que a
CLI publicar, da declaração da pessoa (1 a 100) ou vale 1 com o selo "não
declarado". Nenhuma CLI instalada hoje publica "20x": na prática vale a
declaração. Comparar capacidade entre provedores é heurística; o diálogo mostra
os números e a fonte, e a pessoa decide.

**Cobrança** (assinatura ou uso): vale a declarada; na falta dela, a detectada.
Se divergirem, a conta é tratada como desconhecida. Desconhecida **nunca** é
presumida como assinatura.

## Espera por conta

| Classe | Fim da espera |
|---|---|
| limite | horário de reset; depois disso a conta só volta a ser apta com nova checagem de login |
| login | checagem com login OK posterior à detecção |
| cobrança | "Já recarreguei" e checagem OK (no Openia, também uma medição atual de créditos acima de zero) |

Fonte do horário, em ordem: medição atual, texto impresso pela CLI (com o fuso
impresso, ou o fuso local quando não houver) e, por fim, o padrão estimado (5 h
no Claude, 15 min nos demais). Se medição e texto divergirem, vale o mais tarde.
Uma leitura a mais de 8 dias é descartada. Reiniciar o app não tira a conta da
espera. "Não era limite" libera a espera e silencia aquela evidência.

## Confirmação

- A proposta **nunca** abre um modal sozinha: aparece como faixa no bloco e como
  item fixo nas notificações. Um Enter digitado em outro terminal não confirma
  nada.
- O diálogo mostra origem, destino, motivo, horário da detecção, a linha que a
  CLI imprimiu (redigida), o fim da espera com a fonte, os candidatos aptos com
  o motivo da posição, os que estão fora com o motivo, e o custo: o tamanho do
  contexto que será enviado e quem paga (assinatura da conta de destino ou
  créditos por uso).
- O foco inicial fica no candidato recomendado, nunca no botão de confirmar.
- Confirmar gera um ticket de uso único no processo principal; o bloco novo só
  nasce com esse ticket e só na conta confirmada. Confirmar duas vezes devolve o
  mesmo ticket.
- Uma proposta vence em 30 minutos; um ticket não usado vence em 2 minutos.
- "Automática (cadeia)" ao abrir um bloco mostra antes qual conta será usada; o
  clique em Abrir é a confirmação. Sem conta apta, a abertura é recusada, nunca
  cai no Login do sistema.

## A sessão ativa e o terminal antigo

- O processo vivo nunca troca de conta, e o app nunca escreve no terminal
  antigo, nunca o pausa e nunca o encerra.
- Se o terminal antigo ainda estiver produzindo saída (menos de 5 s desde a
  última), a confirmação pede um segundo "abrir mesmo assim", que fica
  registrado.
- O Claude pode estar programado para continuar sozinho na conta antiga
  ("continuing automatically at …"). O diálogo avisa que isso poria dois agentes
  no mesmo trabalho e oferece ir ao terminal antigo.
- O bloco novo recebe o contexto redigido, uma única vez, com o aviso de que o
  último pedido pode ter ficado pela metade.

## Isolamento de credenciais

Um terminal com conta própria não herda credencial de API do ambiente do app.
Em todo spawn com perfil (e na checagem de login dessa conta), saem:

| Provedor | Variáveis removidas |
|---|---|
| Claude | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` |
| Codex | `OPENAI_API_KEY`, `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN` |
| Gemini | `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_GENAI_USE_VERTEXAI` |
| Openia | nenhuma (o perfil já define a própria chave) |

O Login do sistema não muda. O painel mostra só os **nomes** das variáveis de
credencial presentes no ambiente do app, nunca os valores.

## Orquestrador do chat

- Pede confirmação **só quando a família de provedor muda** (Anthropic, OpenAI,
  Google): no fallback entre provedores, no último recurso para outra família e
  no novo spawn no meio da tarefa. Codex → Codex App Server é só troca de
  transporte e não pergunta.
- Sem resposta em 10 minutos, conta como recusa: o job falha com mensagem clara
  e nenhum provedor é trocado.
- Um reinício apaga a decisão pendente sem executar nada.
- O orquestrador continua no Login do sistema e não usa contas da cadeia.

## Registro de trocas e privacidade

- Toda proposta, troca, aviso e decisão do orquestrador fica no registro de
  trocas com motivo e horários (detecção, proposta, decisão e spawn).
- O registro nunca guarda contexto, ambiente, caminho de perfil ou segredo. O
  motivo e a evidência são redigidos antes de gravar, emitir para a interface ou
  ir para o log QA.
- Retenção: ficam as 1.000 linhas mais recentes; a poda nunca apaga uma linha em
  estado aberto.

## Glossário (fixo na interface)

apta, em espera, fora, fixa, cadeia, Automática, cobrança por uso, assinatura,
continuação. "Limite" **nunca** nomeia erro de rede ou de servidor.

## Limitações conhecidas

- As frases de falha vêm dos pacotes das CLIs, não da captura de bytes reais da
  interface de cada uma. Quebra de linha, truncamento num bloco estreito e a
  repintura do ConPTY podem esconder a mensagem: o efeito é **não detectar**,
  nunca trocar por engano.
- O vocabulário muda com a versão da CLI; o script
  `app/scripts/extract-cli-failure-vocabulary.cjs` confere a fixture de novo a
  cada atualização.
- A checagem de login é local.
- A troca por limite reage à falha; não há troca proativa por limiar de uso.

## Ideias para quem quiser contribuir

- Checagem de login por conta para o Gemini (destrava o Gemini na cadeia sem
  mudar a política).
- Captura do fluxo real de bytes do aviso de limite em Linux, macOS e Windows.
- Detecção de falta de crédito na saída do Openia, quando houver mensagem
  própria.
- Medição de uso por conta sob demanda, para "Mais quota" comparar mais contas.

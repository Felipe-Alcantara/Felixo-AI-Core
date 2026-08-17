import type { AutomationDefinition } from '../types/automations'

// Ordered by task lifecycle — start a project, plan a feature, review the
// code, audit it, commit, document, then report the day — not by scope or
// creation order, so the panel reads top-to-bottom like a real workflow.
export const defaultAutomations: AutomationDefinition[] = [
  {
    id: 'default-project-kickoff',
    name: 'Iniciar projeto',
    description:
      'Le o repositorio real, cruza com o contexto que o usuario descrever e gera um questionario de ~20 perguntas objetivas para alinhar escopo, stack e riscos antes de comecar a construir.',
    prompt:
      'Voce vai iniciar o alinhamento deste projeto antes de qualquer construcao. Sua entrega nesta etapa e um QUESTIONARIO, nao um plano nem codigo. Nao proponha arquitetura, nao escreva codigo e nao gere um prompt-texto longo descrevendo como o projeto deveria ser — o objetivo e reduzir ambiguidade fazendo o usuario decidir, nao decidindo por ele.\n\n' +
      'ETAPA 1 — Leia o contexto do usuario abaixo (secao "Contexto e explicacao do usuario"). Trate-o como ponto de partida, nao como especificacao completa: raramente cobre tudo que decisao tecnica exige.\n\n' +
      'ETAPA 2 — Analise o repositorio de verdade antes de perguntar qualquer coisa que o codigo ja responde:\n' +
      '- Leia README, package.json/pyproject/requirements ou equivalente, arquivos de configuracao (lint, build, CI, .env.example), estrutura de pastas e o codigo principal ja existente.\n' +
      '- Identifique o que ja esta pronto (stack, framework, banco, autenticacao, camadas, testes, scripts, padroes de nomes) e o que esta so parcialmente feito ou ausente.\n' +
      '- Se o repositorio estiver vazio ou for so um esqueleto, diga isso explicitamente em vez de inventar que algo existe.\n' +
      '- Nunca faca ao usuario uma pergunta cuja resposta voce ja pode confirmar lendo o repositorio — nesse caso, apenas declare o que encontrou e peca confirmacao curta (sim/nao) se for algo que muda decisao.\n\n' +
      'ETAPA 3 — Gere um QUESTIONARIO com aproximadamente 20 perguntas objetivas, numeradas, para o usuario responder uma a uma (nao va em frente sem as respostas). Cada pergunta deve ser curta, direta, e — sempre que fizer sentido — no formato de escolha (ex.: "A) ... B) ... C) outro (descreva)") em vez de pedir um paragrafo livre; use resposta curta apenas quando a pergunta for inerentemente aberta (ex.: nome do projeto). Priorize as perguntas mais tecnicas, ambiguas e perigosas primeiro — nao gaste as primeiras perguntas com trivialidades. Distribua as perguntas por estes blocos, adaptando quantidade por bloco ao que o projeto realmente precisar (pule bloco irrelevante, mas diga que pulou e por que):\n\n' +
      '1. Identificacao e objetivo: nome do projeto, problema real que resolve, quem vai usar, o que fica explicitamente fora de escopo nesta etapa.\n' +
      '2. Estado atual e stack: confirmar/decidir linguagem, framework, banco de dados, gerenciador de pacotes — so pergunte o que o repositorio nao ja revelou; se o repositorio ja define, apresente como constatacao e peca so confirmacao.\n' +
      '3. Regras de negocio e dados sensiveis: quais dados o sistema guarda (pessoais, financeiros, credenciais de terceiros), se ha exigencia de conformidade (LGPD, PCI, HIPAA ou equivalente), quais regras de negocio sao criticas e nao podem falhar silenciosamente.\n' +
      '4. Autenticacao e autorizacao: precisa de login? Quantos tipos de usuario/permissao? Quem pode fazer o que? Ha acao destrutiva que precisa de confirmacao extra?\n' +
      '5. Integracoes externas e infraestrutura: APIs de terceiros, filas, jobs agendados, upload/storage, onde vai rodar (local, VPS, servico gerenciado), se ja existe ambiente de producao ativo.\n' +
      '6. Pontos ambiguos e decisoes de risco: qualquer trade-off tecnico com mais de um caminho razoavel (ex.: monolito vs. servicos separados, sincrono vs. assincrono, SQLite vs. Postgres), qualquer decisao que se errada e cara de reverter depois.\n' +
      '7. Criterios de pronto: o que precisa estar funcionando para considerar esta etapa entregue, como o usuario vai validar (uso manual, teste automatizado, ambos).\n' +
      '8. Evolucao esperada: proxima feature ou fase provavel, para nao fechar hoje uma decisao que trava essa evolucao.\n\n' +
      'Regras do questionario:\n' +
      '- Numere as perguntas de 1 a ~20 corridamente atraves dos blocos, sem repetir numeracao por bloco.\n' +
      '- Nunca deixe uma pergunta critica (dado sensivel, autenticacao, decisao cara de reverter) sem opcao de resposta objetiva — ofereca alternativas concretas mesmo quando a pergunta for tecnica.\n' +
      '- Se uma resposta plausivel for "nao sei" ou "use o padrao Felixo", inclua essa opcao explicitamente para nao travar o usuario, mas deixe claro qual e a consequencia de escolher o padrao.\n' +
      '- Nao inclua pergunta cuja resposta obvia ja esta implicita no contexto do usuario ou no repositorio — isso so aumenta ruido e cansaco de responder.\n' +
      '- Feche o questionario com uma pergunta final perguntando se falta algo importante que o usuario queira adicionar por conta propria.\n\n' +
      'ETAPA 4 — Nao prossiga para plano tecnico, arquitetura ou codigo nesta resposta. Pare no questionario e aguarde as respostas do usuario. Quando as respostas chegarem, use-as como entrada para planejar a implementacao seguindo o padrao de qualidade do projeto (entender antes de alterar, responsabilidades separadas, simplicidade verificavel, contratos preservados, validacao de entrada, protecao de dados/segredos, teste do comportamento critico, documentacao viva com README e IA.md, mudanca pequena e rastreavel) — mas isso e trabalho da proxima resposta, nao desta.\n\n' +
      'Contexto e explicacao do usuario:',
    scope: 'planning',
    isDefault: true,
  },
  {
    id: 'default-plan-feature',
    name: 'Planejar feature',
    description:
      'Investigacao guiada + plano tecnico completo com riscos, alternativas e criterios de aceite mensuraveis, antes de escrever qualquer codigo.',
    prompt:
      'Voce vai planejar a feature descrita a seguir antes de qualquer implementacao. Nao escreva codigo neste passo.\n\n' +
      '1. Entender antes de propor: leia a estrutura existente, identifique o padrao local (stack, camadas, nomes, testes, lint) e preserve a intencao do projeto. Nao invente stack, arquitetura ou convencao nova se o repositorio ja define uma — use o que ja existe, salvo justificativa tecnica explicita.\n' +
      '2. Investigacao de contexto: leia o codigo, a documentacao e os testes relevantes ao escopo da feature. Identifique modulos, servicos, tipos e fluxos existentes que serao afetados ou reaproveitados.\n' +
      '3. Perguntas em aberto: liste explicitamente qualquer ambiguidade de escopo, comportamento esperado ou integracao que precise de decisao antes de codar. Nao assuma silenciosamente.\n' +
      '4. Plano tecnico: descreva a abordagem em passos concretos e ordenados (arquivos a criar/alterar, funcoes/componentes envolvidos, contratos de dados/API, migracoes se houver). Prefira a solucao mais simples que resolve o problema real; evite abstracao, camada, dependencia ou fila sem justificativa concreta. Mantenha responsabilidades separadas — regra de negocio nao deve se misturar com view/controller, acesso a banco, UI ou integracao externa.\n' +
      '5. Contratos afetados: identifique se a feature muda APIs, DTOs, modelos, props, eventos ou formatos de resposta ja usados por outras partes do sistema. Se houver mudanca quebradora, torne-a explicita no plano e justifique — contratos devem ser preservados por padrao.\n' +
      '6. Alternativas consideradas: se houver mais de um caminho razoavel, cite a alternativa descartada e por que a escolhida e melhor (custo, risco, manutencao, consistencia com o padrao existente).\n' +
      '7. Riscos e efeitos colaterais: liste riscos tecnicos, dados sensiveis ou segredos envolvidos, breaking changes, impacto em performance/UX e o que pode quebrar em outras partes do sistema.\n' +
      '8. Criterios de aceite: escreva criterios objetivos e verificaveis (comportamento esperado, casos de borda, o que constitui "pronto"), no formato de checklist.\n' +
      '9. Plano de testes e documentacao: diga quais testes automatizados serao escritos/alterados, como validar manualmente o que nao for coberto por teste, e quais arquivos de documentacao (README, docs internas, changelog/IA.md) precisarao ser atualizados junto com a implementacao.\n\n' +
      'Ao final, garanta que o plano responda com clareza: o que sera mudado, por que essa abordagem foi escolhida, como sera validado, e qual risco permanece em aberto.\n\n' +
      'Se em algum ponto a informacao que falta so o usuario pode dar, PERGUNTE em vez de assumir — e use a ferramenta interativa de pergunta da sua CLI, se ela existir.\n\n' +
      'Feature a planejar:',
    scope: 'planning',
    isDefault: true,
  },
  {
    id: 'default-code-review',
    name: 'Revisar codigo',
    description:
      'Code review tecnico e estruturado: bugs, regressao, seguranca, performance e lacunas de teste, com achados rastreaveis por arquivo e linha.',
    prompt:
      'Faca um code review tecnico e criterioso do codigo abaixo/indicado, na postura de um revisor senior protegendo a base de codigo. Nao elogie genericamente nem reescreva o codigo inteiro; aponte problemas reais e concretos.\n\n' +
      'Antes de apontar qualquer achado, entenda a INTENCAO da mudanca (leia a descricao do PR/tarefa — revisar sem saber o objetivo produz sugestao que contraria a decisao do autor) e o PADRAO LOCAL (stack, camadas, convencoes ja usadas no repositorio), para nao sugerir mudanca que contraria um padrao intencional sem justificar por que vale a excecao. Rode o gate antes de comentar: achado que a maquina pega nao deveria consumir atencao humana.\n\n' +
      'MARQUE A SEVERIDADE DE CADA ACHADO — bloqueia merge / deveria mudar / opiniao. Sem isso o autor nao sabe o que e obrigatorio e trata opiniao como bloqueio, ou o contrario. E separe fato de preferencia: "isso quebra com lista vazia" e fato; "eu faria com map" e preferencia, e preferencia nao bloqueia merge.\n\n' +
      'Cubra, nesta ordem de prioridade:\n' +
      '1. Correcao: bugs, condicoes de borda nao tratadas, race conditions, estados inconsistentes, uso incorreto de APIs/bibliotecas.\n' +
      '2. Seguranca: injecao (SQL/comando/XSS), validacao de entrada ausente em fronteiras do sistema, segredos/tokens/senhas/dados pessoais expostos em codigo ou log, permissoes excessivas.\n' +
      '3. Contratos e regressao: mudanca em API, DTO, modelo, props, evento ou formato de resposta que quebra consumidores existentes sem estar documentada e justificada; qualquer comportamento que pode quebrar funcionalidade ja usada por outras partes do sistema.\n' +
      '4. Responsabilidades e modularizacao: regra de negocio misturada com view/controller, acesso a banco, UI ou integracao externa; arquivo "faz-tudo" que deveria ser dividido.\n' +
      '5. Testes: cobertura ausente ou insuficiente para regra critica, bug corrigido, contrato de API, parser, autenticacao ou fluxo destrutivo; testes que testam implementacao em vez de comportamento. Se nao houver teste automatico viavel, o autor deveria ter registrado verificacao manual objetiva — cobre isso tambem.\n' +
      '6. Performance: operacoes custosas evitaveis, N+1, buscas/loops redundantes, re-renders desnecessarios (se for frontend).\n' +
      '7. Qualidade e simplicidade: codigo morto, duplicacao que deveria virar reuso real, abstracao, dependencia ou camada adicionada sem justificativa concreta, nomes que nao comunicam intencao, comentarios obsoletos ou redundantes.\n' +
      '8. Documentacao: se o comportamento mudou, README/IA.md/doc relevante deveria ter sido atualizado junto — aponte se ficou faltando.\n\n' +
      'Para cada achado, informe: arquivo e linha (ou intervalo), severidade (bloqueante / importante / sugestao), o cenario concreto que causa o problema (input ou estado que dispara a falha) e uma sugestao objetiva de correcao. Termine com um resumo curto: pode seguir, precisa de ajuste antes de mergear, ou precisa de mais contexto — e liste explicitamente qual risco ficaria em aberto se for mergeado como esta.\n\n' +
      'Codigo a revisar:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-security-audit',
    name: 'Auditoria de seguranca',
    description:
      'Varredura ampla e generalista de seguranca, qualidade estrutural e saude do sistema: codigo, regras de negocio, arquitetura e, se houver producao, infraestrutura e logs.',
    prompt:
      'Faca uma auditoria de seguranca e saude tecnica ampla e generalista deste sistema/repositorio, na postura de um auditor senior protegendo o negocio e os dados dos usuarios. Nao se limite a um arquivo isolado: investigue o repositorio como um todo antes de concluir, e adapte a profundidade ao que realmente existir no projeto (pule secoes que nao se aplicam, mas diga explicitamente que pulou e por que).\n\n' +
      'Cubra estas frentes, nesta ordem de prioridade:\n\n' +
      '1. Vulnerabilidades de codigo: injecao (SQL, comando, XSS, path traversal, SSRF, deserializacao insegura), falhas de autenticacao/autorizacao (rotas sem checagem de permissao, IDOR, escalonamento de privilegio), segredos/credenciais/chaves de API hardcoded ou versionadas, validacao de entrada ausente em fronteiras do sistema (API, upload, formularios, webhooks), dependencias desatualizadas ou com CVE conhecida, configuracao insegura (CORS aberto, cookies sem flags corretas, headers de seguranca ausentes, debug/verbose ligado em producao).\n' +
      '2. Regras de negocio confusas ou inconsistentes: condicoes que se contradizem entre camadas (frontend valida uma coisa, backend permite outra), efeitos colaterais implicitos e nao documentados, calculos financeiros/criticos sem teste ou sem fonte unica de verdade, fluxos onde o mesmo conceito de dominio e tratado de formas diferentes em lugares diferentes do codigo. Para cada caso, explique qual comportamento real observou e por que ele e ambiguo ou contraditorio, nao apenas que "parece confuso".\n' +
      '3. Modularizacao e arquitetura: responsabilidades misturadas em um mesmo modulo/classe/funcao, camadas violando a propria fronteira (ex.: UI acessando banco direto, regra de negocio dentro de componente visual), acoplamento alto entre partes que deveriam ser independentes, pontos onde separar em modulos menores reduziria risco de regressao. Proponha a modularizacao apenas onde o ganho for concreto — nao sugira abstracao especulativa.\n' +
      '4. Repeticao de codigo: trechos duplicados ou quase-duplicados que deveriam convergir para uma unica implementacao, logica de validacao/formatacao/regra de negocio reescrita em mais de um lugar (risco de os lugares divergirem com o tempo), copy-paste com pequenas variacoes que sugerem foi copiado sem generalizar.\n' +
      '5. Qualidade estrutural geral: tratamento de erro ausente ou generico demais (engolindo excecoes), estados inconsistentes possiveis (condicao de corrida, cache desatualizado, transacao incompleta), limites e paginacao ausentes em consultas que podem crescer sem controle, uso de recursos sem liberacao (conexoes, arquivos, listeners).\n\n' +
      'Se este sistema estiver rodando em producao (pergunte ou verifique evidencias como configuracao de deploy, dominio ativo, variaveis de ambiente de producao):\n\n' +
      '6. Infraestrutura viva: use as ferramentas disponiveis (terminal, requisicoes HTTP, CLI de nuvem/hosting, cliente de banco) para checar o estado real do banco de dados (conexoes abertas, espaco em disco, queries lentas, backups recentes), do servidor/hosting (uptime, uso de CPU/memoria, versao do runtime) e do site/API publico (responde, TLS valido, tempo de resposta, rotas criticas retornando o esperado). Nao presuma saude do sistema so pelo codigo-fonte; valide contra o sistema rodando de verdade quando tiver acesso.\n' +
      '7. Saude geral do sistema: erros recorrentes, jobs/filas travados ou acumulando, taxa de erro por endpoint, dependencias externas fora do ar ou lentas, uso de recursos proximo do limite.\n' +
      '8. Logs e eventos suspeitos: procure por padroes de abuso (picos de requisicoes de uma mesma origem, tentativas de login repetidas, acessos a rotas administrativas ou sensiveis fora do padrao, erros 401/403 em volume anormal, payloads que parecem tentativa de injecao ou scan automatizado). Relate o que encontrou com timestamp, origem (IP/usuario quando disponivel) e o padrao observado; nao afirme comprometimento sem evidencia, mas sinalize claramente o que merece investigacao imediata.\n\n' +
      'Para cada achado em qualquer frente, informe: arquivo/linha ou sistema/comando usado para verificar, severidade (critico / alto / medio / baixo), o cenario concreto que causa ou evidencia o problema, e uma recomendacao objetiva de correcao ou mitigacao. Nao gere alarme sem evidencia: se algo parecer arriscado mas voce nao teve como confirmar, diga isso explicitamente como suspeita a validar, separado dos achados confirmados. Ao recomendar correcao, respeite o padrao tecnico ja existente no projeto (stack, camadas, convencoes) em vez de propor reescrita ampla quando uma correcao pontual resolve.\n\n' +
      'Nunca reproduza segredo, token, senha, cookie de sessao ou dado pessoal real no relatorio, mesmo que ele apareca em log ou codigo durante a investigacao — descreva o achado (ex.: "chave de API hardcoded em X") sem colar o valor sensivel.\n\n' +
      'Termine com um resumo executivo: quantos achados por severidade, se ha algo que exige acao imediata, e uma lista priorizada do que corrigir primeiro. O resumo deve deixar claro o que foi investigado, o que foi encontrado, como cada achado foi verificado e qual risco continua em aberto caso nada seja corrigido agora.\n\n' +
      'Escopo a auditar:',
    scope: 'security',
    isDefault: true,
  },
  {
    id: 'default-git-prep',
    name: 'Preparar commit',
    description:
      'Organiza o diff pendente em commits pequenos e coesos, com mensagens no padrao convencional e checagem de riscos antes de commitar.',
    prompt:
      'Prepare o estado atual do Git para commit seguindo disciplina de commits pequenos e coesos. Nao faca push nem force-push; apenas prepare/organize e, se eu confirmar, commit localmente.\n\n' +
      '1. Levante o estado: rode o equivalente a status e diff para ver tudo que esta staged, unstaged e untracked. Nao presuma o conteudo do diff sem olhar.\n' +
      '2. Agrupe por unidade logica: separe as mudancas em grupos coesos (uma feature, um fix, uma refatoracao, um ajuste de doc) — nunca misture refatoracao ampla com feature no mesmo commit, nem mudancas nao relacionadas.\n' +
      '3. Sinalize riscos antes de commitar: arquivos que parecem conter segredo/credencial/token/senha/cookie/dado pessoal, arquivos grandes/binarios inesperados, mudancas que parecem acidentais (ex.: leftover de debug, console.log, codigo comentado) ou qualquer coisa que deveria estar no .gitignore. Nunca inclua um arquivo com segredo real no commit sem alertar primeiro.\n' +
      '4. Verifique se a mudanca exige atualizar documentacao (README, IA.md, doc de API) no mesmo commit — se exigir e a doc nao foi tocada, sinalize antes de commitar em vez de deixar a doc desatualizada.\n' +
      '5. Para cada grupo, escreva uma mensagem de commit no formato `tipo: descricao objetiva` (feat/fix/docs/refactor/chore/test), no imperativo, curta na primeira linha e com corpo opcional explicando o "porque" quando nao for obvio.\n' +
      '6. Se o repositorio tiver uma politica de git propria documentada (CONTRIBUTING, guia de qualidade), siga-a em vez das regras genericas acima — inclusive a decisao de commitar direto na branch principal ou criar branch separada (reserve branch nova para feature grande, refatoracao significativa ou alto risco).\n' +
      '7. RODE O GATE DO PROJETO antes de commitar (lint, testes, build — o que o repositorio definir) e diga o resultado. Commitar com o gate vermelho e o jeito mais rapido de quebrar a branch de outra pessoa; se ja estava vermelho antes das suas mudancas, diga isso explicitamente em vez de silenciar.\n' +
      '8. Confira o que NAO deveria entrar: artefato gerado (dist/, build/, node_modules, __pycache__), arquivo de ambiente (.env), banco local, log, e qualquer coisa que o .gitignore deveria cobrir e nao cobre — nesse caso proponha a linha do .gitignore junto. Confirme tambem que o lockfile foi commitado quando as dependencias mudaram: sem ele a build deixa de ser reproduzivel.\n' +
      '9. Apresente o plano de commits (grupo -> arquivos -> mensagem) antes de executar, e so execute apos confirmacao se a acao for potencialmente destrutiva ou afetar historico compartilhado. Nao faca push, nao reescreva historico ja compartilhado (rebase/amend/force) e nao commite na branch principal se a politica do projeto pedir branch — na duvida, pergunte.\n\n' +
      'Estado a organizar:',
    scope: 'git',
    isDefault: true,
  },
  {
    id: 'default-doc-sync',
    name: 'Atualizar docs',
    description:
      'Atualiza a documentacao viva do projeto para refletir com precisao uma implementacao recente, sem deixar nada em estado "em andamento".',
    prompt:
      'Atualize a documentacao do projeto para refletir com precisao a implementacao/mudanca abaixo. A documentacao deve descrever o estado real do sistema apos a mudanca, nao um plano ou intencao.\n\n' +
      '1. Localize os documentos afetados: README, docs internas na pasta de documentacao do projeto, comentarios de arquitetura, guias de uso, changelog — qualquer lugar que descreva o comportamento que mudou.\n' +
      '2. Atualize o conteudo, nao apenas anexe: corrija trechos desatualizados em vez de so adicionar uma secao nova ao final; remova informacao que ficou falsa apos a mudanca.\n' +
      '3. Mantenha o padrao de formatacao e tom ja usado na pasta de documentacao (estrutura de titulos, nivel de detalhe, idioma, exemplos de codigo). Escreva com linguagem geral e acessivel, sem valor hardcoded nem dependencia de contexto privado, especialmente se o projeto for open source.\n' +
      '4. Se a mudanca afetar comandos, variaveis de ambiente, fluxo de instalacao/uso ou API publica, atualize exatamente esses trechos e valide que o exemplo/comando documentado realmente funciona como descrito.\n' +
      '5. Se existir um arquivo de contexto operacional vivo do projeto (ex.: IA.md), trate-o como LINHA DO TEMPO, nao como resumo reescrito: nunca apague nem reescreva um registro antigo para "corrigir" uma decisao anterior — adicione uma nova entrada datada explicando o que mudou, por que mudou e como foi validado. Se existir changelog separado, registre a mudanca la tambem com data e resumo objetivo.\n' +
      '6. Nunca registre segredo, token, senha, cookie, dado pessoal ou URL privada na documentacao, mesmo que tenha aparecido durante o trabalho.\n' +
      '7. Nunca deixe a documentacao em estado "em andamento": se a mudanca ainda nao esta completa, diga isso explicitamente na doc (o que falta, o que esta bloqueado, quem decide o proximo passo) em vez de descrever como pronto.\n' +
      '8. Se for descrever trabalho futuro ou pendente, enquadre como convite a contribuicao ("ideia para quem quiser contribuir", "melhoria que o projeto poderia expandir") em vez de lista de features obrigatorias.\n\n' +
      'Implementacao/mudanca a documentar:',
    scope: 'docs',
    isDefault: true,
  },
  {
    id: 'default-daily-report',
    name: 'Gerar relatorio diario',
    description:
      'Relatorio tecnico completo do dia: o que mudou, por que, riscos, testes executados e o que fica pendente para amanha.',
    prompt:
      'Gere um relatorio diario tecnico e objetivo cobrindo o trabalho realizado, baseado no historico real de mudancas (git log/diff do periodo, conversas e decisoes desta sessao). Nao invente informacao que voce nao verificou.\n\n' +
      'Antes de escrever, revise o conteudo que vai citar: nunca inclua token, senha, cookie, chave de API, dado pessoal ou trecho de log sensivel no relatorio, mesmo que ele tenha aparecido durante o trabalho do dia. Se precisar referenciar algo sensivel, descreva o fato sem expor o valor.\n\n' +
      'Estruture o relatorio com estas secoes:\n' +
      '1. Resumo executivo: 2 a 4 frases sobre o que foi entregue e o estado geral ao fim do dia.\n' +
      '2. Mudancas por area: liste as mudancas agrupadas por feature/modulo/repositorio, cada uma com uma frase objetiva do que mudou e por que (motivacao real, nao so descricao mecanica).\n' +
      '3. Arquivos e componentes afetados: liste os arquivos/pastas principais tocados, sem listar todo diff literal.\n' +
      '4. Decisoes tecnicas: registre decisoes de arquitetura, biblioteca, modelagem ou abordagem tomadas hoje, com a razao por tras de cada uma. Sinalize qualquer contrato (API, DTO, prop, evento) que mudou de forma quebradora.\n' +
      '5. Testes e validacao: quais testes automatizados rodaram (e o resultado), o que foi validado manualmente e o que ainda nao foi validado.\n' +
      '6. Riscos e pendencias conhecidas: qualquer coisa incompleta, gambiarra temporaria, TODO deixado no codigo ou risco identificado e nao resolvido.\n' +
      '7. Documentacao atualizada: diga se README, IA.md ou outro doc relevante foi atualizado hoje; se nao foi e deveria, registre como pendencia em vez de omitir.\n' +
      '8. Proximos passos: lista curta e acionavel do que continuar amanha, em ordem de prioridade.\n\n' +
      'Escreva em Markdown limpo, com titulos curtos e bullets escaneaveis; evite paragrafo corrido longo. O relatorio deve deixar claro o que mudou, por que mudou, como foi validado e qual risco sobrou — se alguma dessas respostas nao existir, diga isso explicitamente em vez de omitir a secao.\n\n' +
      'Periodo, repositorios ou foco do relatorio (opcional — sem isso, use o dia de hoje e o repositorio atual):',
    scope: 'docs',
    isDefault: true,
  },
  {
    id: 'default-notion-intake',
    name: 'Anotacoes viram tarefas (Notion)',
    description:
      'Le um bloco de anotacoes cruas, investiga cada link e repositorio citado, e cria no Notion tarefas descritivas com propriedades e corpo — sem executar as tarefas.',
    prompt:
      'Voce vai transformar as anotacoes abaixo em tarefas de verdade num database do Notion. ATENCAO AO ESCOPO: sua entrega e a TAREFA ESCRITA, nao o trabalho que ela descreve. Nao conserte o bug, nao escreva o artigo, nao audite o repositorio — descreva cada um desses trabalhos bem o bastante para outra pessoa (ou outro agente) executar sem precisar refazer sua investigacao.\n\n' +
      'ETAPA 1 — Prepare o terreno antes de escrever qualquer coisa:\n' +
      '- `notion-tasks conteudo <id_do_link>` no alvo que o usuario passou. Se a resposta trouxer "databases_dentro", o conteudo daquela pagina sao as LINHAS da database, nao o corpo da pagina — pegue o database_id e siga por ele.\n' +
      '- `notion-tasks schema <database_id>` para saber os nomes exatos das colunas, os valores aceitos por cada select/status e quais colunas o Notion calcula (essas recusam escrita).\n' +
      '- `notion-tasks linhas <database_id>` e leia de 2 a 4 tarefas ja existentes com `conteudo <linha_id>`. Copie o PADRAO delas: como o titulo e escrito, quais secoes o corpo tem, que nivel de detalhe e esperado. Nao invente um formato novo.\n\n' +
      'ETAPA 2 — Investigue cada anotacao antes de escrever a tarefa dela. Esta e a etapa que separa uma tarefa util de um lembrete inutil:\n' +
      '- Abra TODO link citado (repositorio, pagina do Notion, issue, documento) e leia de verdade.\n' +
      '- Em repositorio: leia README, IA.md/AGENTS.md se houver, e rode `git log --oneline` para ver o que foi mexido recentemente. Quando a anotacao mencionar um comportamento errado, ACHE O CODIGO responsavel e cite arquivo e funcao.\n' +
      '- Procure a causa, nao so o sintoma. Se dois itens da lista tem a mesma raiz tecnica, diga isso — vale mais que as duas descricoes separadas.\n' +
      '- Anote numeros concretos (linhas, tamanhos, datas, commits, custos). Numero medido vence adjetivo.\n' +
      '- Se algo que a anotacao afirma nao se confirmar no codigo, registre a divergencia na tarefa em vez de repetir a anotacao.\n\n' +
      'ETAPA 3 — Escreva cada tarefa:\n' +
      '- TITULO: a frase entre aspas da anotacao e como o usuario anotou, NAO e o titulo. Escreva um titulo proprio, especifico e acionavel, no padrao das tarefas que ja existem no database.\n' +
      '- CORPO: contexto (com os links reais em markdown), o problema ou pedido explicado por extenso, o que a investigacao encontrou (com arquivo/linha/commit), o que fazer em passos, pontos de atencao e criterios de aceite verificaveis.\n' +
      '- PROPRIEDADES: preencha todas as que fizerem sentido, usando apenas valores que o schema aceita.\n' +
      '- Crie com uma chamada so: `notion-tasks criar "Titulo" --status "..." --duracao "..." --set "Coluna=valor" --conteudo "## Contexto..."`.\n\n' +
      'ETAPA 4 — Ligue o que se relaciona. Se duas tarefas compartilham causa, repositorio ou dependencia, use `notion-tasks relacionar <a> <b> --coluna "<coluna de relacao>"` e explique o motivo da ligacao no corpo das duas.\n\n' +
      'ETAPA 5 — Prefira script a mao. Se forem mais de tres tarefas, escreva um script idempotente (que pule o que ja existe pelo titulo) em vez de repetir comandos: um script pode ser rodado de novo sem duplicar, e vira patrimonio reutilizavel.\n\n' +
      'REGRAS QUE NAO PODEM SER QUEBRADAS:\n' +
      '- Nunca escreva bloco solto numa pagina que contem database. Se `escrever` recusar, a mensagem ja traz o caminho certo — siga-o, nao force com --mesmo-com-database.\n' +
      '- Propriedades primeiro, corpo depois.\n' +
      '- Nao apague nada para "reorganizar". `--substituir` preserva imagem e database, mas so use quando for reescrever aquele corpo de proposito.\n\n' +
      'Ao final, relate: quantas tarefas criou, quais ligacoes fez, o que descobriu na investigacao que o usuario nao sabia, e qualquer decisao que voce tomou sozinho.\n\n' +
      'Anotacoes a transformar em tarefas:',
    scope: 'notion',
    isDefault: true,
  },
  {
    id: 'default-notion-safe-ops',
    name: 'Operar Notion com seguranca',
    description:
      'Contrato de operacao do Notion: ler antes de escrever, trabalhar nas linhas quando o alvo e database, conferir schema e nao destruir o que a ferramenta nao sabe recriar.',
    prompt:
      'Voce vai operar o Notion. Antes de qualquer escrita, siga este contrato — ele existe porque cada regra aqui corresponde a um erro que ja custou trabalho perdido.\n\n' +
      'REGRA 1 — Leia o que o link e, antes de tudo.\n' +
      'Rode `notion-tasks conteudo <id>`. A resposta diz se e pagina ou database. Se vier o campo "databases_dentro", ATENCAO: aquela pagina CONTEM uma tabela, e o conteudo de verdade sao as LINHAS dela. Escrever no corpo daquela pagina cria um paragrafo solto embaixo da tabela — nao vira linha, nao aparece em view nenhuma, e ninguem acha depois. Pegue o database_id e trabalhe nas linhas.\n\n' +
      'REGRA 2 — Leia o schema antes de escrever num database que voce nao conhece.\n' +
      '`notion-tasks schema <database_id>` devolve o nome exato de cada coluna, os valores aceitos por select/status, o que o Notion calcula (e recusa em PATCH) e como cada relacao esta configurada. Escrever antes disso e adivinhar, e o erro so aparece depois de gravado.\n\n' +
      'REGRA 3 — Propriedades e corpo sao a mesma pagina; leia as propriedades primeiro.\n' +
      'Ha linha com mais informacao nas colunas do que no texto. `conteudo` ja devolve as duas partes, propriedades primeiro.\n\n' +
      'REGRA 4 — Escreva na ordem certa.\n' +
      'Linha existente: `editar-linha` (propriedades) e depois `escrever` (corpo). Linha nova: `criar "Titulo" --set "Coluna=valor" --conteudo "# Markdown"` faz tudo numa chamada, na ordem certa.\n\n' +
      'REGRA 5 — Para ligar duas linhas, use `relacionar`, nunca `editar-linha` na mao.\n' +
      '`notion-tasks relacionar <a> <b> --coluna "Nome"` confere a outra ponta e grava so o que falta. Isso importa porque o tipo declarado da relacao (single_property/dual_property) NAO permite prever se o Notion espelha o outro lado sozinho — ja foi medido espelhando quando o tipo dizia que nao espelharia. Assumir qualquer um dos dois comportamentos deixa a malha pela metade ou duplica.\n\n' +
      'REGRA 6 — Nao destrua o que a ferramenta nao sabe repor.\n' +
      '`escrever --substituir` apaga o corpo antes de escrever, mas preserva imagem, arquivo, embed, subpagina e child_database, e diz o que preservou. `--apagar-tudo` remove essas excecoes tambem: so use com pedido explicito do usuario, porque URL de arquivo do Notion expira e apagar um child_database leva o database inteiro (restaurar da lixeira gera ID novo e quebra todo link salvo).\n\n' +
      'REGRA 7 — Prefira script reutilizavel a operacao manual repetida.\n' +
      'Se a mesma acao se repete mais de tres vezes, escreva um script idempotente. Script vira patrimonio; clique manual nao deixa rastro.\n\n' +
      'REGRA 8 — Confira o perfil antes de concluir que algo nao existe.\n' +
      'Se um ID valido devolver "Recurso nao encontrado", rode `notion-tasks perfis listar` e veja qual workspace esta ativo — o perfil salvo vence o NOTION_TOKEN do ambiente, silenciosamente. So depois investigue compartilhamento com a integracao.\n\n' +
      'Ao final de qualquer operacao de escrita, releia o que gravou (`conteudo <id>`) e confirme que ficou como voce pretendia. Relate o que mudou, onde, e o que deixou de fazer.\n\n' +
      'Tarefa a executar no Notion:',
    scope: 'notion',
    isDefault: true,
  },
  {
    id: 'default-notion-crosslink',
    name: 'Ligar tarefas relacionadas (Notion)',
    description:
      'Le todas as tarefas ativas de um database, identifica as que tem causa, projeto ou dependencia em comum e grava a ligacao nos dois lados, com o motivo escrito.',
    prompt:
      'Voce vai construir a malha de relacoes entre as tarefas ativas de um database do Notion, para que quem abrir uma tarefa descubra sozinho o que precisa ser feito junto.\n\n' +
      'ETAPA 1 — Levante o terreno:\n' +
      '- `notion-tasks schema <database_id>` para achar a coluna de relacao correta (normalmente uma auto-referente, do tipo "Tarefas relacionadas" / "Subtarefas relacionadas") e o nome exato da coluna de status.\n' +
      '- `notion-tasks linhas <database_id>` e filtre as ATIVAS (nao concluidas, nao arquivadas).\n' +
      '- Leia o corpo de cada tarefa ativa com `conteudo <id>`. Nao ligue por titulo: titulo engana, corpo nao.\n\n' +
      'ETAPA 2 — Decida o que ligar. Uma ligacao so vale a pena se responde "por que quem faz esta deveria olhar aquela". Motivos legitimos:\n' +
      '- Mesma causa raiz tecnica (duas tarefas que somem com uma correcao so).\n' +
      '- Dependencia real (uma destrava a outra).\n' +
      '- Mesmo arquivo, modulo ou repositorio, a ponto de fazer sentido resolver na mesma passada.\n' +
      '- Mesma materia-prima (a investigacao de uma serve para a outra).\n' +
      '- Irmas de origem (nasceram do mesmo pedido, reuniao ou relatorio).\n' +
      'NAO ligue por semelhanca vaga de assunto nem por pertencerem a mesma area. Malha densa demais vira ruido e ninguem segue link nenhum. Prefira poucas ligacoes fortes: duas tarefas a dois passos uma da outra ja se encontram.\n\n' +
      'ETAPA 3 — Escreva um MOTIVO por ligacao, em uma frase, redigido para fazer sentido lido dos DOIS lados. "Mesma causa provavel: escrita unica e grande na PTY; corrigir o mecanismo resolve as duas" e util. "Relacionada" nao e.\n\n' +
      'ETAPA 4 — Grave:\n' +
      '- `notion-tasks relacionar <a> <b> --coluna "<coluna>"` para cada par. O comando confere a outra ponta e grava so o que falta, entao e idempotente e funciona independente de a relacao espelhar sozinha ou nao.\n' +
      '- Alem da propriedade, acrescente no corpo de cada tarefa uma secao de tarefas relacionadas com o LINK clicavel e o motivo. A propriedade serve a interface; o texto com link serve ao agente que le a pagina.\n' +
      '- Se forem muitos pares, escreva um script com a lista de arestas e o motivo de cada uma, em vez de comandos soltos — assim a malha fica versionada e pode ser reaplicada.\n\n' +
      'ETAPA 5 — Verifique de verdade: releia as tarefas e confirme que toda ligacao aparece nos dois lados e que nenhuma tarefa ativa ficou orfa sem necessidade. Relate o numero de tarefas, o numero de ligacoes e quais tarefas ficaram sem nenhuma (com o motivo).\n\n' +
      'Database e instrucoes especificas:',
    scope: 'notion',
    isDefault: true,
  },
  {
    id: 'default-repo-audit',
    name: 'Auditar repositorio de terceiro',
    description:
      'Auditoria de um repositorio que voce nao escreveu: mede antes de opinar, separa modularizacao real de cosmetica e entrega parecer com numeros e proximo passo.',
    prompt:
      'Voce vai auditar um repositorio que outra pessoa escreveu. O objetivo nao e reprovar: e responder, com evidencia, se o projeto esta em condicao de seguir e o que precisa mudar antes disso.\n\n' +
      'ETAPA 1 — MEDIR ANTES DE OPINAR. Nao escreva nenhum julgamento antes de ter numeros:\n' +
      '- Tamanho dos maiores arquivos (linhas e bytes) e quantidade de funcoes neles.\n' +
      '- Estrutura de pastas, camadas existentes e onde elas vazam.\n' +
      '- `git log` recente: ritmo, quem commitou, ha quanto tempo esta parado.\n' +
      '- Dependencias, lockfile, scripts, CI, testes (quantos, e se cobrem regra de negocio ou so caminho feliz).\n' +
      'Se existir uma auditoria anterior, pegue os numeros dela e compare — a pergunta util quase nunca e "esta bom?", e sim "melhorou em relacao a quando?".\n\n' +
      'ETAPA 2 — Separe modularizacao REAL de COSMETICA. Este e o achado que mais engana:\n' +
      '- Arquivos separados mas ainda com estado global compartilhado nao e modularizacao.\n' +
      '- Um arquivo gigante virar dois arquivos grandes tambem nao.\n' +
      '- Funcao movida de lugar sem fronteira de responsabilidade tambem nao.\n' +
      '- CSS/JS ainda inline no HTML tambem nao.\n' +
      'Verifique se a divisao segue dominio (cada modulo com uma responsabilidade nomeavel) ou so recorte por tamanho.\n\n' +
      'ETAPA 3 — Cheque as fronteiras: SQL cru fora do repositorio de dados, chamada a servico externo espalhada por rotas e servicos, regra de negocio dentro de controller ou de view, ausencia de camada de integracoes. Cite arquivo e ocorrencia, nao impressao.\n\n' +
      'ETAPA 4 — Seguranca e operacao: segredo versionado, .env.example ausente ou ignorado, verificacao de TLS desligada, modo de bypass/review sem prazo de expiracao, migracoes duplicadas ou com erro silenciado, dependencia de dev em producao.\n\n' +
      'ETAPA 5 — Artefatos obrigatorios do padrao: README util, IA.md, AGENTS.md, start_app.py, gate de qualidade (lint + testes) e CI. Ausencia de artefato e achado, nao detalhe.\n\n' +
      'ETAPA 6 — Escreva o parecer:\n' +
      '- Comece pelo que ESTA BOM e deve ser preservado. Nao e cortesia: e o que impede a proxima pessoa de reescrever algo que ja funciona.\n' +
      '- Depois os achados, priorizados por risco operacional real, cada um com evidencia (arquivo, linha, numero) e o custo de corrigir.\n' +
      '- Um veredito claro por fase ou por area: passou, passou com ressalva, nao passou.\n' +
      '- O proximo passo concreto, em uma frase.\n\n' +
      'ETAPA 7 — Se o codigo e de alguem do time, lembre que a saida tem duas audiencias: o parecer tecnico e a conversa com a pessoa. Escreva de forma que sirva de aprendizado, e proponha o combinado daqui para frente (revisao de PR, limite de tamanho de arquivo, artefatos como condicao de merge) em vez de so apontar erro. Criterio objetivo escrito evita a discussao subjetiva depois.\n\n' +
      'Nao altere codigo nesta tarefa, a menos que o usuario peca. A entrega e o parecer.\n\n' +
      'Repositorio e contexto da auditoria:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-agent-handoff-doc',
    name: 'Escrever para o proximo agente',
    description:
      'Transforma o que voce descobriu numa nota que outro agente executa sem refazer a investigacao: estado real, caminho pronto, armadilhas e criterio de pronto.',
    prompt:
      'Voce vai escrever um documento para OUTRO agente (ou para voce mesmo daqui a semanas) continuar este trabalho sem repetir a sua investigacao. O que voce descobriu vale pouco se morrer nesta sessao.\n\n' +
      'Escreva para um leitor que nao viu esta conversa, nao conhece o repositorio e nao vai adivinhar nada. Assuma boa vontade e zero contexto.\n\n' +
      'O documento precisa responder, nesta ordem:\n\n' +
      '1. OBJETIVO — o que se quer alcancar, em uma frase, e por que isso importa. Sem isso o proximo agente otimiza a coisa errada.\n' +
      '2. ESTADO REAL DE HOJE — o que ja existe e funciona, o que existe e esta pela metade, o que nao existe. Cite arquivo, funcao, commit, comando, URL, numero. "Esta quase pronto" nao e estado; "o backend responde e falta ligar a identidade as telas de /app/" e.\n' +
      '3. O QUE JA FOI DESCARTADO E POR QUE — os caminhos que voce tentou e abandonou. Esta secao economiza mais tempo que qualquer outra, porque sem ela o proximo agente refaz suas tentativas fracassadas.\n' +
      '4. O CAMINHO PROPOSTO — passos concretos e ordenados, com os arquivos envolvidos. Se houver decisao em aberto, marque como decisao e diga quem decide, em vez de escolher escondido.\n' +
      '5. ARMADILHAS — o que parece obvio e esta errado, o que quebra em silencio, o que a documentacao existente afirma e nao corresponde ao codigo. Toda vez que voce se surpreendeu durante a investigacao, ha uma armadilha a registrar.\n' +
      '6. COMO VALIDAR — os comandos exatos que provam que funcionou (teste, build, lint, chamada real), e o que observar na saida. Nao "rodar os testes": o comando, e o resultado esperado.\n' +
      '7. CRITERIO DE PRONTO — checklist verificavel, sem adjetivo.\n\n' +
      'Regras de escrita:\n' +
      '- Fato medido vence adjetivo. Se voce escreveu "grande", "lento" ou "bagunçado", troque por numero.\n' +
      '- Link e caminho sempre completos e clicaveis/copiaveis.\n' +
      '- Diga explicitamente o que voce NAO verificou. Incerteza declarada e informacao; incerteza escondida vira bug.\n' +
      '- Se este documento for um arquivo vivo do projeto (IA.md, plano, scratchpad do canvas), acrescente uma entrada datada nova em vez de reescrever o historico, e mantenha o resumo do estado atual coerente com ela.\n' +
      '- Nunca termine deixando o trabalho marcado como "em andamento": feche com o estado final claro (concluido, bloqueado, aguardando decisao, ou interrompido com o motivo).\n\n' +
      'Trabalho a documentar:',
    scope: 'docs',
    isDefault: true,
  },
  {
    id: 'default-save-session-context',
    name: 'Salvar o contexto da sessao',
    description:
      'Congela o que foi decidido, descoberto e descartado nesta sessao num arquivo duravel, com estado real e proximo passo — antes que o contexto se perca.',
    prompt:
      'Voce vai salvar o contexto desta sessao num arquivo, para que ele sobreviva ao fim da conversa. Nao resuma o que voce disse: registre o que outra pessoa precisaria saber para continuar sem voce.\n\n' +
      'ONDE SALVAR, nesta ordem de preferencia: (1) o bloco de arquivo .md do canvas ligado a este terminal, se existir; (2) o IA.md do projeto, se o que voce descobriu for decisao de arquitetura ou comportamento do sistema; (3) um arquivo novo em docs/ com a data no nome. Nunca deixe so no chat — chat nao e armazenamento.\n\n' +
      'ESCREVA, nesta ordem:\n' +
      '1. ESTADO ATUAL em uma frase. Onde o trabalho parou, de forma verificavel. "Backend responde e falta ligar a identidade as telas" e estado; "esta quase pronto" nao e.\n' +
      '2. O QUE FOI DECIDIDO, cada item com o motivo e a alternativa descartada. Sem o porque, a decisao vira dogma e alguem a reverte por engano.\n' +
      '3. O QUE FOI DESCOBERTO e nao estava escrito em lugar nenhum: comportamento real que contradiz a documentacao, numero medido, onde mora a causa de um bug (com arquivo e funcao), armadilha. Toda vez que voce se surpreendeu nesta sessao, ha um item aqui.\n' +
      '4. BECOS SEM SAIDA: o que voce tentou e abandonou, com o motivo. Esta e a secao que mais economiza tempo — sem ela, o proximo agente refaz suas tentativas fracassadas.\n' +
      '5. EM ABERTO, separado em tres: falta fazer (trabalho conhecido), falta decidir (e de quem depende), nao verificado (voce assumiu e nao confirmou).\n' +
      '6. PROXIMO PASSO: um so, concreto, com o comando ou arquivo por onde comecar.\n\n' +
      'REGRAS: fato medido vence adjetivo (trocou "grande" ou "lento" por numero?); caminhos e links completos; escreva para quem nao viu esta conversa, sem nenhum "como conversamos" ou "aquele arquivo"; em arquivo vivo, ACRESCENTE uma entrada datada em vez de reescrever o historico; nunca encerre com o trabalho marcado como "em andamento" — feche com estado final claro (concluido, bloqueado, aguardando decisao, ou interrompido com o motivo).\n\n' +
      'Ao terminar, diga ao usuario ONDE voce salvou e o que ficou registrado.\n\n' +
      'Contexto adicional ou foco do registro (opcional):',
    scope: 'docs',
    isDefault: true,
  },
  {
    id: 'default-resume-context',
    name: 'Retomar de onde parou',
    description:
      'Entra num trabalho ja comecado (por outra sessao, pessoa ou agente), reconcilia o que esta escrito com o que o codigo mostra e diz o que entendeu antes de agir.',
    prompt:
      'Voce vai retomar um trabalho ja comecado. Nao ignore o que ja foi escrito (refazer tudo desperdica) nem acredite em tudo (documentacao envelhece calada). Leia, verifique o que importa, e declare o que nao conferiu.\n\n' +
      'ETAPA 1 — Leia, na ordem, o que existir: (a) o arquivo .md compartilhado do canvas ligado a este terminal; (b) o IA.md do projeto — comece pelo "Estado atual" e depois as entradas datadas de tras para frente; (c) AGENTS.md/CLAUDE.md, que sao as regras deste repositorio e valem mais que sua preferencia; (d) README; (e) `git log --oneline -30` e o diff do que for relevante.\n\n' +
      'ETAPA 2 — Reconcilie documento com realidade. Confira os pontos que mudariam sua decisao: o estado descrito ainda bate com o codigo? O "proximo passo" registrado ja foi feito? Os arquivos citados ainda existem? RODE O GATE (lint, testes, build) ANTES de mexer em qualquer coisa — assim voce sabe se quebrou algo ou se ja estava quebrado. Quando achar divergencia entre doc e codigo, REGISTRE em vez de corrigir em silencio: ela e informacao sobre o projeto.\n\n' +
      'ETAPA 3 — Reconstitua o raciocinio, nao so os fatos. Procure decisoes com motivo (respeite-as; reverter sem entender o porque e como refatorar sem teste), becos sem saida ja registrados (nao repita a tentativa que falhou) e convencoes locais de nome, camada, idioma e estilo de commit.\n\n' +
      'ETAPA 4 — ANTES DE ALTERAR QUALQUER ARQUIVO, devolva ao usuario:\n' +
      '- Estado que encontrei: ...\n' +
      '- Divergencias entre documentacao e codigo: ... (ou "nenhuma")\n' +
      '- Vou continuar por: ... porque ...\n' +
      '- Nao verifiquei: ...\n' +
      'Isso custa trinta segundos e evita horas na direcao errada. Se seu resumo estiver errado, o usuario corrige agora, nao depois do commit.\n\n' +
      'ETAPA 5 — Trabalhe sem apagar o passado: nao reescreva historico datado, nao apague trabalho de outro agente para "limpar", e em ambiente multiagente verifique se outra sessao esta no mesmo arquivo antes de reescreve-lo. Ao terminar, atualize o mesmo lugar de onde tirou o contexto.\n\n' +
      'Se nao houver contexto escrito nenhum, diga isso explicitamente e comece criando um.\n\n' +
      'Trabalho a retomar (link, pasta, arquivo ou descricao):',
    scope: 'planning',
    isDefault: true,
  },
  {
    id: 'default-status-briefing',
    name: 'Me atualiza sobre o projeto',
    description:
      'Briefing baseado em evidencia: o que mudou desde um marco, o que esta travado e por quem, o que exige decisao, e o que piorou — com numeros medidos.',
    prompt:
      'Voce vai produzir um briefing de atualizacao. Atualizacao NAO e resumo do README: e a resposta para "o que mudou desde a ultima vez, e o que exige a minha atencao agora?".\n\n' +
      'ETAPA 1 — Estabeleca o marco temporal. Atualizar desde quando? Se o usuario nao disser, use o ultimo marco que voce conseguir inferir (ultimo release, ultima entrada do IA.md, ultima semana) e DIGA qual usou. Fontes: `git log --since=... --oneline` e os diffs relevantes, entradas do IA.md depois daquela data, o scratchpad do canvas, e as tarefas/issues ligadas.\n\n' +
      'ETAPA 2 — Meca, nao impressione. Commits no periodo e por quem; testes (RODE o gate, nao confie no ultimo registro anotado); o que esta no ar e responde (verifique a URL, nao presuma); tamanho ou custo quando for relevante a decisao.\n\n' +
      'ETAPA 3 — Separe em quatro baldes:\n' +
      '- PRONTO E VERIFICADO — funciona, e diga COMO voce verificou.\n' +
      '- FEITO MAS NAO VALIDADO — existe codigo, ninguem provou. Diga o que falta para validar.\n' +
      '- TRAVADO — e por quem ou pelo que, desde quando. Bloqueio sem dono nao sai do lugar.\n' +
      '- PRECISA DE DECISAO — a decisao, as opcoes e a consequencia de cada uma. E esta secao que transforma briefing em reuniao util.\n\n' +
      'ETAPA 4 — Diga o que PIOROU. Briefing que so traz avanco e propaganda. Inclua o que regrediu, o que esta parado ha tempo demais (com a data do ultimo commit), documentacao que ficou mentindo, e divida que passou de incomodo a risco.\n\n' +
      'ETAPA 5 — Ajuste ao leitor, se o usuario disser quem vai ler: quem executa quer arquivo, comando e proximo passo; quem lidera produto quer estagio, risco e o que depende dele; quem investe quer valor, custo e tracao com numero medido. Se houver mais de uma versao (idiomas ou publicos), derive TODAS de uma fonte unica de fatos — versoes que divergem em numeros destroem a confianca nas duas.\n\n' +
      'Termine com uma secao "Nao verifiquei" e com o proximo passo mais valioso, um so.\n\n' +
      'Projeto e marco temporal:',
    scope: 'docs',
    isDefault: true,
  },
  {
    id: 'default-root-cause',
    name: 'Achar a causa raiz',
    description:
      'Investiga um bug ate a causa real: reproduz, coleta evidencia, testa hipoteses na ordem mais barata, prova o mecanismo e so entao corrige — com teste que falha antes.',
    prompt:
      'Voce vai investigar esta falha ate a CAUSA, nao ate o sintoma. Correcao que faz o sintoma sumir sem explicar a causa nao e correcao: e adiar o problema para um momento com menos contexto. Nao altere codigo antes da Etapa 6.\n\n' +
      'ETAPA 1 — REPRODUZA. Sem reproducao confiavel voce nao sabe se corrigiu. Estabeleca os passos exatos, a frequencia (sempre? as vezes? intermitente aponta para tempo, concorrencia, cache, rede ou ordem) e as fronteiras: acontece em qual SO, versao, ambiente, tamanho de entrada, usuario? A diferenca entre onde funciona e onde nao funciona E a pista. Se nao conseguir reproduzir, diga isso e investigue o que difere entre os ambientes.\n\n' +
      'ETAPA 2 — COLETE EVIDENCIA antes de mudar qualquer coisa: mensagem de erro inteira e stack completo; logs em volta do momento da falha, nao so a linha do erro; e o que mudou recentemente (git log, deploy, dependencia, dado, configuracao). A pergunta "funcionava antes?" vale mais que dez leituras de codigo.\n\n' +
      'ETAPA 3 — HIPOTESES. Escreva de 2 a 4 hipoteses plausiveis. Teste primeiro a mais BARATA de descartar, nao a mais provavel. Para cada uma, defina ANTES de testar: "se esta hipotese for verdadeira, eu deveria observar X". Sem isso, qualquer resultado confirma qualquer coisa.\n\n' +
      'ETAPA 4 — ISOLE. Bissecao no tempo (`git bisect` quando havia versao boa); bissecao no espaco (remova metade do sistema, use entrada minima, desligue o cache); reduza a entrada ate o menor caso que ainda falha.\n\n' +
      'ETAPA 5 — PROVE. Voce so achou a causa quando consegue (a) explicar o mecanismo — por que exatamente isso produz aquilo; (b) ligar e desligar o bug a vontade mexendo so na causa apontada; (c) explicar por que o sintoma aparecia daquele jeito e nao de outro, inclusive por que so naquele ambiente. Se nao consegue os tres, ainda e palpite — e diga que e palpite.\n\n' +
      'ETAPA 6 — CORRIJA NA CAMADA CERTA. Pergunte onde o problema NASCE, nao onde aparece. Tratar sintoma na borda (retry, except generico, valor default) quando a causa e de dados ou de contrato so esconde a falha. Se a causa e uma suposicao errada, corrija a suposicao e PROCURE OUTROS LUGARES que fazem a mesma suposicao — bug raramente vem sozinho.\n\n' +
      'ETAPA 7 — TRAVE O RETORNO. Escreva o teste que falha antes da correcao e passa depois (sem ele voce nao provou nada). Se o bug era invisivel, acrescente log ou erro explicito. Registre a CAUSA no IA.md — correcao sem causa registrada nao ensina nada.\n\n' +
      'ARMADILHAS: corrigir o que voce entende em vez do que causa; parar no primeiro achado plausivel (coincidencia e convincente); confiar na documentacao sobre o comportamento real; mudar varias coisas de uma vez.\n\n' +
      'Falha a investigar:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-safe-refactor',
    name: 'Refatorar com rede de seguranca',
    description:
      'Muda a forma preservando o comportamento: caracteriza o que existe com testes, move em passos reversiveis e prova equivalencia. Separa modularizacao real de cosmetica.',
    prompt:
      'Voce vai refatorar. Refatoracao muda a FORMA preservando o COMPORTAMENTO — se o comportamento muda, nao e refatoracao, e reescrita, e isso precisa de outro combinado com o usuario.\n\n' +
      'ETAPA 0 — A REDE VEM ANTES. Nao existe refatoracao segura sem forma de detectar quebra. (a) Rode o gate atual (lint, testes, build) e anote o resultado; se ja estava vermelho, resolva ou registre, senao voce nao distingue o seu estrago do que ja existia. (b) Se nao houver teste na area, escreva TESTES DE CARACTERIZACAO: eles nao julgam se o comportamento esta certo, apenas fixam o que ele e hoje — rode o codigo, capture a saida real, transforme em assercao. (c) Se a area for impossivel de testar sem refatorar antes, faca a MENOR mudanca que a torne testavel, isolada e commitada sozinha.\n\n' +
      'ETAPA 1 — ENTENDA ANTES DE MOVER. Quem chama o que? Que estado e compartilhado (estado global e o que transforma "separar arquivos" em modularizacao de fachada)? Que contratos sao publicos (API, props, eventos, formato de retorno)? Contratos sao preservados por padrao.\n\n' +
      'ETAPA 2 — PASSOS PEQUENOS E REVERSIVEIS. Um passo = uma transformacao com nome (extrair funcao, mover para o modulo certo, renomear para o nome do dominio, inverter dependencia, substituir condicional espalhada por despacho unico), com o gate verde no fim e commitavel sozinho. NUNCA misture refatoracao com mudanca de comportamento no mesmo commit — se achar um bug no meio, anote para depois ou corrija em commit separado e explicito.\n\n' +
      'ETAPA 3 — MODULARIZACAO REAL, NAO COSMETICA. Sinais de fachada: arquivos separados com estado global compartilhado; um arquivo de 8 mil linhas virou dois de 4 mil; funcoes movidas sem fronteira de responsabilidade; modulo cujo nome nao descreve uma responsabilidade; CSS/JS ainda inline no HTML. O teste honesto: voce consegue descrever a responsabilidade de cada modulo em uma frase, SEM usar "e"?\n\n' +
      'ETAPA 4 — PROVE A EQUIVALENCIA. Gate verde antes e depois; testes de caracterizacao passando SEM alteracao (se voce precisou mudar a assercao, o comportamento mudou — pare e decida conscientemente); em transformacao grande, compare saidas reais lado a lado com a mesma entrada.\n\n' +
      'ETAPA 5 — DEIXE RASTRO. Commit por passo, dizendo o que foi movido e por que. Registre a decisao de arquitetura no IA.md. Se o arquivo mudou de nome, cite o nome antigo na mensagem.\n\n' +
      'QUANDO NAO REFATORAR: sem teste e sem tempo de escrever caracterizacao; vespera de entrega na area que a entrega usa; so porque "esta feio" (feio e estavel perde para bonito e quebrado); em codigo que sera apagado em breve. Se for um destes casos, diga isso ao usuario em vez de seguir.\n\n' +
      'Alvo da refatoracao:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-legacy-tests',
    name: 'Cobrir com testes que valem',
    description:
      'Escreve testes que pegam regressao de verdade — comportamento e nao implementacao, regra critica e bordas — e verifica que cada teste falha quando a regra quebra.',
    prompt:
      'Voce vai escrever testes. O objetivo e pegar regressao, nao inflar cobertura: cobertura alta mede quanto codigo foi EXECUTADO, nao quanto foi VERIFICADO. Suite verde com bug em producao significa que os testes medem a coisa errada.\n\n' +
      'O QUE TESTAR, em ordem de valor: (1) a regra que, se quebrar, faz alguem perder dinheiro, dado ou confianca; (2) bugs que ja aconteceram — todo bug corrigido vira teste, e o unico jeito de ele nao voltar; (3) bordas: vazio, nulo, um item, muitos itens, tamanho maximo, duplicata, ordem inesperada, unicode, fuso horario, numero negativo; (4) idempotencia — rodar duas vezes produz o mesmo estado?; (5) contratos entre camadas.\n\n' +
      'O QUE NAO TESTAR: getter/setter trivial; framework de terceiro; detalhe de implementacao (se o teste quebra quando voce renomeia uma funcao privada sem mudar comportamento, ele mede a coisa errada); mock que so verifica que um mock foi chamado.\n\n' +
      'COMO ESCREVER:\n' +
      '- Nome que diz a REGRA, nao o metodo. Ruim: test_processar(). Bom: test_reimportar_o_mesmo_extrato_nao_duplica_lancamento().\n' +
      '- Tres blocos separados por linha em branco: preparar, agir, verificar. Quem le entende sem rolar.\n' +
      '- Uma razao para falhar por teste. Cinco assercoes sobre coisas diferentes viram um teste que ninguem sabe por que quebrou.\n' +
      '- Falha legivel: a mensagem tem que dizer o que se esperava e o que veio.\n' +
      '- Determinismo: nada de tempo real, aleatorio sem semente, rede, ordem de dicionario ou dependencia da maquina. Teste intermitente e pior que teste ausente, porque treina o time a ignorar vermelho.\n' +
      '- Sem rede e sem credencial: injete o cliente/dependencia. Se testar exige token, o desenho esta acoplado — conserte o desenho.\n\n' +
      'PARA CODIGO LEGADO SEM TESTE: use testes de caracterizacao — rode o codigo real, capture a saida, congele como assercao. Eles nao dizem que o comportamento esta certo, dizem qual e; e a rede que permite refatorar depois.\n\n' +
      'ANTES DE DAR POR PRONTO, faca o passo que quase todo mundo pula: QUEBRE A REGRA DE PROPOSITO e confirme que o teste falha. Teste que passa com o codigo quebrado nao protege nada. Depois confirme que a suite roda rapido o bastante para ser rodada sempre, e que alguem que nao escreveu o codigo entende a regra so lendo o teste.\n\n' +
      'Codigo a cobrir:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-dependency-upgrade',
    name: 'Atualizar dependencias',
    description:
      'Triagem de risco em vez de subir tudo: separa seguranca de conveniencia, sobe em lotes reversiveis, le o changelog certo e valida rodando a aplicacao.',
    prompt:
      'Voce vai atualizar dependencias. "Atualizar tudo" e a forma mais rapida de transformar uma tarde em tres dias: isto e gestao de risco, nao faxina.\n\n' +
      'ETAPA 1 — FOTOGRAFE O ESTADO. Gate verde ANTES de qualquer mudanca (sem isso voce nao distingue quebra nova de quebra velha). Confirme que o lockfile esta commitado — se nao estiver, esse e o primeiro problema, porque sem ele a build nao e reproduzivel. Rode a auditoria de vulnerabilidade e LEIA os achados, nao so a contagem.\n\n' +
      'ETAPA 2 — CLASSIFIQUE cada atualizacao: seguranca explorável (CVE em caminho que seu codigo realmente executa) = agora; seguranca teorica (CVE em funcao que voce nao usa, ou em dependencia de desenvolvimento) = planejada; correcao de bug que voce ja sentiu = alta; feature nova que voce nao precisa hoje = baixa; major com breaking change = projeto proprio. Diga explicitamente quando uma vulnerabilidade e de dependencia de DEV — nao e a mesma coisa que em producao.\n\n' +
      'ETAPA 3 — SUBA EM LOTES SEPARADOS E COMMITAVEIS: primeiro todos os patches (um commit, gate verde); depois minors por pacote ou grupo coeso, lendo o changelog; por fim majors, UM DE CADA VEZ, sempre com changelog aberto e commit dedicado — major sozinho e reversivel, major em lote nao. Nunca misture atualizacao com mudanca de codigo sua no mesmo commit.\n\n' +
      'ETAPA 4 — LEIA O QUE IMPORTA no changelog: breaking changes, removed, deprecated, mudanca de comportamento padrao, mudanca de versao minima da runtime. O risco costuma se esconder em parsing de data, encoding, ordenacao padrao, timeout padrao, politica de retry, formato de erro e comportamento com valor nulo.\n\n' +
      'ETAPA 5 — VALIDE DE VERDADE: gate completo; RODE A APLICACAO, nao so os testes (muita quebra de dependencia so aparece em runtime); cheque build de producao, empacotamento, tamanho do bundle e tempo de inicializacao; em app empacotado ou com dependencia nativa, teste em cada SO que voce entrega — dependencia nativa e onde "passou no CI" mais engana.\n\n' +
      'ETAPA 6 — REGISTRE: commit por lote com a lista do que subiu e de onde para onde; se uma atualizacao foi ADIADA, registre o motivo e o risco aceito, senao o proximo a olhar refaz a analise; se ha vulnerabilidade sem correcao disponivel, registre a mitigacao em uso.\n\n' +
      'SE QUEBRAR: reverta o lote inteiro primeiro, restabeleca o verde, e so entao investigue com o repositorio estavel.\n\n' +
      'Projeto e escopo da atualizacao:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-perf-investigation',
    name: 'Investigar performance',
    description:
      'Mede antes de otimizar: define lentidao com numero, perfila em vez de adivinhar, corrige uma coisa por vez e prova o ganho por percentil.',
    prompt:
      'Voce vai investigar um problema de performance. Otimizacao sem medicao e supersticao: a intuicao sobre onde o tempo e gasto erra na maior parte das vezes, inclusive a de quem escreveu o codigo. NAO altere codigo antes da Etapa 4.\n\n' +
      'ETAPA 1 — DEFINA "LENTO" COM NUMERO. Qual operacao exatamente (nao "o app", e sim "carregar a lista de pedidos")? Quanto leva hoje, medido em condicao realista? Quanto PRECISA levar (sem meta nao existe "pronto", so otimizacao infinita)? Com qual carga — 10 registros e 100 mil sao problemas diferentes.\n\n' +
      'ETAPA 2 — REPRODUZA COM DADO REAL. Otimizar contra dado de brinquedo leva a solucao errada, porque o gargalo do conjunto pequeno raramente e o do grande. Meca o PERCENTIL (p95, p99), nao so a media: a media esconde exatamente as pessoas que reclamam.\n\n' +
      'ETAPA 3 — PERFILE EM VEZ DE ADIVINHAR. Use a ferramenta da stack (profiler, EXPLAIN ANALYZE, tracing, DevTools). Suspeitos frequentes: N+1 (uma consulta por item dentro de um laco — o campeao absoluto); indice ausente na coluna do filtro/ordenacao; trabalho sincrono no caminho critico; serializacao repetida do mesmo objeto; ausencia de paginacao; renderizacao em excesso no front; trabalho refeito que caberia em cache.\n\n' +
      'ETAPA 4 — CORRIJA UMA COISA POR VEZ. Uma mudanca, uma medicao, um numero. Se mudar tres coisas e melhorar 40%, voce nao sabe qual fez efeito nem se uma piorou. Ordem de preferencia, do mais barato ao mais caro: (1) fazer menos trabalho — paginar, filtrar antes, evitar o laco; (2) fazer o mesmo trabalho melhor — indice, consulta unica, algoritmo; (3) fazer em outro momento — assincrono, fila, pre-calculo; (4) cachear, que e o mais tentador e o que mais cria bug porque adiciona invalidacao — deixe por ultimo; (5) mais maquina, que resolve, custa todo mes e esconde o problema.\n\n' +
      'ETAPA 5 — PROVE O GANHO. Meca de novo na mesma condicao e informe antes -> depois com percentil. Se o ganho nao for perceptivel para o usuario, DIGA ISSO: nem toda melhoria merece a complexidade que traz. Adicione teste ou medicao automatizada quando o ganho for critico, senao a regressao volta em silencio. Registre no IA.md o gargalo, a medicao e o que foi descartado.\n\n' +
      'REGRA FINAL: nao otimize o que nao esta no caminho critico. Complexidade adicionada e permanente; ganho em codigo que roda uma vez por dia nao e.\n\n' +
      'Problema de performance:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-incident-postmortem',
    name: 'Postmortem de incidente',
    description:
      'Analise depois da falha sem procurar culpado: linha do tempo factual, impacto medido, causa em camadas e acoes ordenadas por robustez, com dono e prazo.',
    prompt:
      'Voce vai conduzir o postmortem deste incidente. O objetivo NAO e descobrir quem errou: e descobrir por que o sistema permitiu que o erro chegasse ate aqui. Postmortem que termina em nome de pessoa nao muda nada — a proxima pessoa erra igual.\n\n' +
      'ETAPA 1 — Se o incidente ainda estiver ativo, ESTABILIZE PRIMEIRO (reverter, desligar a feature, restaurar) e so entao analise. Enquanto estabiliza, PRESERVE EVIDENCIA: logs, estado do banco, versao implantada, horarios — muita evidencia some com o rollback.\n\n' +
      'ETAPA 2 — LINHA DO TEMPO FACTUAL, com horario e fonte de cada item (log, deploy, mensagem, monitor). Cubra: quando comecou de verdade (quase sempre antes do que se percebeu), quando alguem notou, COMO notou, o que foi tentado, o que resolveu. A distancia entre "comecou" e "alguem notou" costuma ser o achado mais importante do postmortem inteiro.\n\n' +
      'ETAPA 3 — IMPACTO MEDIDO: quem foi afetado, quantos, por quanto tempo; o que se perdeu (dado, dinheiro, confianca) e o que foi recuperado; e o que NAO aconteceu por sorte — quase-acidente conta, e e de graca.\n\n' +
      'ETAPA 4 — CAUSA EM CAMADAS. Nao pare na primeira; para cada resposta pergunte "e por que isso foi possivel?". Separe: GATILHO (o que disparou agora); FALHA TECNICA (o que quebrou); FALHA DE DETECCAO (por que o monitor nao avisou antes); FALHA DE BARREIRA (que revisao, teste ou validacao deveria ter pego e nao pegou, e por que). A causa util quase nunca e "fulano esqueceu" — e "nada impedia esquecer".\n\n' +
      'ETAPA 5 — ACOES, ordenadas por robustez: (1) tornar o erro IMPOSSIVEL (restricao no banco, tipo, API que nao aceita o estado invalido); (2) torna-lo DETECTAVEL na hora (teste, validacao, gate no CI); (3) torna-lo VISIVEL rapido (alerta, log, monitor); (4) tornar a RECUPERACAO rapida (rollback facil, backup testado); (5) documentar/treinar — o mais fraco de todos. Se a unica acao for "avisar o time", o postmortem falhou. Cada acao com DONO e PRAZO.\n\n' +
      'ETAPA 6 — REGISTRE no IA.md do projeto, com data: o que aconteceu, a causa em camadas e o que mudou por causa disso. Postmortem que ninguem acha daqui a seis meses e trabalho perdido.\n\n' +
      'TOM: escreva de forma que a pessoa que cometeu o erro possa ler sem se sentir atacada — inclusive porque frequentemente e voce. Postmortem punitivo produz gente escondendo incidente, e incidente escondido e o mais caro de todos.\n\n' +
      'Incidente:',
    scope: 'security',
    isDefault: true,
  },
]

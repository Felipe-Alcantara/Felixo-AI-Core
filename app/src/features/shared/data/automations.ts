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
      'Antes de apontar qualquer achado, entenda o padrao local (stack, camadas, convencoes ja usadas no repositorio) para nao sugerir uma mudanca que contraria um padrao intencional do projeto sem justificar por que vale a excecao.\n\n' +
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
      '7. Apresente o plano de commits (grupo -> arquivos -> mensagem) antes de executar, e so execute apos confirmacao se a acao for potencialmente destrutiva ou afetar historico compartilhado.\n\n' +
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
      'Escreva em Markdown limpo, com titulos curtos e bullets escaneaveis; evite paragrafo corrido longo. O relatorio deve deixar claro o que mudou, por que mudou, como foi validado e qual risco sobrou — se alguma dessas respostas nao existir, diga isso explicitamente em vez de omitir a secao.',
    scope: 'docs',
    isDefault: true,
  },
]

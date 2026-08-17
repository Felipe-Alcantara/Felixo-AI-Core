'use strict'

/**
 * O catalogo de skills que o app conhece, em tres origens:
 *
 * - `builtin`: a biblioteca que acompanha o app (`app/resources/skills`),
 *   materializada em disco para o agente poder ler e o usuario poder editar.
 * - `community`: skills publicas de terceiros, referenciadas pela **fonte
 *   original** (URL). Nao sao baixadas nem reescritas — o agente busca no
 *   endereco quando precisar, entao o catalogo nao envelhece com o app e o
 *   credito fica com quem escreveu.
 * - `user`: as que a pessoa cadastrou no painel de Skills.
 *
 * O agente nunca recebe o conteudo das skills no prompt: recebe a **lista**
 * (nome, descricao e onde encontrar) e le o arquivo so quando a tarefa combina
 * — o mesmo "progressive disclosure" da especificacao Agent Skills.
 */

/** Skills que acompanham o app. `slug` e a pasta em `resources/skills`. */
const BUILTIN_SKILLS = [
  {
    slug: 'notion-operacoes',
    name: 'Operar o Notion sem estragar nada',
    description:
      'Contrato da CLI notion-tasks: ler antes de escrever, trabalhar nas linhas quando a pagina contem database, conferir schema, ligar relacoes nos dois sentidos e nao apagar o que nao se recria.',
  },
  {
    slug: 'notion-anotacoes-para-tarefas',
    name: 'Anotacoes cruas viram tarefas no Notion',
    description:
      'Investiga cada link e repositorio citado numa anotacao e escreve tarefas ricas no database — sem executar o trabalho que elas descrevem.',
  },
  {
    slug: 'capturar-contexto-da-sessao',
    name: 'Capturar o contexto da sessao',
    description:
      'Salva decisoes, descobertas, becos sem saida, estado real e proximo passo num arquivo duravel antes que a sessao acabe e o contexto se perca.',
  },
  {
    slug: 'retomar-contexto',
    name: 'Retomar um trabalho ja comecado',
    description:
      'Entrar em trabalho de outra sessao/agente e ficar produtivo rapido: ler o que existe, reconciliar documento com codigo e declarar o que nao conferiu.',
  },
  {
    slug: 'handoff-entre-agentes',
    name: 'Passar o trabalho para outro agente',
    description:
      'Escrever um handoff que outro agente executa sem refazer a investigacao — missao, estado, tentativas que falharam, armadilhas e como validar.',
  },
  {
    slug: 'destilar-anotacoes',
    name: 'Destilar anotacoes cruas',
    description:
      'Transformar despejo de ideias, reuniao ou mensagens soltas em conhecimento estruturado, sem perder informacao e sem inventar o que nao foi dito.',
  },
  {
    slug: 'memoria-viva-ia-md',
    name: 'IA.md como memoria viva',
    description:
      'Manter o IA.md como linha do tempo append-only: decisao com motivo, evidencia do que foi medido e validacao real, em vez de resumo reescrito.',
  },
  {
    slug: 'briefing-de-atualizacao',
    name: 'Briefing de atualizacao',
    description:
      'Responder "me atualiza sobre X" com evidencia: o que mudou desde um marco, o que esta travado e por quem, e o que exige decisao.',
  },
  {
    slug: 'investigar-repo-desconhecido',
    name: 'Entrar em um repositorio desconhecido',
    description:
      'Leitura minima antes da primeira linha alterada: convencoes locais, gate de qualidade, estrutura real, historico e onde mora o risco.',
  },
  {
    slug: 'depurar-causa-raiz',
    name: 'Depurar ate a causa, nao ate o sintoma',
    description:
      'Reproduzir, isolar, provar a hipotese e corrigir na camada certa — com o teste que falha antes e passa depois.',
  },
  {
    slug: 'refatorar-com-rede-de-seguranca',
    name: 'Refatorar sem quebrar',
    description:
      'Caracterizar o comportamento atual com testes, mover em passos reversiveis e provar equivalencia. Separa modularizacao real de cosmetica.',
  },
  {
    slug: 'escrever-testes-que-valem',
    name: 'Testes que pegam regressao',
    description:
      'Testar comportamento e nao implementacao, cobrir a regra critica e as bordas, e garantir que o teste falha quando a regra quebra.',
  },
  {
    slug: 'revisar-pull-request',
    name: 'Revisar um pull request',
    description:
      'Review de revisor senior: correcao, seguranca, perda de dado, contratos e testes, com achados priorizados e severidade declarada.',
  },
  {
    slug: 'atualizar-dependencias',
    name: 'Atualizar dependencias com triagem de risco',
    description:
      'Separar seguranca de conveniencia, subir em lotes reversiveis, ler o changelog certo e validar rodando a aplicacao, nao so os testes.',
  },
  {
    slug: 'investigar-performance',
    name: 'Performance: medir antes de otimizar',
    description:
      'Definir lentidao com numero, perfilar em vez de adivinhar, corrigir uma coisa por vez e provar o ganho por percentil.',
  },
  {
    slug: 'migracao-de-banco-segura',
    name: 'Migracao de banco sem perder dado',
    description:
      'Expand/migrate/contract, backfill idempotente e retomavel, e o cuidado com o que nao volta. Codigo se reverte, dado nao.',
  },
  {
    slug: 'postmortem-de-incidente',
    name: 'Postmortem sem culpado',
    description:
      'Linha do tempo factual, causa em camadas (gatilho, falha tecnica, deteccao, barreira) e acoes ordenadas por robustez, com dono e prazo.',
  },
]

/**
 * Skills publicas de terceiros, referenciadas na fonte. Curadoria enxuta e de
 * proposito: entram as que cobrem trabalho que a biblioteca propria nao cobre
 * (formatos de arquivo, construcao de MCP, teste de webapp), nao um diretorio
 * inteiro. `url` aponta para o SKILL.md/pasta original.
 */
const COMMUNITY_SKILLS = [
  {
    id: 'community-anthropic-pdf',
    name: 'PDF (Anthropic)',
    description:
      'Ler, extrair, preencher e gerar PDF — inclusive formularios e extracao de texto/tabela de documento escaneado.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/pdf',
    origin: 'anthropics/skills',
  },
  {
    id: 'community-anthropic-docx',
    name: 'DOCX (Anthropic)',
    description:
      'Criar e editar documentos Word preservando formatacao, estilos e controle de alteracoes.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/docx',
    origin: 'anthropics/skills',
  },
  {
    id: 'community-anthropic-xlsx',
    name: 'XLSX (Anthropic)',
    description:
      'Ler e escrever planilhas Excel com formulas, formatacao e multiplas abas.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/xlsx',
    origin: 'anthropics/skills',
  },
  {
    id: 'community-anthropic-pptx',
    name: 'PPTX (Anthropic)',
    description: 'Criar e editar apresentacoes PowerPoint a partir de conteudo estruturado.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/pptx',
    origin: 'anthropics/skills',
  },
  {
    id: 'community-anthropic-mcp-builder',
    name: 'MCP builder (Anthropic)',
    description:
      'Construir um servidor MCP do zero: ferramentas, esquemas, transporte e empacotamento.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/mcp-builder',
    origin: 'anthropics/skills',
  },
  {
    id: 'community-anthropic-webapp-testing',
    name: 'Teste de webapp (Anthropic)',
    description:
      'Dirigir um navegador para testar uma aplicacao web de verdade: fluxo, screenshot e verificacao do que o usuario ve.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/webapp-testing',
    origin: 'anthropics/skills',
  },
  {
    id: 'community-anthropic-frontend-design',
    name: 'Design de frontend (Anthropic)',
    description:
      'Decisoes de interface com criterio: hierarquia, espacamento, tipografia, estados e acessibilidade.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
    origin: 'anthropics/skills',
  },
  {
    id: 'community-anthropic-skill-creator',
    name: 'Criar uma skill (Anthropic)',
    description:
      'Escrever uma skill nova no padrao Agent Skills, com frontmatter, descricao que dispara na hora certa e progressive disclosure.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
    origin: 'anthropics/skills',
  },
]

/** Diretorios publicos para quem quiser procurar mais skills. */
const SKILL_DIRECTORIES = [
  { name: 'anthropics/skills', url: 'https://github.com/anthropics/skills' },
  {
    name: 'awesome-claude-skills',
    url: 'https://github.com/travisvn/awesome-claude-skills',
  },
  { name: 'Especificacao Agent Skills', url: 'https://agentskills.io' },
]

/**
 * Monta a lista de skills disponiveis, ja com a origem marcada.
 *
 * Funcao pura: recebe o que resolveu os caminhos e o que veio das
 * configuracoes, e nao toca em disco. Assim a ordem e a filtragem tem teste.
 *
 * @param {object} options
 * @param {(slug: string) => string} options.resolveBuiltinPath - caminho do SKILL.md.
 * @param {boolean} [options.communityEnabled] - inclui as skills de terceiros.
 * @param {Array<object>} [options.userSkills] - skills cadastradas pela pessoa.
 * @param {Array<string>} [options.hiddenBuiltinIds] - built-ins que a pessoa removeu.
 * @returns {Array<{id: string, name: string, description: string, path: string, source: string, origin?: string}>}
 */
function listAvailableSkills(options = {}) {
  const {
    resolveBuiltinPath,
    communityEnabled = true,
    userSkills = [],
    hiddenBuiltinIds = [],
  } = options

  const hidden = new Set(hiddenBuiltinIds)

  const builtin = BUILTIN_SKILLS.map((skill) => ({
    id: `builtin-${skill.slug}`,
    name: skill.name,
    description: skill.description,
    path: typeof resolveBuiltinPath === 'function' ? resolveBuiltinPath(skill.slug) : '',
    source: 'builtin',
  })).filter((skill) => skill.path && !hidden.has(skill.id))

  const community = communityEnabled
    ? COMMUNITY_SKILLS.filter((skill) => !hidden.has(skill.id)).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        path: skill.url,
        source: 'community',
        origin: skill.origin,
      }))
    : []

  // As do usuario vem por ultimo e vencem: um id repetido substitui o do
  // catalogo, para dar como editar uma skill que acompanha o app.
  const porId = new Map()
  for (const skill of [...builtin, ...community]) {
    porId.set(skill.id, skill)
  }
  for (const skill of userSkills) {
    if (skill && skill.id && skill.name && skill.path) {
      porId.set(skill.id, {
        id: String(skill.id),
        name: String(skill.name),
        description: String(skill.description ?? ''),
        path: String(skill.path),
        source: 'user',
      })
    }
  }

  return [...porId.values()]
}

module.exports = {
  BUILTIN_SKILLS,
  COMMUNITY_SKILLS,
  SKILL_DIRECTORIES,
  listAvailableSkills,
}

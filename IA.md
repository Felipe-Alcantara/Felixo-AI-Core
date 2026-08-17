
---

## [2026-08-17] Biblioteca de skills, catálogo de prompts e o manifesto no spawn

**Contexto.** Uma sessão longa de trabalho real (operar o Notion, auditar
repositórios, escrever tarefas para outro agente executar) mostrou que o app
tinha ótimos prompts de *desenvolvimento* e nada para o resto do trabalho: gerir
contexto de sessão, operar base de conhecimento, entrar em repositório alheio,
passar trabalho adiante.

### Skills: biblioteca própria + terceiros por referência

Skills deixaram de ser só ponteiros que a pessoa cadastra. Agora existe uma
**biblioteca que acompanha o app**, em `app/resources/skills/<slug>/SKILL.md`,
escrita no formato **Agent Skills** (frontmatter `name` + `description`) — a
mesma especificação de `anthropics/skills` e do `.claude/skills/`. A escolha do
formato é deliberada: os arquivos servem ao canvas **e** ao Claude Code, sem
conversão.

São 17 skills em três famílias: operação do Notion (2), gestão de contexto de
sessão (6: capturar, retomar, handoff, destilar anotações, IA.md vivo, briefing)
e engenharia (9: repo desconhecido, causa raiz, refatoração com rede, testes,
review, dependências, performance, migração de banco, postmortem).

**Skills de terceiros são referenciadas na fonte, nunca baixadas nem
reescritas** (`skills-catalog.cjs` → `COMMUNITY_SKILLS`): oito entradas de
`anthropics/skills` apontando para a URL original. O crédito fica com quem
escreveu e o catálogo não envelhece com o app. Vem **ligado por padrão**, com
desligamento no painel de Skills.

`installBuiltinSkills` materializa a biblioteca em `userData/skills` a cada
início. A regra de atualização é conservadora: instala o que falta, atualiza o
que está **idêntico ao que o app instalou** (marcador `.origem` ao lado) e
**preserva o que a pessoa editou**. Sem marcador, trata como editado — perder
edição é pior que ficar atrasado.

### O agente sabe que as skills existem, sem pagar por elas

Todo terminal de agente nasce com um **manifesto**: nome, descrição e onde
encontrar cada skill — **nunca o conteúdo**. É o *progressive disclosure* da
especificação: dezessete skills coladas no prompt inicial gastariam o contexto
exatamente com o que quase nunca é necessário. O bloco entra por último (depois
da tarefa e da identidade), diz explicitamente que a lista é oferta e não
obrigação, e corta em 40 itens com resumo do excedente.

### Catálogo de prompts: de 7 para 21

Novos: 3 de Notion (intake de anotações, contrato de operação, malha de
relações), 3 de contexto (salvar sessão, retomar, briefing de atualização) e 6
de engenharia (auditar repo de terceiro, escrever para o próximo agente, causa
raiz, refatorar com rede, testes que valem, dependências, performance,
postmortem). Escopo novo `notion`.

Os presets antigos ganharam o que faltava: `preparar commit` agora roda o gate e
confere artefato gerado/lockfile antes de commitar; `revisar codigo` passa a
exigir **severidade declarada** por achado e a separar fato de preferência;
`planejar feature` manda perguntar em vez de assumir.

### Duplicação encontrada pelo compilador

A lista de escopos e os rótulos viviam copiados em **três** arquivos
(`PromptsPanel`, `PromptDetailPanel`, `AutomationsModal`). Acrescentar um escopo
compilava e sumia de um dropdown. Agora é fonte única em
`shared/types/automations.ts` — o terceiro caso só apareceu porque o `tsc`
reclamou, o que é o argumento a favor da centralização.

### Validação

`npm run lint` e `tsc --noEmit` limpos; **465 testes de frontend** (Vitest) e
**619 do processo principal** (`node --test`) verdes. Testes novos cobrem a
regra de preservação de edição do instalador, a filtragem do catálogo, o
manifesto (inclusive a garantia de que ele **não** cola conteúdo) e a
integridade do catálogo de prompts — este último pegou um preset real que não
terminava pedindo a entrada do usuário, e o preset foi corrigido.

**Não** foi executado o app empacotado nesta sessão, a pedido: a validação foi
por gate e testes, sem subir nem derrubar processo do Electron.

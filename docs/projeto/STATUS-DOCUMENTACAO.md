# Status da Documentação

Status: em desenvolvimento.

## Decisão deste ciclo

A tasklist pede status no nome de cada arquivo Markdown. O padrão atual do projeto, porém, usa `Status:` no corpo dos documentos e muitos arquivos já estão modificados no worktree. Renomear tudo agora teria alto risco de quebrar links e de misturar alterações pré-existentes em commits de feature.

Neste ciclo, o status será auditado em um documento central. Renomeação em massa só deve acontecer depois de:

1. worktree limpo ou escopo de commit combinado;
2. atualização automática de links internos;
3. validação de links;
4. padrão de nomenclatura aprovado.

## Padrão recomendado

Manter no topo de cada documento:

```text
Status: concluido.
Status: em desenvolvimento.
Status: planejado.
```

Se a renomeação for realmente adotada depois, usar sufixo ASCII consistente:

```text
NOME-DO-DOCUMENTO__CONCLUIDO.md
NOME-DO-DOCUMENTO__EM-DESENVOLVIMENTO.md
NOME-DO-DOCUMENTO__PLANEJADO.md
```

## Pendências

- Renomear arquivos com status no nome, se esse padrão for confirmado depois.
- Atualizar links antes de qualquer renomeação.
- Executar a renomeação em commit isolado, porque o impacto atinge praticamente toda a árvore `/docs`.

## Auditoria de 2026-05-01

Todos os arquivos Markdown em `/docs` foram verificados quanto à presença de uma linha `Status:`. Os documentos que ainda não tinham essa linha receberam `Status: concluido.` quando eram guias, padrões ou relatórios já fechados.

Resultado:

- Todos os `.md` em `/docs` possuem status no corpo do documento.
- A renomeação física dos arquivos foi adiada para evitar quebra de links e mistura com alterações pré-existentes no worktree.

## Revisão de 2026-05-01

A continuação da tasklist manteve a decisão de não renomear os arquivos no mesmo recorte de orquestração/exportação. A renomeação física continua viável, mas deve ser tratada como mudança própria: gerar mapa antigo/novo, aplicar `git mv`, reescrever links internos e validar referências em seguida.

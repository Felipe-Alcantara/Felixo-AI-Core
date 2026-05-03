# Status da Documentação

Status: concluido.

## Decisão consolidada

A tasklist pediu status no nome de cada arquivo Markdown. O padrão consolidado do projeto, porém, é manter `Status:` no corpo dos documentos. Isso evita renomeação massiva, preserva links internos e mantém os nomes dos arquivos estáveis.

Renomeação física com status no nome não será feita no padrão atual. Se esse padrão voltar a ser desejado no futuro, deve ser tratado como ADR/migração própria e só acontecer depois de:

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

Não há pendência ativa de renomeação. A regra vigente é documentar status no corpo do arquivo.

## Auditoria de 2026-05-01

Todos os arquivos Markdown em `/docs` foram verificados quanto à presença de uma linha `Status:`. Os documentos que ainda não tinham essa linha receberam `Status: concluido.` quando eram guias, padrões ou relatórios já fechados.

Resultado:

- Todos os `.md` em `/docs` possuem status no corpo do documento.
- A renomeação física dos arquivos foi adiada para evitar quebra de links e mistura com alterações pré-existentes no worktree.

## Revisão de 2026-05-01

A continuação da tasklist manteve a decisão de não renomear os arquivos no mesmo recorte de orquestração/exportação. A renomeação física continua viável, mas deve ser tratada como mudança própria: gerar mapa antigo/novo, aplicar `git mv`, reescrever links internos e validar referências em seguida.

## Revisão de 2026-05-03

Decisão fechada: o status permanece no corpo dos arquivos Markdown. A pendência de "status no nome físico" foi encerrada para evitar churn de paths e quebra de links.

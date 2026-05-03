# Relatórios de Desenvolvimento

Status: em desenvolvimento.

## Objetivo

Criar relatórios por dia, semana, mês ou sprint a partir de commits, diffs e registros manuais, separando progresso real de interpretação automática.

## Escopo inicial

- [x] Analisar commits do dia.
- [x] Agrupar commits por data.
- [x] Extrair mensagens.
- [x] Identificar arquivos alterados.
- [x] Gerar resumo simples.
- [x] Exportar como Markdown em `docs/relatorios/`.

Implementado em `scripts/generate-daily-report.cjs`:

```bash
node scripts/generate-daily-report.cjs --date 2026-05-03 --write
```

## Escopo intermediário

- Relatório semanal.
- Relatório mensal.
- Intervalo customizado.
- Classificação por tipo: feature, bugfix, docs, refactor, testes, infraestrutura e experimentos.
- Changelog simplificado.

## Escopo avançado

- Associar commits a sprints.
- Associar commits a tasks internas.
- Marcar feature concluída manualmente.
- Templates configuráveis.
- Integração com notas e tasklists.

## Cuidados

- Mensagens ruins geram relatórios ruins.
- Mudanças não commitadas precisam de tratamento separado.
- Relatório automático deve evitar inventar objetivo de commit.

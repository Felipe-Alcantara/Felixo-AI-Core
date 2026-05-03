# Pendências Priorizadas em `/docs`

Status: em desenvolvimento.

## Objetivo

Registrar a análise das pendências abertas em `/docs` e ordenar próximos recortes por impacto, dificuldade e risco. Este documento atende a tasklist de 01/05/2026 sem transformar o roadmap inteiro em implementação imediata.

## Critério de priorização

| Prioridade | Critério |
|------------|----------|
| Alta | Corrige risco de regressão, vazamento de contexto ou inconsistência do orquestrador |
| Média | Melhora uso diário sem alterar contrato central de execução |
| Baixa | Planejamento futuro, telas grandes ou features com risco operacional |

## Correções fáceis implementadas neste ciclo

| Área | Pendência | Resultado |
|------|-----------|-----------|
| Terminal | Threads devem mostrar o contexto inicial real, não o prompt interno completo enviado à CLI | `promptHint` agora usa a pergunta original do usuário, prompt do subagente ou objetivo original da run |
| Sessão | Eventos atrasados de threads antigas podiam reaparecer no terminal após novo chat | `useTerminalOutput` ignora eventos de threadIds resetados |
| Orquestração | Reinvocações do orquestrador podiam perder lista de modelos/configurações e cair em fallback permissivo | `availableModels`, `orchestratorSettings` e limites são preservados entre turnos |
| Orquestração | Motivo de escolha do modelo não ficava rastreável | Evento `orchestration_model_choice` registra modelo escolhido, regra, candidatos, bloqueios e motivo |
| Exportação | Exportação não permitia destino/nome manual no app desktop | Modal recebe nome manual e o Electron usa `showSaveDialog`; navegador continua com fallback por download |
| Relatórios | Gerar relatório do dia a partir de commits locais | `scripts/generate-daily-report.cjs` gera Markdown diário e atualiza o índice de `docs/relatorios/` |
| Persistência | Configurações do orquestrador dependiam de `localStorage` | Store Electron grava em `userData/config/orchestrator-settings.json` e migra o valor legado |
| Documentação | Decidir se status vai no nome físico dos arquivos | Padrão consolidado: `Status:` fica no corpo do Markdown; renomeação física não será adotada agora |

## Pendências consolidadas

| Prioridade | Área | Documento origem | Pendência | Dificuldade | Risco |
|------------|------|------------------|-----------|-------------|-------|
| Alta | Persistência | `docs/backend/PERSISTENCIA-SQLITE.md` | Criar schema mínimo, migrations e repositório Electron antes de migrar histórico, notas, modelos e projetos restantes | Média | Médio |
| Alta | Terminal/providers | `docs/projeto/TERMINAL-PERSISTENTE.md` | Validar protocolo persistente real para Codex/Gemini antes de substituir retomada nativa | Alta | Alto |
| Alta | Segurança | `docs/backend/PLANO-CONFIRMACOES-PERMISSOES-CLI.md` | Formalizar confirmações para ações de escrita, Git e ferramentas sensíveis | Média | Alto |
| Média | Git | `docs/projeto/PAINEL-GIT-INTEGRADO.md` | Evoluir painel Code de read-only para stage/unstage/commit com confirmação | Média | Médio |
| Baixa | Workflows | `docs/projeto/WORKFLOWS-VISUAIS.md` | Criar canvas visual estilo n8n/Railway, inicialmente sem execução real | Alta | Médio |
| Baixa | MCP | `docs/arquitetura/ORQUESTRADOR-HIBRIDO-MCP.md` | Implementar servidor MCP read-only a partir do catálogo atual | Alta | Médio |
| Baixa | Roadmap | `docs/projeto/ROADMAP.md` | Atualizar checklists antigos que já foram parcialmente implementados | Média | Baixo |

## Próximos recortes recomendados

1. Implementar recorte inicial do plano SQLite/memória em `docs/implementacoes/PERSISTENCIA-SQLITE-MEMORIA-PLANO.md`.
2. Atualizar `ROADMAP.md` marcando itens já entregues no frontend atual.

## Cuidados

- Não implementar operações Git destrutivas sem política de confirmação.
- Não migrar notas/histórico para SQLite antes de existir migração versionada.
- Não trocar Codex/Gemini para processo persistente real sem contrato parseável de conclusão.
- Não renomear todos os arquivos de `/docs` sem atualizar links internos no mesmo commit.

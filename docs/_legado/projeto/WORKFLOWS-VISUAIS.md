# Workflows Visuais

Status: planejado.

## Objetivo

Planejar uma tela visual estilo n8n/Railway para criar cadeias de automação com nós, conexões, agentes, modelos, ferramentas, condições e aprovações humanas.

## Diferença para o chat

| Fluxo | Descrição |
|-------|-----------|
| Chat comum | Interação linear e conversacional |
| Orquestração automática | O modelo decide subagentes durante uma resposta |
| Workflow visual | O usuário desenha uma sequência explícita e reutilizável |

## Modelo conceitual

| Conceito | Descrição |
|----------|-----------|
| Workflow | Grafo versionado com nós, conexões e configuração de execução |
| Node | Unidade de trabalho: input, IA, Git, arquivo, decisão, aprovação ou saída |
| Conexão | Direcionamento de saída de um node para entrada de outro |
| Execução | Run com logs por node, status e limites |

## Nodes iniciais

- Input manual.
- Modelo/IA.
- Prompt template.
- Leitura de arquivo.
- Escrita de arquivo com confirmação.
- Git status/diff.
- Resumo.
- Relatório.
- Decisão condicional.
- Aprovação humana.
- Saída/exportação.

## Fases

1. Canvas visual sem execução real.
2. Salvar/carregar workflows.
3. Executar nodes simples.
4. Executar cadeia linear.
5. Branching condicional.
6. Subagentes e ferramentas.
7. Agendamento e automações.

## Riscos

- Loops sem limite.
- Ações destrutivas sem confirmação.
- Custo/tokens fora de controle.
- UI complexa demais cedo.
- Misturar workflow visual com orquestração espontânea.

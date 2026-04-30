import type { AutomationDefinition } from '../types'

export const defaultAutomations: AutomationDefinition[] = [
  {
    id: 'default-plan-feature',
    name: 'Planejar feature',
    description: 'Transforma uma ideia em plano tecnico, riscos e criterios de aceite.',
    prompt:
      'Analise esta feature, investigue o contexto necessario, proponha um plano de implementacao e liste os criterios de aceite antes de codar:',
    scope: 'planning',
    isDefault: true,
  },
  {
    id: 'default-code-review',
    name: 'Revisar codigo',
    description: 'Foca em bugs, regressao, riscos e testes faltantes.',
    prompt:
      'Revise o codigo com postura de code review. Priorize bugs, riscos, regressao e lacunas de teste. Traga achados com arquivo e linha:',
    scope: 'code',
    isDefault: true,
  },
  {
    id: 'default-daily-report',
    name: 'Gerar relatorio diario',
    description: 'Resume o que foi feito no dia em formato de relatorio tecnico.',
    prompt:
      'Crie um relatorio diario objetivo com resumo, arquivos alterados, decisoes tecnicas, testes executados e proximos passos:',
    scope: 'docs',
    isDefault: true,
  },
  {
    id: 'default-git-prep',
    name: 'Preparar commit',
    description: 'Organiza diff, riscos e sugestao de mensagem de commit.',
    prompt:
      'Analise o estado do Git, separe as mudancas por feature e sugira mensagens de commit claras e pequenas:',
    scope: 'git',
    isDefault: true,
  },
  {
    id: 'default-doc-sync',
    name: 'Atualizar docs',
    description: 'Pede atualizacao da documentacao viva apos uma implementacao.',
    prompt:
      'Atualize a documentacao do projeto para refletir esta implementacao, mantendo o padrao da pasta docs:',
    scope: 'docs',
    isDefault: true,
  },
]

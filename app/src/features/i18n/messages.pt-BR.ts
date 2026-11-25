/**
 * Catálogo pt-BR da interface: é a referência. `MessageKey` sai daqui, e todo
 * outro idioma é parcial, com fallback para estas frases.
 *
 * Áreas migradas: Configurações > Idioma e Iniciar com o sistema, e o gerador de prompts. As demais
 * ainda têm o texto escrito no componente (plano por área no relatório da task).
 */
export const PT_BR = {
  'idioma.rotulo': 'Idioma',
  'idioma.opcao.pt-BR': 'Português (Brasil)',
  'idioma.opcao.en': 'English',

  'autostart.titulo': 'Iniciar com o sistema',
  'autostart.descricao': 'Abre o Felixo automaticamente quando você liga o computador.',
  'autostart.alternar': 'Sempre iniciar com o sistema',
  'autostart.indisponivel': 'Esta opção não está disponível nesta plataforma.',
  'autostart.erroLer': 'Não foi possível ler a preferência de autostart.',
  'autostart.erroSalvar': 'Não foi possível salvar a preferência de autostart.',

  'gerador.abrir': 'Gerar prompt',
  'gerador.titulo': 'Gerador de prompts',
  'gerador.aviso': 'Monta o prompt neste computador, sem IA e sem rede. Nada sai daqui até você copiar, enviar ou salvar.',
  'gerador.objetivo': 'Objetivo (obrigatório)',
  'gerador.objetivoDica': 'O que você quer que o agente faça?',
  'gerador.contexto': 'Contexto',
  'gerador.contextoDica': 'O que o agente precisa saber: trechos, links, o que já foi tentado.',
  'gerador.formato': 'Formato de saída',
  'gerador.formatoDica': 'Como quer a resposta: lista, tabela, diff, resumo de 5 linhas…',
  'gerador.restricoes': 'Restrições',
  'gerador.criterio': 'Critério de aceite',
  'gerador.maisCampos': 'Restrições e critério de aceite',
  'gerador.previa': 'Prévia (editável)',
  'gerador.previaEditada': 'Você editou o texto. Mudar os campos não o sobrescreve.',
  'gerador.refazer': 'Refazer a partir dos campos',
  'gerador.previaVazia': 'Preencha o objetivo para ver o prompt.',
  'gerador.copiar': 'Copiar',
  'gerador.copiado': 'Copiado',
  'gerador.copiadoAviso': 'Prompt copiado para a área de transferência.',
  'gerador.erroCopiar': 'Não foi possível copiar. Selecione o texto da prévia e copie à mão.',
  'gerador.enviar': 'Enviar ao agente',
  'gerador.enviando': 'Enviando…',
  'gerador.nome': 'Nome no catálogo',
  'gerador.topico': 'Tópico',
  'gerador.salvar': 'Salvar no catálogo',
  'gerador.salvarAtualizar': 'Atualizar no catálogo',
  'gerador.salvando': 'Salvando…',
  'gerador.salvo': 'Prompt salvo no catálogo.',
  'gerador.fechar': 'Fechar o gerador',
  'gerador.editarNoGerador': 'Editar no gerador',
} as const

export type MessageKey = keyof typeof PT_BR

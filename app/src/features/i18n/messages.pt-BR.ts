/**
 * Catálogo pt-BR da interface: é a referência. `MessageKey` sai daqui, e todo
 * outro idioma é parcial, com fallback para estas frases.
 *
 * Áreas migradas: Configurações > Idioma e Iniciar com o sistema. As demais
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
} as const

export type MessageKey = keyof typeof PT_BR

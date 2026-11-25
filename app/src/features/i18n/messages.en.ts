import type { MessageKey } from './messages.pt-BR'

/** Inglês: parcial, o que falta cai no pt-BR. */
export const EN: Partial<Record<MessageKey, string>> = {
  'idioma.rotulo': 'Language',
  'idioma.opcao.pt-BR': 'Português (Brasil)',
  'idioma.opcao.en': 'English',

  'autostart.titulo': 'Start with the system',
  'autostart.descricao': 'Opens Felixo automatically when you turn on your computer.',
  'autostart.alternar': 'Always start with the system',
  'autostart.indisponivel': 'This option is not available on this platform.',
  'autostart.erroLer': 'Could not read the autostart preference.',
  'autostart.erroSalvar': 'Could not save the autostart preference.',
}

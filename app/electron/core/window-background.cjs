'use strict'

/**
 * Cor de fundo da janela = a do tema salvo. O tema mora no localStorage do
 * renderer, que ainda não existe quando a janela abre; então o renderer avisa
 * o tema por IPC e o processo principal guarda no repositório de configurações.
 * Os valores seguem o fundo do boot em index.html e as variáveis dos temas.
 */
const THEME_BACKGROUNDS = { dark: '#09090b', light: '#f3f3f1', high_contrast: '#050505' }
const THEME_SETTING_KEY = 'app.theme'
const DEFAULT_BACKGROUND = THEME_BACKGROUNDS.dark

function readWindowBackground(settingsRepository) {
  try {
    return THEME_BACKGROUNDS[settingsRepository?.get(THEME_SETTING_KEY)] ?? DEFAULT_BACKGROUND
  } catch {
    return DEFAULT_BACKGROUND
  }
}

function registerWindowThemeIpc({ ipcMain, settingsRepository, listWindows = () => [] }) {
  ipcMain.on('settings:set-theme', (_event, theme) => {
    if (!Object.hasOwn(THEME_BACKGROUNDS, theme)) return
    try {
      settingsRepository?.set(THEME_SETTING_KEY, theme)
    } catch {
      // Sem gravar, a próxima abertura só usa o fundo escuro de sempre.
    }
    for (const win of listWindows()) {
      if (!win.isDestroyed()) win.setBackgroundColor(THEME_BACKGROUNDS[theme])
    }
  })
}

module.exports = { THEME_BACKGROUNDS, readWindowBackground, registerWindowThemeIpc }

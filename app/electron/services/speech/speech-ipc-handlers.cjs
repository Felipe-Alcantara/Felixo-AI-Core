'use strict'

const { ipcMain, safeStorage, systemPreferences } = require('electron')
const { toErrorResult } = require('../ipc-result.cjs')
const { createSpeechSettingsStore } = require('./speech-settings-store.cjs')
const { transcribeAudio } = require('./speech-transcription.cjs')

/**
 * Estado do acesso ao microfone segundo o sistema. macOS e Windows respondem
 * (`granted`/`denied`/`not-determined`/`restricted`); Linux não tem esse
 * conceito, então devolve `unknown` e o pedido de permissão só aparece quando
 * o Chromium abre o dispositivo.
 */
function microphoneStatus(prefs = systemPreferences) {
  try {
    const status = prefs?.getMediaAccessStatus?.('microphone')
    return typeof status === 'string' && status ? status : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Ponte do ditado por voz. Áudio e chave só existem aqui: o renderer manda o
 * áudio gravado, este processo lê a chave cifrada, chama a API e devolve só o
 * texto. A chave nunca volta ao renderer.
 *
 * @param {{ userData: string, dependencies?: object }} options
 */
function registerSpeechIpcHandlers({ userData, dependencies = {} }) {
  const store =
    dependencies.store ?? createSpeechSettingsStore({ userData, safeStorage: dependencies.safeStorage ?? safeStorage })
  const transcribe = dependencies.transcribe ?? transcribeAudio
  const prefs = dependencies.systemPreferences ?? systemPreferences
  const platform = dependencies.platform ?? process.platform

  ipcMain.handle('speech:get-config', () => {
    try {
      return { ok: true, config: store.getConfig() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel ler a configuracao do ditado.')
    }
  })

  ipcMain.handle('speech:save-config', (_event, config) => {
    try {
      return { ok: true, config: { ...store.saveConfig(config), keyConfigured: store.getConfig().keyConfigured } }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar a configuracao do ditado.')
    }
  })

  ipcMain.handle('speech:set-key', (_event, key) => {
    try {
      store.setKey(key)
      return { ok: true }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel guardar a chave.')
    }
  })

  ipcMain.handle('speech:clear-key', () => {
    store.clearKey()
    return { ok: true }
  })

  ipcMain.handle('speech:transcribe', async (_event, params) => {
    try {
      return await transcribe({
        audio: params?.audio,
        mimeType: params?.mimeType,
        config: store.readConfig(),
        apiKey: store.readKeyForRequest(),
      })
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel transcrever o audio.')
    }
  })

  ipcMain.handle('speech:microphone-status', () => ({ ok: true, status: microphoneStatus(prefs), platform }))

  // No macOS o pedido de permissão só é feito pelo processo principal; no
  // Windows a configuração de privacidade é da pessoa, então só informamos.
  ipcMain.handle('speech:request-microphone', async () => {
    try {
      if (platform === 'darwin' && typeof prefs?.askForMediaAccess === 'function') {
        await prefs.askForMediaAccess('microphone')
      }
    } catch {
      // O estado abaixo diz o que de fato ficou.
    }
    return { ok: true, status: microphoneStatus(prefs), platform }
  })

  return { store }
}

module.exports = { microphoneStatus, registerSpeechIpcHandlers }

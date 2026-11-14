'use strict'

/**
 * @module codex-launch-gate
 * A vez de abrir um processo do Codex em cada perfil (`CODEX_HOME`).
 *
 * Medido em 14/11/2026 (Codex 0.171, credencial e endpoint de token falsos,
 * nenhuma conta): o Codex renova o token ao abrir quando a credencial está
 * velha, e não há trava entre processos. Dois processos do mesmo perfil
 * abertos juntos (dois terminais, ou o `app-server` e o `/status` do painel)
 * mandam o mesmo refresh token; o servidor gira o token e recusa o segundo
 * ("refresh token was already used"). Se a recusa chega antes de o primeiro
 * gravar o `auth.json`, o segundo fica sem login até reabrir, e a vigia leria
 * isso como login vencido. Com a vez, o primeiro abre na hora e o seguinte do
 * mesmo perfil espera `CODEX_LAUNCH_SPACING_MS`: tempo de o primeiro renovar
 * e gravar; o seguinte lê o token novo.
 *
 * Fora daqui, de propósito: `codex login status` (a checagem de login) não
 * renova o token; e o Claude Code já serializa o refresh entre processos.
 */

const path = require('node:path')

/** Espaço entre aberturas do Codex no mesmo perfil: a renovação medida leva menos de 1 s. */
const CODEX_LAUNCH_SPACING_MS = 2_500

/** Perfil de um ambiente: o `CODEX_HOME` da conta, ou o padrão do login do sistema. */
function codexProfileKey(env, platformName = process.platform) {
  const home = typeof env?.CODEX_HOME === 'string' ? env.CODEX_HOME.trim() : ''
  if (!home) return 'padrao'
  const resolved = path.resolve(home)
  return platformName === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * @param {{ spacingMs?: number, now?: () => number }} [options]
 * @returns {{ reserve: (profile: string) => number }} `reserve` marca a vez do perfil e diz quantos ms esperar (0 = já).
 */
function createCodexLaunchGate({ spacingMs = CODEX_LAUNCH_SPACING_MS, now = () => Date.now() } = {}) {
  const nextAt = new Map()
  return {
    reserve(profile) {
      const current = now()
      const start = Math.max(current, nextAt.get(profile) ?? 0)
      nextAt.set(profile, start + spacingMs)
      return start - current
    },
  }
}

/**
 * Abre na vez do perfil: com o perfil livre, ou sem fila (`null`), `open` roda
 * na hora, no mesmo tique (quem cancela logo depois encontra o processo aberto,
 * como antes); senão, depois da espera.
 */
function openOnCodexTurn(gate, env, open) {
  const waitMs = gate ? gate.reserve(codexProfileKey(env)) : 0
  if (waitMs <= 0) return open()
  return new Promise((resolve) => setTimeout(resolve, waitMs)).then(open)
}

/** A fila do processo principal, compartilhada por terminais e painel. */
const codexLaunchGate = createCodexLaunchGate()

module.exports = {
  CODEX_LAUNCH_SPACING_MS,
  codexLaunchGate,
  codexProfileKey,
  createCodexLaunchGate,
  openOnCodexTurn,
}

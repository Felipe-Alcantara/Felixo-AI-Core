'use strict'

const fs = require('node:fs')
const path = require('node:path')

function processIsAlive(pid) {
  // PID reutilizado por outro processo pode esconder uma sessão interrompida.
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

// Um arquivo por processo evita que outra instância ativa seja tomada por crash.
function startPerformanceRecovery({ userData, pid = process.pid, isAlive = processIsAlive }) {
  const directory = path.join(userData, 'performance-recovery')
  const ownFile = path.join(directory, `${pid}.json`)
  let pending = false
  let available = false
  try {
    fs.mkdirSync(directory, { recursive: true })
    const stale = fs.readdirSync(directory).filter((name) => {
      if (!/^\d+\.json$/.test(name)) return false
      const owner = Number(name.slice(0, -5))
      return Number.isSafeInteger(owner) && owner > 0 && (owner === pid || !isAlive(owner))
    })
    pending = stale.length > 0
    // Escreve primeiro: se o app cair ao remover os antigos, o sinal sobrevive.
    fs.writeFileSync(ownFile, JSON.stringify({ pending }), { mode: 0o600 })
    available = true
    for (const name of stale) {
      if (path.join(directory, name) !== ownFile) fs.rmSync(path.join(directory, name), { force: true })
    }
  } catch (error) {
    console.error('[felixo] não foi possível registrar a sessão para recuperação:', error.message)
  }
  const persist = () => {
    if (!available) return
    try { fs.writeFileSync(ownFile, JSON.stringify({ pending }), { mode: 0o600 }) } catch (error) {
      console.error('[felixo] não foi possível atualizar a recuperação:', error.message)
    }
  }
  return {
    needsRecovery: () => pending,
    acknowledge: () => { pending = false; persist() },
    rendererCrashed: () => { pending = true; persist() },
    close: () => {
      if (!available || pending) return
      try { fs.rmSync(ownFile, { force: true }) } catch (error) {
        console.error('[felixo] não foi possível encerrar o registro da sessão:', error.message)
      }
    },
  }
}

module.exports = { startPerformanceRecovery }

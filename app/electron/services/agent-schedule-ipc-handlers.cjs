'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')

function registerAgentScheduleIpcHandlers({ getService }) {
  const handle = (channel, fallback, run) =>
    ipcMain.handle(channel, (_event, arg) => {
      try {
        return { ok: true, ...run(getService(), arg) }
      } catch (error) {
        return toErrorResult(error, fallback)
      }
    })

  handle('agent-schedule:list', 'Nao foi possivel listar os agendamentos.', (s) => ({ schedules: s.list() }))
  handle('agent-schedule:save', 'Nao foi possivel salvar o agendamento.', (s, input) => ({ schedule: s.save(input) }))
  handle('agent-schedule:remove', 'Nao foi possivel remover o agendamento.', (s, nodeId) => ({ removed: s.remove(nodeId) }))
  handle('agent-schedule:pending', 'Nao foi possivel ler os avisos.', (s) => ({ notices: s.pending() }))
  handle('agent-schedule:confirm', 'Nao foi possivel confirmar o aviso.', (s, id) => ({ run: s.confirm(id) }))
  handle('agent-schedule:dismiss', 'Nao foi possivel dispensar o aviso.', (s, id) => ({ dismissed: s.dismiss(id) }))
}

module.exports = { registerAgentScheduleIpcHandlers }

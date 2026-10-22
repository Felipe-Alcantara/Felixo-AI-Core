/**
 * Windows kill path for node-pty sessions.
 *
 * On Windows, `WindowsPtyAgent.kill()` forks `conpty_console_list_agent.js` to
 * list the processes attached to the console and, in the same tick, closes the
 * pseudo console. The helper needs tens of milliseconds to boot; by then the
 * console and its shell are gone, so `AttachConsole(shellPid)` fails every
 * time: the helper dies printing "Error: AttachConsole failed", and `kill()`
 * only gets an answer from node-pty's own 5 s timer. That timer keeps the event
 * loop busy for 5 s after every kill and then calls `process.kill(shellPid)`
 * on a PID that may have been reused by then. node-pty 1.1.0 and the 1.2 betas
 * share the code, so upgrading does not fix it.
 *
 * Closing the pseudo console already ends every process attached to it, so the
 * list never added anything. This module answers the helper's question locally:
 * the shell PID while the session is alive, and nothing once it has exited.
 */

const WINDOWS = 'win32'

/**
 * Replace the console-list helper of one Windows session. The method is a
 * private node-pty detail, so a missing one is reported, not thrown: the
 * session then keeps node-pty's own (slow, noisy, but working) behaviour. A
 * test pins the shape in the installed node-pty so an upgrade cannot change it
 * silently.
 *
 * @param {object} session A node-pty `IPty`.
 * @param {{ platformName?: string }} [options]
 * @returns {boolean} Whether the session was changed.
 */
function answerConsoleListLocally(session, { platformName = process.platform } = {}) {
  if (platformName !== WINDOWS) {
    return false
  }

  const agent = session?._agent
  if (!agent || typeof agent._getConsoleProcessList !== 'function') {
    return false
  }

  let exited = false
  if (typeof session.onExit === 'function') {
    session.onExit(() => {
      exited = true
    })
  }

  agent._getConsoleProcessList = () => {
    const shellPid = agent.innerPid ?? session.pid
    const alive = !exited && Number.isInteger(shellPid) && shellPid > 0
    return Promise.resolve(alive ? [shellPid] : [])
  }
  return true
}

/**
 * node-pty's `spawn` with the Windows kill path fixed on every session it
 * returns. `nodePty.spawn` is read on each call, so a test that swaps it keeps
 * working.
 *
 * @param {{ spawn: Function }} nodePty The loaded `node-pty` module.
 * @param {{ platformName?: string }} [options]
 * @returns {(file: string, args: string[] | string, options: object) => object}
 */
function createNodePtySpawn(nodePty, { platformName = process.platform } = {}) {
  return (file, args, options) => {
    const session = nodePty.spawn(file, args, options)
    answerConsoleListLocally(session, { platformName })
    return session
  }
}

module.exports = { answerConsoleListLocally, createNodePtySpawn }

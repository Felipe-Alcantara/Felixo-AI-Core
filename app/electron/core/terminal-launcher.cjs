const fs = require('node:fs')
const spawnChildProcess = require('cross-spawn')
const platform = require('./platform/index.cjs')

function createTerminalLaunchPlan({
  command,
  args = [],
  cwd = process.env.HOME || process.cwd(),
  env = process.env,
  platform: platformName = process.platform,
  exists = fs.existsSync,
} = {}) {
  if (!command) {
    return {
      ok: false,
      message: 'Comando invalido para abrir login da CLI.',
    }
  }

  const adapter = resolveAdapter(platformName)
  return adapter.createTerminalLaunchPlan({ command, args, cwd, env, exists })
}

function launchCommandInTerminal(options = {}) {
  const plan = createTerminalLaunchPlan(options)

  if (!plan.ok) {
    return plan
  }

  const childProcess = spawnChildProcess(plan.command, plan.args, {
    cwd: options.cwd || process.env.HOME || process.cwd(),
    detached: true,
    env: options.env || process.env,
    stdio: 'ignore',
    windowsHide: false,
  })

  childProcess.unref()

  return {
    ok: true,
    command: plan.command,
    args: plan.args,
  }
}

function resolveAdapter(platformName) {
  if (!platformName || platformName === process.platform) {
    return platform
  }

  return platform.getAdapter(platformName)
}

module.exports = {
  createTerminalLaunchPlan,
  launchCommandInTerminal,
}

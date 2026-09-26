'use strict'

/**
 * @module gpu-launch
 * Liga a preferência de placa de vídeo ao processo principal, antes de
 * `app.whenReady()`: decide o início (`gpu-start-guard.cjs`), aplica o plano
 * na linha de comando e no ambiente (`gpu-preference.cjs`) e, quando o plano
 * pede, relança o app com o ambiente limpo (`app-relaunch.cjs`).
 *
 * Fica fora do `main.cjs` para a ordem ser testável sem Electron:
 * - o plano é aplicado ANTES do relançamento, porque o processo novo herda o
 *   `process.env` deste (sem as variáveis que forçam a dedicada e com a marca
 *   `FELIXO_GPU_ENV_SANITIZED`);
 * - fora do relançamento, a marca sai do `process.env`: ela é só do processo
 *   relançado, e os terminais e apps abertos a partir daqui não a herdam.
 */

const { GPU_ENV_SANITIZED_FLAG, applyGpuLaunchPlan, restoreGpuLaunchEnv } = require('./gpu-preference.cjs')
const { abandonGpuRelaunch, prepareGpuStart, recordGpuRelaunchChild } = require('./gpu-start-guard.cjs')
const { relaunchApp } = require('./app-relaunch.cjs')

/**
 * @param {object} options
 * @param {{ commandLine: { appendSwitch: Function, getSwitchValue: Function }, exit: (code: number) => void, isPackaged: boolean, relaunch: () => unknown }} options.app
 * @param {string} options.userDataPath - Vazio no release smoke: sem perfil,
 *   a preferência é Automático e nada é gravado.
 * @param {Record<string, string | undefined>} [options.environment] - O
 *   `process.env` do processo principal, alterado no lugar.
 * @param {boolean} [options.softwareRendering]
 * @param {boolean} [options.isDevelopment]
 * @param {string} [options.platformName]
 * @param {() => string} [options.now]
 * @param {typeof relaunchApp} [options.relaunch] - Injetável para teste.
 * @returns {{
 *   gpuStart: ReturnType<typeof prepareGpuStart>,
 *   gpuLaunch: ReturnType<typeof applyGpuLaunchPlan> & { restoredEnv?: string[] },
 *   exiting: boolean,
 * }} `exiting` é `true` quando o relançamento começou e `app.exit(0)` foi
 *   chamado (no Electron ele encerra na hora; nada depois roda).
 */
function startGpuPreference({
  app,
  userDataPath,
  environment = process.env,
  softwareRendering = false,
  isDevelopment = false,
  platformName = process.platform,
  now,
  relaunch = relaunchApp,
}) {
  const gpuStart = prepareGpuStart({
    userDataPath,
    platformName,
    environment,
    softwareRendering,
    isDevelopment,
    ...(now ? { now } : {}),
  })
  const gpuLaunch = applyGpuLaunchPlan(gpuStart.plan, { commandLine: app.commandLine, environment })

  if (!gpuStart.relaunch) {
    delete environment[GPU_ENV_SANITIZED_FLAG]
    return { gpuStart, gpuLaunch, exiting: false }
  }

  // Integrada com variáveis herdadas que mandam o GL para a NVIDIA (ex.: o
  // `prime-run`): elas já estão no zygote do Chromium, criado antes do
  // `main.cjs`, então só um processo novo, com o ambiente limpo, sobe na
  // integrada. O pedido gravado por `prepareGpuStart` cobre o relançado que
  // não nasce.
  const outcome = relaunch({ app, environment })
  if (outcome.ok) {
    // Com o pid, uma abertura enquanto o relançado ainda nasce não confunde o
    // relançamento em andamento com um que falhou.
    recordGpuRelaunchChild({ userDataPath, pid: outcome.pid })
    app.exit(0)
    return { gpuStart, gpuLaunch, exiting: true }
  }

  // Sem processo novo, fechar deixaria a pessoa sem app: segue aqui, no
  // Automático, com o aviso, e com o ambiente com que foi aberto (sem a marca,
  // que o plano pôs).
  const restoredEnv = restoreGpuLaunchEnv(gpuLaunch, environment)
  delete environment[GPU_ENV_SANITIZED_FLAG]
  return {
    gpuStart: abandonGpuRelaunch({
      userDataPath,
      start: gpuStart,
      detail: `${outcome.method}: ${outcome.detail}`,
      ...(now ? { now } : {}),
    }),
    gpuLaunch: { ...gpuLaunch, unsetEnv: [], restoredEnv },
    exiting: false,
  }
}

module.exports = { startGpuPreference }

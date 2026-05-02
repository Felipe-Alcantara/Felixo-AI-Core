#!/usr/bin/env node

const path = require('node:path')
const { spawn } = require('node:child_process')
const electronPath = require('electron')

const appDir = path.join(__dirname, '..')
const isDev = process.argv.includes('--dev')
const env = { ...process.env }

delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_NO_ATTACH_CONSOLE

if (isDev && !env.VITE_DEV_SERVER_URL) {
  env.VITE_DEV_SERVER_URL = 'http://127.0.0.1:5173'
}

const childProcess = spawn(electronPath, ['.'], {
  cwd: appDir,
  env,
  stdio: 'inherit',
  windowsHide: false,
})

childProcess.once('error', (error) => {
  console.error(`[felixo] Failed to start Electron: ${error.message}`)
  process.exit(1)
})

childProcess.once('close', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code)
    return
  }

  process.exit(signal ? 1 : 0)
})

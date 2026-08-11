import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildRunCommand } from './run-file-command'

type WindowWithFelixoPlatform = { window?: { felixo?: { platform: string } } }

describe('buildRunCommand', () => {
  const globalWithWindow = globalThis as WindowWithFelixoPlatform
  const originalWindow = globalWithWindow.window

  const setPlatform = (platform: string) => {
    globalWithWindow.window = { felixo: { platform } }
  }

  beforeEach(() => {
    setPlatform('linux')
  })

  afterEach(() => {
    globalWithWindow.window = originalWindow
  })

  it('runs a .py file with python3 on non-Windows platforms', () => {
    expect(buildRunCommand('script.py')).toEqual({
      command: 'python3',
      args: ['script.py'],
    })
  })

  it('keeps .PY runnable on macOS', () => {
    setPlatform('darwin')
    expect(buildRunCommand('Script.PY')).toEqual({
      command: 'python3',
      args: ['Script.PY'],
    })
  })

  it('runs a .py file with the `py` launcher on Windows, falling back to `python`', () => {
    setPlatform('win32')
    expect(buildRunCommand('script.py')).toEqual({
      command: 'py',
      args: ['script.py'],
      fallbackCommand: 'python',
    })
  })

  it('offers no interpreter fallback for .py outside Windows', () => {
    expect(buildRunCommand('script.py').fallbackCommand).toBeUndefined()
  })

  it('runs a .js/.mjs/.cjs file with node', () => {
    expect(buildRunCommand('index.js')).toEqual({ command: 'node', args: ['index.js'] })
    expect(buildRunCommand('index.mjs')).toEqual({ command: 'node', args: ['index.mjs'] })
    expect(buildRunCommand('index.cjs')).toEqual({ command: 'node', args: ['index.cjs'] })
  })

  it('runs a .ts file via npx tsx', () => {
    expect(buildRunCommand('index.ts')).toEqual({ command: 'npx', args: ['tsx', 'index.ts'] })
  })

  it('runs a .sh file with bash', () => {
    expect(buildRunCommand('deploy.sh')).toEqual({ command: 'bash', args: ['deploy.sh'] })
  })

  it('runs a .ps1 file with powershell', () => {
    expect(buildRunCommand('setup.ps1')).toEqual({ command: 'powershell', args: ['setup.ps1'] })
  })

  it('is case-insensitive on the extension', () => {
    expect(buildRunCommand('Script.PY')).toEqual({ command: 'python3', args: ['Script.PY'] })
  })

  it('falls back to the bare path for an unrecognized extension', () => {
    expect(buildRunCommand('run.exe')).toEqual({ command: 'run.exe', args: [] })
  })

  it('falls back to the bare path for a file with no extension', () => {
    expect(buildRunCommand('Makefile')).toEqual({ command: 'Makefile', args: [] })
  })
})

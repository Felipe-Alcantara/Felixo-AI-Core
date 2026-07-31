import { describe, expect, it } from 'vitest'
import { buildRunCommand } from './run-file-command'

describe('buildRunCommand', () => {
  it('runs a .py file with python', () => {
    expect(buildRunCommand('script.py')).toEqual({ command: 'python', args: ['script.py'] })
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
    expect(buildRunCommand('Script.PY')).toEqual({ command: 'python', args: ['Script.PY'] })
  })

  it('falls back to the bare path for an unrecognized extension', () => {
    expect(buildRunCommand('run.exe')).toEqual({ command: 'run.exe', args: [] })
  })

  it('falls back to the bare path for a file with no extension', () => {
    expect(buildRunCommand('Makefile')).toEqual({ command: 'Makefile', args: [] })
  })
})

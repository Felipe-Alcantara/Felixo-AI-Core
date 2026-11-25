'use strict'

// Comportamento dos gerenciadores falsos; ver `fake-external-clis.cjs`.
const fs = require('node:fs')

const tool = process.env.FAKE_TOOL
const args = process.argv.slice(2)
const state = JSON.parse(fs.readFileSync(process.env.FAKE_STATE, 'utf8'))
const save = (patch) => fs.writeFileSync(process.env.FAKE_STATE, JSON.stringify({ ...state, ...patch }))
fs.appendFileSync(process.env.FAKE_LOG, `${tool} ${args.join(' ')}\n`)

const [first, second, third] = args
if (tool === 'claude') {
  if (first === '--version') console.log(`${state.version} (Claude Code)`)
  else if (first === 'update') save({ version: state.channelVersion })
  else if (first === 'install' && state.installable.includes(second)) save({ version: second })
  else if (first === 'install') {
    console.error(`Version ${second} not found`)
    process.exit(1)
  }
} else if (tool === 'brew' && first === 'upgrade') {
  save({ version: state.channelVersion })
} else if ((tool === 'pnpm' && first === 'add') || (tool === 'volta' && first === 'install')) {
  const spec = tool === 'pnpm' ? third : second
  save({ version: spec.slice(spec.lastIndexOf('@') + 1) })
}

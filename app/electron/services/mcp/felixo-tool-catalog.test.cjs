const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getFelixoMcpTool,
  listFelixoMcpToolNames,
  listFelixoMcpTools,
} = require('./felixo-tool-catalog.cjs')

test('felixo MCP tool catalog keeps tools namespaced and scoped', () => {
  const tools = listFelixoMcpTools()

  assert.ok(tools.length >= 8)
  assert.ok(tools.every((tool) => /^[a-z]+[.][a-z_]+$/.test(tool.name)))
  assert.ok(tools.some((tool) => tool.name === 'project.read_file'))
  assert.ok(tools.some((tool) => tool.name === 'git.diff'))
  assert.ok(tools.some((tool) => tool.name === 'memory.search'))
})

test('felixo MCP tool catalog marks write operations for confirmation', () => {
  const writeTools = listFelixoMcpTools().filter((tool) => tool.access === 'write')

  assert.ok(writeTools.length > 0)
  assert.ok(writeTools.every((tool) => tool.requiresConfirmation === true))
})

test('felixo MCP tool catalog does not expose arbitrary terminal execution', () => {
  assert.equal(getFelixoMcpTool('terminal.run'), null)
  assert.ok(listFelixoMcpToolNames().includes('terminal.run_allowlisted'))
})

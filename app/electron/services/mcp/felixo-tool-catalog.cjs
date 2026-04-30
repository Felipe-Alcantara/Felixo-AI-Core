const FELIXO_MCP_TOOLS = Object.freeze([
  {
    name: 'project.read_file',
    layer: 'project-context',
    access: 'read',
    status: 'planned',
    description: 'Read a file inside an active workspace after path validation.',
  },
  {
    name: 'project.search',
    layer: 'project-context',
    access: 'read',
    status: 'planned',
    description: 'Search text inside active workspaces with scoped paths.',
  },
  {
    name: 'project.write_file',
    layer: 'project-context',
    access: 'write',
    status: 'planned',
    requiresConfirmation: true,
    description: 'Write a file inside an active workspace after confirmation.',
  },
  {
    name: 'git.status',
    layer: 'git',
    access: 'read',
    status: 'planned',
    description: 'Return git status for an active project.',
  },
  {
    name: 'git.diff',
    layer: 'git',
    access: 'read',
    status: 'planned',
    description: 'Return git diff for an active project.',
  },
  {
    name: 'git.commit_message',
    layer: 'git',
    access: 'read',
    status: 'planned',
    description: 'Generate a commit message from the current diff.',
  },
  {
    name: 'memory.save',
    layer: 'memory',
    access: 'write',
    status: 'planned',
    requiresConfirmation: true,
    description: 'Save a scoped memory entry for the current project or workspace.',
  },
  {
    name: 'memory.search',
    layer: 'memory',
    access: 'read',
    status: 'planned',
    description: 'Search scoped memory entries relevant to the current task.',
  },
  {
    name: 'summary.create',
    layer: 'summary',
    access: 'read',
    status: 'planned',
    description: 'Create a reusable summary from selected conversation or project context.',
  },
  {
    name: 'terminal.run_allowlisted',
    layer: 'terminal',
    access: 'write',
    status: 'planned',
    requiresConfirmation: true,
    description: 'Run only allowlisted local commands with audit logging.',
  },
])

function listFelixoMcpTools() {
  return FELIXO_MCP_TOOLS.map(cloneTool)
}

function getFelixoMcpTool(name) {
  const tool = FELIXO_MCP_TOOLS.find((item) => item.name === name)

  return tool ? cloneTool(tool) : null
}

function listFelixoMcpToolNames() {
  return FELIXO_MCP_TOOLS.map((tool) => tool.name)
}

function cloneTool(tool) {
  return { ...tool }
}

module.exports = {
  getFelixoMcpTool,
  listFelixoMcpToolNames,
  listFelixoMcpTools,
}

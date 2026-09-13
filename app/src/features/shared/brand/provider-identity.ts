/** Identity comes from the launch command, never the user-editable node name. */
export function providerIdentity(command?: string) {
  const binary = command?.trim().replace(/^"|"$/g, '').split(/[\\/]/).at(-1)
    ?.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase()
  switch (binary) {
    case 'claude': return { id: 'claude', label: 'Claude', asset: 'claude-color' }
    case 'codex': return { id: 'codex', label: 'Codex', asset: 'openai-color' }
    case 'gemini': return { id: 'gemini', label: 'Gemini', asset: 'gemini-color' }
    case 'openia': return { id: 'openia', label: 'Openia', asset: 'openrouter-color' }
    default: return { id: 'terminal', label: 'Terminal', asset: null }
  }
}

/** Launch configuration, not a claim about the live model after CLI commands. */
export function configuredAgentModel(command?: string, args: readonly string[] = []) {
  if (!['claude', 'codex', 'gemini'].includes(providerIdentity(command).id)) return null
  let model: string | null = null
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') break
    if (arg.startsWith('--model=')) model = arg.slice(8).trim() || null
    else if (arg === '--model' || arg === '-m') {
      const value = args[index + 1]
      if (value && !value.startsWith('-')) { model = value.trim() || null; index++ }
    }
  }
  return model
}

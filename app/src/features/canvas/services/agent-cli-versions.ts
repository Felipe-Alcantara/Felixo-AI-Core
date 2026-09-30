import { isCliVersion } from './agent-resume-capability'

/** Versão instalada por CLI de agente (`claude`, `codex`, `gemini`); `null` = não se sabe. */
export type AgentCliVersions = Readonly<Record<string, string | null>>

/**
 * Pede ao processo principal a versão instalada de cada CLI de agente, para o
 * plano de retomada (`explainAgentResume`) decidir pelo que está instalado
 * agora. Nunca falha: sem ponte (navegador, teste), com erro ou com uma
 * versão fora do formato, a CLI fica como "não se sabe" — e aí só o Gemini
 * deixa de retomar pelo ID (ver `agent-resume-capability.ts`).
 */
export async function loadAgentCliVersions(): Promise<AgentCliVersions> {
  const read = window.felixo?.pty?.cliVersions
  if (!read) return {}
  try {
    const result = await read()
    if (!result?.ok || !result.versions || typeof result.versions !== 'object') return {}
    const versions: Record<string, string | null> = {}
    for (const [provider, version] of Object.entries(result.versions)) {
      versions[provider] = isCliVersion(version) ? version : null
    }
    return versions
  } catch {
    return {}
  }
}

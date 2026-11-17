export function checkChatThreadResume(
  threadSession: {
    providerSessionId: string | null
    hasStarted: boolean
    origin?: { cwd: string; accountId: string | null }
  },
  current: { cwd?: string | null; accountId?: string | null },
): { reasons: Array<'cwd-mismatch' | 'account-mismatch'>; previousCwd: string } | null

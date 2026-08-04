import type { SessionSnapshot } from './terminal-session-store'

/** True when a terminal needs the user's attention in the notifications panel. */
export function isActionRequired(snapshot: SessionSnapshot | undefined): boolean {
  return snapshot?.activity === 'exited' || snapshot?.activity === 'waiting_approval'
}

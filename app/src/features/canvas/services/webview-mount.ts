/**
 * Mount/unmount rules for the canvas <webview> guests.
 *
 * Extracted from the component so the invariant that actually broke — exactly
 * one live guest per node — is testable without a DOM: a second guest keeps
 * loading and playing audio behind the first, which is what surfaced as pages
 * "opening twice" with doubled sound.
 */

/** The slice of a <webview>/element the mount rules need. */
export type MountableGuest = {
  isConnected: boolean
  remove: () => void
}

/** The slice of the host container the mount rules need. */
export type GuestContainer<TGuest extends MountableGuest> = {
  /** Every guest currently under this container, live or stale. */
  existingGuests: () => TGuest[]
}

/**
 * Decides what a ref-callback detach must do. Dropping the reference alone
 * leaves the guest attached and running, so the next mount adds a second one.
 */
export function shouldRemoveOnDetach(current: MountableGuest | null): boolean {
  return current !== null
}

/**
 * Whether a mount call should create a new guest, given the one this node
 * already owns. A still-connected guest is reused; anything else (never
 * mounted, or detached by a previous cleanup) needs a fresh one.
 */
export function shouldCreateGuest(current: MountableGuest | null): boolean {
  return !current?.isConnected
}

/**
 * Guests left behind by a mount whose cleanup never ran. Removing these before
 * creating a new one is what keeps a remount from stacking a second page over
 * the first.
 */
export function staleGuests<TGuest extends MountableGuest>(
  container: GuestContainer<TGuest>,
  current: MountableGuest | null,
): TGuest[] {
  return container.existingGuests().filter((guest) => guest !== current)
}

/**
 * The URL a (re)created guest must load: wherever the page actually is, so a
 * remount never rewinds the user to the URL the block was opened with.
 */
export function resolveGuestSrc(currentUrl: string, initialUrl: string): string {
  return currentUrl || initialUrl
}

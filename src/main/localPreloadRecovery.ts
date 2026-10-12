const locallyOwnedFailures = new WeakSet<Event>();
const activeOwners = new WeakMap<EventTarget, Set<{ ownsFailure: (payload: unknown) => boolean }>>();

export function isLocallyOwnedPreloadFailure(event: Event, target: EventTarget): boolean {
  if (locallyOwnedFailures.has(event)) return true;
  const owners = activeOwners.get(target);
  if (!owners?.size) return false;
  for (const owner of owners) {
    try {
      const payload: unknown = 'payload' in event ? event.payload : undefined;
      if (owner.ownsFailure(payload)) {
        locallyOwnedFailures.add(event);
        return true;
      }
    } catch { /* Unknown event shapes retain the global recovery policy. */ }
  }
  return false;
}

/** Only a bounded, same-origin Vite asset failure belonging to this optional feature is claimed. */
export function isCommandPalettePreloadFailure(payload: unknown, origin: string): boolean {
  if (!(payload instanceof Error)) return false;
  let message: unknown;
  try { message = payload.message; } catch { return false; }
  if (typeof message !== 'string' || message.length > 4096) return false;
  const match = /^(?:Failed to fetch dynamically imported module: |error loading dynamically imported module: |Unable to preload CSS for )(.+)$/u.exec(message);
  if (!match || match[1].length > 2048) return false;
  try {
    const resource = new URL(match[1], origin);
    return resource.origin === new URL(origin).origin && !resource.username && !resource.password
      && !resource.search && !resource.hash
      && /^\/assets\/(?:CommandPalette|editor-ui|commandPaletteStorage)-[A-Za-z0-9_-]+\.(?:js|css)$/u.test(resource.pathname);
  } catch { return false; }
}

export async function loadWithLocalPreloadRecovery<T>(
  load: () => Promise<T>,
  ownsFailure: (payload: unknown) => boolean,
  target: EventTarget = window,
): Promise<T> {
  const owner = { ownsFailure };
  const owners = activeOwners.get(target) ?? new Set();
  owners.add(owner);
  activeOwners.set(target, owners);
  // The global handler consults ownership synchronously. Window listeners at
  // their own target cannot safely rely on capture/bubble registration order.
  try { return await load(); }
  finally {
    owners.delete(owner);
    if (!owners.size) activeOwners.delete(target);
  }
}

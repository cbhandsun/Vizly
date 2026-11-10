const record = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === 'object' && !Array.isArray(value);

export type HandleRole = 'source' | 'target';

export const readPersistedAutomaticHandleRoles = (saved: unknown): HandleRole[] => {
  if (!record(saved) || !record(saved.metadata)) return [];
  const metadata = saved.metadata;
  if (metadata.manualHandles === true) return [];
  const manual = Array.isArray(metadata.manualHandleSides) ? metadata.manualHandleSides : [];
  const automatic = Array.isArray(metadata.autoHandles) ? metadata.autoHandles : [];
  return (['source', 'target'] as const).filter(role => !manual.includes(role)
    && (automatic.includes(role)
      || (metadata.manualHandles === false && saved[`${role}Handle`] === undefined)));
};

/** Persisted automatic port hints are not authored CRDT handle edits. */
export const restorePersistedEdgeHandlePolicy = (
  element: Record<string, unknown>, saved: unknown,
): Record<string, unknown> => {
  const roles = readPersistedAutomaticHandleRoles(saved);
  if (roles.length === 0) return element;
  const restored = { ...element };
  for (const role of roles) delete restored[`${role}Handle`];
  if (record(element.data) && Array.isArray(element.data.manualHandleSides)) {
    const data = { ...element.data };
    const sides = element.data.manualHandleSides.filter(role => !roles.includes(role));
    if (sides.length > 0) data.manualHandleSides = sides;
    else delete data.manualHandleSides;
    restored.data = data;
  }
  return restored;
};

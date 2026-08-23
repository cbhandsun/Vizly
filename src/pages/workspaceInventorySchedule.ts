export const WORKSPACE_INVENTORY_DEFER_MS = 600;

/** Let workspace chrome become interactive before loading the full local inventory. */
export const scheduleWorkspaceInventoryLoad = (run: () => void): (() => void) => {
  const timer = globalThis.setTimeout(run, WORKSPACE_INVENTORY_DEFER_MS);
  return () => globalThis.clearTimeout(timer);
};

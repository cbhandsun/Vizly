export type DisplayRoutingCapabilityName =
  | 'routingSessionSnapshot'
  | 'incrementalDisplayRouting'
  | 'topologyFirstSeed'
  | 'routingOnlyDocumentSnapshot';

export type DisplayRoutingCapabilities = Readonly<Record<DisplayRoutingCapabilityName, boolean>>;

export const DEFAULT_DISPLAY_ROUTING_CAPABILITIES: DisplayRoutingCapabilities = Object.freeze({
  routingSessionSnapshot: true,
  incrementalDisplayRouting: true,
  topologyFirstSeed: true,
  routingOnlyDocumentSnapshot: true,
});

const readCapabilityBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value !== 'string' || value.length > 32) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'enabled') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'disabled') return false;
  return null;
};

const readCapabilityRecord = (value: unknown): Readonly<Record<string, unknown>> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {}
);

/**
 * Parses the bounded build/runtime rollout boundary. Invalid values retain the
 * production default instead of silently disabling routing. Dependent features
 * fail closed when their Routing Session authority is disabled.
 */
export const resolveDisplayRoutingCapabilities = (
  value: unknown,
): DisplayRoutingCapabilities => {
  const record = readCapabilityRecord(value);
  const read = (name: DisplayRoutingCapabilityName): boolean => (
    readCapabilityBoolean(record[name]) ?? DEFAULT_DISPLAY_ROUTING_CAPABILITIES[name]
  );
  const routingSessionSnapshot = read('routingSessionSnapshot');
  return Object.freeze({
    routingSessionSnapshot,
    incrementalDisplayRouting: routingSessionSnapshot && read('incrementalDisplayRouting'),
    topologyFirstSeed: read('topologyFirstSeed'),
    routingOnlyDocumentSnapshot: routingSessionSnapshot && read('routingOnlyDocumentSnapshot'),
  });
};

const environment = import.meta.env as Readonly<Record<string, unknown>>;

/**
 * Build-scoped rollout switches. Commercial quality gates are intentionally
 * absent: no capability can bypass final hard-quality validation.
 */
export const DISPLAY_ROUTING_CAPABILITIES = resolveDisplayRoutingCapabilities({
  routingSessionSnapshot: environment.VITE_VIZLY_ROUTING_SESSION_SNAPSHOT,
  incrementalDisplayRouting: environment.VITE_VIZLY_INCREMENTAL_DISPLAY_ROUTING,
  topologyFirstSeed: environment.VITE_VIZLY_TOPOLOGY_FIRST_SEED,
  routingOnlyDocumentSnapshot: environment.VITE_VIZLY_ROUTING_ONLY_DOCUMENT_SNAPSHOT,
});

export const isDisplayRoutingCapabilityEnabled = (
  name: DisplayRoutingCapabilityName,
): boolean => DISPLAY_ROUTING_CAPABILITIES[name];

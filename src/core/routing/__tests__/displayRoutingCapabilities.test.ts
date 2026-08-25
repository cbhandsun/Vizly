import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DISPLAY_ROUTING_CAPABILITIES,
  resolveDisplayRoutingCapabilities,
} from '../displayRoutingCapabilities';

describe('display routing capabilities', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps every staged capability enabled by default', () => {
    expect(resolveDisplayRoutingCapabilities(undefined)).toEqual(
      DEFAULT_DISPLAY_ROUTING_CAPABILITIES,
    );
    expect(Object.keys(DEFAULT_DISPLAY_ROUTING_CAPABILITIES).sort()).toEqual([
      'incrementalDisplayRouting',
      'routingOnlyDocumentSnapshot',
      'routingSessionSnapshot',
      'topologyFirstSeed',
    ]);
  });

  it('coerces only bounded explicit rollout values', () => {
    expect(resolveDisplayRoutingCapabilities({
      routingSessionSnapshot: 'enabled',
      incrementalDisplayRouting: '0',
      topologyFirstSeed: false,
      routingOnlyDocumentSnapshot: 1,
    })).toEqual({
      routingSessionSnapshot: true,
      incrementalDisplayRouting: false,
      topologyFirstSeed: false,
      routingOnlyDocumentSnapshot: true,
    });
  });

  it.each([
    null,
    [],
    'disabled',
    { topologyFirstSeed: 'maybe' },
    { incrementalDisplayRouting: Number.NaN },
    { routingOnlyDocumentSnapshot: 'x'.repeat(10_000) },
  ])('ignores malformed or extreme input without weakening production defaults', (value) => {
    expect(resolveDisplayRoutingCapabilities(value)).toEqual(
      DEFAULT_DISPLAY_ROUTING_CAPABILITIES,
    );
  });

  it('fails dependent features closed when Routing Session authority is disabled', () => {
    expect(resolveDisplayRoutingCapabilities({
      routingSessionSnapshot: false,
      incrementalDisplayRouting: true,
      routingOnlyDocumentSnapshot: true,
    })).toEqual({
      routingSessionSnapshot: false,
      incrementalDisplayRouting: false,
      topologyFirstSeed: true,
      routingOnlyDocumentSnapshot: false,
    });
  });

  it('reads the four build-scoped rollout switches without exposing a quality bypass', async () => {
    vi.stubEnv('VITE_VIZLY_ROUTING_SESSION_SNAPSHOT', 'false');
    vi.stubEnv('VITE_VIZLY_INCREMENTAL_DISPLAY_ROUTING', 'true');
    vi.stubEnv('VITE_VIZLY_TOPOLOGY_FIRST_SEED', 'disabled');
    vi.stubEnv('VITE_VIZLY_ROUTING_ONLY_DOCUMENT_SNAPSHOT', 'true');
    vi.resetModules();

    const { DISPLAY_ROUTING_CAPABILITIES } = await import('../displayRoutingCapabilities');
    expect(DISPLAY_ROUTING_CAPABILITIES).toEqual({
      routingSessionSnapshot: false,
      incrementalDisplayRouting: false,
      topologyFirstSeed: false,
      routingOnlyDocumentSnapshot: false,
    });
    expect(DISPLAY_ROUTING_CAPABILITIES).not.toHaveProperty('qualityGate');
  });
});

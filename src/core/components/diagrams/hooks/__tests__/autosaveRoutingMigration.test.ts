import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { invalidateStalePresetEdgeAutomaticRoute } from '../autosaveRoutingMigration';

describe('invalidateStalePresetEdgeAutomaticRoute', () => {
  const staleEdge = (): Edge => ({
    id: 'edge-loms-visibility',
    source: 'l-oms',
    target: 'visibility',
    type: 'stablePath',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: {
      label: '状态数据',
      waypoints: [{ x: 20, y: 30 }],
      computedPath: [
        { x: 191, y: 742 },
        { x: 0, y: 742 },
        { x: 0, y: 1050 },
        { x: -24, y: 1050 },
        { x: -24, y: 1248 },
        { x: 0, y: 1248 },
      ],
      elkPath: [{ x: 0, y: 0 }],
      treeRouting: { points: [] },
      algorithm: 'legacy-clearance-repair',
      layoutPathLocked: true,
      _layoutPathLocked: true,
      _layoutEpoch: 42,
      runtimeHandleLock: { source: true, target: true },
      _runtimeHandleLock: { source: true },
      auto: [],
      autoSource: false,
      autoTarget: false,
      sharedTrunkAware: true,
      sharedTrunkSynthesized: true,
      isTreeBus: true,
      overextendedTargetTrunkCorridorReclaimed: true,
    },
  });

  it('drops stale automatic geometry while preserving authored edge intent', () => {
    const migrated = invalidateStalePresetEdgeAutomaticRoute(
      staleEdge(),
      { id: 'edge-loms-visibility', type: 'main' },
      'older-routing-version',
    );

    expect(migrated.type).toBe('advanced-smart-step');
    expect(migrated.sourceHandle).toBeUndefined();
    expect(migrated.targetHandle).toBeUndefined();
    expect(migrated.data).toEqual({
      label: '状态数据',
      waypoints: [{ x: 20, y: 30 }],
    });
  });

  it('treats legacy payloads without a version as stale', () => {
    const migrated = invalidateStalePresetEdgeAutomaticRoute(
      staleEdge(),
      { id: 'edge-loms-visibility', type: 'data' },
      undefined,
    );

    expect(migrated.type).toBe('advanced-smart-step');
    expect(migrated.data?.computedPath).toBeUndefined();
  });

  it('removes current-version automatic geometry from the durable edge object too', () => {
    const edge = staleEdge();
    const migrated = invalidateStalePresetEdgeAutomaticRoute(
      edge,
      { id: edge.id, type: 'main' },
      'current-routing-version',
    );
    expect(migrated).not.toBe(edge);
    expect(migrated.type).toBe('advanced-smart-step');
    expect(migrated.data?.computedPath).toBeUndefined();
  });

  it('preserves explicitly authored terminal roles during migration', () => {
    const edge = staleEdge();
    edge.data = {
      ...edge.data,
      manualHandleSides: ['source'],
      manualHandles: { target: true },
    };

    const migrated = invalidateStalePresetEdgeAutomaticRoute(
      edge,
      { id: edge.id, type: 'main' },
      'older-routing-version',
    );

    expect(migrated.sourceHandle).toBe('bottom');
    expect(migrated.targetHandle).toBe('top');
    expect(migrated.data).toMatchObject({
      manualHandleSides: ['source'],
      manualHandles: { target: true },
    });
  });
});

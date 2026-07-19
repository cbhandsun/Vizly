import { afterEach, describe, expect, it } from 'vitest';

import type { PathfindingContext } from '../../../types/routing';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';
import {
  parseWorkerHandleDirection,
  resolveWorkerEndpoints,
} from '../edgeRoutingWorkerEndpointResolution';
import {
  getWorkerRoutingModules,
  resetWorkerRoutingModuleCacheForTests,
} from '../edgeRoutingWorkerModules';
import { resolveWorkerRoutingContext } from '../edgeRoutingWorkerContext';

const createContext = (sourceHandle: unknown, targetHandle: unknown): PathfindingContext => ({
  job: {
    jobId: 'job',
    edgeId: 'edge',
    source: 'source',
    target: 'target',
    sourceX: 0,
    sourceY: 0,
    targetX: 300,
    targetY: 0,
    sourceHandle: sourceHandle as string,
    targetHandle: targetHandle as string,
  },
  graph: {
    nodes: [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 } },
      { id: 'target', position: { x: 300, y: 0 }, measured: { width: 100, height: 60 } },
    ],
    edges: [],
    obstacles: [],
    config: {},
  },
  config: createDefaultRoutingConfig(),
});

describe('edgeRoutingWorkerEndpointResolution', () => {
  afterEach(resetWorkerRoutingModuleCacheForTests);

  it('parses bounded compound handles and rejects invalid boundary values', () => {
    expect(parseWorkerHandleDirection('source-right-handle')).toBe(Position.Right);
    expect(parseWorkerHandleDirection('x'.repeat(1_025))).toBeUndefined();
    expect(parseWorkerHandleDirection(42)).toBeUndefined();
    expect(parseWorkerHandleDirection(null)).toBeUndefined();
  });

  it('resolves valid explicit handles into finite endpoint anchors', () => {
    const context = createContext('r', 'l');
    const modules = getWorkerRoutingModules(context.config);
    const resolved = resolveWorkerRoutingContext(
      context.job,
      context.graph,
      modules.analyzer,
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const endpoints = resolveWorkerEndpoints({
      context,
      resolved: resolved.value,
      busDetector: modules.busDetector,
      portSelector: modules.portSelector,
    });
    expect(endpoints).toMatchObject({
      startPosition: Position.Right,
      endPosition: Position.Left,
      hasExplicitSource: true,
      hasExplicitTarget: true,
    });
    expect(Object.values(endpoints.startPoint).every(Number.isFinite)).toBe(true);
    expect(Object.values(endpoints.endPoint).every(Number.isFinite)).toBe(true);
  });

  it('does not lock port selection for malformed handle identifiers', () => {
    const context = createContext('unknown', 'x'.repeat(1_025));
    const modules = getWorkerRoutingModules(context.config);
    const resolved = resolveWorkerRoutingContext(context.job, context.graph, modules.analyzer);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const endpoints = resolveWorkerEndpoints({
      context,
      resolved: resolved.value,
      busDetector: modules.busDetector,
      portSelector: modules.portSelector,
    });
    expect(endpoints.hasExplicitSource).toBe(false);
    expect(endpoints.hasExplicitTarget).toBe(false);
  });
});

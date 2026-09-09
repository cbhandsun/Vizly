import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readRenderedDisplayEdgeNodeIntersections,
  summarizeDisplayRoutingGeometryFailure,
} from './display-routing-browser-geometry.mjs';

const rect = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
});

const style = () => ({
  display: 'block',
  visibility: 'visible',
  opacity: '1',
});

beforeEach(() => {
  vi.stubGlobal('getComputedStyle', style);
  vi.stubGlobal('window', { reactFlowInstance: { getNodes: () => (
    [...document.querySelectorAll('.react-flow__node[data-id]')]
      .map(element => ({ id: element.getAttribute('data-id'), type: 'custom' }))
  ) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('display routing browser clearance diagnostics', () => {
  it('summarizes bounded clearance evidence for failed final SVG geometry', () => {
    const route = {
      response: {
        edges: [
          {
            id: 'edge-a',
            source: 'source-a',
            target: 'target-a',
            sourceHandle: 'right',
            targetHandle: 'left',
          },
        ],
        routeResolution: 'repaired-candidate',
        phaseTrace: [
          { phase: 'final-commercial-clearance', resolution: 'skip' },
          { phase: 'other-phase', resolution: 'accepted' },
        ],
      },
    };
    const audit = {
      auditedPathCount: 1,
      invalidEdgeIds: [],
      intersections: [],
      clearanceRisks: Array.from({ length: 14 }, (_, index) => ({
        edgeId: 'edge-a',
        nodeId: `node-${index}`,
        clearance: 15.04 + index,
        requiredClearance: 16,
      })),
    };
    const commercialAudit = {
      ...audit,
      clearanceRisks: [
        { edgeId: 'edge-a', nodeId: 'business-node', clearance: 47.96, requiredClearance: 48 },
      ],
    };
    const hardAudit = {
      auditedPathCount: 1,
      invalidEdgeIds: [],
      nonOrthogonalEdgeIds: [],
      detachedTerminalEdgeIds: [],
      detachedTerminalFindings: [],
      shortEndpointStubEdgeIds: [],
      tinyInteriorDoglegEdgeIds: [],
      excessiveBendEdgeIds: [],
      excessiveBendFindings: [],
      hairpinEdgeIds: [],
      strictCrossings: [],
      illegalOverlaps: [],
    };

    const summary = summarizeDisplayRoutingGeometryFailure({
      route,
      audit,
      commercialAudit,
      hardAudit,
      visualAudit: { computedRenderPathCount: 1 },
      renderAuthorityStatus: 'accepted',
    });

    expect(summary).toMatchObject({
      expectedPathCount: 1,
      minimumClearanceRiskCount: 14,
      commercialClearanceRiskCount: 1,
      commercialClearanceRiskSamples: [
        {
          edgeId: 'edge-a',
          edgeIndex: 0,
          nodeId: 'business-node',
          clearance: 48,
          requiredClearance: 48,
        },
      ],
      computedRenderPathCount: 1,
      renderAuthorityStatus: 'accepted',
      routeResolution: 'repaired-candidate',
      commercialPhaseTrace: [
        { phase: 'final-commercial-clearance', resolution: 'skip' },
      ],
    });
    expect(summary.minimumClearanceRiskSamples).toHaveLength(12);
    expect(summary.minimumClearanceRiskSamples[0]).toEqual({
      edgeId: 'edge-a',
      edgeIndex: 0,
      source: 'source-a',
      target: 'target-a',
      sourceHandle: 'right',
      targetHandle: 'left',
      nodeId: 'node-0',
      clearance: 15,
      requiredClearance: 16,
      screenClearance: undefined,
      requiredScreenClearance: undefined,
    });
  });

  it('keeps zoomed-out screen proximity out of graph clearance failures', () => {
    const nodes = [
      { id: 'source', bounds: rect(-20, 0, 10, 10) },
      { id: 'obstacle', bounds: rect(2, 5.5, 20, 20) },
      { id: 'target', bounds: rect(20, 0, 10, 10) },
    ].map(({ id, bounds }) => ({
      getAttribute: name => name === 'data-id' ? id : null,
      getBoundingClientRect: () => bounds,
    }));
    const path = {
      getTotalLength: () => 100,
      getPointAtLength: distance => ({ x: distance, y: 50 }),
      getScreenCTM: () => ({ a: 0.05, b: 0, c: 0, d: 0.05, e: 0, f: 0 }),
    };
    const wrapper = {
      getAttribute: name => name === 'data-testid' ? 'rf__edge-edge-1' : null,
      querySelector: () => path,
    };
    vi.stubGlobal('document', {
      querySelectorAll: selector => selector.startsWith('.react-flow__node')
        ? nodes
        : [wrapper],
    });

    expect(readRenderedDisplayEdgeNodeIntersections([
      { id: 'edge-1', source: 'source', target: 'target' },
    ], 48)).toMatchObject({
      intersections: [],
      clearanceRisks: [],
      visualClearanceRisks: [{
        edgeId: 'edge-1',
        nodeId: 'obstacle',
        clearance: 60,
        requiredClearance: 48,
        screenClearance: 3,
        requiredScreenClearance: 4,
      }],
    });
  });
});

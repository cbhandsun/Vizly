import { describe, expect, it } from 'vitest';

import {
  displayRoutingFinalSvgGeometryIsClean,
  partitionDisplayRoutingCommercialClearanceRisks,
  summarizeDisplayRoutingGeometryFailure,
} from './display-routing-browser-geometry.mjs';

const cleanAudit = Object.freeze({
  nodeScanComplete: true,
  auditedPathCount: 1,
  invalidEdgeIds: [],
  intersections: [],
  clearanceRisks: [],
  visualClearanceRisks: [],
});

const cleanHardAudit = Object.freeze({
  auditedPathCount: 1,
  invalidEdgeIds: [],
  nonOrthogonalEdgeIds: [],
  detachedTerminalEdgeIds: [],
  shortEndpointStubEdgeIds: [],
  tinyInteriorDoglegEdgeIds: [],
  hairpinEdgeIds: [],
  strictCrossings: [],
  illegalOverlaps: [],
});

const geometryIsClean = ({ commercialAudit = cleanAudit, responseEdges = [] } = {}) => (
  displayRoutingFinalSvgGeometryIsClean({
    audit: cleanAudit,
    commercialAudit,
    hardAudit: cleanHardAudit,
    expectedPathCount: 1,
    responseEdges,
  })
);

describe('display routing browser commercial clearance contract', () => {
  it('accepts a 48px risk only for the exact audited constrained-edge marker', () => {
    const commercialAudit = {
      ...cleanAudit,
      clearanceRisks: [{ edgeId: 'edge', nodeId: 'obstacle', clearance: 32 }],
    };

    expect(geometryIsClean({ commercialAudit })).toBe(false);
    expect(geometryIsClean({
      commercialAudit,
      responseEdges: [{ id: 'edge', data: { commercialClearanceConstrainedStaircase: 'true' } }],
    })).toBe(false);
    expect(geometryIsClean({
      commercialAudit,
      responseEdges: [{ id: 'edge', data: { commercialClearanceConstrainedStaircase: true } }],
    })).toBe(true);
  });

  it('partitions bounded exception evidence without accepting malformed identities', () => {
    const risks = [
      { edgeId: 'constrained' },
      { edgeId: 'ordinary' },
      { edgeId: '' },
      { edgeId: 'x'.repeat(501) },
    ];
    const partition = partitionDisplayRoutingCommercialClearanceRisks(risks, [
      { id: 'constrained', data: { commercialClearanceConstrainedStaircase: true } },
      { id: 'ordinary', data: {} },
    ]);

    expect(partition.accepted).toEqual([{ edgeId: 'constrained' }]);
    expect(partition.rejected).toEqual(risks.slice(1));
  });

  it('never exempts the 4px screen-readability floor', () => {
    expect(geometryIsClean({
      commercialAudit: {
        ...cleanAudit,
        visualClearanceRisks: [{ edgeId: 'edge', screenClearance: 3.5 }],
      },
      responseEdges: [{
        id: 'edge', data: { commercialClearanceConstrainedStaircase: true },
      }],
    })).toBe(false);
  });

  it('keeps bounded diagnostics and exposes the reviewed exception marker', () => {
    const strictCrossings = Array.from({ length: 20 }, (_, index) => ({
      edgeA: `a-${index}`,
      edgeB: `b-${index}`,
    }));
    const summary = summarizeDisplayRoutingGeometryFailure({
      hardAudit: {
        strictCrossings,
        illegalOverlaps: [{ edgeA: 'c', edgeB: 'd', overlap: 48 }],
      },
      route: { response: { edges: [{
        id: 'a-0', source: 'source', target: 'target', sourceHandle: 'right',
        targetHandle: 'left', data: {
          commercialClearanceConstrainedStaircase: true,
          computedPath: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        },
      }], hardReport: { minimumClearanceViolations: 1,
        minimumClearanceViolationEdgeIds: ['a-0'], commercialClearanceViolations: 2 } } },
      commercialAudit: { clearanceRisks: [{ edgeId: 'a-0', clearance: 32 }] },
    });

    expect(summary.strictCrossingSamples).toEqual(strictCrossings.slice(0, 12));
    expect(summary.strictCrossingEdgeSamples[0].edgeA).toMatchObject({
      edgeId: 'a-0', source: 'source', target: 'target',
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    });
    expect(summary.illegalOverlapSamples).toEqual([{ edgeA: 'c', edgeB: 'd', overlap: 48 }]);
    expect(summary.commercialClearanceRiskSamples).toEqual([
      expect.objectContaining({
        edgeId: 'a-0', commercialClearanceConstrainedStaircase: true,
      }),
    ]);
    expect(summary.workerMinimumClearanceViolationEdgeIds).toEqual(['a-0']);
  });
});

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createLocalDoglegRepairDiagnostics } from '../../../strategies/shared/edgeLocalDoglegRepair';
import { createDisplayQualityDoglegRepairSession } from '../baseReactFlowDisplayQualityDoglegSession';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} },
  { id: 'target', position: { x: 240, y: 0 }, measured: { width: 80, height: 40 }, data: {} },
];

const cleanEdge = (): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'smart',
  data: {
    computedPath: [{ x: 80, y: 20 }, { x: 240, y: 20 }],
  },
});

describe('display quality dogleg repair session', () => {
  it('skips an identical route only after the first run proves a fixed point', () => {
    const session = createDisplayQualityDoglegRepairSession(nodes);
    const firstDiagnostics = createLocalDoglegRepairDiagnostics();
    const edges = [cleanEdge()];

    expect(session.run(edges, firstDiagnostics)).toBe(edges);
    expect(firstDiagnostics.cacheHitCount).toBe(0);

    const hitDiagnostics = createLocalDoglegRepairDiagnostics();
    expect(session.run(edges, hitDiagnostics)).toBe(edges);
    expect(hitDiagnostics.cacheHitCount).toBe(1);
    expect(hitDiagnostics.candidateCount).toBe(0);
    expect(hitDiagnostics.qualityEvaluationCount).toBe(0);
  });

  it('returns current edges on a signature hit and preserves non-routing metadata', () => {
    const session = createDisplayQualityDoglegRepairSession(nodes);
    session.run([cleanEdge()]);
    const current = [{
      ...cleanEdge(),
      selected: true,
      label: 'new label',
      style: { stroke: '#f00' },
    }];
    const diagnostics = createLocalDoglegRepairDiagnostics();

    const result = session.run(current, diagnostics);

    expect(result).toBe(current);
    expect(result[0]).toMatchObject({
      selected: true,
      label: 'new label',
      style: { stroke: '#f00' },
    });
    expect(diagnostics.cacheHitCount).toBe(1);
  });

  it('does not trust a different routing signature', () => {
    const session = createDisplayQualityDoglegRepairSession(nodes);
    session.run([cleanEdge()]);
    const changed = [cleanEdge()];
    changed[0] = {
      ...changed[0],
      data: {
        ...changed[0].data,
        computedPath: [{ x: 80, y: 20 }, { x: 180, y: 20 }, { x: 180, y: 60 }, { x: 240, y: 60 }],
      },
    };
    const diagnostics = createLocalDoglegRepairDiagnostics();

    session.run(changed, diagnostics);

    expect(diagnostics.cacheHitCount).toBe(0);
  });
});

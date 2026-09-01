import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { detectLocalDoglegRisks } from '../../../algorithms/localDoglegQuality';
import {
  repairFinalSharedSourceTerminalTrunks,
  repairFinalSharedTargetTerminalTrunks,
  repairFinalSameSideAdjacentTerminalEscape,
  repairFinalSameTargetTerminalTrunks,
  repairFinalTerminalMicroDoglegs,
} from '../edgeFinalEndpointTopologyRepair';
import {
  auditFinalSameSideEndpointOrder,
  repairFinalSameSideEndpointOrder,
} from '../edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../edgeFinalSameSidePassageOrderRepair';
import { createEdgePathQualityEvaluationContext } from '../edgeStrictCrossingGuard';
import { hardQualityDoesNotRegress } from '../edgeSharedEndpointPortOrderGeometry';

type Point = { x: number; y: number };

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
});

const pathOf = (edge: Edge | undefined): Point[] => {
  const path = edge?.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
    ? (edge.data as Record<string, unknown>).computedPath
    : undefined;
  return Array.isArray(path) ? path as Point[] : [];
};

const sourceEdge = (id: string, target: string, computedPath: Point[]): Edge => ({
  id,
  source: 'hub',
  target,
  sourceHandle: 'bottom',
  targetHandle: 'top',
  data: { computedPath },
});

const sideEscapeFixture = (): { nodes: Node[]; edges: Edge[] } => ({
  nodes: [
    node('hub', 0, 0, 300, 100),
    node('fixed', 70, 400, 60, 60),
    node('middle', 520, 400, 60, 60),
    node('far', 920, 400, 60, 60),
  ],
  edges: [
    sourceEdge('fixed-edge', 'fixed', [
      { x: 100, y: 100 },
      { x: 100, y: 400 },
    ]),
    sourceEdge('middle-edge', 'middle', [
      { x: 220, y: 100 },
      { x: 220, y: 200 },
      { x: 550, y: 200 },
      { x: 550, y: 400 },
    ]),
    sourceEdge('far-edge', 'far', [
      { x: 180, y: 100 },
      { x: 180, y: 220 },
      { x: 950, y: 220 },
      { x: 950, y: 400 },
    ]),
  ],
});

const targetTrunkFixture = (): { nodes: Node[]; edges: Edge[] } => {
  const nodes = [
    node('first', 0, 0, 60, 60),
    node('second', 200, 0, 60, 60),
    node('third', 400, 0, 60, 60),
    node('sink', 800, 500, 300, 100),
  ];
  const targetEdge = (
    id: string,
    source: string,
    sourceX: number,
    targetX: number,
    laneY: number,
  ): Edge => ({
    id,
    source,
    target: 'sink',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: {
      computedPath: [
        { x: sourceX, y: 60 },
        { x: sourceX, y: laneY },
        { x: targetX, y: laneY },
        { x: targetX, y: 500 },
      ],
    },
  });
  return {
    nodes,
    edges: [
      targetEdge('first-edge', 'first', 30, 850, 380),
      targetEdge('second-edge', 'second', 230, 900, 320),
      targetEdge('third-edge', 'third', 430, 930, 260),
    ],
  };
};

const dualTrunkSourceFixture = (): { nodes: Node[]; edges: Edge[] } => ({
  nodes: [
    node('hub', 0, 0, 300, 100),
    node('branch-a', 400, 500, 80, 80),
    node('branch-b', 600, 500, 80, 80),
    node('target-source-a', 800, 0, 80, 80),
    node('target-source-b', 900, 0, 80, 80),
    node('sink', 1_000, 500, 300, 100),
  ],
  edges: [
    {
      id: 'source-trunk-a',
      source: 'hub',
      target: 'branch-a',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 120, y: 100 },
          { x: 120, y: 220 },
          { x: 440, y: 220 },
          { x: 440, y: 500 },
        ],
      },
    },
    {
      id: 'source-trunk-b',
      source: 'hub',
      target: 'branch-b',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 120, y: 100 },
          { x: 120, y: 220 },
          { x: 640, y: 220 },
          { x: 640, y: 500 },
        ],
      },
    },
    {
      id: 'dual-trunk-edge',
      source: 'hub',
      target: 'sink',
      sourceHandle: 'left',
      targetHandle: 'top',
      data: {
        runtimeHandleLock: { source: true },
        sharedTrunkAware: true,
        computedPath: [
          { x: 0, y: 50 },
          { x: -160, y: 50 },
          { x: -160, y: 340 },
          { x: 1_150, y: 340 },
          { x: 1_150, y: 420 },
          { x: 1_150, y: 500 },
        ],
      },
    },
    {
      id: 'target-trunk-a',
      source: 'target-source-a',
      target: 'sink',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 840, y: 80 },
          { x: 840, y: 380 },
          { x: 1_150, y: 380 },
          { x: 1_150, y: 420 },
          { x: 1_150, y: 500 },
        ],
      },
    },
    {
      id: 'target-trunk-b',
      source: 'target-source-b',
      target: 'sink',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 940, y: 80 },
          { x: 940, y: 400 },
          { x: 1_150, y: 400 },
          { x: 1_150, y: 420 },
          { x: 1_150, y: 500 },
        ],
      },
    },
  ],
});

const dualTrunkTargetFixture = (): { nodes: Node[]; edges: Edge[] } => ({
  nodes: [
    node('hub', 0, 0, 300, 100),
    node('source-branch', 400, 500, 80, 80),
    node('target-source-a', 800, 0, 80, 80),
    node('target-source-b', 900, 0, 80, 80),
    node('sink', 1_000, 500, 300, 100),
  ],
  edges: [
    {
      id: 'source-trunk-peer',
      source: 'hub',
      target: 'source-branch',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 120, y: 100 },
          { x: 120, y: 220 },
          { x: 440, y: 220 },
          { x: 440, y: 500 },
        ],
      },
    },
    {
      id: 'dual-trunk-edge',
      source: 'hub',
      target: 'sink',
      sourceHandle: 'bottom',
      targetHandle: 'left',
      data: {
        runtimeHandleLock: { target: true },
        sharedTrunkAware: true,
        computedPath: [
          { x: 120, y: 100 },
          { x: 120, y: 220 },
          { x: 720, y: 220 },
          { x: 720, y: 550 },
          { x: 850, y: 550 },
          { x: 1_000, y: 550 },
        ],
      },
    },
    {
      id: 'target-trunk-a',
      source: 'target-source-a',
      target: 'sink',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 840, y: 80 },
          { x: 840, y: 380 },
          { x: 1_150, y: 380 },
          { x: 1_150, y: 420 },
          { x: 1_150, y: 500 },
        ],
      },
    },
    {
      id: 'target-trunk-b',
      source: 'target-source-b',
      target: 'sink',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 940, y: 80 },
          { x: 940, y: 400 },
          { x: 1_150, y: 400 },
          { x: 1_150, y: 420 },
          { x: 1_150, y: 500 },
        ],
      },
    },
  ],
});

describe('final endpoint topology repair', () => {
  it('uses an adjacent automatic side when the same-side multiset swap is unsafe', () => {
    const { nodes, edges } = sideEscapeFixture();
    const directOrderRepair = repairFinalSameSideEndpointOrder(edges, nodes);

    expect(auditFinalSameSideEndpointOrder(edges, nodes).inversions).toBe(1);
    expect(auditFinalSameSideEndpointOrder(directOrderRepair, nodes).inversions).toBe(1);

    const result = repairFinalSameSideAdjacentTerminalEscape(edges, nodes);
    const sourceGroups = auditFinalSameSideEndpointOrder(result, nodes).groups
      .filter(group => group.nodeId === 'hub' && group.role === 'source');

    expect(sourceGroups.every(group => group.inversions === 0)).toBe(true);
    expect(result.some(edge => edge.sourceHandle === 'right')).toBe(true);
  });

  it('escapes a residual same-side child overlap even when endpoint order is already correct', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('near', 600, 400, 100, 80),
      node('far', 1_200, 400, 100, 80),
    ];
    const edges: Edge[] = [
      sourceEdge('near-edge', 'near', [
        { x: 156, y: 100 },
        { x: 156, y: 200 },
        { x: 650, y: 200 },
        { x: 650, y: 400 },
      ]),
      sourceEdge('far-edge', 'far', [
        { x: 168, y: 100 },
        { x: 168, y: 200 },
        { x: 1_250, y: 200 },
        { x: 1_250, y: 400 },
      ]),
    ];

    expect(auditFinalSameSideEndpointOrder(edges, nodes).inversions).toBe(0);
    expect(auditFinalSameSidePassageOrder(edges, nodes).parallelChildOverlaps).toBe(1);

    const result = repairFinalSameSideAdjacentTerminalEscape(edges, nodes);

    expect(result.find(edge => edge.id === 'far-edge')?.sourceHandle).toBe('right');
    expect(auditFinalSameSidePassageOrder(result, nodes).passageDefects).toBe(0);
    expect(auditFinalSameSideEndpointOrder(result, nodes).inversions).toBe(0);
  });

  it.each([
    ['fixed side', { sourcePortPolicy: 'fixed-side' }],
    ['forbidden side', { sourcePortPolicy: 'forbidden' }],
  ])('does not move a %s terminal', (_label, terminalPolicy) => {
    const { nodes, edges } = sideEscapeFixture();
    const constrained = edges.map(edge => edge.id === 'middle-edge'
      ? { ...edge, data: { ...edge.data, ...terminalPolicy } }
      : edge);
    const result = repairFinalSameSideAdjacentTerminalEscape(constrained, nodes);
    const constrainedMiddle = constrained.find(edge => edge.id === 'middle-edge');
    const resultMiddle = result.find(edge => edge.id === 'middle-edge');

    expect(resultMiddle).toBe(constrainedMiddle);
    expect(resultMiddle?.sourceHandle).toBe('bottom');
    expect(pathOf(resultMiddle)).toEqual(pathOf(constrainedMiddle));
  });

  it('builds a three-member target suffix while preserving every source terminal', () => {
    const { nodes, edges } = targetTrunkFixture();
    const sourceTerminals = edges.map(edge => pathOf(edge)[0]);

    const result = repairFinalSameTargetTerminalTrunks(edges, nodes);
    const order = auditFinalSameSideEndpointOrder(result, nodes);
    const targetTrunk = order.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink'
      && trunk.role === 'target'
      && trunk.edgeIds.length === 3
    ));

    expect(result.map(edge => pathOf(edge)[0])).toEqual(sourceTerminals);
    expect(targetTrunk?.commonStemLength).toBeGreaterThanOrEqual(48);
  });

  it('preserves a dual-trunk edge source trunk while synthesizing its target trunk', () => {
    const { nodes, edges } = targetTrunkFixture();
    const sourceHub = node('source-hub', 0, 100, 300, 100);
    const dualTrunkNodes = [sourceHub, ...nodes.filter(item => (
      item.id !== 'first' && item.id !== 'second'
    ))];
    const dualTrunkEdges = edges.map((edge, index): Edge => {
      if (index > 1) return edge;
      const path = pathOf(edge);
      return {
        ...edge,
        source: 'source-hub',
        data: {
          ...edge.data,
          sharedTrunkAware: true,
          computedPath: [
            { x: 100, y: 200 },
            { x: 100, y: index === 0 ? 280 : 260 },
            ...path.slice(2),
          ],
        },
      };
    });
    const baselineSourceTrunk = auditFinalSameSideEndpointOrder(
      dualTrunkEdges,
      dualTrunkNodes,
    ).legalSharedTrunks.find(trunk => trunk.nodeId === 'source-hub');

    const result = repairFinalSameTargetTerminalTrunks(dualTrunkEdges, dualTrunkNodes);
    const trunks = auditFinalSameSideEndpointOrder(result, dualTrunkNodes).legalSharedTrunks;

    expect(baselineSourceTrunk?.edgeIds).toEqual(['first-edge', 'second-edge']);
    expect(trunks.some(trunk => (
      trunk.nodeId === 'source-hub'
      && trunk.edgeIds.includes('first-edge')
      && trunk.edgeIds.includes('second-edge')
    ))).toBe(true);
    expect(trunks.some(trunk => trunk.nodeId === 'sink' && trunk.edgeIds.length === 3)).toBe(true);
  });

  it('moves a router-owned dual-trunk edge onto the source trunk without losing its target trunk', () => {
    const { nodes, edges } = dualTrunkSourceFixture();
    const baselineOrder = auditFinalSameSideEndpointOrder(edges, nodes);
    const baselineSourceTrunk = baselineOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'hub' && trunk.role === 'source'
    ));
    const baselineTargetTrunk = baselineOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink' && trunk.role === 'target'
    ));
    const quality = createEdgePathQualityEvaluationContext(edges);
    const baselineQuality = quality.evaluate(edges);

    let endpointEvaluationCount = 0;
    const result = repairFinalSharedSourceTerminalTrunks(edges, nodes, {
      evaluateEndpointOrder: candidateEdges => {
        endpointEvaluationCount += 1;
        return auditFinalSameSideEndpointOrder(candidateEdges, nodes);
      },
    });
    const resultOrder = auditFinalSameSideEndpointOrder(result, nodes);
    const resultSourceTrunk = resultOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'hub'
      && trunk.role === 'source'
      && trunk.edgeIds.includes('dual-trunk-edge')
    ));
    const resultTargetTrunk = resultOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink' && trunk.role === 'target'
    ));
    const dualTrunkEdge = result.find(edge => edge.id === 'dual-trunk-edge');
    const resultQuality = quality.evaluate(result);

    expect(endpointEvaluationCount).toBeGreaterThan(0);
    expect(baselineSourceTrunk?.edgeIds).toEqual(['source-trunk-a', 'source-trunk-b']);
    expect(baselineTargetTrunk?.edgeIds).toEqual([
      'dual-trunk-edge',
      'target-trunk-a',
      'target-trunk-b',
    ]);
    expect(resultSourceTrunk?.edgeIds).toEqual([
      'dual-trunk-edge',
      'source-trunk-a',
      'source-trunk-b',
    ]);
    expect(resultTargetTrunk?.edgeIds).toEqual(baselineTargetTrunk?.edgeIds);
    expect(resultTargetTrunk?.commonStemLength).toBeGreaterThanOrEqual(
      baselineTargetTrunk?.commonStemLength ?? 0,
    );
    expect(dualTrunkEdge?.sourceHandle).toBe('bottom');
    expect(hardQualityDoesNotRegress(baselineQuality, resultQuality)).toBe(true);
    expect(resultQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
  });

  it('rejects a dual-trunk source adoption when the added backtrack exceeds the bounded allowance', () => {
    const { nodes, edges } = dualTrunkSourceFixture();
    const wideSourceTrunk = edges.map(edge => (
      edge.id === 'source-trunk-a' || edge.id === 'source-trunk-b'
        ? {
          ...edge,
          data: {
            ...edge.data,
            computedPath: pathOf(edge).map((point, index) => (
              index <= 1 ? { ...point, x: 280 } : point
            )),
          },
        }
        : edge.id === 'dual-trunk-edge'
          ? {
            ...edge,
            data: {
              ...edge.data,
              computedPath: [
                { x: 0, y: 50 },
                { x: -160, y: 50 },
                { x: -160, y: 150 },
                { x: -260, y: 150 },
                { x: -260, y: 250 },
                { x: -360, y: 250 },
                { x: -360, y: 340 },
                { x: -160, y: 340 },
                { x: 1_150, y: 340 },
                { x: 1_150, y: 420 },
                { x: 1_150, y: 500 },
              ],
            },
          }
          : edge
    ));
    const baselineDualTrunkEdge = wideSourceTrunk.find(edge => edge.id === 'dual-trunk-edge');

    const result = repairFinalSharedSourceTerminalTrunks(wideSourceTrunk, nodes);
    const resultDualTrunkEdge = result.find(edge => edge.id === 'dual-trunk-edge');

    expect(resultDualTrunkEdge).toBe(baselineDualTrunkEdge);
    expect(resultDualTrunkEdge?.sourceHandle).toBe('left');
    expect(pathOf(resultDualTrunkEdge)).toEqual(pathOf(baselineDualTrunkEdge));
  });

  it('keeps an ordinary cross-side source sibling on its clean independent escape', () => {
    const { nodes, edges } = dualTrunkSourceFixture();
    const ordinaryEdges = edges.filter(edge => (
      edge.id !== 'target-trunk-a' && edge.id !== 'target-trunk-b'
    ));
    const ordinarySibling = ordinaryEdges.find(edge => edge.id === 'dual-trunk-edge');

    const result = repairFinalSharedSourceTerminalTrunks(ordinaryEdges, nodes);
    const resultSibling = result.find(edge => edge.id === 'dual-trunk-edge');

    expect(resultSibling).toBe(ordinarySibling);
    expect(resultSibling?.sourceHandle).toBe('left');
    expect(pathOf(resultSibling)).toEqual(pathOf(ordinarySibling));
  });

  it('joins a cross-container downstream sibling to an existing source trunk', () => {
    const { nodes: fixtureNodes, edges } = dualTrunkSourceFixture();
    const nodes = fixtureNodes.map(current => {
      if (current.id === 'hub') return { ...current, parentId: 'operations' };
      if (current.id === 'branch-a' || current.id === 'branch-b') {
        return { ...current, parentId: 'operations' };
      }
      if (current.id === 'sink') return { ...current, parentId: 'data' };
      return current;
    });
    const ordinaryEdges = edges.filter(edge => (
      edge.id !== 'target-trunk-a' && edge.id !== 'target-trunk-b'
    ));

    const result = repairFinalSharedSourceTerminalTrunks(ordinaryEdges, nodes);
    const resultOrder = auditFinalSameSideEndpointOrder(result, nodes);
    const sibling = result.find(edge => edge.id === 'dual-trunk-edge');
    const sourceTrunk = resultOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'hub'
      && trunk.role === 'source'
      && trunk.edgeIds.includes('dual-trunk-edge')
    ));

    expect(sibling?.sourceHandle).toBe('bottom');
    expect(sourceTrunk?.edgeIds).toEqual([
      'dual-trunk-edge',
      'source-trunk-a',
      'source-trunk-b',
    ]);
  });

  it.each([
    ['manual side', { manualHandleSides: ['source'] }],
    ['fixed side', { sourcePortPolicy: 'fixed-side' }],
    ['source exact lock', { sourceHandleLocked: true }],
  ])('does not move a %s dual-trunk source terminal across sides', (_label, constraint) => {
    const { nodes, edges } = dualTrunkSourceFixture();
    const constrained = edges.map(edge => edge.id === 'dual-trunk-edge'
      ? { ...edge, data: { ...edge.data, ...constraint } }
      : edge);
    const baselineDualTrunkEdge = constrained.find(edge => edge.id === 'dual-trunk-edge');

    const result = repairFinalSharedSourceTerminalTrunks(constrained, nodes);
    const resultDualTrunkEdge = result.find(edge => edge.id === 'dual-trunk-edge');

    expect(resultDualTrunkEdge).toBe(baselineDualTrunkEdge);
    expect(resultDualTrunkEdge?.sourceHandle).toBe('left');
    expect(pathOf(resultDualTrunkEdge)).toEqual(pathOf(baselineDualTrunkEdge));
  });

  it('moves a router-owned dual-trunk edge onto the target trunk without losing its source trunk', () => {
    const { nodes, edges } = dualTrunkTargetFixture();
    const baselineOrder = auditFinalSameSideEndpointOrder(edges, nodes);
    const baselineSourceTrunk = baselineOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'hub' && trunk.role === 'source'
    ));
    const baselineTargetTrunk = baselineOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink' && trunk.role === 'target'
    ));

    const result = repairFinalSharedTargetTerminalTrunks(edges, nodes);
    const resultOrder = auditFinalSameSideEndpointOrder(result, nodes);
    const resultSourceTrunk = resultOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'hub' && trunk.role === 'source'
    ));
    const resultTargetTrunk = resultOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink'
      && trunk.role === 'target'
      && trunk.edgeIds.includes('dual-trunk-edge')
    ));
    const dualTrunkEdge = result.find(edge => edge.id === 'dual-trunk-edge');

    expect(baselineSourceTrunk?.edgeIds).toEqual([
      'dual-trunk-edge',
      'source-trunk-peer',
    ]);
    expect(baselineTargetTrunk?.edgeIds).toEqual(['target-trunk-a', 'target-trunk-b']);
    expect(resultSourceTrunk?.edgeIds).toEqual(baselineSourceTrunk?.edgeIds);
    expect(resultSourceTrunk?.commonStemLength).toBeGreaterThanOrEqual(
      baselineSourceTrunk?.commonStemLength ?? 0,
    );
    expect(resultTargetTrunk?.edgeIds).toEqual([
      'dual-trunk-edge',
      'target-trunk-a',
      'target-trunk-b',
    ]);
    expect(dualTrunkEdge?.targetHandle).toBe('top');
  });

  it.each([
    ['source repair is needed', dualTrunkSourceFixture],
    ['target repair is needed', dualTrunkTargetFixture],
  ])('keeps dual-trunk topology independent of repair order when %s', (_label, fixture) => {
    const { nodes, edges } = fixture();
    const sourceThenTarget = repairFinalSharedTargetTerminalTrunks(
      repairFinalSharedSourceTerminalTrunks(edges, nodes),
      nodes,
    );
    const targetThenSource = repairFinalSharedSourceTerminalTrunks(
      repairFinalSharedTargetTerminalTrunks(edges, nodes),
      nodes,
    );
    const trunkSignature = (candidateEdges: Edge[]): string[] => (
      auditFinalSameSideEndpointOrder(candidateEdges, nodes).legalSharedTrunks
        .filter(trunk => trunk.edgeIds.includes('dual-trunk-edge'))
        .map(trunk => `${trunk.role}:${trunk.nodeId}:${trunk.side}:${trunk.edgeIds.join(',')}`)
        .sort()
    );

    expect(trunkSignature(sourceThenTarget)).toEqual(trunkSignature(targetThenSource));
    expect(trunkSignature(sourceThenTarget).some(signature => signature.startsWith('source:hub:')))
      .toBe(true);
    expect(trunkSignature(sourceThenTarget).some(signature => signature.startsWith('target:sink:')))
      .toBe(true);
    expect(pathOf(sourceThenTarget.find(edge => edge.id === 'dual-trunk-edge'))).toEqual(
      pathOf(targetThenSource.find(edge => edge.id === 'dual-trunk-edge')),
    );
  });

  it.each([
    ['source repair is needed', dualTrunkSourceFixture],
    ['target repair is needed', dualTrunkTargetFixture],
  ])('is idempotent after both dual-trunk roles are repaired when %s', (_label, fixture) => {
    const { nodes, edges } = fixture();
    const repairBothRoles = (candidateEdges: Edge[]): Edge[] => (
      repairFinalSharedTargetTerminalTrunks(
        repairFinalSharedSourceTerminalTrunks(candidateEdges, nodes),
        nodes,
      )
    );
    const once = repairBothRoles(edges);
    const twice = repairBothRoles(once);

    expect(twice).toEqual(once);
  });

  it('flattens an automatic terminal micro-dogleg without losing source or dual-trunk identities', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('micro-target', 0, 400, 160, 80),
      node('source-two', 300, 0, 60, 60),
      node('source-three', 700, 0, 60, 60),
      node('sink', 500, 500, 200, 100),
    ];
    const edges: Edge[] = [
      sourceEdge('micro-edge', 'micro-target', [
        { x: 100, y: 100 },
        { x: 100, y: 169 },
        { x: 52, y: 169 },
        { x: 52, y: 400 },
      ]),
      sourceEdge('dual-trunk-edge', 'sink', [
        { x: 100, y: 100 },
        { x: 100, y: 200 },
        { x: 600, y: 200 },
        { x: 600, y: 500 },
      ]),
      {
        id: 'target-peer-two',
        source: 'source-two',
        target: 'sink',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 330, y: 60 },
          { x: 330, y: 280 },
          { x: 600, y: 280 },
          { x: 600, y: 500 },
        ] },
      },
      {
        id: 'target-peer-three',
        source: 'source-three',
        target: 'sink',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 730, y: 60 },
          { x: 730, y: 260 },
          { x: 600, y: 260 },
          { x: 600, y: 500 },
        ] },
      },
    ];
    const baselineOrder = auditFinalSameSideEndpointOrder(edges, nodes);
    const baselineSourceTrunk = baselineOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'hub' && trunk.role === 'source'
    ));
    const baselineTargetTrunk = baselineOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink' && trunk.role === 'target'
    ));
    const baselineQuality = createEdgePathQualityEvaluationContext(edges).evaluate(edges);

    const result = repairFinalTerminalMicroDoglegs(edges, nodes);
    const resultOrder = auditFinalSameSideEndpointOrder(result, nodes);
    const resultSourceTrunk = resultOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'hub' && trunk.role === 'source'
    ));
    const resultTargetTrunk = resultOrder.legalSharedTrunks.find(trunk => (
      trunk.nodeId === 'sink' && trunk.role === 'target'
    ));
    const microEdge = result.find(edge => edge.id === 'micro-edge');
    const resultQuality = createEdgePathQualityEvaluationContext(result).evaluate(result);

    expect(detectLocalDoglegRisks(pathOf(edges[0]))).toEqual([
      expect.objectContaining({ rule: 'local-micro-dogleg', depth: 48 }),
    ]);
    expect(pathOf(microEdge)).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 400 },
    ]);
    expect(detectLocalDoglegRisks(pathOf(microEdge))).toEqual([]);
    expect(resultSourceTrunk?.edgeIds).toEqual(baselineSourceTrunk?.edgeIds);
    expect(resultSourceTrunk?.commonStemLength).toBeGreaterThanOrEqual(
      baselineSourceTrunk?.commonStemLength ?? 0,
    );
    expect(resultTargetTrunk).toEqual(baselineTargetTrunk);
    expect(hardQualityDoesNotRegress(baselineQuality, resultQuality)).toBe(true);
  });

  it('keeps a terminal micro-dogleg when its exact endpoint position is locked', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('micro-target', 0, 400, 160, 80),
    ];
    const edges: Edge[] = [{
      ...sourceEdge('locked-edge', 'micro-target', [
        { x: 100, y: 100 },
        { x: 100, y: 180 },
        { x: 52, y: 180 },
        { x: 52, y: 400 },
      ]),
      data: {
        computedPath: [
          { x: 100, y: 100 },
          { x: 100, y: 180 },
          { x: 52, y: 180 },
          { x: 52, y: 400 },
        ],
        targetHandleLocked: true,
        sourceHandleLocked: true,
      },
    }];

    expect(repairFinalTerminalMicroDoglegs(edges, nodes)).toBe(edges);
  });

  it('widens a readable trunk branch when flattening would create a reverse terminal overlap', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('micro-target', 60, 400, 200, 80),
      node('peer-target', -250, 400, 100, 80),
      node('remote', 800, 0, 100, 100),
    ];
    const edges: Edge[] = [
      sourceEdge('micro-edge', 'micro-target', [
        { x: 150, y: 100 },
        { x: 150, y: 169 },
        { x: 102, y: 169 },
        { x: 102, y: 400 },
      ]),
      sourceEdge('source-trunk-peer', 'peer-target', [
        { x: 150, y: 100 },
        { x: 150, y: 169 },
        { x: -200, y: 169 },
        { x: -200, y: 400 },
      ]),
      {
        id: 'reverse-terminal-edge',
        source: 'micro-target',
        target: 'remote',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 150, y: 400 },
          { x: 150, y: 328 },
          { x: 850, y: 328 },
          { x: 850, y: 100 },
        ] },
      },
    ];
    const straightCandidate = edges.map(edge => edge.id === 'micro-edge'
      ? {
        ...edge,
        data: { ...edge.data, computedPath: [
          { x: 150, y: 100 },
          { x: 150, y: 400 },
        ] },
      }
      : edge);
    const baselineQuality = createEdgePathQualityEvaluationContext(edges).evaluate(edges);
    const straightQuality = createEdgePathQualityEvaluationContext(edges)
      .evaluateChanged(straightCandidate, [0]);

    const result = repairFinalTerminalMicroDoglegs(edges, nodes);
    const resultQuality = createEdgePathQualityEvaluationContext(result).evaluate(result);
    const sourceTrunk = auditFinalSameSideEndpointOrder(result, nodes).legalSharedTrunks
      .find(trunk => trunk.nodeId === 'hub' && trunk.role === 'source');

    expect(straightQuality.reverseOverlap).toBeGreaterThan(baselineQuality.reverseOverlap);
    expect(pathOf(result.find(edge => edge.id === 'micro-edge'))).toEqual([
      { x: 150, y: 100 },
      { x: 150, y: 169 },
      { x: 70, y: 169 },
      { x: 70, y: 400 },
    ]);
    expect(detectLocalDoglegRisks(pathOf(result[0]))).toEqual([]);
    expect(sourceTrunk?.edgeIds).toEqual(['micro-edge', 'source-trunk-peer']);
    expect(hardQualityDoesNotRegress(baselineQuality, resultQuality)).toBe(true);
  });

  it.each([
    ['manual side', { manualHandleSides: ['target'] }],
    ['fixed side', { targetPortPolicy: 'fixed-side' }],
    ['target exact lock', { targetHandleLocked: true }],
  ])('does not move a %s dual-trunk target terminal across sides', (_label, constraint) => {
    const { nodes, edges } = dualTrunkTargetFixture();
    const constrained = edges.map(edge => edge.id === 'dual-trunk-edge'
      ? { ...edge, data: { ...edge.data, ...constraint } }
      : edge);
    const baselineDualTrunkEdge = constrained.find(edge => edge.id === 'dual-trunk-edge');

    const result = repairFinalSharedTargetTerminalTrunks(constrained, nodes);
    const resultDualTrunkEdge = result.find(edge => edge.id === 'dual-trunk-edge');

    expect(resultDualTrunkEdge).toBe(baselineDualTrunkEdge);
    expect(resultDualTrunkEdge?.targetHandle).toBe('left');
    expect(pathOf(resultDualTrunkEdge)).toEqual(pathOf(baselineDualTrunkEdge));
  });

  it('fails closed for empty, malformed, oversized, and non-orthogonal paths', () => {
    const nodes = [node('hub', 0, 0, 300, 100), node('sink', 800, 500, 300, 100)];
    const malformed: Edge[] = [{
      id: 'malformed',
      source: 'hub',
      target: 'sink',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { computedPath: 'not-a-path' },
    }];
    const oversizedPath = Array.from({ length: 4_097 }, (_, index) => ({ x: 150, y: index }));
    const oversized: Edge[] = [{
      ...malformed[0],
      id: 'oversized',
      data: { computedPath: oversizedPath },
    }];
    const nonOrthogonal: Edge[] = [{
      ...malformed[0],
      id: 'non-orthogonal',
      data: {
        computedPath: [
          { x: 150, y: 100 },
          { x: 200, y: 180 },
          { x: 900, y: 500 },
        ],
      },
    }];

    expect(repairFinalSameSideAdjacentTerminalEscape([], nodes)).toEqual([]);
    expect(repairFinalSameTargetTerminalTrunks(malformed, nodes)).toBe(malformed);
    expect(repairFinalSameTargetTerminalTrunks(oversized, nodes)).toBe(oversized);
    expect(repairFinalSameSideAdjacentTerminalEscape(nonOrthogonal, nodes)).toBe(nonOrthogonal);
  });

  it('rejects candidates when the final validator fails or throws', () => {
    const { nodes, edges } = targetTrunkFixture();

    expect(repairFinalSameTargetTerminalTrunks(edges, nodes, {
      validateCandidate: () => false,
    })).toBe(edges);
    expect(repairFinalSameTargetTerminalTrunks(edges, nodes, {
      validateCandidate: () => {
        throw new Error('gate failure');
      },
    })).toBe(edges);
  });
});

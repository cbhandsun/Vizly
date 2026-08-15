import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import type { StandardDiagramData } from '../../../models/DiagramModels';
import { buildRenderSceneFromReactFlow } from '../../../rendering/reactFlowScene';
import {
  applySharedTrunkPaintPlan,
  createSharedTrunkBackboneFragments,
  readSharedTrunkPaintPlan,
  type SharedTrunkPaintMembership,
  type SharedTrunkPaintPlan,
  type SharedTrunkRole,
} from '../../../rendering/sharedTrunkPaint';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { parseBaseReactFlowPrecompiledRoutePatches } from '../baseReactFlowPrecompiledRouteArtifact';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';
import { mergeBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import {
  GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_PREFETCH_LOADERS,
} from '../generated/baseReactFlowPrecompiledRouteLoaders';
import { getGeneratedPrecompiledRouteArtifactForTest } from './fixtures/generatedPrecompiledRouteArtifacts';
import { withAbsoluteNodePositions } from './baseReactFlowDisplayEdges.testUtils';

const byId = (edges: readonly Edge[], edgeId: string): Edge => {
  const found = edges.find(edge => edge.id === edgeId);
  if (!found) throw new Error(`Missing logistics edge: ${edgeId}`);
  return found;
};

const plansByEdgeId = (edges: readonly Edge[]): Map<string, SharedTrunkPaintPlan> => new Map(
  edges.flatMap(edge => {
    const plan = readSharedTrunkPaintPlan(edge.data);
    return plan ? [[edge.id, plan] as const] : [];
  }),
);

const requiredPlan = (
  plans: ReadonlyMap<string, SharedTrunkPaintPlan>,
  edgeId: string,
): SharedTrunkPaintPlan => {
  const plan = plans.get(edgeId);
  if (!plan) throw new Error(`Missing shared-trunk plan: ${edgeId}`);
  return plan;
};

const requiredEndpointMembership = (
  plans: ReadonlyMap<string, SharedTrunkPaintPlan>,
  role: SharedTrunkRole,
  endpointId: string,
): SharedTrunkPaintMembership => {
  const candidates = [...plans.values()].flatMap(plan => plan.memberships)
    .filter(membership => membership.role === role && membership.endpointId === endpointId)
    .sort((first, second) => second.edgeIds.length - first.edgeIds.length);
  const membership = candidates[0];
  if (!membership) throw new Error(`Missing ${role} shared trunk at ${endpointId}`);
  return membership;
};

const expectConsistentGroupMembership = (
  plans: ReadonlyMap<string, SharedTrunkPaintPlan>,
  membership: SharedTrunkPaintMembership,
): void => {
  expect(membership.edgeIds).toContain(membership.ownerEdgeId);
  for (const edgeId of membership.edgeIds) {
    const plan = requiredPlan(plans, edgeId);
    expect(plan.memberships.find(candidate => candidate.id === membership.id)).toEqual(membership);
    expect(plan.hiddenRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: membership.role,
        ownerEdgeId: membership.ownerEdgeId,
      }),
    ]));
  }
};

const loadLogisticsPatches = async (): Promise<Edge[]> => {
  const descriptor = GENERATED_BASE_REACT_FLOW_PRECOMPILED_ROUTE_PREFETCH_LOADERS[
    'logistics-architecture-v1'
  ];
  if (!descriptor) throw new Error('Missing generated logistics route descriptor');
  const artifact = getGeneratedPrecompiledRouteArtifactForTest('logistics-architecture-v1');
  const artifactRecord = artifact !== null && typeof artifact === 'object' && !Array.isArray(artifact)
    ? artifact as Record<string, unknown>
    : {};
  const patches = parseBaseReactFlowPrecompiledRoutePatches(artifactRecord.patches);
  if (!patches) throw new Error('Invalid generated logistics route patches');
  return patches;
};

const routeLogisticsCanvas = async (): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  const canvas = await standardDataToCanvas(
    logisticsStandardData as unknown as StandardDiagramData,
  );
  const projected = projectBaseReactFlowDisplayWorkerInput(canvas);
  const edges = mergeBaseReactFlowDisplayEdgePatches(
    projected.edges,
    await loadLogisticsPatches(),
  );
  if (!edges) throw new Error('Unable to merge generated logistics route patches');
  return {
    nodes: withAbsoluteNodePositions(projected.nodes),
    edges,
  };
};

describe('base React Flow logistics shared trunk paint', () => {
  it('preserves the LOMS source trunk and Visibility target trunk on the same dual-trunk edge', async () => {
    const planned = applySharedTrunkPaintPlan((await routeLogisticsCanvas()).edges);
    const plans = plansByEdgeId(planned);
    const lomsSource = requiredEndpointMembership(plans, 'source', 'l-oms');
    const visibilityTarget = requiredEndpointMembership(plans, 'target', 'visibility');

    expect(lomsSource).toMatchObject({
      edgeIds: [
        'edge-loms-customs',
        'edge-loms-tms',
        'edge-loms-visibility',
        'edge-loms-wms',
      ],
    });
    // Customs now uses the same true bottom-side stem as the other L-OMS
    // branches. Painting all four members as one backbone avoids a duplicate
    // stroke while retaining each semantic edge after the shared junction.
    for (const edgeId of lomsSource.edgeIds) {
      expect(byId(planned, edgeId).sourceHandle).toBe('bottom');
    }
    expect(lomsSource.commonLength).toBeGreaterThanOrEqual(48);
    expect(visibilityTarget).toMatchObject({
      edgeIds: [
        'edge-loms-visibility',
        'edge-tms-visibility',
        'edge-wms-visibility',
      ],
    });
    expect(visibilityTarget.commonLength).toBeGreaterThanOrEqual(48);
    expectConsistentGroupMembership(plans, lomsSource);
    expectConsistentGroupMembership(plans, visibilityTarget);

    const sourceOwner = byId(planned, lomsSource.ownerEdgeId);
    const sourceOwnerPlan = requiredPlan(plans, lomsSource.ownerEdgeId);
    const targetOwner = byId(planned, visibilityTarget.ownerEdgeId);
    const targetOwnerPlan = requiredPlan(plans, visibilityTarget.ownerEdgeId);
    expect(sourceOwnerPlan.backboneRanges.some(range => (
      range.role === 'source' && range.ownerEdgeId === lomsSource.ownerEdgeId
    ))).toBe(true);
    expect(targetOwnerPlan.backboneRanges.some(range => (
      range.role === 'target' && range.ownerEdgeId === visibilityTarget.ownerEdgeId
    ))).toBe(true);

    // The semantic LOMS -> Visibility route belongs to both true trunks. Its
    // render host may change without changing that dual-trunk identity.
    const dualTrunkEdgeIds = lomsSource.edgeIds.filter(edgeId => (
      visibilityTarget.edgeIds.includes(edgeId)
    ));
    expect(dualTrunkEdgeIds).toHaveLength(1);
    const dualTrunkEdgeId = dualTrunkEdgeIds[0];
    const dualTrunkPlan = requiredPlan(plans, dualTrunkEdgeId);
    expect(dualTrunkPlan.memberships.map(membership => membership.role).sort()).toEqual([
      'source',
      'target',
    ]);
    expect(dualTrunkPlan.hiddenRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'source', ownerEdgeId: lomsSource.ownerEdgeId }),
      expect.objectContaining({ role: 'target', ownerEdgeId: visibilityTarget.ownerEdgeId }),
    ]));

    const sourceBackbones = createSharedTrunkBackboneFragments(
      sourceOwner.data?.computedPath,
      sourceOwnerPlan,
    );
    const mixedSourceBackbone = sourceBackbones.find(fragment => fragment.paint.token === 'mixed-neutral');
    expect(mixedSourceBackbone).toMatchObject({
      from: 0,
      roles: ['source'],
      paint: {
        token: 'mixed-neutral',
        stroke: '#64748B',
        strokeWidth: 3,
        strokeDasharray: '',
        opacity: 0.92,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
    });

    const targetBackbones = createSharedTrunkBackboneFragments(
      targetOwner.data?.computedPath,
      targetOwnerPlan,
    );
    expect(targetBackbones).toEqual([
      expect.objectContaining({
        roles: ['target'],
        paint: expect.objectContaining({
          token: 'semantic',
          stroke: '#47CACC',
          strokeWidth: 2,
          strokeDasharray: '6 4',
          opacity: 1,
        }),
      }),
    ]);

    expect(byId(planned, 'edge-loms-wms').style).toMatchObject({
      stroke: '#FF5722',
      strokeWidth: 3,
    });
    expect(byId(planned, 'edge-loms-visibility').style).toMatchObject({
      stroke: '#47CACC',
      strokeWidth: 2,
      strokeDasharray: '6 4',
    });
  }, 15_000);

  it('renders canonical backbones markerless while retaining semantic members and one endpoint carrier', async () => {
    const canvas = await routeLogisticsCanvas();
    const planned = applySharedTrunkPaintPlan(canvas.edges);
    const plans = plansByEdgeId(planned);
    const lomsSource = requiredEndpointMembership(plans, 'source', 'l-oms');
    const visibilityTarget = requiredEndpointMembership(plans, 'target', 'visibility');
    const dualTrunkEdgeIds = lomsSource.edgeIds.filter(edgeId => (
      visibilityTarget.edgeIds.includes(edgeId)
    ));
    expect(dualTrunkEdgeIds).toHaveLength(1);
    const dualTrunkEdgeId = dualTrunkEdgeIds[0];
    const sameRenderOwner = lomsSource.ownerEdgeId === visibilityTarget.ownerEdgeId;
    const routed = canvas.edges.map(edge => {
      const markerStart = edge.id === lomsSource.ownerEdgeId
        ? { type: MarkerType.ArrowClosed, color: '#FF5722' }
        : edge.markerStart;
      const markerEnd = edge.id === visibilityTarget.ownerEdgeId
        ? { type: MarkerType.ArrowClosed, color: '#47CACC' }
        : edge.markerEnd;
      return { ...edge, markerStart, markerEnd };
    });
    const scene = buildRenderSceneFromReactFlow(
      canvas.nodes,
      routed,
    );
    const sourceBackbone = scene.edges.find(edge => (
      edge.id.startsWith(`${lomsSource.ownerEdgeId}::shared-backbone:`)
      && edge.stroke === '#64748B'
    ));
    const targetBackbone = scene.edges.find(edge => (
      edge.id.startsWith(`${visibilityTarget.ownerEdgeId}::shared-backbone:`)
      && edge.stroke === '#47CACC'
    ));

    expect(sourceBackbone).toMatchObject({
      label: '',
      stroke: '#64748B',
      strokeWidth: 3,
      opacity: 0.92,
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'none' },
    });
    expect(targetBackbone).toMatchObject({
      label: '',
      stroke: '#47CACC',
      strokeWidth: 2,
      strokeDasharray: '6 4',
      opacity: 1,
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'none' },
    });
    expect(scene.edges.find(edge => edge.id === dualTrunkEdgeId)).toMatchObject({
      label: '状态数据',
      stroke: '#47CACC',
      strokeWidth: 2,
      strokeDasharray: '6 4',
      markerStart: { kind: 'none' },
      markerEnd: { kind: 'none' },
    });
    expect(scene.edges.find(edge => edge.id === 'edge-loms-wms')).toMatchObject({
      label: '仓储指令',
      stroke: '#FF5722',
      strokeWidth: 3,
    });
    expect(scene.edges.find(edge => (
      edge.id === `${lomsSource.ownerEdgeId}::shared-terminal-markers`
    ))).toMatchObject({
      label: '',
      stroke: 'transparent',
      opacity: 1,
      markerOnly: true,
      markerStart: { kind: 'arrow', color: '#FF5722' },
      markerEnd: sameRenderOwner
        ? { kind: 'arrow', color: '#47CACC' }
        : { kind: 'none' },
    });
    expect(scene.edges.find(edge => (
      edge.id === `${visibilityTarget.ownerEdgeId}::shared-terminal-markers`
    ))).toMatchObject({
      label: '',
      stroke: 'transparent',
      opacity: 1,
      markerOnly: true,
      markerStart: sameRenderOwner
        ? { kind: 'arrow', color: '#FF5722' }
        : { kind: 'none' },
      markerEnd: { kind: 'arrow', color: '#47CACC' },
    });
  }, 15_000);
});

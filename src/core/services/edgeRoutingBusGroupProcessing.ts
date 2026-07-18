import type { Rectangle } from '../algorithms/pathfinding';
import type {
  PathFindingJob,
  SharedGraphContext,
  UnifiedRoutingConfig,
} from '../types/routing';
import { createDefaultRoutingConfig } from '../types/routing';
import { TrunkCalculator } from '../workers/core/TrunkCalculator';
import {
  assignNonBusIncomingIndices,
  collectHubPortGroups,
  prepareBusRoutingContext,
  type HubPortGroupInfo,
} from './edgeRoutingBusPreparation';
import {
  groupBusPeersByHemisphere,
  type BusPeerClassification,
  type BusPeerEdge,
} from './edgeRoutingBusPeerGrouping';
import {
  assignBusTrunkGeometry,
  type BusTrunkGeometry,
} from './edgeRoutingTrunkAssignment';

interface ProcessBusRoutingGroupOptions {
  hubId: string;
  busGroupJobs: PathFindingJob[];
  globalPeers: readonly unknown[];
  getNodeRect: (id: string) => Rectangle | undefined;
  trunkCalculator: TrunkCalculator;
  config: UnifiedRoutingConfig;
  layoutDirection: string;
  isManyToOne: boolean;
  obstacles?: Rectangle[];
  hubUsedPorts?: ReadonlyMap<string, HubPortGroupInfo>;
  onClassification?: (classification: BusPeerClassification) => void;
  onTrunk?: (edges: readonly BusPeerEdge[], trunk: BusTrunkGeometry) => void;
}

export interface BusRoutingDebugCallbacks {
  onClassification?: (classification: BusPeerClassification) => void;
  onTrunk?: (edges: readonly BusPeerEdge[], trunk: BusTrunkGeometry) => void;
}

export const processBusRoutingGroup = ({
  hubId,
  busGroupJobs,
  globalPeers,
  getNodeRect,
  trunkCalculator,
  config,
  layoutDirection,
  isManyToOne,
  obstacles,
  hubUsedPorts,
  onClassification,
  onTrunk,
}: ProcessBusRoutingGroupOptions): void => {
  const hubRect = getNodeRect(hubId);
  if (!hubRect) return;
  const grouping = groupBusPeersByHemisphere({
    hubRect,
    busGroupJobs,
    globalPeers,
    getNodeRect,
    isManyToOne,
  });
  if (grouping.classifications.length === 0) return;
  grouping.classifications.forEach(classification =>
    onClassification?.(classification),
  );

  for (const [side, edges] of grouping.groups) {
    if (edges.length === 0) continue;
    const peerRectangles = edges
      .map(edge => getNodeRect(isManyToOne ? edge.source : edge.target))
      .filter((rectangle): rectangle is Rectangle => !!rectangle);
    const trunk = trunkCalculator.calculateTreeTrunk(
      hubRect,
      peerRectangles,
      isManyToOne,
      config,
      layoutDirection,
      undefined,
      obstacles,
    );
    const tangentValues = edges
      .map(edge => getNodeRect(isManyToOne ? edge.source : edge.target))
      .filter((rectangle): rectangle is Rectangle => !!rectangle)
      .map(rectangle =>
        trunk.suggestedPort === 'top' || trunk.suggestedPort === 'bottom'
          ? rectangle.x + rectangle.width / 2
          : rectangle.y + rectangle.height / 2,
      );
    const trunkPortTangent = tangentValues.length > 0
      ? tangentValues.reduce((sum, value) => sum + value, 0) / tangentValues.length
      : 0;
    const conflictingOutgoingGroup = isManyToOne
      ? hubUsedPorts?.get(trunk.suggestedPort)
      : undefined;
    const hasPortConflict = !!conflictingOutgoingGroup;
    let hubPortSlot = hasPortConflict ? 1 : 0;
    if (conflictingOutgoingGroup) {
      hubPortSlot = trunkPortTangent < conflictingOutgoingGroup.tangent ? 0 : 1;
      const outgoingSlot = 1 - hubPortSlot;
      conflictingOutgoingGroup.jobs.forEach(job => {
        job.outgoingCount = 2;
        job.outgoingIndex = outgoingSlot;
      });
      if (trunk.direction === 'vertical') {
        const hubCenterX = hubRect.x + hubRect.width / 2;
        trunk.axis = hubCenterX - (trunk.axis - hubCenterX);
      } else {
        const hubCenterY = hubRect.y + hubRect.height / 2;
        trunk.axis = hubCenterY - (trunk.axis - hubCenterY);
      }
    }

    onTrunk?.(edges, trunk);
    assignBusTrunkGeometry({
      edges,
      jobs: busGroupJobs,
      trunk,
      layoutDirection,
      getNodeRect,
      isManyToOne,
      hubPortConflict: hasPortConflict,
      peerGroupKeyOverride: `${isManyToOne ? 'm2o' : 'o2m'}:${hubId}:${side}`,
      hubPortSlot,
      trunkPortTangent,
    });
  }
};

export const assignBusRoutingMetadata = (
  jobs: PathFindingJob[],
  graph: SharedGraphContext,
  callbacks: BusRoutingDebugCallbacks = {},
): void => {
  const context = prepareBusRoutingContext(jobs, graph);
  const config = createDefaultRoutingConfig();
  const trunkCalculator = new TrunkCalculator();
  const occupiedOutgoingPorts = new Map<
    string,
    Map<string, HubPortGroupInfo>
  >();

  for (const [sourceId, groupJobs] of context.sourceGroups) {
    const busJobs = groupJobs.filter(job => job.isOneToMany);
    if (busJobs.length === 0) continue;
    processBusRoutingGroup({
      hubId: sourceId,
      busGroupJobs: busJobs,
      globalPeers: context.outgoingByNode.get(sourceId) ?? [],
      getNodeRect: context.getNodeRect,
      trunkCalculator,
      config,
      layoutDirection: context.layoutDirection,
      isManyToOne: false,
      obstacles: context.trunkObstacles,
      ...callbacks,
    });
    const usedPorts = collectHubPortGroups(busJobs);
    if (usedPorts.size > 0) occupiedOutgoingPorts.set(sourceId, usedPorts);
  }

  for (const [targetId, groupJobs] of context.targetGroups) {
    const busJobs = groupJobs.filter(job => job.isManyToOne);
    if (busJobs.length === 0) {
      assignNonBusIncomingIndices(groupJobs);
      continue;
    }
    processBusRoutingGroup({
      hubId: targetId,
      busGroupJobs: busJobs,
      globalPeers: context.incomingByNode.get(targetId) ?? [],
      getNodeRect: context.getNodeRect,
      trunkCalculator,
      config,
      layoutDirection: context.layoutDirection,
      isManyToOne: true,
      obstacles: context.trunkObstacles,
      hubUsedPorts: occupiedOutgoingPorts.get(targetId),
      ...callbacks,
    });
  }
};

import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { diagramConfigManager } from '../../components/config/DiagramConfig';
import { LayeredConfigManager } from '../../config/LayeredConfigManager';
import { safeLog } from '../consoleCleanup';
import {
  centerSubGroupChildrenHorizontallyWithConfig,
  centerSubGroupChildrenVerticallyWithConfig,
  enforceSubGroupChildrenLayoutStrictWithConfig,
  leftAlignSubGroupChildrenHorizontallyWithConfig,
} from './subGroupChildAlignment';
import { resolveSubGroupChildrenOverlapsWithConfig } from './subGroupChildOverlapResolution';
import {
  enforceSubGroupStrictContainmentWithConfig,
  expandSubGroupContainersBySemanticWithConfig,
} from './subGroupContainerBounds';
import { recomputeSubGroupContainersWithConfig } from './subGroupContainerRecompute';
import { splitDenseRowsInSubGroupsWithConfig } from './subGroupDenseRowLayout';
import {
  centerSubGroupsInDomainWithConfig,
  expandSubGroupsToDomainWidthWithConfig,
  stackSubGroupsVerticallyWithConfig,
  unifySubGroupLeftAnchorsWithConfig,
} from './subGroupDomainAlignment';
import {
  equalizeSubGroupMarginsByProjectionWithConfig,
  unifySubGroupHeightsByDomainWithConfig,
  unifySubGroupWidthsByDomainWithConfig,
} from './subGroupDomainNormalization';
import { reflowSubGroupChildrenDagreWithConfig } from './subGroupDagreLayout';
import {
  resolveSubGroupChildrenOverlapWithD3ForceWithConfig,
  resolveSubGroupsOverlapWithD3ForceWithConfig,
} from './subGroupForceOverlap';
import { unifySubGroupGapsInDomainWithConfig } from './subGroupGapNormalization';
import {
  enforceSubGroupTitleClearanceWithConfig,
  syncDagreChildPositionsWithConfig,
} from './subGroupLayoutPostProcessing';
import {
  finalizeSubGroupHeightsByProjectionPreserveAnchorWithConfig,
  finalizeSubGroupHeightsByProjectionWithConfig,
  finalizeSubGroupWidthsByProjectionPreserveAnchorWithConfig,
  writeSubGroupChildrenRelativeOffsetsWithConfig,
} from './subGroupProjection';
import {
  rankSnapDomainFreeNodesWithConfig,
  rankSnapSubGroupChildrenWithConfig,
} from './rankSnapLayout';
import {
  snapFreeNodesToRowsInDomainWithConfig,
  snapSubGroupChildrenToRowsWithConfig,
} from './rowSnapLayout';
import { scaleDomainContentToFitWidthWithConfig } from './domainContentScaling';

const layoutConfig = () => diagramConfigManager.getLayoutConfig();
const diagramConfig = () => diagramConfigManager.getConfig();

export const snapFreeNodesToRowsInDomain = (
  nodes: ReactFlowNode[],
  noClamp = false,
): ReactFlowNode[] => snapFreeNodesToRowsInDomainWithConfig(
  nodes,
  noClamp,
  layoutConfig(),
  diagramConfig(),
);

export const snapSubGroupChildrenToRowsStrict = (
  nodes: ReactFlowNode[],
  noClamp = false,
): ReactFlowNode[] => snapSubGroupChildrenToRowsWithConfig(
  nodes,
  noClamp,
  layoutConfig(),
  diagramConfig(),
);

export const rankSnapSubGroupChildren = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => rankSnapSubGroupChildrenWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const rankSnapDomainFreeNodes = (
  nodes: ReactFlowNode[],
  noClamp = false,
): ReactFlowNode[] => rankSnapDomainFreeNodesWithConfig(
  nodes,
  noClamp,
  layoutConfig(),
  diagramConfig(),
);

export const resolveSubGroupChildrenOverlapWithD3Force = (
  nodes: ReactFlowNode[],
  iterations = 160,
  strength = 0.6,
): ReactFlowNode[] => resolveSubGroupChildrenOverlapWithD3ForceWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
  iterations,
  strength,
);

export const resolveSubGroupsOverlapWithD3Force = (
  nodes: ReactFlowNode[],
  iterations = 100,
  strength = 0.5,
): ReactFlowNode[] => resolveSubGroupsOverlapWithD3ForceWithConfig(
  nodes,
  layoutConfig(),
  iterations,
  strength,
);

export const splitDenseRowsInSubGroupsAdaptive = (
  nodes: ReactFlowNode[],
  maxPerRow?: number,
): ReactFlowNode[] => splitDenseRowsInSubGroupsWithConfig(
  nodes,
  maxPerRow,
  layoutConfig(),
  diagramConfig(),
);

export const expandSubGroupContainersBySemantic = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => expandSubGroupContainersBySemanticWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const enforceSubGroupStrictContainmentByChildren = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => enforceSubGroupStrictContainmentWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const recomputeSubGroupContainersBasic = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => recomputeSubGroupContainersWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
  { logger: safeLog },
);

export const unifySubGroupGapsInDomain = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number,
  customSort?: (a: ReactFlowNode, b: ReactFlowNode) => number,
): ReactFlowNode[] => unifySubGroupGapsInDomainWithConfig(
  nodes,
  gapHOverride,
  gapVOverride,
  customSort,
  layoutConfig(),
  diagramConfig(),
);

export const unifySubGroupHeightsByDomain = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => unifySubGroupHeightsByDomainWithConfig(nodes);

export const resolveSubGroupChildrenOverlapsStrict = (
  nodes: ReactFlowNode[],
  gapHOverride?: number,
  gapVOverride?: number,
): ReactFlowNode[] => resolveSubGroupChildrenOverlapsWithConfig(
  nodes,
  gapHOverride,
  gapVOverride,
  layoutConfig(),
  diagramConfig(),
);

export const centerSubGroupChildrenHorizontally = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => centerSubGroupChildrenHorizontallyWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const leftAlignSubGroupChildrenHorizontally = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => leftAlignSubGroupChildrenHorizontallyWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const finalizeSubGroupHeightsByProjection = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => finalizeSubGroupHeightsByProjectionWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const finalizeSubGroupHeightsByProjectionPreserveAnchor = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => finalizeSubGroupHeightsByProjectionPreserveAnchorWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const finalizeSubGroupWidthsByProjectionPreserveAnchor = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => finalizeSubGroupWidthsByProjectionPreserveAnchorWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const writeSubGroupChildrenRelativeOffsets = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => writeSubGroupChildrenRelativeOffsetsWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const reflowSubGroupChildrenDagre = (
  subGroup: ReactFlowNode,
  nodes: ReactFlowNode[],
  horizontalGap: number,
  verticalGap: number,
  globalEdges: Edge[],
  direction: 'TB' | 'LR' = 'TB',
): ReactFlowNode[] => reflowSubGroupChildrenDagreWithConfig(
  subGroup,
  nodes,
  horizontalGap,
  verticalGap,
  globalEdges,
  direction,
  layoutConfig(),
  diagramConfig(),
  { logger: safeLog },
);

export const syncDagreChildPositions = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => syncDagreChildPositionsWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
  {
    onNearTitleBoundary: (childId, innerTop) => safeLog.warn(
      `[DAGRE-SYNC-ALERT] Child ${childId} is very close to innerTop (${innerTop}). Overlap risk!`,
    ),
  },
);

export const enforceSubGroupTitleClearance = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => enforceSubGroupTitleClearanceWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const unifySubGroupLeftAnchors = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => unifySubGroupLeftAnchorsWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const stackSubGroupsVertically = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => stackSubGroupsVerticallyWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const expandSubGroupsToDomainWidth = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => expandSubGroupsToDomainWidthWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

export const scaleDomainContentToFitWidth = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => scaleDomainContentToFitWidthWithConfig(
  nodes,
  diagramConfig(),
);

export const centerSubGroupsInDomain = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => centerSubGroupsInDomainWithConfig(nodes, diagramConfig());

export const unifySubGroupWidthsByDomain = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => unifySubGroupWidthsByDomainWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
  LayeredConfigManager.getInstance().get<string>(
    'diagram.layout.subGroupAlign',
    'center',
  ),
);

export const scaleDomainContentToFitWidthAll = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => scaleDomainContentToFitWidthWithConfig(
  nodes,
  diagramConfig(),
  { syncLegacyWidth: true },
);

export const equalizeSubGroupMarginsByProjection = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => equalizeSubGroupMarginsByProjectionWithConfig(
  nodes,
  diagramConfig(),
);

export const enforceSubGroupChildrenLayoutStrict = (
  nodes: ReactFlowNode[],
  layout: 'horizontal' | 'vertical' | 'grid' | 'centered',
): ReactFlowNode[] => enforceSubGroupChildrenLayoutStrictWithConfig(
  nodes,
  layout,
  layoutConfig(),
  diagramConfig(),
);

export const centerSubGroupChildrenVertically = (
  nodes: ReactFlowNode[],
): ReactFlowNode[] => centerSubGroupChildrenVerticallyWithConfig(
  nodes,
  layoutConfig(),
  diagramConfig(),
);

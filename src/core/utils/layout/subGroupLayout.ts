/**
 * Compatibility facade for subgroup layout stages.
 *
 * Keep this module free of layout implementation so callers retain a stable
 * import path while each algorithm remains independently testable.
 */
export {
  centerSubGroupChildrenHorizontally,
  centerSubGroupChildrenVertically,
  centerSubGroupsInDomain,
  enforceSubGroupChildrenLayoutStrict,
  enforceSubGroupStrictContainmentByChildren,
  enforceSubGroupTitleClearance,
  equalizeSubGroupMarginsByProjection,
  expandSubGroupContainersBySemantic,
  expandSubGroupsToDomainWidth,
  finalizeSubGroupHeightsByProjection,
  finalizeSubGroupHeightsByProjectionPreserveAnchor,
  finalizeSubGroupWidthsByProjectionPreserveAnchor,
  leftAlignSubGroupChildrenHorizontally,
  rankSnapDomainFreeNodes,
  rankSnapSubGroupChildren,
  recomputeSubGroupContainersBasic,
  reflowSubGroupChildrenDagre,
  resolveSubGroupChildrenOverlapWithD3Force,
  resolveSubGroupChildrenOverlapsStrict,
  resolveSubGroupsOverlapWithD3Force,
  scaleDomainContentToFitWidth,
  scaleDomainContentToFitWidthAll,
  snapFreeNodesToRowsInDomain,
  snapSubGroupChildrenToRowsStrict,
  splitDenseRowsInSubGroupsAdaptive,
  stackSubGroupsVertically,
  syncDagreChildPositions,
  unifySubGroupGapsInDomain,
  unifySubGroupHeightsByDomain,
  unifySubGroupLeftAnchors,
  unifySubGroupWidthsByDomain,
  writeSubGroupChildrenRelativeOffsets,
} from './subGroupLayoutConfiguredFacade';

export {
  enforceGlobalNoOverlapStrict,
  layoutNodesByGhostDomainColumns,
  resolveAllNodeOverlapsGlobal,
  resolveFreeNodeOverlapsInDomain,
} from './subGroupGlobalLayout';

export {
  countSubGroupOverlapsByDomain,
  enforceDomainNoOverlapStrict,
  laneGridPackByDomain,
  packDomainNodesGrid,
  packSubGroupsInDomain,
  strengthenDomainsAggressive,
} from './subGroupDomainPacking';

export {
  enforceSubGroupNoOverlapStrict,
  equalizeSubGroupVerticalMarginsByProjection,
  fitSubGroupsToDomainSymmetric,
  packSubGroupChildrenGridStrict,
  packSubGroupsVerticallySymmetric,
  resolveSubGroupOverlaps,
  strengthenSubGroupsInDomainWithGridStrict,
  unifySubGroupLeftAnchorsStrict,
} from './subGroupStrictPacking';

export {
  packSubGroupChildrenRigid,
  reflowSubGroupChildrenGrid,
  reflowSubGroupChildrenVertical,
} from './subGroupChildPacking';

export {
  alignSubGroupGridRows,
  alignSubGroupStack,
  layoutSubGroupChildrenFlow,
  layoutSubGroupChildrenInRow,
} from './subGroupChildAlignment';

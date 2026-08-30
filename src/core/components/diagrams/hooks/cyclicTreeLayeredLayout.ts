import type { Edge, Node } from '@xyflow/react';

import type { LayoutOptions } from '../../../types/layout';
import type { LayoutCalculationContext } from '../../../types/layout-strategy';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';
import { isLayoutRoutingHardQualityRejection } from './legacyDomainLayoutFallback';
import { preserveEdgesOnEmptyLayoutResult } from './layoutEdgeBoundary';
import {
  LAYERED_TREE_ROUTING_SPACING,
  loadDomainCompoundElkStrategy,
  loadDomainElkStrategy,
} from './layoutStrategyRuntime';
import {
  resolveLayoutStrategyGeneratedGroupOptions,
  stripHiddenGeneratedLayoutNodes,
} from './layoutStrategyInputBoundary';
import { prepareLayeredLayoutEdges } from './layeredLayoutEdgePreparation';
import { calculateLayeredLayoutWithReverse } from './reverseLayeredLayoutGeometry';

type CyclicTreeLayeredLayoutInput = Readonly<{
  layoutNodes: Node[];
  layoutEdges: Edge[];
  allNodes: Node[];
  nonLayoutTypes: ReadonlySet<string>;
  direction: FlowchartLayoutDirection;
  context?: LayoutCalculationContext;
}>;

type CyclicTreeLayeredLayoutResult = Readonly<{
  nodes: Node[];
  edges: Edge[];
}>;

type CyclicTreeLayeredLayoutCommit = (
  candidate: CyclicTreeLayeredLayoutResult,
  usedCompoundFallback: boolean,
) => Promise<void>;

const calculateCandidate = async (
  input: CyclicTreeLayeredLayoutInput,
  compound: boolean,
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  const strategy = compound
    ? await loadDomainCompoundElkStrategy()
    : await loadDomainElkStrategy();
  const calculated = await calculateLayeredLayoutWithReverse(
    strategy,
    input.layoutNodes,
    input.layoutEdges,
    {
      type: 'elk-layered' as LayoutOptions['type'],
      direction: input.direction,
      nodeLayout: 'elk-layered' as LayoutOptions['nodeLayout'],
      spacing: {
        horizontal: LAYERED_TREE_ROUTING_SPACING.nodeSpacing,
        vertical: LAYERED_TREE_ROUTING_SPACING.levelSpacing,
      },
      edgeRouting: 'ORTHOGONAL',
      padding: { top: 40, right: 20, bottom: 20, left: 20 },
    },
    input.direction,
    compound,
    input.context,
  );
  const resultIds = new Set(calculated.nodes.map(node => node.id));
  const preservedNodes = input.allNodes.filter(node => (
    input.nonLayoutTypes.has(node.type || '') && !resultIds.has(node.id)
  ));
  const nodes = compound
    ? stripHiddenGeneratedLayoutNodes(
      [...calculated.nodes, ...preservedNodes],
      resolveLayoutStrategyGeneratedGroupOptions(undefined, input.allNodes),
    )
    : [...calculated.nodes, ...preservedNodes];
  const nodeIds = new Set(nodes.map(node => node.id));
  return {
    nodes,
    edges: prepareLayeredLayoutEdges(
      nodes,
      preserveEdgesOnEmptyLayoutResult(input.layoutEdges, calculated.edges, nodeIds),
      input.direction,
    ),
  };
};

export const commitCyclicTreeLayeredLayout = async (
  input: CyclicTreeLayeredLayoutInput,
  commit: CyclicTreeLayeredLayoutCommit,
): Promise<void> => {
  const flat = await calculateCandidate(input, false);
  try {
    await commit(flat, false);
  } catch (error) {
    if (!isLayoutRoutingHardQualityRejection(error)) throw error;
    await commit(await calculateCandidate(input, true), true);
  }
};

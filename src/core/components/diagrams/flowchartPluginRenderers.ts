import type { EdgeTypes, NodeTypes } from '@xyflow/react';

import type { DiagramTypePlugin } from '../../types/plugin';
import CustomNode from '../custom-nodes/CustomNode';
import FlowchartNode from '../custom-nodes/FlowchartNode';
import ArrowTimelineNode from './nodes/ArrowTimelineNode';
import MindMapEdge from '../edges/MindMapEdge';
import { RelationshipEdge } from '../custom-edges/RelationshipEdge';
import { createStableFlowchartRendererMapResolver } from './flowchartPluginRuntimeModel';
import { createLazyNodeRenderer } from './lazyNodeRenderer';

type EdgeRendererTypes = EdgeTypes;
type FlowchartRendererPlugin = Pick<DiagramTypePlugin, 'getNodeTypes' | 'getEdgeTypes'>;

const TitleGroupNode = createLazyNodeRenderer(() => import('../custom-nodes/TitleGroupNode'));
const SubGroupNode = createLazyNodeRenderer(() => import('../custom-nodes/SubGroupNode'));
const IconNode = createLazyNodeRenderer(() => import('../custom-nodes/IconNode'));
const SwimLaneNode = createLazyNodeRenderer(() => import('../custom-nodes/SwimLaneNode'));
const StickyNoteNode = createLazyNodeRenderer(() => import('../custom-nodes/StickyNoteNode'));
const MindMapNode = createLazyNodeRenderer(() => import('../custom-nodes/MindMapNode'));
const MindMapBoundaryNode = createLazyNodeRenderer(() => import('../custom-nodes/MindMapBoundaryNode'));
const CommentNode = createLazyNodeRenderer(() => import('../custom-nodes/CommentNode'));
const ERDatabaseNode = createLazyNodeRenderer(() => import('../custom-nodes/ERDatabaseNode'));
const FreehandNode = createLazyNodeRenderer(() => import('../custom-nodes/FreehandNode'));

const DEFAULT_NODE_TYPES: NodeTypes = {
    custom: CustomNode,
    titleGroup: TitleGroupNode,
    subGroup: SubGroupNode,
    flowchart: FlowchartNode,
    swimlane: SwimLaneNode,
    mindmap: MindMapNode,
    'mindmap-boundary': MindMapBoundaryNode,
    'sticky-note': StickyNoteNode,
    arrowTimeline: ArrowTimelineNode,
    timeline: ArrowTimelineNode,
    timelineNode: ArrowTimelineNode,
    iconNode: IconNode,
    erNode: ERDatabaseNode,
    'vizly:comment': CommentNode,
    freehand: FreehandNode,
    system: CustomNode,
    actor: CustomNode,
    process: CustomNode,
    notification: CustomNode,
};

const DEFAULT_EDGE_TYPES: EdgeRendererTypes = {
    mindmapEdge: MindMapEdge,
    relationshipEdge: RelationshipEdge,
};

export const getStableFlowchartPluginNodeTypes = createStableFlowchartRendererMapResolver<
    FlowchartRendererPlugin,
    NodeTypes[string]
>(DEFAULT_NODE_TYPES, plugin => plugin.getNodeTypes());

export const getStableFlowchartPluginEdgeTypes = createStableFlowchartRendererMapResolver<
    FlowchartRendererPlugin,
    EdgeRendererTypes[string]
>(DEFAULT_EDGE_TYPES, plugin => plugin.getEdgeTypes());

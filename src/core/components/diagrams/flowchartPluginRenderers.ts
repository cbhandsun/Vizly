import type { ComponentType } from 'react';
import type { NodeTypes } from '@xyflow/react';

import type { DiagramTypePlugin } from '../../types/plugin';
import CustomNode from '../custom-nodes/CustomNode';
import TitleGroupNode from '../custom-nodes/TitleGroupNode';
import SubGroupNode from '../custom-nodes/SubGroupNode';
import FlowchartNode from '../custom-nodes/FlowchartNode';
import IconNode from '../custom-nodes/IconNode';
import SwimLaneNode from '../custom-nodes/SwimLaneNode';
import StickyNoteNode from '../custom-nodes/StickyNoteNode';
import MindMapNode from '../custom-nodes/MindMapNode';
import MindMapBoundaryNode from '../custom-nodes/MindMapBoundaryNode';
import CommentNode from '../custom-nodes/CommentNode';
import ArrowTimelineNode from './nodes/ArrowTimelineNode';
import ERDatabaseNode from '../custom-nodes/ERDatabaseNode';
import MindMapEdge from '../edges/MindMapEdge';
import { RelationshipEdge } from '../custom-edges/RelationshipEdge';
import { createStableFlowchartRendererMapResolver } from './flowchartPluginRuntimeModel';

type EdgeRendererTypes = Record<string, ComponentType<any>>;
type FlowchartRendererPlugin = Pick<DiagramTypePlugin, 'getNodeTypes' | 'getEdgeTypes'>;

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
    timelineNode: ArrowTimelineNode,
    iconNode: IconNode,
    erNode: ERDatabaseNode,
    'vizly:comment': CommentNode,
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

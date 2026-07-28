import React from 'react';
import { Node, Edge, BackgroundVariant, ReactFlowInstance, SelectionMode, NodeTypes, EdgeTypes, NodeChange, EdgeChange, Connection, OnConnectStart, OnConnectEnd, ConnectionMode, ConnectionLineType, type IsValidConnection, type OnNodeDrag, type OnReconnect } from '@xyflow/react';
import BaseReactFlow from '../shared/BaseReactFlow';
import { useConnectionMicrointeractions } from './hooks/useConnectionMicrointeractions';
import { shouldUseScopedDesignerDragPerformanceMode } from './hooks/designerSystemSyncPersistence';
import {
    useFlowchartDragBuffer,
    type SmartNodeDragHandler,
} from './hooks/useFlowchartDragBuffer';

export interface FlowchartCanvasShellProps {
    nodes: Node[];
    displayEdges: Edge[];
    nodeTypes: NodeTypes;
    edgeTypes?: EdgeTypes; // [NEW] Allows custom edge types
    onInit: (instance: ReactFlowInstance) => void;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    onConnectStart: OnConnectStart;
    onConnectEnd: OnConnectEnd;
    autoRoutingEnabled: boolean;
    enableSmartEdges: boolean; // ⭐ 必须传递，否则BaseReactFlow不会注册自定义edge组件
    showMinimap: boolean;
    showGrid: boolean;
    gridVariant: BackgroundVariant;
    onNodeDrag: OnNodeDrag<Node>;
    onSmartNodeDrag?: SmartNodeDragHandler;
    onNodeDragStart: OnNodeDrag<Node>;
    onNodeDragStop?: OnNodeDrag<Node>;
    onSelectionChange: (params: { nodes: Node[]; edges: Edge[] }) => void;
    onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
    onPaneClick: () => void;
    onPaneDoubleClick: (event: React.MouseEvent | MouseEvent) => void;
    onPaneMouseMove?: (event: React.MouseEvent) => void;
    onPaneMouseLeave?: (event: React.MouseEvent) => void;
    onNodeClick?: (event: React.MouseEvent, node: Node) => void;
    onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
    onEdgeDoubleClick?: (event: React.MouseEvent, edge: Edge) => void;
    selectionMode: SelectionMode;
    onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
    onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
    onPaneContextMenu: (event: React.MouseEvent | MouseEvent) => void;
    isSpacePressed: boolean;
    isConnecting: boolean;
    connectPreview: ReturnType<typeof useConnectionMicrointeractions>['connectPreview'];
    connectionMode: ConnectionMode;
    isDragging: boolean;
    isValidConnection?: IsValidConnection<Edge>;
    disableZoomCompensation?: boolean;
    selectionOnDrag?: boolean;
    panOnDrag?: boolean;
    nodesDraggable?: boolean;
    nodesConnectable?: boolean;
    snapEnabled?: boolean;
    edgesReconnectable?: boolean;
    onReconnect?: OnReconnect;
    onReconnectStart?: (event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent, edge: Edge, handleType: 'source' | 'target') => void;
    onReconnectEnd?: (event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent, edge: Edge) => void;
    backgroundGridColor?: string;
    children?: React.ReactNode;
}

export const FlowchartCanvasShell: React.FC<FlowchartCanvasShellProps> = React.memo(({
    nodes,
    displayEdges,
    nodeTypes,
    edgeTypes,
    onInit,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    enableSmartEdges,
    showMinimap,
    showGrid,
    gridVariant,
    onNodeDrag,
    onSmartNodeDrag,
    onNodeDragStart,
    onNodeDragStop,
    onSelectionChange,
    onViewportChange,
    onPaneClick,
    onPaneDoubleClick,
    onPaneMouseMove,
    onPaneMouseLeave,
    onNodeClick,
    onEdgeClick,
    onEdgeDoubleClick,
    selectionMode,
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
    isSpacePressed,
    isConnecting,
    connectPreview,
    connectionMode,
    isDragging,
    snapEnabled,
    isValidConnection,
    disableZoomCompensation,
    selectionOnDrag,
    panOnDrag,
    nodesDraggable,
    nodesConnectable,
    edgesReconnectable,
    onReconnect,
    onReconnectStart,
    onReconnectEnd,
    backgroundGridColor,
    children
}) => {
    const {
        canvasNodes,
        handleNodeDrag,
        handleNodesChange,
        handleNodeDragStart,
        handleNodeDragStop,
    } = useFlowchartDragBuffer({
        nodes,
        onNodesChange,
        onNodeDrag,
        onNodeDragStart,
        onNodeDragStop,
        onSmartNodeDrag,
    });
    const connectionLineStyle = isConnecting ? {
        stroke: connectPreview ? 'rgba(16, 185, 129, 0.95)' : 'rgba(59, 130, 246, 0.95)',
        strokeWidth: connectPreview ? 3.5 : 2.5,
        strokeDasharray: connectPreview ? '0' : '4 4'
    } : undefined;
    return (
        <BaseReactFlow
            onInit={onInit}
            nodes={canvasNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            fitMode="none"
            fitPadding={0.1}
            pinFit={false}
            style={{ width: '100%', height: '100%' }}
            enableSmartEdges={enableSmartEdges}
            showControls={false}
            showMiniMap={showMinimap}
            backgroundGridColor={backgroundGridColor || "rgba(148,163,184,0.4)"}
            backgroundVariant={gridVariant}
            backgroundGap={24}
            showBackgroundGrid={showGrid}
            onNodeDrag={handleNodeDrag}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onSelectionChange={onSelectionChange}
            onViewportChange={onViewportChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onPaneClick={onPaneClick}
            onPaneDoubleClick={onPaneDoubleClick}
            onPaneMouseMove={onPaneMouseMove}
            onPaneMouseLeave={onPaneMouseLeave}
            selectionMode={selectionMode}
            connectionRadius={44}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            panOnDrag={panOnDrag !== undefined ? panOnDrag : isSpacePressed}
            selectionOnDrag={selectionOnDrag}
            connectionMode={connectionMode}
            connectionLineStyle={connectionLineStyle}
            connectionLineType={ConnectionLineType.SmoothStep}
            flowClassName={shouldUseScopedDesignerDragPerformanceMode(canvasNodes.length, isDragging)
                ? 'performance-mode'
                : undefined}
            snapToGrid={snapEnabled}
            snapGrid={[12, 12]}
            isValidConnection={isValidConnection}
            disableZoomCompensation={disableZoomCompensation}
            nodesDraggable={nodesDraggable}
            nodesConnectable={nodesConnectable}
            edgesReconnectable={edgesReconnectable}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
        >
            {children}
        </BaseReactFlow>
    );
});

FlowchartCanvasShell.displayName = 'FlowchartCanvasShell';

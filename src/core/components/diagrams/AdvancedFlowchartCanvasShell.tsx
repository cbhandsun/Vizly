import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Node, Edge, BackgroundVariant, ReactFlowInstance, SelectionMode, NodeTypes, EdgeTypes, NodeChange, EdgeChange, Connection, OnConnectStart, OnConnectEnd, ConnectionMode, ConnectionLineType, type IsValidConnection, type OnNodeDrag, type OnReconnect } from '@xyflow/react';
import BaseReactFlow from '../shared/BaseReactFlow';
import { useConnectionMicrointeractions } from './hooks/useConnectionMicrointeractions';
import { shouldUseScopedDesignerDragPerformanceMode } from './hooks/designerSystemSyncPersistence';
import {
    useFlowchartDragBuffer,
    type SmartNodeDragHandler,
} from './hooks/useFlowchartDragBuffer';
import { addFlowchartAccessibilityLabels } from './flowchartCanvasAccessibility';
import {
    buildShiftEdgeMultiSelectionChanges,
    buildShiftMultiSelectionChanges,
} from './flowchartMultiSelection';
import { getFlowchartMarqueeEdges } from './flowchartMarqueeInteraction';
import { bindBaseReactFlowRendererAssistiveVisibility } from '../shared/baseReactFlowAssistiveVisibility';

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
    editingEnabled?: boolean;
    snapEnabled?: boolean;
    edgesReconnectable?: boolean;
    onReconnect?: OnReconnect;
    onReconnectStart?: (event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent, edge: Edge, handleType: 'source' | 'target') => void;
    onReconnectEnd?: (event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent, edge: Edge) => void;
    onDisplayRoutingFinalApplied?: () => void;
    backgroundGridColor?: string;
    viewportPersistenceKey?: string;
    defaultCanvasHiddenFromAssistiveTech?: boolean;
    children?: React.ReactNode;
}

export const AdvancedFlowchartCanvasShell: React.FC<FlowchartCanvasShellProps> = React.memo(({
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
    editingEnabled = true,
    edgesReconnectable,
    onReconnect,
    onReconnectStart,
    onReconnectEnd,
    onDisplayRoutingFinalApplied,
    backgroundGridColor,
    viewportPersistenceKey,
    defaultCanvasHiddenFromAssistiveTech = false,
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
    const renderedNodes = useMemo(
        () => editingEnabled
            ? canvasNodes
            : canvasNodes.map(node => node.selected ? { ...node, selected: false } : node),
        [canvasNodes, editingEnabled],
    );
    const renderedEdges = useMemo(() => {
        if (!editingEnabled) {
            return displayEdges.map(edge => edge.selected ? { ...edge, selected: false } : edge);
        }
        return getFlowchartMarqueeEdges(displayEdges, selectionOnDrag === true);
    }, [displayEdges, editingEnabled, selectionOnDrag]);
    const accessibleElements = useMemo(
        () => addFlowchartAccessibilityLabels(renderedNodes, renderedEdges),
        [renderedEdges, renderedNodes],
    );
    const shiftSelectionFrameRef = useRef<number | null>(null);
    const canvasRootRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => bindBaseReactFlowRendererAssistiveVisibility(
            canvasRootRef.current,
            defaultCanvasHiddenFromAssistiveTech,
        ), [defaultCanvasHiddenFromAssistiveTech]);
    useEffect(() => () => {
        if (shiftSelectionFrameRef.current !== null) {
            cancelAnimationFrame(shiftSelectionFrameRef.current);
        }
    }, []);
    const connectionLineStyle = isConnecting ? {
        stroke: connectPreview ? 'rgba(16, 185, 129, 0.95)' : 'rgba(59, 130, 246, 0.95)',
        strokeWidth: connectPreview ? 3.5 : 2.5,
        strokeDasharray: connectPreview ? '0' : '4 4'
    } : undefined;
    const handleCanvasNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (!editingEnabled) return;
        if (event.shiftKey) {
            const selectionChanges = buildShiftMultiSelectionChanges(canvasNodes, node.id);
            if (selectionChanges.length > 0) {
                if (shiftSelectionFrameRef.current !== null) {
                    cancelAnimationFrame(shiftSelectionFrameRef.current);
                }
                shiftSelectionFrameRef.current = requestAnimationFrame(() => {
                    shiftSelectionFrameRef.current = null;
                    handleNodesChange(selectionChanges);
                });
            }
        }
        onNodeClick?.(event, node);
    }, [canvasNodes, editingEnabled, handleNodesChange, onNodeClick]);
    const handleCanvasEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        if (!editingEnabled) return;
        if (event.shiftKey) {
            const selectionChanges = buildShiftEdgeMultiSelectionChanges(displayEdges, edge.id);
            if (selectionChanges.length > 0) {
                if (shiftSelectionFrameRef.current !== null) {
                    cancelAnimationFrame(shiftSelectionFrameRef.current);
                }
                shiftSelectionFrameRef.current = requestAnimationFrame(() => {
                    shiftSelectionFrameRef.current = null;
                    onEdgesChange(selectionChanges);
                });
            }
        }
        onEdgeClick?.(event, edge);
    }, [displayEdges, editingEnabled, onEdgeClick, onEdgesChange]);
    return (
      <div ref={canvasRootRef} style={{ width: '100%', height: '100%' }}>
        <BaseReactFlow
            onInit={onInit}
            nodes={accessibleElements.nodes}
            edges={accessibleElements.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={editingEnabled ? handleNodesChange : undefined}
            onEdgesChange={editingEnabled ? onEdgesChange : undefined}
            onConnect={editingEnabled ? onConnect : undefined}
            onConnectStart={editingEnabled ? onConnectStart : undefined}
            onConnectEnd={editingEnabled ? onConnectEnd : undefined}
            fitMode="restoreOrFitAll"
            fitPadding={0.1}
            pinFit={false}
            viewportPersistenceKey={viewportPersistenceKey}
            style={{ width: '100%', height: '100%' }}
            enableSmartEdges={enableSmartEdges}
            showControls={false}
            showMiniMap={showMinimap}
            backgroundGridColor={backgroundGridColor || "rgba(148,163,184,0.4)"}
            backgroundVariant={gridVariant}
            backgroundGap={24}
            showBackgroundGrid={showGrid}
            onNodeDrag={editingEnabled ? handleNodeDrag : undefined}
            onNodeDragStart={editingEnabled ? handleNodeDragStart : undefined}
            onNodeDragStop={editingEnabled ? handleNodeDragStop : undefined}
            onSelectionChange={editingEnabled ? onSelectionChange : undefined}
            onViewportChange={onViewportChange}
            onNodeClick={handleCanvasNodeClick}
            onEdgeClick={handleCanvasEdgeClick}
            onEdgeDoubleClick={editingEnabled ? onEdgeDoubleClick : undefined}
            onPaneClick={onPaneClick}
            onPaneDoubleClick={editingEnabled ? onPaneDoubleClick : undefined}
            onPaneMouseMove={onPaneMouseMove}
            onPaneMouseLeave={onPaneMouseLeave}
            selectionMode={selectionMode}
            connectionRadius={44}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            panOnDrag={editingEnabled ? (panOnDrag !== undefined ? panOnDrag : isSpacePressed) : true}
            selectionOnDrag={editingEnabled ? selectionOnDrag : false}
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
            nodesDraggable={editingEnabled ? nodesDraggable : false}
            nodesConnectable={editingEnabled ? nodesConnectable : false}
            elementsSelectable={editingEnabled}
            nodesFocusable={editingEnabled && !defaultCanvasHiddenFromAssistiveTech}
            edgesFocusable={editingEnabled && !defaultCanvasHiddenFromAssistiveTech}
            multiSelectionKeyCode={null}
            edgesReconnectable={editingEnabled ? edgesReconnectable : false}
            onReconnect={editingEnabled ? onReconnect : undefined}
            onReconnectStart={editingEnabled ? onReconnectStart : undefined}
            onReconnectEnd={editingEnabled ? onReconnectEnd : undefined}
            onDisplayRoutingFinalApplied={onDisplayRoutingFinalApplied}
        >
            {children}
        </BaseReactFlow>
      </div>
    );
});

AdvancedFlowchartCanvasShell.displayName = 'AdvancedFlowchartCanvasShell';

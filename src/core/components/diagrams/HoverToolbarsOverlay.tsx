import React, { useMemo } from 'react';
import { Node, useViewport, type Edge, type NodeTypes } from '@xyflow/react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { FloatingContextToolbar, type ToolbarFeature } from './FloatingContextToolbar';
import { ContextualEdgeToolbar } from './ContextualEdgeToolbar';
import { NodeDataUpdate, EdgeDataUpdate } from '../../types/diagram-updates';

interface HoverToolbarsOverlayProps {
    quickAddMenuVisible: boolean;
    isContextToolbarHidden: boolean;
    isConnecting?: boolean;
    nodeTypes: NodeTypes;
    pluginCtx?: import('../../types/plugin').PluginContext;
    activePlugin?: import('../../types/plugin').DiagramTypePlugin | null;
    
    // Node update actions
    updateNodesBatch: (nodeIds: string[], updates: NodeDataUpdate, options?: { snapshot?: boolean }) => void;
    updateEdgesBatch: (edgeIds: string[], updates: EdgeDataUpdate) => void;
    onUpdateNodes?: (updates: { id: string, position: { x: number, y: number } }[]) => void;
    
    // Commands
    handleDeleteWithToast: () => void;
    handleDuplicateWithToast: () => void;
    handleLock: () => void;
    handleOpacity: (opacity: number) => void;
    handleBringToFront: (id?: string) => void;
    handleSendToBack: (id?: string) => void;
    copyStyle: (node: Node) => void;
    pasteStyle: (ids: string[]) => void;
    hasCopiedStyle: boolean;
}

interface NodeToolbarExtensionProps {
    node: Node;
    updateNodesBatch: HoverToolbarsOverlayProps['updateNodesBatch'];
    onDelete: () => void;
    onDuplicate: () => void;
    onLock: () => void;
}

interface NodeToolbarMetadata {
    ToolbarExtension?: React.ElementType<NodeToolbarExtensionProps>;
    ToolbarFeatureExclusions?: ToolbarFeature[];
    OverrideDefaultToolbar?: boolean;
}

const readNodeToolbarMetadata = (nodeTypes: NodeTypes, node: Node | undefined): NodeToolbarMetadata => {
    if (!node?.type || !nodeTypes[node.type]) return {};
    const metadata = nodeTypes[node.type] as unknown as Record<string, unknown>;
    return {
        ToolbarExtension: metadata.ToolbarExtension as React.ElementType<NodeToolbarExtensionProps> | undefined,
        ToolbarFeatureExclusions: Array.isArray(metadata.ToolbarFeatureExclusions)
            ? metadata.ToolbarFeatureExclusions.filter((item): item is ToolbarFeature => typeof item === 'string')
            : undefined,
        OverrideDefaultToolbar: metadata.OverrideDefaultToolbar === true,
    };
};

export const HoverToolbarsOverlay: React.FC<HoverToolbarsOverlayProps> = ({
    quickAddMenuVisible,
    isContextToolbarHidden,
    isConnecting,
    updateNodesBatch,
    updateEdgesBatch,
    onUpdateNodes,
    handleDeleteWithToast,
    handleDuplicateWithToast,
    handleLock,
    handleOpacity,
    handleBringToFront,
    handleSendToBack,
    copyStyle,
    pasteStyle,
    hasCopiedStyle,
    nodeTypes,
    pluginCtx,
    activePlugin
}) => {
    const contextMenu = useDiagramStore((state) => state.contextMenu);
    const selectedNodes = useDiagramStore((state) => state.selectedNodes);
    const selectedEdges = useDiagramStore((state) => state.selectedEdges);
    const isDragging = useDiagramStore((state) => state.isDragging);
    // 🚀 P3 性能优化: 移除全局 useViewport，防止缩放/平移导致所有工具栏和父组件 (HoverToolbarsOverlay) 60FPS 重渲染
    
    // Hide global toolbar if a mindmap node is selected because they have their own integrated tool island
    const isMindMapSelected = selectedNodes.some((node) => node.type === 'mindmap');
    const nodeToolbar = readNodeToolbarMetadata(nodeTypes, selectedNodes.length === 1 ? selectedNodes[0] : undefined);

    return (
        <>
            {!contextMenu && !quickAddMenuVisible && !isDragging && !isConnecting && !isContextToolbarHidden && !isMindMapSelected && (
                <FloatingContextToolbar
                    selectedNodes={selectedNodes}
                    onUpdateNodes={onUpdateNodes!}
                    onDelete={handleDeleteWithToast}
                    onDuplicate={handleDuplicateWithToast}
                    onChangeColor={(color) => {
                        // Real-time preview (disable snapshot to prevent flooding the undo/redo stack)
                        updateNodesBatch(selectedNodes.map((node) => node.id), {
                            theme: { main: color, border: color, text: '#fff' }
                        }, { snapshot: false });
                    }}
                    onChangeColorComplete={(color) => {
                        // Commit the final color and take a single history snapshot
                        updateNodesBatch(selectedNodes.map((node) => node.id), {
                            theme: { main: color, border: color, text: '#fff' }
                        });
                    }}
                    onChangeShape={(shape) => {
                        updateNodesBatch(selectedNodes.map((node) => node.id), { shape });
                    }}
                    onChangeDomainClass={(domainClass) => {
                        updateNodesBatch(selectedNodes.map((node) => node.id), {
                            domainClass: domainClass === 'none' ? undefined : domainClass
                        });
                    }}

                    onLock={handleLock}
                    onOpacity={handleOpacity}
                    onBringToFront={() => handleBringToFront(selectedNodes[0]?.id)}
                    onSendToBack={() => handleSendToBack(selectedNodes[0]?.id)}
                    onUpdateStyle={(style) => {
                        updateNodesBatch(selectedNodes.map((node) => node.id), { style });
                    }}
                    extraToolbarContent={
                        (pluginCtx && activePlugin?.contributeHoverActions) ||
                        nodeToolbar.ToolbarExtension
                        ? (
                            <>
                                {pluginCtx && activePlugin?.contributeHoverActions && activePlugin.contributeHoverActions(selectedNodes, selectedEdges, pluginCtx)}
                                {nodeToolbar.ToolbarExtension && (
                                    React.createElement(nodeToolbar.ToolbarExtension, {
                                        node: selectedNodes[0],
                                        updateNodesBatch,
                                        onDelete: handleDeleteWithToast,
                                        onDuplicate: handleDuplicateWithToast,
                                        onLock: handleLock
                                    })
                                )}
                            </>
                        ) : undefined
                    }
                    excludeToolbarFeatures={
                        nodeToolbar.ToolbarFeatureExclusions
                    }
                    overrideDefaultToolbar={
                        nodeToolbar.OverrideDefaultToolbar
                    }
                    onCopyStyle={() => copyStyle(selectedNodes[0])}
                    onPasteStyle={() => pasteStyle(selectedNodes.map((node) => node.id))}
                    hasCopiedStyle={hasCopiedStyle}
                />
            )}

            {!contextMenu && !quickAddMenuVisible && !isDragging && !isConnecting &&
                selectedNodes.length === 0 && selectedEdges.length === 1 && (
                    <IsolatedEdgeToolbar
                        edge={selectedEdges[0]}
                        onUpdateEdge={(id, updates) => updateEdgesBatch([id], updates as EdgeDataUpdate)}
                    />
                )}
        </>
    );
};

// 封装独立组件，将 useViewport () 的 60FPS 重绘隔离到尽可能小的 DOM 树中
const IsolatedEdgeToolbar: React.FC<{ edge: Edge; onUpdateEdge: (id: string, updates: EdgeDataUpdate) => void }> = ({ edge, onUpdateEdge }) => {
    const nodes = useDiagramStore((state) => state.nodes);
    const viewport = useViewport();

    const position = useMemo(() => {
        const sourceNode = nodes.find((node) => node.id === edge.source);
        const targetNode = nodes.find((node) => node.id === edge.target);
        if(!sourceNode || !targetNode) return null;

        const sx = sourceNode.position.x + (sourceNode.measured?.width ?? 120) / 2;
        const sy = sourceNode.position.y + (sourceNode.measured?.height ?? 60) / 2;
        const tx = targetNode.position.x + (targetNode.measured?.width ?? 120) / 2;
        const ty = targetNode.position.y + (targetNode.measured?.height ?? 60) / 2;

        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;

        const screenX = mx * viewport.zoom + viewport.x;
        const screenY = my * viewport.zoom + viewport.y;

        return { x: screenX, y: screenY };
    }, [edge, viewport, nodes]);

    if (!position) return null;

    return (
        <div style={{
            position: 'absolute',
            zIndex: 1000,
            left: position.x,
            top: position.y,
            transform: 'translate(-50%, -100%)',
            paddingBottom: '16px', // give some visual clearance
            pointerEvents: 'none' // wrapper isn't clickable
        }} className="contextual-edge-toolbar-wrapper">
            <ContextualEdgeToolbar
                edge={edge}
                onUpdateEdge={onUpdateEdge}
            />
        </div>
    );
};

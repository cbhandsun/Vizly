import React, { Suspense, useLayoutEffect, useRef } from 'react';
import { Background, ReactFlow } from '@xyflow/react';

import type { FlowchartCanvasShellProps } from './AdvancedFlowchartCanvasShell';
import { bindBaseReactFlowRendererAssistiveVisibility } from '../shared/baseReactFlowAssistiveVisibility';

export type { FlowchartCanvasShellProps } from './AdvancedFlowchartCanvasShell';

const AdvancedFlowchartCanvasShell = React.lazy(() => import('./AdvancedFlowchartCanvasShell').then(module => ({
    default: module.AdvancedFlowchartCanvasShell,
})));

const EmptyFlowchartCanvas = ({
    backgroundGridColor,
    children,
    connectionMode,
    defaultCanvasHiddenFromAssistiveTech = false,
    gridVariant,
    isSpacePressed,
    onInit,
    onPaneClick,
    onPaneContextMenu,
    onPaneDoubleClick,
    onPaneMouseLeave,
    onPaneMouseMove,
    panOnDrag,
    showGrid,
    snapEnabled,
}: FlowchartCanvasShellProps) => {
    const canvasRootRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => bindBaseReactFlowRendererAssistiveVisibility(
        canvasRootRef.current,
        defaultCanvasHiddenFromAssistiveTech,
    ), [defaultCanvasHiddenFromAssistiveTech]);

    return (
    <div ref={canvasRootRef} style={{ height: '100%', width: '100%' }}>
        <ReactFlow
            connectionMode={connectionMode}
            edges={[]}
            elementsSelectable={false}
            nodes={[]}
            nodesConnectable={false}
            nodesDraggable={false}
            nodesFocusable={!defaultCanvasHiddenFromAssistiveTech}
            edgesFocusable={!defaultCanvasHiddenFromAssistiveTech}
            onInit={onInit}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onDoubleClick={onPaneDoubleClick}
            onPaneMouseLeave={onPaneMouseLeave}
            onPaneMouseMove={onPaneMouseMove}
            panOnDrag={panOnDrag ?? isSpacePressed}
            selectionOnDrag={false}
            snapGrid={[12, 12]}
            snapToGrid={snapEnabled}
        >
            {showGrid ? (
                <Background
                    color={backgroundGridColor || 'rgba(148,163,184,0.4)'}
                    gap={24}
                    variant={gridVariant}
                />
            ) : null}
            {children}
        </ReactFlow>
    </div>
    );
};

/**
 * The empty creation route starts with an interactive React Flow pane.
 * Advanced routing is loaded only after the first node or edge exists.
 */
export const FlowchartCanvasShell: React.FC<FlowchartCanvasShellProps> = React.memo((props) => {
    if (props.nodes.length === 0 && props.displayEdges.length === 0) {
        return <EmptyFlowchartCanvas {...props} />;
    }

    return (
        <Suspense fallback={<EmptyFlowchartCanvas {...props} />}>
            <AdvancedFlowchartCanvasShell {...props} />
        </Suspense>
    );
});

FlowchartCanvasShell.displayName = 'FlowchartCanvasShell';

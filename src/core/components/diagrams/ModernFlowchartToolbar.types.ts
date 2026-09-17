import type React from 'react';
import type { BackgroundVariant } from '@xyflow/react';
import type { FlowchartLayoutDirection } from './flowchartLayoutStrategyMode';
import type { LayoutScopeRequest } from './hooks/layoutScopeBoundary';
import type { LaneRankDecision, LaneRankPreference } from '../../types/domainLaneRank';

export interface FlowchartToolbarProps {
    customDomainLayoutAvailable?: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom?: () => void;
    onFitView: () => void;
    autoRouting: boolean;
    toggleAutoRouting: () => void;
    showGrid: boolean;
    gridVariant?: BackgroundVariant;
    toggleGrid: () => void;
    onShowShortcuts: () => void;
    onShowCanvasSearch?: () => void;
    onStrategyLayout?: (
        strategyName: string,
        nodeLayout?: string,
        direction?: FlowchartLayoutDirection,
        laneRankPreference?: LaneRankPreference,
        layoutScope?: LayoutScopeRequest,
    ) => void;
    onSmartLayout?: () => void | Promise<void>;
    lastDomainStrategy?: string;
    lastDomainDirection?: FlowchartLayoutDirection;
    lastNodeLayout?: string;
    laneRankPreference?: LaneRankPreference;
    laneRankDecision?: LaneRankDecision;
    layoutBusy?: boolean;
    showRuler: boolean;
    toggleRuler: () => void;
    showMinimap?: boolean;
    toggleMinimap?: () => void;
    onToggleAI?: () => void;
    aiChatActive?: boolean;
    showAiCrown?: boolean;
    nodeCount?: number;
    edgeCount?: number;
    highlightMainFlow?: boolean;
    onToggleHighlightMainFlow?: () => void;
    showOnlyMainFlow?: boolean;
    onToggleShowOnlyMainFlow?: () => void;
    onExport?: () => void;
    onImportClick?: () => void;
    onActivatePointer?: () => void;
    isDrawingMode?: boolean;
    onToggleDrawingMode?: () => void;
    isMarqueeActive?: boolean;
    toggleSelectionMode?: () => void;
    onAddMindMap?: () => void;
    onAddStickyNote?: () => void;
    selectedNodesCount?: number;
    selectedEdgesCount?: number;
    hideFlowFocusControls?: boolean;
    hideUndoRedoControls?: boolean;
    onDeleteSelected?: () => void;
    isCommentMode?: boolean;
    setIsCommentMode?: (v: boolean) => void;
    contextPortalTarget?: HTMLElement | null;
    bottomPortalTarget?: HTMLElement | null;
    onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    onDistribute?: (type: 'horizontal' | 'vertical') => void;
    children?: React.ReactNode;
    historyCount?: number;
    onShowHistory?: () => void;
    onOpenHistoryPanel?: () => void;
    zoomPercent?: number;
    hideHistoryControls?: boolean;
    hideZoomControls?: boolean;
    hideLayoutControls?: boolean;
    hideGridControls?: boolean;
    onToggleSnap?: () => void;
    snapToGrid?: boolean;
}

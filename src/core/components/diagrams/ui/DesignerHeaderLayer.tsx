import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaProjectDiagram, FaExchangeAlt } from 'react-icons/fa';

import { PresenceHeader } from '../collaboration/PresenceHeader';

import { TopActionButtons } from '../TopActionButtons';
import { ModernFlowchartToolbar } from '../ModernFlowchartToolbar';
import type { ReactFlowRenderSnapshot } from '../../../rendering/reactFlowScene';
import type { CollaborationPresenceUser } from '../collaborationPresence';
import type {
    DiagramCollaborationStatus,
    DiagramExportFormat,
} from '../../../types/diagram-components';
import { haveSameDesignerHeaderLayoutState } from './designerHeaderMemoState';

type TopActionProps = React.ComponentProps<typeof TopActionButtons>;
type ToolbarProps = React.ComponentProps<typeof ModernFlowchartToolbar>;

export interface DesignerHeaderLayerProps {
    diagramId?: string;
    diagramTitle?: string;
    
    topActions: {
        onEditJson: () => void;
        onStartPresentation: () => void;
        onShowDiff: () => void;
        onShowHistory: () => void;
        onOpenVersionHistory?: () => void;
        onSaveToCloud?: () => Promise<void>;
        onDirectSave?: () => Promise<void>;
        isDirectSaveDisabled?: boolean;
        onShare?: () => void;
        rightOffset: number;
        extraExportItems?: TopActionProps['extraExportItems'];
        isYjsSynced?: boolean;
        collaborationStatus?: DiagramCollaborationStatus;
        onOpenCollaboration?: () => void;
        isReadonly: boolean;
        onReadonlyChange: (v: boolean) => void;
        onOpenSettings?: () => void;
        onSmartOptimize?: () => void;
        highlightMainFlow: boolean;
        handleToggleHighlightMainFlow: () => void;
        showOnlyMainFlow: boolean;
        handleToggleShowOnlyMainFlow: () => void;
        topActionArea?: React.ReactNode;
        pluginToolbar?: React.ReactNode;
        activeUsers?: CollaborationPresenceUser[]; // ⭐ GAP-02

        // ⭐ Phase 10: 状态提升
        exportModalVisible: boolean;
        setExportModalVisible: (v: boolean) => void;
        pluginManagerVisible: boolean;
        setPluginManagerVisible: (v: boolean) => void;
        isCommentMode: boolean; // ⭐ Phase 11
        setIsCommentMode: (v: boolean) => void;
        getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
        onExportPermissionCheck?: (format: DiagramExportFormat) => boolean;
    };

    toolbar: {
        canUndo: boolean;
        canRedo: boolean;
        onUndo: () => void;
        onRedo: () => void;
        onZoomIn: () => void;
        onZoomOut: () => void;
        onResetZoom: () => void;
        onFitView: () => void;
        autoRouting: boolean;
        toggleAutoRouting: () => void;
        showGrid: boolean;
        gridVariant: ToolbarProps['gridVariant'];
        toggleGrid: () => void;
        onShowShortcuts: () => void;
        onShowCanvasSearch: () => void;
        onStrategyLayout: ToolbarProps['onStrategyLayout'];
        onSmartLayout?: ToolbarProps['onSmartLayout'];
        customDomainLayoutAvailable?: boolean;
        lastDomainStrategy?: string;
        lastDomainDirection?: string;
        lastNodeLayout?: string;
        layoutBusy?: boolean;
        showRuler: boolean;
        toggleRuler: () => void;
        showMinimap?: boolean;
        toggleMinimap?: () => void;
        showAiCrown?: boolean;
        onToggleAI: () => void;
        aiChatActive: boolean;
        nodeCount: number;
        edgeCount: number;
        selectedNodesCount: number;
        selectedEdgesCount: number;
        zoomPercent: number;
        snapToGrid: boolean;
        onToggleSnap: () => void;
        hideZoomControls?: boolean;
        hideLayoutControls?: boolean;
        hideGridControls?: boolean;
        hideFlowFocusControls?: boolean;
        hideUndoRedoControls?: boolean;
        isDrawingMode?: boolean;
        isMarqueeActive?: boolean;
        toggleSelectionMode?: () => void;
        onToggleDrawingMode?: () => void;
        onActivatePointer?: () => void;
        onAddStickyNote?: () => void;
        onAddMindMap?: () => void;
        onExport?: () => void;
        onImportClick?: () => void;
        renderThemeSelector?: React.ReactNode;
        /** 历史面板入口 */
        onShowHistory?: () => void;
        historyCount?: number;
        onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
        onDistribute?: (type: 'horizontal' | 'vertical') => void;
    };
}

export const DesignerHeaderLayer = React.memo(
    ({
        diagramId: _diagramId = 'flowchart-designer',
        diagramTitle,
        topActions,
        toolbar
    }: DesignerHeaderLayerProps) => {
        const { t } = useTranslation();
        const showCollaborationPresence = (
            topActions.collaborationStatus !== undefined
            && topActions.collaborationStatus !== 'inactive'
        ) || (topActions.activeUsers?.length ?? 0) > 0;

        return (
            <>
                <TopActionButtons
                    diagramId={_diagramId}
                    diagramTitle={diagramTitle}
                    onEditJson={topActions.onEditJson}
                    onStartPresentation={topActions.onStartPresentation}
                    onShowDiff={topActions.onShowDiff}
                    onShowHistory={topActions.onShowHistory}
                    onOpenVersionHistory={topActions.onOpenVersionHistory}
                    onSaveToCloud={topActions.onSaveToCloud}
                    onDirectSave={topActions.onDirectSave}
                    isDirectSaveDisabled={topActions.isDirectSaveDisabled}
                    onShare={topActions.onShare}
                    onOpenCollaboration={topActions.onOpenCollaboration}
                    rightOffset={topActions.rightOffset}
                    extraExportItems={topActions.extraExportItems}
                    isYjsSynced={topActions.isYjsSynced}
                    isReadonly={topActions.isReadonly}
                    onReadonlyChange={topActions.onReadonlyChange}
                    onOpenSettings={topActions.onOpenSettings}
                    onSmartOptimize={topActions.onSmartOptimize}
                    // ⭐ Phase 10
                    exportModalVisible={topActions.exportModalVisible}
                    setExportModalVisible={topActions.setExportModalVisible}
                    pluginManagerVisible={topActions.pluginManagerVisible}
                    setPluginManagerVisible={topActions.setPluginManagerVisible}
                    isCommentMode={topActions.isCommentMode}
                    setIsCommentMode={topActions.setIsCommentMode}
                    getReactFlowSnapshot={topActions.getReactFlowSnapshot}
                    onExportPermissionCheck={topActions.onExportPermissionCheck}
                    onToggleAI={toolbar.onToggleAI}
                    aiChatActive={toolbar.aiChatActive}
                    disablePortal={false}
                    extraMoreItems={[
                        {
                            key: 'toggle-highlight-main',
                            label: topActions.highlightMainFlow 
                                ? t('designer.toolbar.unhighlightMainFlow')
                                : t('designer.toolbar.highlightMainFlow'),
                            icon: <FaProjectDiagram />,
                            onClick: topActions.handleToggleHighlightMainFlow
                        },
                        {
                            key: 'toggle-only-main',
                            label: topActions.showOnlyMainFlow 
                                ? t('designer.toolbar.restoreFullFlow')
                                : t('designer.toolbar.showOnlyMainFlow'),
                            icon: <FaExchangeAlt />,
                            onClick: topActions.handleToggleShowOnlyMainFlow
                        }
                    ]}
                >
                    {!topActions.isReadonly && topActions.pluginToolbar}
                </TopActionButtons>

                {!topActions.isReadonly && topActions.topActionArea && (
                    <div style={{ position: 'absolute', top: 16, left: 24, zIndex: 110 }} className="designer-top-left-actions">
                        {topActions.topActionArea}
                    </div>
                )}

                {/* GAP-02: Premium Collaboration Presence */}
                {showCollaborationPresence && (
                    <div style={{ position: 'absolute', top: 16, right: topActions.rightOffset + 280, zIndex: 110 }} className="designer-top-presence">
                        <PresenceHeader
                            activeUsers={topActions.activeUsers}
                            status={topActions.collaborationStatus}
                            onOpen={topActions.onOpenCollaboration}
                        />
                    </div>
                )}
                
                {!topActions.isReadonly && <ModernFlowchartToolbar
                    canUndo={toolbar.canUndo}
                    canRedo={toolbar.canRedo}
                    onUndo={toolbar.onUndo}
                    onRedo={toolbar.onRedo}
                    onZoomIn={toolbar.onZoomIn}
                    onZoomOut={toolbar.onZoomOut}
                    onResetZoom={toolbar.onResetZoom}
                    onFitView={toolbar.onFitView}
                    autoRouting={toolbar.autoRouting}
                    toggleAutoRouting={toolbar.toggleAutoRouting}
                    showGrid={toolbar.showGrid}
                    gridVariant={toolbar.gridVariant}
                    toggleGrid={toolbar.toggleGrid}
                    onShowShortcuts={toolbar.onShowShortcuts}
                    onShowCanvasSearch={toolbar.onShowCanvasSearch}
                    onStrategyLayout={toolbar.onStrategyLayout}
                    onSmartLayout={toolbar.onSmartLayout}
                    customDomainLayoutAvailable={toolbar.customDomainLayoutAvailable}
                    lastDomainStrategy={toolbar.lastDomainStrategy}
                    lastDomainDirection={toolbar.lastDomainDirection as 'TB' | 'LR' | undefined}
                    lastNodeLayout={toolbar.lastNodeLayout}
                    layoutBusy={toolbar.layoutBusy}
                    showRuler={toolbar.showRuler}
                    toggleRuler={toolbar.toggleRuler}
                    showMinimap={toolbar.showMinimap}
                    toggleMinimap={toolbar.toggleMinimap}
                    showAiCrown={toolbar.showAiCrown}
                    onToggleAI={toolbar.onToggleAI}
                    aiChatActive={toolbar.aiChatActive}
                    nodeCount={toolbar.nodeCount}
                    edgeCount={toolbar.edgeCount}
                    selectedNodesCount={toolbar.selectedNodesCount}
                    selectedEdgesCount={toolbar.selectedEdgesCount}
                    zoomPercent={toolbar.zoomPercent}
                    snapToGrid={toolbar.snapToGrid}
                    onToggleSnap={toolbar.onToggleSnap}
                    highlightMainFlow={topActions.highlightMainFlow}
                    onToggleHighlightMainFlow={topActions.handleToggleHighlightMainFlow}
                    showOnlyMainFlow={topActions.showOnlyMainFlow}
                    onToggleShowOnlyMainFlow={topActions.handleToggleShowOnlyMainFlow}
                    hideZoomControls={toolbar.hideZoomControls}
                    hideLayoutControls={toolbar.hideLayoutControls}
                    hideGridControls={toolbar.hideGridControls}
                    hideFlowFocusControls={toolbar.hideFlowFocusControls}
                    hideUndoRedoControls={toolbar.hideUndoRedoControls}
                    isDrawingMode={toolbar.isDrawingMode}
                    isMarqueeActive={toolbar.isMarqueeActive}
                    toggleSelectionMode={toolbar.toggleSelectionMode}
                    onToggleDrawingMode={toolbar.onToggleDrawingMode}
                    onActivatePointer={toolbar.onActivatePointer}
                    onAddStickyNote={toolbar.onAddStickyNote}
                    onAddMindMap={toolbar.onAddMindMap}
                    onExport={toolbar.onExport}
                    onImportClick={toolbar.onImportClick}
                    isCommentMode={topActions.isCommentMode}
                    setIsCommentMode={topActions.setIsCommentMode}
                    historyCount={toolbar.historyCount}
                    onAlign={toolbar.onAlign}
                    onDistribute={toolbar.onDistribute}
                />}
            </>
        );
    },
    (prevProps, nextProps) => {
        // ⭐ 高级性能优化：忽略每次渲染中新创建的匿名函数 props
        // 只有当核心可变数据（节点数/连线数/缩放比例/锁定状态/UI模式）发生真正变化时才重绘
        return (
            prevProps.toolbar.nodeCount === nextProps.toolbar.nodeCount &&
            prevProps.diagramTitle === nextProps.diagramTitle &&
            prevProps.toolbar.edgeCount === nextProps.toolbar.edgeCount &&
            prevProps.toolbar.selectedNodesCount === nextProps.toolbar.selectedNodesCount &&
            prevProps.toolbar.selectedEdgesCount === nextProps.toolbar.selectedEdgesCount &&
            prevProps.toolbar.zoomPercent === nextProps.toolbar.zoomPercent &&
            prevProps.toolbar.showGrid === nextProps.toolbar.showGrid &&
            prevProps.toolbar.snapToGrid === nextProps.toolbar.snapToGrid &&
            prevProps.toolbar.canUndo === nextProps.toolbar.canUndo &&
            prevProps.toolbar.canRedo === nextProps.toolbar.canRedo &&
            prevProps.toolbar.autoRouting === nextProps.toolbar.autoRouting &&
            haveSameDesignerHeaderLayoutState(prevProps.toolbar, nextProps.toolbar) &&
            prevProps.toolbar.aiChatActive === nextProps.toolbar.aiChatActive &&
            prevProps.toolbar.showRuler === nextProps.toolbar.showRuler &&
            prevProps.toolbar.isDrawingMode === nextProps.toolbar.isDrawingMode &&
            prevProps.toolbar.isMarqueeActive === nextProps.toolbar.isMarqueeActive &&
            prevProps.topActions.isReadonly === nextProps.topActions.isReadonly &&
            prevProps.topActions.highlightMainFlow === nextProps.topActions.highlightMainFlow &&
            prevProps.topActions.showOnlyMainFlow === nextProps.topActions.showOnlyMainFlow &&
            prevProps.topActions.isDirectSaveDisabled === nextProps.topActions.isDirectSaveDisabled &&
            prevProps.topActions.isCommentMode === nextProps.topActions.isCommentMode &&
            prevProps.topActions.onExportPermissionCheck === nextProps.topActions.onExportPermissionCheck &&
            prevProps.toolbar.historyCount === nextProps.toolbar.historyCount &&
            // ⭐ Phase 10: 弹窗状态 — 必须纳入比较，否则 setExportModalVisible(true) 后组件不重渲染
            prevProps.topActions.exportModalVisible === nextProps.topActions.exportModalVisible &&
            prevProps.topActions.pluginManagerVisible === nextProps.topActions.pluginManagerVisible &&
            // 工具栏外观 — gridVariant 影响 gridInfo memo，showMinimap 影响 moreMenuItems
            prevProps.toolbar.gridVariant === nextProps.toolbar.gridVariant &&
            prevProps.toolbar.showMinimap === nextProps.toolbar.showMinimap &&
            // ⭐ Plugin hide flags — MindMapPlugin (hideLayoutControls=true) 激活后
            // 需要重渲染 toolbar，否则流程图专属按钮无法被正确隐藏
            prevProps.toolbar.hideLayoutControls === nextProps.toolbar.hideLayoutControls &&
            prevProps.toolbar.hideGridControls === nextProps.toolbar.hideGridControls &&
            prevProps.toolbar.hideFlowFocusControls === nextProps.toolbar.hideFlowFocusControls &&
            prevProps.toolbar.hideZoomControls === nextProps.toolbar.hideZoomControls &&
            prevProps.toolbar.hideUndoRedoControls === nextProps.toolbar.hideUndoRedoControls
        );
    }
);

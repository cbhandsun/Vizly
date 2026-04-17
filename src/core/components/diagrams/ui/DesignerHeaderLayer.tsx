import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaProjectDiagram, FaExchangeAlt } from 'react-icons/fa';
import { Divider } from 'antd';

import { TopActionButtons } from '../TopActionButtons';
import { ModernFlowchartToolbar } from '../ModernFlowchartToolbar';

export interface DesignerHeaderLayerProps {
    diagramId?: string;
    
    topActions: {
        onExportJSON: () => void;
        onExportPNG: () => any;
        onExportSVG: () => any;
        onExportPDF: () => any;
        onExportGIF: () => any;
        onExportMermaid: () => void;
        onImportClick: () => void;
        onEditJson: () => void;
        onStartPresentation: () => void;
        onShowDiff: () => void;
        onShowHistory: () => void;
        onSaveToCloud?: () => Promise<void>;
        onDirectSave?: () => Promise<void>;
        isDirectSaveDisabled?: boolean;
        onShare?: () => void;
        rightOffset: number;
        extraExportItems?: any[];
        isYjsSynced?: boolean;
        isReadonly: boolean;
        onReadonlyChange: (v: boolean) => void;
        onOpenSettings: () => void;
        onSmartOptimize?: () => void;
        highlightMainFlow: boolean;
        handleToggleHighlightMainFlow: () => void;
        showOnlyMainFlow: boolean;
        handleToggleShowOnlyMainFlow: () => void;
        topActionArea?: React.ReactNode;
        pluginToolbar?: React.ReactNode;

        // ⭐ Phase 10: 状态提升
        exportModalVisible: boolean;
        setExportModalVisible: (v: boolean) => void;
        pluginManagerVisible: boolean;
        setPluginManagerVisible: (v: boolean) => void;
        isCommentMode: boolean; // ⭐ Phase 11
        setIsCommentMode: (v: boolean) => void;
    };

    toolbar: {
        canUndo: boolean;
        canRedo: boolean;
        onUndo: () => void;
        onRedo: () => void;
        onZoomIn: () => void;
        onZoomOut: () => void;
        onFitView: () => void;
        onFitWidth: () => void;
        autoRouting: boolean;
        toggleAutoRouting: () => void;
        showGrid: boolean;
        gridVariant: any;
        toggleGrid: () => void;
        onShowShortcuts: () => void;
        onStrategyLayout: (s: any) => void;
        lastDomainStrategy?: string;
        lastDomainDirection?: string;
        lastNodeLayout?: string;
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
    };
}

export const DesignerHeaderLayer = React.memo(
    ({
        diagramId = 'flowchart-designer',
        topActions,
        toolbar
    }: DesignerHeaderLayerProps) => {
        const { t } = useTranslation();

        return (
            <>
                <TopActionButtons
                    onExportJSON={topActions.onExportJSON}
                    onExportPNG={topActions.onExportPNG}
                    onExportSVG={topActions.onExportSVG}
                    onExportPDF={topActions.onExportPDF}
                    onExportGIF={topActions.onExportGIF}
                    onExportMermaid={topActions.onExportMermaid}
                    onImportClick={topActions.onImportClick}
                    onEditJson={topActions.onEditJson}
                    onStartPresentation={topActions.onStartPresentation}
                    onShowDiff={topActions.onShowDiff}
                    onShowHistory={topActions.onShowHistory}
                    onSaveToCloud={topActions.onSaveToCloud}
                    onDirectSave={topActions.onDirectSave}
                    isDirectSaveDisabled={topActions.isDirectSaveDisabled}
                    onShare={topActions.onShare}
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
                    extraMoreItems={[
                        {
                            key: 'toggle-highlight-main',
                            label: topActions.highlightMainFlow 
                                ? t('designer.features.disableHighlight', '关闭主干高亮') 
                                : t('designer.features.enableHighlight', '主链路高亮'),
                            icon: <FaProjectDiagram />,
                            onClick: topActions.handleToggleHighlightMainFlow
                        },
                        {
                            key: 'toggle-only-main',
                            label: topActions.showOnlyMainFlow 
                                ? t('designer.features.showAllFlows', '显示所有连线') 
                                : t('designer.features.showOnlyMain', '仅显示主干流'),
                            icon: <FaExchangeAlt />,
                            onClick: topActions.handleToggleShowOnlyMainFlow
                        }
                    ]}
                >
                    {topActions.pluginToolbar}
                </TopActionButtons>

                {topActions.topActionArea && (
                    <div style={{ position: 'absolute', top: 16, left: 24, zIndex: 1020 }} className="designer-top-left-actions">
                        {topActions.topActionArea}
                    </div>
                )}
                
                <ModernFlowchartToolbar
                    canUndo={toolbar.canUndo}
                    canRedo={toolbar.canRedo}
                    onUndo={toolbar.onUndo}
                    onRedo={toolbar.onRedo}
                    onZoomIn={toolbar.onZoomIn}
                    onZoomOut={toolbar.onZoomOut}
                    onFitView={toolbar.onFitView}
                    onFitWidth={toolbar.onFitWidth}
                    autoRouting={toolbar.autoRouting}
                    toggleAutoRouting={toolbar.toggleAutoRouting}
                    showGrid={toolbar.showGrid}
                    gridVariant={toolbar.gridVariant}
                    toggleGrid={toolbar.toggleGrid}
                    onShowShortcuts={toolbar.onShowShortcuts}
                    onStrategyLayout={toolbar.onStrategyLayout as any}
                    lastDomainStrategy={toolbar.lastDomainStrategy}
                    lastDomainDirection={toolbar.lastDomainDirection as 'TB' | 'LR' | undefined}
                    lastNodeLayout={toolbar.lastNodeLayout}
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
                >
                    {toolbar.renderThemeSelector && (
                        <>
                            <Divider orientation="vertical" style={{ margin: '0 2px', height: '1.2em' }} />
                            {toolbar.renderThemeSelector}
                        </>
                    )}
                </ModernFlowchartToolbar>
            </>
        );
    },
    (prevProps, nextProps) => {
        // ⭐ 高级性能优化：忽略每次渲染中新创建的匿名函数 props
        // 只有当核心可变数据（节点数/连线数/缩放比例/锁定状态/UI模式）发生真正变化时才重绘
        return (
            prevProps.toolbar.nodeCount === nextProps.toolbar.nodeCount &&
            prevProps.toolbar.edgeCount === nextProps.toolbar.edgeCount &&
            prevProps.toolbar.selectedNodesCount === nextProps.toolbar.selectedNodesCount &&
            prevProps.toolbar.selectedEdgesCount === nextProps.toolbar.selectedEdgesCount &&
            prevProps.toolbar.zoomPercent === nextProps.toolbar.zoomPercent &&
            prevProps.toolbar.showGrid === nextProps.toolbar.showGrid &&
            prevProps.toolbar.snapToGrid === nextProps.toolbar.snapToGrid &&
            prevProps.toolbar.canUndo === nextProps.toolbar.canUndo &&
            prevProps.toolbar.canRedo === nextProps.toolbar.canRedo &&
            prevProps.toolbar.autoRouting === nextProps.toolbar.autoRouting &&
            prevProps.toolbar.aiChatActive === nextProps.toolbar.aiChatActive &&
            prevProps.toolbar.showRuler === nextProps.toolbar.showRuler &&
            prevProps.toolbar.isDrawingMode === nextProps.toolbar.isDrawingMode &&
            prevProps.toolbar.isMarqueeActive === nextProps.toolbar.isMarqueeActive &&
            prevProps.topActions.isReadonly === nextProps.topActions.isReadonly &&
            prevProps.topActions.highlightMainFlow === nextProps.topActions.highlightMainFlow &&
            prevProps.topActions.showOnlyMainFlow === nextProps.topActions.showOnlyMainFlow &&
            prevProps.topActions.isDirectSaveDisabled === nextProps.topActions.isDirectSaveDisabled &&
            prevProps.topActions.isCommentMode === nextProps.topActions.isCommentMode
        );
    }
);

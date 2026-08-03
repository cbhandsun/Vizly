import React from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';

// Relative imports for UI components
import { CommandPalette as UiCommandPalette } from '../../ui/CommandPalette';
import { SaveStatusIndicator } from '../SaveStatusIndicator';
import { DiffResult } from '../../../utils/diagramDiff';
import type { CommandItem } from '../../../types/plugin';
import type { AutoSaveState } from '../hooks/useAutoSave';
import type { FlowchartSaveTarget } from '../hooks/useTrackedFlowchartSaves';
import type { PresentationSlide } from '../../../hooks/usePresentationSlides';

const JsonEditorModal = React.lazy(() => import('../JsonEditorModal').then(module => ({
    default: module.JsonEditorModal,
})));
const KeyboardShortcutPanel = React.lazy(() => import('../KeyboardShortcutPanel').then(module => ({
    default: module.KeyboardShortcutPanel,
})));
const FlowchartShortcutsHelpModal = React.lazy(() => import('../FlowchartShortcutsHelpModal').then(module => ({
    default: module.FlowchartShortcutsHelpModal,
})));
const PerformanceDashboard = React.lazy(() => import('../PerformanceDashboard').then(module => ({
    default: module.PerformanceDashboard,
})));
const PresentationMode = React.lazy(() => import('../../presentation/PresentationMode'));
const DiffOverlay = React.lazy(() => import('../DiffOverlay'));

export interface DesignerOverlaysLayerProps {
    diagramId?: string;
    
    // JSON Editor Area
    jsonEditor: {
        visible: boolean;
        setVisible: (v: boolean) => void;
        nodes: Node[];
        edges: Edge[];
        setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
        setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
        reactFlowInstance: ReactFlowInstance | null;
        initialContent?: string;
        onBeforeCanvasReplace?: () => void;
    };

    // Command Palette
    commandPalette: {
        visible: boolean;
        setVisible: (v: boolean) => void;
        items: CommandItem[];
    };

    // Shortcuts Help
    shortcuts: {
        panelVisible: boolean;
        setPanelVisible: (v: boolean) => void;
        modalVisible: boolean;
        setModalVisible: (v: boolean) => void;
    };

    // Status & Performance
    status: {
        saveState: AutoSaveState;
        saveTarget: FlowchartSaveTarget;
        showPerformanceDashboard: boolean;
        nodeCount: number;
        edgeCount: number;
    };

    // Presentation
    presentation: {
        active: boolean;
        setActive: (v: boolean) => void;
        slides: PresentationSlide[];
        onFocusNodes: (ids: string[]) => void;
    };

    // Diff / Version Comparison
    diff: {
        result: DiffResult | null;
        setResult: (v: DiffResult | null) => void;
    };

    // Externally injected modals
    renderAIConfigModal?: React.ReactNode;
    renderShareDialog?: React.ReactNode;
}

export const DesignerOverlaysLayer: React.FC<DesignerOverlaysLayerProps> = ({
    diagramId = 'flowchart-designer',
    jsonEditor,
    commandPalette,
    shortcuts,
    status,
    presentation,
    diff,
    renderAIConfigModal,
    renderShareDialog
}) => {
    return (
        <>
            {jsonEditor.visible && jsonEditor.reactFlowInstance && (
                <React.Suspense fallback={null}>
                    <JsonEditorModal
                        visible={jsonEditor.visible}
                        onClose={() => jsonEditor.setVisible(false)}
                        nodes={jsonEditor.nodes}
                        edges={jsonEditor.edges}
                        setNodes={jsonEditor.setNodes}
                        setEdges={jsonEditor.setEdges}
                        reactFlowInstance={jsonEditor.reactFlowInstance}
                        initialContent={jsonEditor.initialContent}
                        diagramId={diagramId}
                        onBeforeCanvasReplace={jsonEditor.onBeforeCanvasReplace}
                    />
                </React.Suspense>
            )}

            {/* Command Palette */}
            {commandPalette.visible && (
                <UiCommandPalette
                    open={commandPalette.visible}
                    onClose={() => commandPalette.setVisible(false)}
                    items={commandPalette.items}
                    getContainer={() => document.getElementById(`diagram-${diagramId}`) as HTMLElement}
                />
            )}

            {/* 快捷键帮助面板 */}
            {shortcuts.panelVisible && (
                <React.Suspense fallback={null}>
                    <KeyboardShortcutPanel
                        visible={shortcuts.panelVisible}
                        onClose={() => shortcuts.setPanelVisible(false)}
                    />
                </React.Suspense>
            )}

            {/* Shortcuts Modal */}
            {shortcuts.modalVisible && (
                <React.Suspense fallback={null}>
                    <FlowchartShortcutsHelpModal
                        open={shortcuts.modalVisible}
                        onClose={() => shortcuts.setModalVisible(false)}
                        getContainer={() => document.getElementById(`diagram-${diagramId}`) as HTMLElement}
                    />
                </React.Suspense>
            )}

            {/* 保存状态指示器 */}
            <div className="designer-save-status-anchor">
                <SaveStatusIndicator saveState={status.saveState} target={status.saveTarget} />
            </div>

            {/* ⭐ 性能仪表盘 */}
            {status.showPerformanceDashboard && (
                <React.Suspense fallback={null}>
                    <div style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
                        zIndex: 10,
                        transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}>
                        <PerformanceDashboard nodeCount={status.nodeCount} edgeCount={status.edgeCount} />
                    </div>
                </React.Suspense>
            )}

            {/* ⣻ Presentation 演示模式 */}
            {presentation.active && (
                <React.Suspense fallback={null}>
                    <PresentationMode
                        slides={presentation.slides}
                        onFocusNodes={presentation.onFocusNodes}
                        onExit={() => presentation.setActive(false)}
                    />
                </React.Suspense>
            )}

            {/* ⣻ 版本 Diff 覆盖层 */}
            {diff.result && (
                <React.Suspense fallback={null}>
                    <DiffOverlay
                        diff={diff.result}
                        onClose={() => diff.setResult(null)}
                        versionLabel="与上一次操作对比"
                    />
                </React.Suspense>
            )}

            {/* ⣻ AI 配置及分享弹窗交由 props 外部注入 */}
            {renderAIConfigModal}
            {renderShareDialog}
        </>
    );
};

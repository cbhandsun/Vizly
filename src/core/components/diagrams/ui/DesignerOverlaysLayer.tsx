import React from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';

// Relative imports for UI components
import { JsonEditorModal } from '../JsonEditorModal';
import { CommandPalette as UiCommandPalette } from '../../ui/CommandPalette';
import { KeyboardShortcutPanel } from '../KeyboardShortcutPanel';
import { FlowchartShortcutsHelpModal } from '../FlowchartShortcutsHelpModal';
import { SaveStatusIndicator } from '../SaveStatusIndicator';
import { PerformanceDashboard } from '../PerformanceDashboard';
import PresentationMode from '../../presentation/PresentationMode';
import DiffOverlay from '../DiffOverlay';
import { DiffResult } from '../../../utils/diagramDiff';

export interface DesignerOverlaysLayerProps {
    diagramId?: string;
    
    // JSON Editor Area
    jsonEditor: {
        visible: boolean;
        setVisible: (v: boolean) => void;
        nodes: Node[];
        edges: Edge[];
        setNodes: (val: any) => void;
        setEdges: (val: any) => void;
        reactFlowInstance: ReactFlowInstance | null;
        initialContent?: any;
    };

    // Command Palette
    commandPalette: {
        visible: boolean;
        setVisible: (v: boolean) => void;
        items: any[];
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
        saveState: 'saved' | 'saving' | 'error' | 'idle' | string;
        showPerformanceDashboard: boolean;
        nodeCount: number;
        edgeCount: number;
    };

    // Presentation
    presentation: {
        active: boolean;
        setActive: (v: boolean) => void;
        slides: any[];
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
            <JsonEditorModal
                visible={jsonEditor.visible}
                onClose={() => jsonEditor.setVisible(false)}
                nodes={jsonEditor.nodes}
                edges={jsonEditor.edges}
                setNodes={jsonEditor.setNodes}
                setEdges={jsonEditor.setEdges}
                reactFlowInstance={jsonEditor.reactFlowInstance as any}
                initialContent={jsonEditor.initialContent}
                diagramId={diagramId}
            />

            {/* Command Palette */}
            <UiCommandPalette
                open={commandPalette.visible}
                onClose={() => commandPalette.setVisible(false)}
                items={commandPalette.items}
                getContainer={() => document.getElementById(`diagram-${diagramId}`) as HTMLElement}
            />

            {/* 快捷键帮助面板 */}
            <KeyboardShortcutPanel
                visible={shortcuts.panelVisible}
                onClose={() => shortcuts.setPanelVisible(false)}
            />

            {/* Shortcuts Modal */}
            <FlowchartShortcutsHelpModal
                open={shortcuts.modalVisible}
                onClose={() => shortcuts.setModalVisible(false)}
                getContainer={() => document.getElementById(`diagram-${diagramId}`) as HTMLElement}
            />

            {/* 保存状态指示器 */}
            <div style={{
                position: 'absolute',
                bottom: 20,
                right: 20, // Overlay 模式不需要偏移
                zIndex: 10,
                pointerEvents: 'none',
                transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
                <SaveStatusIndicator saveState={status.saveState as any} />
            </div>

            {/* ⭐ 性能仪表盘 */}
            {status.showPerformanceDashboard && (
                <div style={{
                    position: 'absolute',
                    top: 20,
                    right: 20,
                    zIndex: 10,
                    transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    <PerformanceDashboard nodeCount={status.nodeCount} edgeCount={status.edgeCount} />
                </div>
            )}

            {/* ⣻ Presentation 演示模式 */}
            {presentation.active && (
                <PresentationMode
                    slides={presentation.slides}
                    onFocusNodes={presentation.onFocusNodes}
                    onExit={() => presentation.setActive(false)}
                />
            )}

            {/* ⣻ 版本 Diff 覆盖层 */}
            {diff.result && (
                <DiffOverlay
                    diff={diff.result}
                    onClose={() => diff.setResult(null)}
                    versionLabel="与上一次操作对比"
                />
            )}

            {/* ⣻ AI 配置及分享弹窗交由 props 外部注入 */}
            {renderAIConfigModal}
            {renderShareDialog}
        </>
    );
};

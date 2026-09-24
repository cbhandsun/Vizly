import type { CanvasOperations } from './ai/types';
import { appMessage } from '@vizly/core/antd';
import { renderCssVariableBlock } from '@vizly/core/theme';
import { getFlowDataBridge, type FlowDataBridgeEntry } from '@vizly/core/diagram-data';
import { logDiagramViewerAiJsonImportFailure } from './diagramViewerLogging';
import type { AnalysisResult } from '@/utils/diagramAnalyzer';

type DiagramViewerBridge = FlowDataBridgeEntry & {
    importData?: (data: unknown, options?: { keepHistory?: boolean; mode?: 'append' | 'replace' }) => void;
    deleteNodes?: (nodeIds: string[]) => void;
    triggerLayout?: (strategy?: string) => void;
    onGroupNodes?: (nodeIds: string[], groupName: string) => void;
    onAnalyze?: () => AnalysisResult;
    animatePath?: (edgeIds: string[], options?: { duration?: number; loop?: boolean }) => void;
};

type DiagramJsonParser = (json: string, meta: { id: string; title: string }) => unknown;

interface ImportAIDiagramJsonOptions {
    diagramId: string;
    json: string;
    mode: 'preview' | 'apply';
    applyStrategy?: 'append' | 'replace' | 'new-diagram';
    parseJson: DiagramJsonParser;
    getBridge?: (diagramId: string) => DiagramViewerBridge | undefined;
    logFailure?: (mode: 'preview' | 'apply', diagramId: string, error: unknown) => void;
    onNavigateNewDiagram?: (newDiagramId: string) => void;
}

interface CreateDiagramViewerCanvasOpsOptions {
    diagramId: string;
    isFullscreen: boolean;
    analyzeFallbackSummary: string;
    invalidThemeMessage: string;
    appliedThemeMessage: string;
    onExportPNG: () => void;
    onExportPDF: () => void;
    onExportSVG: () => void;
    onExportGIF: () => void;
    onSave: () => void;
    onShare: () => void;
    onSetPresentationMode: (active: boolean) => void;
    onToggleFullscreen: () => void;
    getBridge?: (diagramId: string) => DiagramViewerBridge | undefined;
    renderCssVariables?: (styles: Record<string, string>) => string;
    messageApi?: Pick<typeof appMessage, 'success' | 'warning'>;
}

const getDiagramViewerBridge = (diagramId: string): DiagramViewerBridge | undefined => (
    getFlowDataBridge(diagramId) as DiagramViewerBridge | undefined
);

export const bindAIDiagramToTargetId = (diagram: unknown, targetId: string): Record<string, unknown> => {
    if (!diagram || typeof diagram !== 'object' || Array.isArray(diagram)) {
        throw new Error('Parsed AI diagram must be an object.');
    }
    return { ...(diagram as Record<string, unknown>), id: targetId };
};

export const importAIDiagramJsonToBridge = ({
    diagramId,
    json,
    mode,
    applyStrategy = 'append',
    parseJson,
    getBridge = getDiagramViewerBridge,
    logFailure = logDiagramViewerAiJsonImportFailure,
    onNavigateNewDiagram,
}: ImportAIDiagramJsonOptions): void => {
    if (applyStrategy === 'new-diagram') {
        try {
            const newDiagramId = `ai_diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            const parsedDiagram = parseJson(json, {
                id: newDiagramId,
                title: '新建 AI 图表',
            });
            const diagram = bindAIDiagramToTargetId(parsedDiagram, newDiagramId);
            void import('@/data/DataRegistry').then(async ({ dataRegistry }) => {
                await dataRegistry.initialize();
                const dataService = dataRegistry.getDataService();
                dataService.registerDiagram(diagram as unknown as Parameters<typeof dataService.registerDiagram>[0], false);
                try {
                    const key = 'vizly_user_diagram_manifests';
                    const raw = localStorage.getItem(key);
                    const list = raw ? JSON.parse(raw) : [];
                    const diagRecord = (diagram && typeof diagram === 'object') ? diagram as Record<string, unknown> : {};
                    const diagMeta = (diagRecord.metadata && typeof diagRecord.metadata === 'object') ? diagRecord.metadata as Record<string, unknown> : {};
                    list.unshift({
                        id: newDiagramId,
                        name: (typeof diagMeta.title === 'string' ? diagMeta.title : undefined) || '新建 AI 图表',
                        type: (typeof diagRecord.type === 'string' ? diagRecord.type : undefined) || 'flowchart',
                        source: 'local',
                        updatedAt: new Date().toISOString(),
                    });
                    localStorage.setItem(key, JSON.stringify(list));
                } catch {}
                if (onNavigateNewDiagram) {
                    onNavigateNewDiagram(newDiagramId);
                } else {
                    window.location.hash = `/?diagram=${encodeURIComponent(newDiagramId)}`;
                    window.location.reload();
                }
            });
            return;
        } catch (error) {
            logFailure(mode, diagramId, error);
            return;
        }
    }

    const bridge = getBridge(diagramId);
    if (!bridge?.importData) return;

    try {
        const diagram = parseJson(json, {
            id: diagramId,
            title: mode === 'preview' ? (diagramId || 'AI Preview') : (diagramId || 'AI Diagram'),
        });
        bridge.importData(diagram, { keepHistory: true, mode: applyStrategy });
    } catch (error) {
        logFailure(mode, diagramId, error);
    }
};

export const createDiagramViewerCanvasOps = ({
    diagramId,
    isFullscreen,
    analyzeFallbackSummary,
    invalidThemeMessage,
    appliedThemeMessage,
    onExportPNG,
    onExportPDF,
    onExportSVG,
    onExportGIF,
    onSave,
    onShare,
    onSetPresentationMode,
    onToggleFullscreen,
    getBridge = getDiagramViewerBridge,
    renderCssVariables = renderCssVariableBlock,
    messageApi = appMessage,
}: CreateDiagramViewerCanvasOpsOptions): CanvasOperations => ({
    onAddNode: (label, shape) => {
        const bridge = getBridge(diagramId);
        return bridge?.addNode?.({ label, shape }) as string | void;
    },
    onDeleteNodes: (ids) => {
        getBridge(diagramId)?.deleteNodes?.(ids);
    },
    onConnectNodes: (source, target, label) => {
        getBridge(diagramId)?.connectNodes?.({ source, target, label });
    },
    onAutoLayout: (strategy) => {
        getBridge(diagramId)?.triggerLayout?.(strategy);
    },
    onGroupNodes: (ids, name) => {
        getBridge(diagramId)?.onGroupNodes?.(ids, name);
    },
    onAnalyze: () => {
        return getBridge(diagramId)?.onAnalyze?.() ?? {
            summary: analyzeFallbackSummary,
            issues: [],
            stats: {
                nodeCount: 0,
                edgeCount: 0,
                orphanCount: 0,
                connectedComponents: 0,
                maxDepth: 0,
            },
        };
    },
    onExport: (type) => {
        if (type === 'png') onExportPNG();
        else if (type === 'pdf') onExportPDF();
        else if (type === 'svg') onExportSVG();
        else if (type === 'gif') onExportGIF();
    },
    onSave,
    onShare,
    onUpdateTheme: (styles) => {
        let styleTag = document.getElementById('ai-dynamic-theme');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'ai-dynamic-theme';
            document.head.appendChild(styleTag);
        }

        const cssText = renderCssVariables(styles);
        if (!cssText) {
            messageApi.warning(invalidThemeMessage);
            return;
        }

        styleTag.textContent = cssText;
        messageApi.success(appliedThemeMessage);
    },
    onTogglePresentation: (active) => {
        onSetPresentationMode(active);
        if (active && !isFullscreen) {
            onToggleFullscreen();
        }
    },
    onAnimatePath: (ids, options) => {
        getBridge(diagramId)?.animatePath?.(ids, options);
    },
});

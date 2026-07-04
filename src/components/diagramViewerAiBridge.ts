import type { CanvasOperations } from './ai/types';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { renderCssVariableBlock } from '@/core/utils/cssVariables';
import { getFlowDataBridge, type FlowDataBridgeEntry } from '@/core/utils/flowDataBridge';
import { logDiagramViewerAiJsonImportFailure } from './diagramViewerLogging';

type DiagramViewerBridge = FlowDataBridgeEntry & {
    importData?: (data: unknown, options?: { keepHistory?: boolean }) => void;
    deleteNodes?: (nodeIds: string[]) => void;
    triggerLayout?: (strategy?: string) => void;
    onGroupNodes?: (nodeIds: string[], groupName: string) => void;
    onAnalyze?: () => { summary: string; nodes: unknown[]; issues: unknown[] };
    animatePath?: (edgeIds: string[], options?: { duration?: number; loop?: boolean }) => void;
};

type DiagramJsonParser = (json: string, meta: { id: string; title: string }) => unknown;

interface ImportAIDiagramJsonOptions {
    diagramId: string;
    json: string;
    mode: 'preview' | 'apply';
    parseJson: DiagramJsonParser;
    getBridge?: (diagramId: string) => DiagramViewerBridge | undefined;
    logFailure?: (mode: 'preview' | 'apply', diagramId: string, error: unknown) => void;
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

export const importAIDiagramJsonToBridge = ({
    diagramId,
    json,
    mode,
    parseJson,
    getBridge = getDiagramViewerBridge,
    logFailure = logDiagramViewerAiJsonImportFailure,
}: ImportAIDiagramJsonOptions): void => {
    const bridge = getBridge(diagramId);
    if (!bridge?.importData) return;

    try {
        const diagram = parseJson(json, {
            id: diagramId,
            title: mode === 'preview' ? (diagramId || 'AI Preview') : (diagramId || 'AI Diagram'),
        });
        bridge.importData(diagram, { keepHistory: true });
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
            nodes: [],
            issues: [],
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

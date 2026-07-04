import { createAutoSavePayload, type AutoSavePayload } from '@/core/utils/autoSaveStorage';
import { removeFlowDataBridge } from '@/core/utils/flowDataBridge';
import { buildDiagramHashRoute } from './diagramViewerLocation';
import {
    clearPreviousDiagramAutoSave,
    persistDiagramFreshSeed,
} from './diagramViewerStorage';

const STANDARD_EDGE_TYPES = new Set(['main', 'dependency', 'support', 'data', 'feedback', 'custom']);

type DiagramSeedData = {
    nodes?: any[];
    edges?: any[];
    layout?: unknown;
    metadata?: unknown;
    [key: string]: unknown;
};

type CanvasLayoutResult = {
    nodes: any[];
    edges?: any[];
};

type ConvertStandardDataToCanvas = (data: DiagramSeedData) => Promise<CanvasLayoutResult>;

interface NormalizeDiagramSeedOptions {
    data: DiagramSeedData;
    convertStandardDataToCanvas: ConvertStandardDataToCanvas;
    logLayoutFallbackFailure: (error: unknown) => void;
}

interface FinalizeDiagramSeedNavigationOptions {
    storage: Pick<Storage, 'setItem' | 'removeItem'>;
    currentDiagramId: string;
    nextDiagramId: string;
    processedData: DiagramSeedData;
    saveSelectedDiagramId: (diagramId: string) => void;
    assignHashRoute?: (hash: string) => void;
    reloadWindow?: () => void;
    requestAnimationFrameImpl?: (callback: FrameRequestCallback) => number;
    removeBridge?: (diagramId: string) => void;
    createPayload?: typeof createAutoSavePayload;
    buildHashRoute?: (diagramId: string) => string;
    logBridgeCleanupFailure: (diagramId: string, nextDiagramId: string, error: unknown) => void;
}

export const needsStandardDiagramSeedConversion = (data: DiagramSeedData | null | undefined): boolean => {
    const firstNode = data?.nodes?.[0];
    const firstEdge = data?.edges?.[0];
    const nodeIsStandard = Boolean(firstNode) && (!('data' in firstNode) || ('domain' in firstNode));
    const edgeIsStandard = Boolean(firstEdge) && !('markerEnd' in firstEdge) && !('sourceHandle' in firstEdge);

    return Boolean(data && data.nodes && data.nodes.length > 0 && (nodeIsStandard || edgeIsStandard));
};

export const normalizeDiagramSeedData = async ({
    data,
    convertStandardDataToCanvas,
    logLayoutFallbackFailure,
}: NormalizeDiagramSeedOptions): Promise<DiagramSeedData> => {
    if (needsStandardDiagramSeedConversion(data)) {
        try {
            const layoutResult = await convertStandardDataToCanvas(data);
            return {
                ...data,
                nodes: layoutResult.nodes,
                edges: layoutResult.edges || data.edges || [],
                layout: data.layout || { type: 'DomainDagreLayout', direction: 'TB' },
            };
        } catch (error) {
            logLayoutFallbackFailure(error);
            return data;
        }
    }

    if (!data?.edges?.length) return data;

    const edges = data.edges.map((edge: any) => {
        const needsFix = STANDARD_EDGE_TYPES.has(edge.type) || !edge.markerEnd;
        if (!needsFix) return edge;
        return {
            ...edge,
            type: 'advanced-smart-step',
            markerEnd: edge.markerEnd || { type: 'arrowclosed' },
            data: edge.data || { auto: ['source', 'target'] },
        };
    });

    return { ...data, edges };
};

export const finalizeDiagramSeedNavigation = ({
    storage,
    currentDiagramId,
    nextDiagramId,
    processedData,
    saveSelectedDiagramId,
    assignHashRoute = (hash) => { window.location.hash = hash; },
    reloadWindow = () => window.location.reload(),
    requestAnimationFrameImpl = requestAnimationFrame,
    removeBridge = removeFlowDataBridge,
    createPayload = createAutoSavePayload,
    buildHashRoute = buildDiagramHashRoute,
    logBridgeCleanupFailure,
}: FinalizeDiagramSeedNavigationOptions): void => {
    clearPreviousDiagramAutoSave(storage, currentDiagramId, nextDiagramId);

    if (processedData?.nodes) {
        const payload = createPayload({
            diagramId: nextDiagramId,
            nodes: processedData.nodes,
            edges: processedData.edges || [],
            layout: processedData.layout,
            metadata: processedData.metadata,
            timestamp: Date.now(),
            isFreshSeed: true,
        }) as AutoSavePayload | null;
        persistDiagramFreshSeed(storage, nextDiagramId, payload);
    }

    saveSelectedDiagramId(nextDiagramId);

    try {
        if (currentDiagramId && currentDiagramId !== nextDiagramId) {
            removeBridge(currentDiagramId);
        }
    } catch (error) {
        logBridgeCleanupFailure(currentDiagramId, nextDiagramId, error);
    }

    assignHashRoute(buildHashRoute(nextDiagramId));
    requestAnimationFrameImpl(() => reloadWindow());
};

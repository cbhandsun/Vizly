// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDiagramViewerCanvasOps,
    importAIDiagramJsonToBridge,
} from '../diagramViewerAiBridge';

const messageState = vi.hoisted(() => ({
    success: vi.fn(),
    warning: vi.fn(),
}));

const loggingState = vi.hoisted(() => ({
    logDiagramViewerAiJsonImportFailure: vi.fn(),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: messageState,
}));

vi.mock('../diagramViewerLogging', () => ({
    logDiagramViewerAiJsonImportFailure: loggingState.logDiagramViewerAiJsonImportFailure,
}));

const createDocumentStub = (): Document => {
    const elements = new Map<string, { id: string; textContent: string | null }>();
    const head = {
        appendChild: (element: { id: string; textContent: string | null }) => {
            elements.set(element.id, element);
            return element;
        },
    };

    return {
        head,
        createElement: () => ({ id: '', textContent: null }),
        getElementById: (id: string) => elements.get(id) ?? null,
    } as unknown as Document;
};

describe('diagramViewerAiBridge', () => {
    beforeEach(() => {
        vi.stubGlobal('document', createDocumentStub());
        vi.restoreAllMocks();
        messageState.success.mockReset();
        messageState.warning.mockReset();
        loggingState.logDiagramViewerAiJsonImportFailure.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('imports AI JSON into the active bridge for preview and apply modes', () => {
        const importData = vi.fn();
        const parseJson = vi.fn((json: string, meta: { id: string; title: string }) => ({ json, meta }));
        const getBridge = vi.fn(() => ({ importData }));

        importAIDiagramJsonToBridge({
            diagramId: 'diagram-a',
            json: '{"nodes":[]}',
            mode: 'preview',
            parseJson,
            getBridge,
        });

        importAIDiagramJsonToBridge({
            diagramId: 'diagram-a',
            json: '{"nodes":[1]}',
            mode: 'apply',
            parseJson,
            getBridge,
        });

        expect(parseJson).toHaveBeenNthCalledWith(1, '{"nodes":[]}', {
            id: 'diagram-a',
            title: 'diagram-a',
        });
        expect(parseJson).toHaveBeenNthCalledWith(2, '{"nodes":[1]}', {
            id: 'diagram-a',
            title: 'diagram-a',
        });
        expect(importData).toHaveBeenCalledTimes(2);
        expect(importData).toHaveBeenNthCalledWith(1, expect.any(Object), { keepHistory: true });
        expect(importData).toHaveBeenNthCalledWith(2, expect.any(Object), { keepHistory: true });
    });

    it('logs AI JSON import failures without throwing', () => {
        const parseJson = vi.fn(() => {
            throw new Error('bad json');
        });

        importAIDiagramJsonToBridge({
            diagramId: 'diagram-a',
            json: '{bad',
            mode: 'preview',
            parseJson,
            getBridge: () => ({ importData: vi.fn() }),
        });

        expect(loggingState.logDiagramViewerAiJsonImportFailure).toHaveBeenCalledWith(
            'preview',
            'diagram-a',
            expect.any(Error)
        );
    });

    it('creates bridge-backed canvas operations plus theme and presentation handlers', () => {
        const addNode = vi.fn((_payload: unknown) => 'node-1');
        const deleteNodes = vi.fn((_nodeIds: string[]) => undefined);
        const connectNodes = vi.fn((_payload: unknown) => undefined);
        const triggerLayout = vi.fn((_strategy?: string) => undefined);
        const onGroupNodes = vi.fn((_nodeIds: string[], _groupName: string) => undefined);
        const onAnalyze = vi.fn(() => ({
            summary: 'ok',
            issues: [],
            stats: {
                nodeCount: 1,
                edgeCount: 0,
                orphanCount: 1,
                connectedComponents: 1,
                maxDepth: 0,
            },
        }));
        const animatePath = vi.fn((
            _edgeIds: string[],
            _options?: { duration?: number; loop?: boolean },
        ) => undefined);
        const onExportPNG = vi.fn();
        const onExportPDF = vi.fn();
        const onExportSVG = vi.fn();
        const onExportGIF = vi.fn();
        const onSave = vi.fn();
        const onShare = vi.fn();
        const onSetPresentationMode = vi.fn();
        const onToggleFullscreen = vi.fn();

        const ops = createDiagramViewerCanvasOps({
            diagramId: 'diagram-a',
            isFullscreen: false,
            analyzeFallbackSummary: 'fallback',
            invalidThemeMessage: 'invalid',
            appliedThemeMessage: 'applied',
            onExportPNG,
            onExportPDF,
            onExportSVG,
            onExportGIF,
            onSave,
            onShare,
            onSetPresentationMode,
            onToggleFullscreen,
            getBridge: () => ({
                addNode,
                deleteNodes,
                connectNodes,
                triggerLayout,
                onGroupNodes,
                onAnalyze,
                animatePath,
            }),
            renderCssVariables: () => ':root { --vizly-color: red; }',
            messageApi: messageState,
        });

        expect(ops.onAddNode?.('Gateway', 'flowchart')).toBe('node-1');
        ops.onDeleteNodes?.(['n1']);
        ops.onConnectNodes?.('n1', 'n2', 'link');
        ops.onAutoLayout?.('elk');
        ops.onGroupNodes?.(['n1', 'n2'], 'Group A');
        expect(ops.onAnalyze?.()).toEqual({
            summary: 'ok',
            issues: [],
            stats: {
                nodeCount: 1,
                edgeCount: 0,
                orphanCount: 1,
                connectedComponents: 1,
                maxDepth: 0,
            },
        });
        ops.onExport?.('png');
        ops.onExport?.('pdf');
        ops.onExport?.('svg');
        ops.onExport?.('gif');
        ops.onSave?.();
        ops.onShare?.();
        ops.onTogglePresentation?.(true);
        ops.onAnimatePath?.(['e1'], { duration: 1200, loop: true });
        ops.onUpdateTheme?.({ '--vizly-color': 'red' });

        expect(addNode).toHaveBeenCalledWith({ label: 'Gateway', shape: 'flowchart' });
        expect(deleteNodes).toHaveBeenCalledWith(['n1']);
        expect(connectNodes).toHaveBeenCalledWith({ source: 'n1', target: 'n2', label: 'link' });
        expect(triggerLayout).toHaveBeenCalledWith('elk');
        expect(onGroupNodes).toHaveBeenCalledWith(['n1', 'n2'], 'Group A');
        expect(onExportPNG).toHaveBeenCalled();
        expect(onExportPDF).toHaveBeenCalled();
        expect(onExportSVG).toHaveBeenCalled();
        expect(onExportGIF).toHaveBeenCalled();
        expect(onSave).toHaveBeenCalled();
        expect(onShare).toHaveBeenCalled();
        expect(onSetPresentationMode).toHaveBeenCalledWith(true);
        expect(onToggleFullscreen).toHaveBeenCalled();
        expect(animatePath).toHaveBeenCalledWith(['e1'], { duration: 1200, loop: true });
        expect(document.getElementById('ai-dynamic-theme')?.textContent).toBe(':root { --vizly-color: red; }');
        expect(messageState.success).toHaveBeenCalledWith('applied');
    });

    it('falls back for analyze and warns when theme CSS is rejected', () => {
        const ops = createDiagramViewerCanvasOps({
            diagramId: 'diagram-a',
            isFullscreen: true,
            analyzeFallbackSummary: 'fallback summary',
            invalidThemeMessage: 'invalid',
            appliedThemeMessage: 'applied',
            onExportPNG: vi.fn(),
            onExportPDF: vi.fn(),
            onExportSVG: vi.fn(),
            onExportGIF: vi.fn(),
            onSave: vi.fn(),
            onShare: vi.fn(),
            onSetPresentationMode: vi.fn(),
            onToggleFullscreen: vi.fn(),
            getBridge: () => undefined,
            renderCssVariables: () => '',
            messageApi: messageState,
        });

        expect(ops.onAnalyze?.()).toEqual({
            summary: 'fallback summary',
            issues: [],
            stats: {
                nodeCount: 0,
                edgeCount: 0,
                orphanCount: 0,
                connectedComponents: 0,
                maxDepth: 0,
            },
        });

        ops.onUpdateTheme?.({ '--bad': 'value' });
        ops.onTogglePresentation?.(true);

        expect(messageState.warning).toHaveBeenCalledWith('invalid');
    });
});

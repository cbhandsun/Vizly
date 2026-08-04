import { describe, expect, it, vi, beforeEach } from 'vitest';

const importFileState = vi.hoisted(() => ({
    validateFlowchartImportFile: vi.fn(),
    readFlowchartImportFileText: vi.fn(),
}));

const importPipelineState = vi.hoisted(() => ({
    runFlowchartImportPipeline: vi.fn(),
}));

vi.mock('../flowchartImportFile', () => importFileState);
vi.mock('../flowchartImportPipeline', () => importPipelineState);

import { createFlowchartImportHandler } from '../flowchartImportHandler';

const makeMessageApi = () => ({
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
});

const makeEvent = (file?: File) => ({
    target: {
        files: file ? [file] : [],
        value: 'preset-value',
    },
});

describe('flowchartImportHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        importPipelineState.runFlowchartImportPipeline.mockResolvedValue(true);
    });

    it('reports validation errors and clears the input', async () => {
        importFileState.validateFlowchartImportFile.mockReturnValue({
            ok: false,
            error: 'invalid',
        });
        const messageApi = makeMessageApi();
        const handler = createFlowchartImportHandler({
            t: (key) => key,
            messageApi,
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            onBeforeCanvasReplace: vi.fn(),
            fitView: vi.fn(),
            registerStandardReload: vi.fn(async () => undefined),
        });
        const event = makeEvent(new File(['x'], 'diagram.txt', { type: 'text/plain' }));

        await handler(event);

        expect(messageApi.error).toHaveBeenCalledWith('invalid');
        expect(event.target.value).toBe('');
        expect(importPipelineState.runFlowchartImportPipeline).not.toHaveBeenCalled();
    });

    it('blocks file imports when editing is unavailable', async () => {
        const messageApi = makeMessageApi();
        const handler = createFlowchartImportHandler({
            t: (key) => key,
            messageApi,
            editingEnabled: false,
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            onBeforeCanvasReplace: vi.fn(),
            fitView: vi.fn(),
            registerStandardReload: vi.fn(async () => undefined),
        });
        const event = makeEvent(new File(['{}'], 'diagram.json', { type: 'application/json' }));

        await handler(event);

        expect(messageApi.info).toHaveBeenCalledWith('designer.flowchart.import.editingRequired');
        expect(importFileState.validateFlowchartImportFile).not.toHaveBeenCalled();
        expect(importFileState.readFlowchartImportFileText).not.toHaveBeenCalled();
        expect(importPipelineState.runFlowchartImportPipeline).not.toHaveBeenCalled();
        expect(event.target.value).toBe('');
    });

    it('routes valid imports through the import pipeline with message callbacks', async () => {
        importFileState.validateFlowchartImportFile.mockReturnValue({
            ok: true,
            importKind: 'json',
        });
        importFileState.readFlowchartImportFileText.mockResolvedValue('{"nodes":[],"edges":[]}');

        const scheduleDelay = vi.fn((callback: () => void) => callback());
        const fitView = vi.fn();
        const registerStandardReload = vi.fn(async () => undefined);
        const onBeforeCanvasReplace = vi.fn();
        importPipelineState.runFlowchartImportPipeline.mockImplementation(async (options) => {
            options.onReactFlowSuccess({ nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] });
            options.onMermaidSuccess();
            options.onMermaidLayoutHint(300);
            options.onJsonImportFailure();
            return true;
        });

        const messageApi = makeMessageApi();
        const handler = createFlowchartImportHandler({
            t: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key,
            messageApi,
            activePlugin: { parseData: vi.fn(() => ({ nodes: [], edges: [] })) },
            businessDataId: 'biz-1',
            diagramId: 'diagram-1',
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            onBeforeCanvasReplace,
            fitView,
            scheduleDelay,
            registerStandardReload,
        });
        const event = makeEvent(new File(['{}'], 'diagram.json', { type: 'application/json' }));

        await handler(event);

        expect(importFileState.readFlowchartImportFileText).toHaveBeenCalled();
        expect(importPipelineState.runFlowchartImportPipeline).toHaveBeenCalledWith(expect.objectContaining({
            content: '{"nodes":[],"edges":[]}',
            importKind: 'json',
            businessDataId: 'biz-1',
            diagramId: 'diagram-1',
            registerStandardReload,
            onBeforeCanvasReplace,
        }));
        expect(messageApi.info).toHaveBeenCalledWith('designer.flowchart.import.rfSuccess:{"nodes":1,"edges":1}');
        expect(messageApi.info).toHaveBeenCalledWith('designer.flowchart.import.mermaidSuccess');
        expect(messageApi.info).toHaveBeenCalledWith('designer.flowchart.import.mermaidLayout');
        expect(messageApi.error).toHaveBeenCalledWith('designer.flowchart.import.jsonFailed');
        expect(fitView).toHaveBeenCalled();
        expect(event.target.value).toBe('');
    });

    it('falls back to the invalid format message when file reading fails', async () => {
        importFileState.validateFlowchartImportFile.mockReturnValue({
            ok: true,
            importKind: 'mermaid',
        });
        importFileState.readFlowchartImportFileText.mockRejectedValue(new Error('read failed'));
        const messageApi = makeMessageApi();
        const handler = createFlowchartImportHandler({
            t: (key) => key,
            messageApi,
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            onBeforeCanvasReplace: vi.fn(),
            fitView: vi.fn(),
            registerStandardReload: vi.fn(async () => undefined),
        });
        const event = makeEvent(new File(['flowchart TD'], 'diagram.mmd', { type: 'text/plain' }));

        await handler(event);

        expect(messageApi.error).toHaveBeenCalledWith('designer.flowchart.import.readFailed');
        expect(event.target.value).toBe('');
    });

    it('holds a shared lock until the real import result settles and blocks duplicates', async () => {
        importFileState.validateFlowchartImportFile.mockReturnValue({ ok: true, importKind: 'json' });
        importFileState.readFlowchartImportFileText.mockResolvedValue('{"nodes":[],"edges":[]}');
        let resolveImport: ((value: boolean) => void) | undefined;
        importPipelineState.runFlowchartImportPipeline.mockImplementation(() => new Promise<boolean>((resolve) => {
            resolveImport = resolve;
        }));
        const messageApi = makeMessageApi();
        const importInFlightRef = { current: false };
        const onImportStarted = vi.fn();
        const onImportFinished = vi.fn();
        const handler = createFlowchartImportHandler({
            t: (key) => key,
            messageApi,
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            onBeforeCanvasReplace: vi.fn(),
            fitView: vi.fn(),
            registerStandardReload: vi.fn(async () => undefined),
            importInFlightRef,
            onImportStarted,
            onImportFinished,
        });

        const firstEvent = makeEvent(new File(['{}'], 'first.json', { type: 'application/json' }));
        const secondEvent = makeEvent(new File(['{}'], 'second.json', { type: 'application/json' }));
        const firstImport = handler(firstEvent);
        await Promise.resolve();
        await handler(secondEvent);

        expect(importPipelineState.runFlowchartImportPipeline).toHaveBeenCalledTimes(1);
        expect(importInFlightRef.current).toBe(true);
        expect(onImportStarted).toHaveBeenCalledTimes(1);
        expect(messageApi.info).toHaveBeenCalledWith('designer.flowchart.import.inProgress');
        expect(secondEvent.target.value).toBe('');

        resolveImport?.(true);
        await firstImport;
        expect(importInFlightRef.current).toBe(false);
        expect(onImportFinished).toHaveBeenCalledWith({ ok: true });
    });

    it('keeps pipeline errors out of the UI and reports a recoverable failed result', async () => {
        importFileState.validateFlowchartImportFile.mockReturnValue({ ok: true, importKind: 'json' });
        importFileState.readFlowchartImportFileText.mockResolvedValue('{"nodes":[],"edges":[]}');
        importPipelineState.runFlowchartImportPipeline.mockImplementation(async (options) => {
            options.onJsonImportFailure();
            return false;
        });
        const messageApi = makeMessageApi();
        const onImportFinished = vi.fn();
        const handler = createFlowchartImportHandler({
            t: (key) => key,
            messageApi,
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            onBeforeCanvasReplace: vi.fn(),
            fitView: vi.fn(),
            registerStandardReload: vi.fn(async () => undefined),
            onImportFinished,
        });

        await handler(makeEvent(new File(['{}'], 'secret.json', { type: 'application/json' })));

        expect(messageApi.error).toHaveBeenCalledWith('designer.flowchart.import.jsonFailed');
        expect(JSON.stringify(messageApi.error.mock.calls)).not.toContain('secret');
        expect(onImportFinished).toHaveBeenCalledWith({ ok: false });
    });

    it('releases the shared lock when the import-start lifecycle callback fails', async () => {
        importFileState.validateFlowchartImportFile.mockReturnValue({ ok: true, importKind: 'json' });
        const messageApi = makeMessageApi();
        const importInFlightRef = { current: false };
        const onImportFinished = vi.fn();
        const event = makeEvent(new File(['{}'], 'diagram.json', { type: 'application/json' }));
        const handler = createFlowchartImportHandler({
            t: (key) => key,
            messageApi,
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            onBeforeCanvasReplace: vi.fn(),
            fitView: vi.fn(),
            registerStandardReload: vi.fn(async () => undefined),
            importInFlightRef,
            onImportStarted: () => {
                throw new Error('notification unavailable');
            },
            onImportFinished,
        });

        await handler(event);

        expect(importFileState.readFlowchartImportFileText).not.toHaveBeenCalled();
        expect(importInFlightRef.current).toBe(false);
        expect(messageApi.error).toHaveBeenCalledWith('designer.flowchart.import.readFailed');
        expect(onImportFinished).toHaveBeenCalledWith({ ok: false });
        expect(event.target.value).toBe('');
    });
});

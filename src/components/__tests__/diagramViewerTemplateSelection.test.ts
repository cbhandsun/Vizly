// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
    beginDiagramViewerTemplateSelection,
    coerceRemoteDiagramSelection,
    selectDiagramViewerTemplate,
    type DiagramViewerTemplateSelectionDependencies,
} from '../diagramViewerTemplateSelection';

const createDependencies = (): DiagramViewerTemplateSelectionDependencies => ({
    loadRemoteDiagram: vi.fn(async () => null),
    loadSystemTemplate: vi.fn(async () => null),
    loadStandardPreset: vi.fn(async () => null),
    getLocalPreset: vi.fn(() => null),
    parseRemoteContent: vi.fn(() => ({})),
    seedAndNavigate: vi.fn(async () => undefined),
    clearBlankTemplate: vi.fn(),
    selectDiagram: vi.fn(),
    showLoading: vi.fn(() => vi.fn()),
    showError: vi.fn(),
    logFailure: vi.fn(),
    translate: vi.fn((key) => key),
});

describe('selectDiagramViewerTemplate', () => {
    it('makes only the latest selection context current', () => {
        const sequence = { current: 0 };
        const first = beginDiagramViewerTemplateSelection(sequence);
        const second = beginDiagramViewerTemplateSelection(sequence);

        expect(first.isCurrent()).toBe(false);
        expect(second.isCurrent()).toBe(true);
    });

    it('coerces remote records without trusting identifier and title types', () => {
        expect(coerceRemoteDiagramSelection({ content: '{}', title: 42 }, ' fallback-id ')).toEqual({
            id: 'fallback-id',
            title: undefined,
            content: '{}',
        });
        expect(coerceRemoteDiagramSelection({ id: 'bad\nvalue', content: '{}' }, '')).toBeNull();
        expect(coerceRemoteDiagramSelection({ id: 'remote' }, 'fallback')).toBeNull();
        expect(coerceRemoteDiagramSelection('bad', 'fallback')).toBeNull();
    });

    it('ignores empty, wrong-type, and control-character keys', async () => {
        const dependencies = createDependencies();

        await selectDiagramViewerTemplate('', 's3', dependencies);
        await selectDiagramViewerTemplate(42, 's3', dependencies);
        await selectDiagramViewerTemplate('bad\nkey', 's3', dependencies);
        await selectDiagramViewerTemplate('x'.repeat(201), 's3', dependencies);

        expect(dependencies.loadRemoteDiagram).not.toHaveBeenCalled();
        expect(dependencies.selectDiagram).not.toHaveBeenCalled();
    });

    it('parses a remote diagram and attaches bounded cloud metadata', async () => {
        const dependencies = createDependencies();
        vi.mocked(dependencies.loadRemoteDiagram).mockResolvedValue({
            id: 'remote-1',
            title: 'Remote title',
            content: '{"nodes":[]}',
        });
        vi.mocked(dependencies.parseRemoteContent).mockReturnValue({ metadata: { source: 'remote' } });

        await selectDiagramViewerTemplate('remote-1', 'cloud', dependencies);

        expect(dependencies.loadRemoteDiagram).toHaveBeenCalledWith('supabase', 'remote-1');
        expect(dependencies.seedAndNavigate).toHaveBeenCalledWith(expect.objectContaining({
            id: 'remote-1',
            name: 'Remote title',
            metadata: {
                source: 'remote',
                title: 'Remote title',
                cloud: { provider: 'supabase', id: 'remote-1', title: 'Remote title' },
            },
        }), 'remote-1', expect.objectContaining({ isCurrent: expect.any(Function) }));
    });

    it('reports remote failures and always closes the loading indicator', async () => {
        const dependencies = createDependencies();
        const hideLoading = vi.fn();
        vi.mocked(dependencies.showLoading).mockReturnValue(hideLoading);
        vi.mocked(dependencies.loadRemoteDiagram).mockRejectedValue(new Error('network failed'));

        await selectDiagramViewerTemplate('remote-2', 's3', dependencies);

        expect(dependencies.logFailure).toHaveBeenCalledWith('s3', 'remote-2', expect.any(Error));
        expect(dependencies.showError).toHaveBeenCalled();
        expect(hideLoading).toHaveBeenCalledOnce();
    });

    it('does not apply a remote result after a newer selection starts', async () => {
        let resolveRemote!: (value: { id: string; content: string }) => void;
        const dependencies = createDependencies();
        const sequence = { current: 0 };
        const first = beginDiagramViewerTemplateSelection(sequence);
        vi.mocked(dependencies.loadRemoteDiagram).mockReturnValue(new Promise((resolve) => {
            resolveRemote = resolve;
        }));
        dependencies.isSelectionCurrent = first.isCurrent;

        const pending = selectDiagramViewerTemplate('remote-a', 's3', dependencies);
        beginDiagramViewerTemplateSelection(sequence);
        resolveRemote({ id: 'remote-a', content: '{}' });
        await pending;

        expect(dependencies.parseRemoteContent).not.toHaveBeenCalled();
        expect(dependencies.seedAndNavigate).not.toHaveBeenCalled();
        expect(dependencies.showError).not.toHaveBeenCalled();
    });

    it('suppresses an error from a selection that became stale', async () => {
        let rejectRemote!: (reason: Error) => void;
        const dependencies = createDependencies();
        const sequence = { current: 0 };
        const first = beginDiagramViewerTemplateSelection(sequence);
        vi.mocked(dependencies.loadRemoteDiagram).mockReturnValue(new Promise((_resolve, reject) => {
            rejectRemote = reject;
        }));
        dependencies.isSelectionCurrent = first.isCurrent;

        const pending = selectDiagramViewerTemplate('remote-a', 's3', dependencies);
        beginDiagramViewerTemplateSelection(sequence);
        rejectRemote(new Error('stale failure'));
        await pending;

        expect(dependencies.logFailure).not.toHaveBeenCalled();
        expect(dependencies.showError).not.toHaveBeenCalled();
    });

    it('opens a local preset and normalizes an invalid stored preset id', async () => {
        const localDependencies = createDependencies();
        vi.mocked(localDependencies.getLocalPreset).mockReturnValue({ id: 'bad\nid', name: 'Local' });

        await selectDiagramViewerTemplate('menu-id', 'local-workspace', localDependencies);

        expect(localDependencies.seedAndNavigate).toHaveBeenCalledWith(
            { id: 'bad\nid', name: 'Local' },
            'menu-id',
            expect.objectContaining({ isCurrent: expect.any(Function) }),
        );
        expect(localDependencies.showError).not.toHaveBeenCalled();
    });

    it.each(['local-workspace', 'built-in'])(
        'keeps the current diagram when a %s selection no longer exists',
        async rootGroup => {
            const dependencies = createDependencies();

            await selectDiagramViewerTemplate('stale-id', rootGroup, dependencies);

            expect(dependencies.showError).toHaveBeenCalledWith('storage.manager.noContent');
            expect(dependencies.seedAndNavigate).not.toHaveBeenCalled();
            expect(dependencies.clearBlankTemplate).not.toHaveBeenCalled();
            expect(dependencies.selectDiagram).not.toHaveBeenCalled();
        },
    );

    it('preserves the legacy ungrouped blank-navigation fallback', async () => {
        const blankDependencies = createDependencies();

        await selectDiagramViewerTemplate('blank-flow', 'templates', blankDependencies);

        expect(blankDependencies.clearBlankTemplate).toHaveBeenCalledWith('blank-flow');
        expect(blankDependencies.selectDiagram).toHaveBeenCalledWith('blank-flow');
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeState = vi.hoisted(() => ({
    registerDiagram: vi.fn(async () => undefined),
}));

vi.mock('../../../ports/applicationDiagramRuntime', () => ({
    getApplicationDiagramRuntime: () => runtimeState,
}));

import { registerImportedFlowchartDiagram } from '../flowchartImportRegistration';

describe('registerImportedFlowchartDiagram', () => {
    beforeEach(() => {
        runtimeState.registerDiagram.mockClear();
    });

    it('registers the normalized import with stable identity and metadata', async () => {
        const normalized = {
            id: 'diagram-1',
            name: 'Imported',
            type: 'flowchart' as const,
            version: '1.0.0',
            nodes: [],
            edges: [],
            layout: {
                type: 'custom' as const,
                direction: 'TB' as const,
                spacing: { horizontal: 80, vertical: 60 },
                padding: { horizontal: 24, vertical: 16 },
            },
            theme: { name: 'default', displayName: 'Default', domains: {} },
            metadata: { title: 'Imported' },
        };

        await registerImportedFlowchartDiagram({
            normalized,
            currentId: 'diagram-1',
            title: 'Imported',
        });

        expect(runtimeState.registerDiagram).toHaveBeenCalledWith(
            normalized,
            { id: 'diagram-1', title: 'Imported' },
            true,
            { id: 'diagram-1', metadata: { title: 'Imported' } },
        );
    });
});

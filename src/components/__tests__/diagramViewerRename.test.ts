import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDiagramConfigIndex } from '@/core/utils/diagramTypeStorage';
import { persistDiagramTitle } from '../diagramViewerRename';

const initialize = vi.fn();
const getDiagram = vi.fn();
const registerDiagram = vi.fn();

vi.mock('@/data/DataRegistry', () => ({
    dataRegistry: {
        initialize,
        getDataService: () => ({
            getDiagram,
            registerDiagram,
        }),
    },
}));

describe('persistDiagramTitle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDiagram.mockReturnValue({
            id: 'diagram-1',
            name: 'Old title',
            type: 'flowchart',
            metadata: { owner: 'local' },
        });
    });

    it('normalizes and persists the title to the registry and config index', async () => {
        const storage = window.localStorage;
        storage.clear();

        const result = await persistDiagramTitle({
            diagramId: 'diagram-1',
            requestedTitle: '  Order   approval  ',
            currentTitle: 'Old title',
            fallbackType: 'flowchart',
            storage,
        });

        expect(result).toBe('Order approval');
        expect(initialize).toHaveBeenCalledOnce();
        expect(registerDiagram).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Order approval',
            metadata: expect.objectContaining({
                owner: 'local',
                title: 'Order approval',
            }),
        }));
        expect(readDiagramConfigIndex(storage)['diagram-1']).toEqual(expect.objectContaining({
            type: 'flowchart',
            name: 'Order approval',
        }));
    });

    it('does not write when the normalized title is unchanged', async () => {
        const result = await persistDiagramTitle({
            diagramId: 'diagram-1',
            requestedTitle: ' Old   title ',
            currentTitle: 'Old title',
            storage: window.localStorage,
        });

        expect(result).toBe('Old title');
        expect(initialize).not.toHaveBeenCalled();
        expect(registerDiagram).not.toHaveBeenCalled();
    });

    it('rejects empty and unavailable diagrams', async () => {
        await expect(persistDiagramTitle({
            diagramId: 'diagram-1',
            requestedTitle: ' \u0000 ',
            currentTitle: 'Old title',
            storage: window.localStorage,
        })).rejects.toThrow('Diagram title is invalid.');

        getDiagram.mockReturnValue(undefined);
        await expect(persistDiagramTitle({
            diagramId: 'diagram-1',
            requestedTitle: 'New title',
            currentTitle: 'Old title',
            storage: window.localStorage,
        })).rejects.toThrow('Diagram is unavailable.');
        expect(registerDiagram).not.toHaveBeenCalled();
    });
});

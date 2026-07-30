import { upsertDiagramConfigIndex } from '@/core/utils/diagramTypeStorage';
import { normalizeDiagramTitle } from './diagramViewerTitle';

export interface PersistDiagramTitleRequest {
    diagramId: string;
    requestedTitle: string;
    currentTitle: string;
    fallbackType?: string;
    storage: Storage;
}

export const persistDiagramTitle = async ({
    diagramId,
    requestedTitle,
    currentTitle,
    fallbackType,
    storage,
}: PersistDiagramTitleRequest): Promise<string> => {
    const nextTitle = normalizeDiagramTitle(requestedTitle);
    if (!nextTitle) throw new Error('Diagram title is invalid.');
    if (nextTitle === currentTitle) return nextTitle;

    const { dataRegistry } = await import('@/data/DataRegistry');
    await dataRegistry.initialize();
    const dataService = dataRegistry.getDataService();
    const currentDiagram = dataService.getDiagram(diagramId);
    if (!currentDiagram) throw new Error('Diagram is unavailable.');

    const updatedAt = Date.now();
    dataService.registerDiagram({
        ...currentDiagram,
        name: nextTitle,
        metadata: {
            ...currentDiagram.metadata,
            title: nextTitle,
            updatedAt: new Date(updatedAt).toISOString(),
        },
    });
    upsertDiagramConfigIndex(storage, {
        id: diagramId,
        type: currentDiagram.type || fallbackType || 'flowchart',
        name: nextTitle,
        updatedAt,
    });

    return nextTitle;
};

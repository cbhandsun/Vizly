import type { StandardDiagramData } from '@/core/models/DiagramModels';

import { getApplicationDiagramRuntime } from '../../ports/applicationDiagramRuntime';

export const registerImportedFlowchartDiagram = async ({
    normalized,
    currentId,
    title,
}: {
    normalized: StandardDiagramData;
    currentId: string;
    title: string;
}): Promise<void> => {
    await getApplicationDiagramRuntime().registerDiagram(normalized, {
        id: currentId,
        title,
    }, true, {
        id: currentId,
        metadata: normalized.metadata,
    });
};

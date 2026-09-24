import type { StandardDiagramData } from '@vizly/core/types';
import type { DataService } from '@/services/DataService';
import { coerceStandardDiagramImport, parseDiagramJson } from '@vizly/core/diagram-import';
import { upsertDiagramConfigIndex as upsertStoredDiagramConfigIndex } from '@vizly/core/storage';

export interface AIDiagramImportFallback {
    id: string;
    title: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const parseAIDiagramJson = (
    jsonContent: string,
    fallback: AIDiagramImportFallback
): StandardDiagramData => {
    const parsed = parseDiagramJson(jsonContent);
    return coerceStandardDiagramImport(parsed, fallback) as StandardDiagramData;
};

export const getAIDiagramTitle = (diagram: StandardDiagramData, fallbackTitle: string): string => {
    const title = diagram.metadata?.title || diagram.name || fallbackTitle;
    return String(title || fallbackTitle).trim().slice(0, 160) || fallbackTitle;
};

export const serializeAIDiagram = (diagram: StandardDiagramData): string => (
    JSON.stringify(diagram)
);

export const registerAIDiagramLocally = (
    dataService: Pick<DataService, 'registerRemoteDiagram'>,
    diagram: StandardDiagramData,
    title: string
): StandardDiagramData => {
    const id = diagram.id || crypto.randomUUID();
    return dataService.registerRemoteDiagram(diagram, {
        id,
        title,
    }, true, {
        id,
        metadata: {
            ...(diagram.metadata || {}),
            title,
        },
    });
};

export const upsertDiagramConfigIndex = (
    storage: StorageLike,
    diagram: StandardDiagramData,
    title: string,
    now = Date.now()
): void => {
    upsertStoredDiagramConfigIndex(storage, {
        id: diagram.id,
        type: diagram.type || 'flowchart',
        name: title,
        updatedAt: now,
    });
};

import type { StandardDiagramData } from '@/core/models/DiagramModels';
import type { DataService } from '@/services/DataService';
import type { UnifiedStorageService } from '@/services/UnifiedStorageService';
import type { IStorageProvider } from '@/services/storage/types';

export type AIChatSaveTarget = 'local' | 's3' | 'supabase';

export interface PrepareAIChatDiagramSaveOptions {
    jsonContent: string;
    target: AIChatSaveTarget;
    now?: () => number;
    parseDiagram: (jsonContent: string, fallback: { id: string; title: string }) => StandardDiagramData;
    getDiagramTitle: (diagram: StandardDiagramData, fallbackTitle: string) => string;
    serializeDiagram: (diagram: StandardDiagramData) => string;
}

export interface PreparedAIChatDiagramSave {
    saveTitle: string;
    saveJson: string;
    saveTarget: AIChatSaveTarget;
}

type LocalStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type AIChatCloudProvider = Pick<IStorageProvider, 'name' | 'isConfigured' | 'saveDiagram'>;

export interface ExecuteAIChatDiagramSaveOptions {
    jsonContent: string;
    target: AIChatSaveTarget;
    title: string;
    userId?: string;
    localStorage: LocalStorageLike;
    now?: () => number;
    createUuid?: () => string;
    parseDiagram: (jsonContent: string, fallback: { id: string; title: string }) => StandardDiagramData;
    getLocalDataService: () => Pick<DataService, 'registerRemoteDiagram'>;
    registerLocalDiagram: (
        dataService: Pick<DataService, 'registerRemoteDiagram'>,
        diagram: StandardDiagramData,
        title: string
    ) => StandardDiagramData;
    persistLocalIndex: (storage: LocalStorageLike, diagram: StandardDiagramData, title: string) => void;
    loadUnifiedStorage: () => Promise<Pick<UnifiedStorageService, 'getProvider'>>;
}

export interface ExecutedAIChatDiagramSave {
    target: AIChatSaveTarget;
    title: string;
    diagramId: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildFallbackTitle = (now: number): string => `ai-generated-${now}`;

const buildFallbackId = (now: number): string => `ai-${now}`;

export const prepareAIChatDiagramSave = ({
    jsonContent,
    target,
    now = Date.now,
    parseDiagram,
    getDiagramTitle,
    serializeDiagram,
}: PrepareAIChatDiagramSaveOptions): PreparedAIChatDiagramSave => {
    const timestamp = now();
    const fallbackTitle = buildFallbackTitle(timestamp);
    const diagram = parseDiagram(jsonContent, {
        id: buildFallbackId(timestamp),
        title: fallbackTitle,
    });

    return {
        saveTitle: getDiagramTitle(diagram, fallbackTitle),
        saveJson: serializeDiagram(diagram),
        saveTarget: target,
    };
};

export const resolveAIChatCloudDiagramId = (
    target: Extract<AIChatSaveTarget, 's3' | 'supabase'>,
    currentId: string | undefined,
    createUuid: () => string,
    now: () => number
): string => {
    if (target === 'supabase') {
        return currentId && UUID_REGEX.test(currentId) ? currentId : createUuid();
    }

    return currentId || `${target}-${now()}`;
};

const getCloudProvider = async (
    loadUnifiedStorage: () => Promise<Pick<UnifiedStorageService, 'getProvider'>>,
    target: Extract<AIChatSaveTarget, 's3' | 'supabase'>
): Promise<AIChatCloudProvider> => {
    const unifiedStorage = await loadUnifiedStorage();
    return unifiedStorage.getProvider(target);
};

export const executeAIChatDiagramSave = async ({
    jsonContent,
    target,
    title,
    userId,
    localStorage,
    now = Date.now,
    createUuid = () => crypto.randomUUID(),
    parseDiagram,
    getLocalDataService,
    registerLocalDiagram,
    persistLocalIndex,
    loadUnifiedStorage,
}: ExecuteAIChatDiagramSaveOptions): Promise<ExecutedAIChatDiagramSave> => {
    const timestamp = now();
    const trimmedTitle = title.trim() || buildFallbackTitle(timestamp);
    const diagram = parseDiagram(jsonContent, {
        id: buildFallbackId(timestamp),
        title: trimmedTitle,
    });

    diagram.metadata = diagram.metadata || {};
    diagram.metadata.title = trimmedTitle;

    if (target === 'local') {
        const registeredDiagram = registerLocalDiagram(getLocalDataService(), diagram, trimmedTitle);
        persistLocalIndex(localStorage, registeredDiagram, trimmedTitle);
        return {
            target,
            title: trimmedTitle,
            diagramId: registeredDiagram.id,
        };
    }

    const provider = await getCloudProvider(loadUnifiedStorage, target);
    if (!provider.isConfigured()) {
        throw new Error(`${provider.name} 未配置，请先在配置面板中设置`);
    }

    const finalId = resolveAIChatCloudDiagramId(target, diagram.id, createUuid, now);
    diagram.id = finalId;

    await provider.saveDiagram({
        id: finalId,
        title: trimmedTitle,
        content: diagram,
        user_id: userId || 'anonymous',
        updated_at: new Date().toISOString(),
    });

    return {
        target,
        title: trimmedTitle,
        diagramId: finalId,
    };
};

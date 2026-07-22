import { describe, expect, it, vi } from 'vitest';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import type { IStorageProvider } from '@/services/storage/types';
import {
    executeAIChatDiagramSave,
    prepareAIChatDiagramSave,
    resolveAIChatCloudDiagramId,
} from '../aiChatSave';

const makeDiagram = (overrides: Partial<StandardDiagramData> = {}): StandardDiagramData => ({
    id: 'diagram-id',
    name: 'AI Diagram',
    type: 'flowchart',
    version: '1.0.0',
    nodes: [],
    edges: [],
    layout: {
        type: 'flow',
        direction: 'TB',
        spacing: { horizontal: 80, vertical: 80 },
        padding: { horizontal: 24, vertical: 24 },
    },
    theme: {
        name: 'default',
        displayName: 'Default',
        domains: {},
    },
    metadata: {
        title: 'AI Diagram',
    },
    ...overrides,
});

describe('aiChatSave', () => {
    it('prepares save modal payload from AI diagram JSON', () => {
        const parseDiagram = vi.fn(() => makeDiagram());
        const getDiagramTitle = vi.fn(() => 'Prepared Title');
        const serializeDiagram = vi.fn(() => '{"serialized":true}');

        const result = prepareAIChatDiagramSave({
            jsonContent: '{"nodes":[]}',
            target: 'supabase',
            now: () => 123,
            parseDiagram,
            getDiagramTitle,
            serializeDiagram,
        });

        expect(parseDiagram).toHaveBeenCalledWith('{"nodes":[]}', {
            id: 'ai-123',
            title: 'ai-generated-123',
        });
        expect(result).toEqual({
            saveTitle: 'Prepared Title',
            saveJson: '{"serialized":true}',
            saveTarget: 'supabase',
        });
    });

    it('resolves supabase ids to UUIDs when the source id is invalid', () => {
        const createUuid = vi.fn(() => '3c3a03b2-1c95-4d31-9b2d-c0a7ef22f049');

        const finalId = resolveAIChatCloudDiagramId('supabase', 'preset-name', createUuid, () => 100);

        expect(finalId).toBe('3c3a03b2-1c95-4d31-9b2d-c0a7ef22f049');
        expect(createUuid).toHaveBeenCalledOnce();
    });

    it('keeps existing s3 ids and generates one when missing', () => {
        const createUuid = vi.fn(() => 'unused');

        expect(resolveAIChatCloudDiagramId('s3', 'existing-id', createUuid, () => 456)).toBe('existing-id');
        expect(resolveAIChatCloudDiagramId('s3', '', createUuid, () => 456)).toBe('s3-456');
        expect(createUuid).not.toHaveBeenCalled();
    });

    it('registers local AI saves and persists the dashboard index', async () => {
        const registerRemoteDiagram = vi.fn((_diagram, fallback) => ({
            ...makeDiagram(),
            id: fallback.id,
            metadata: { title: fallback.title },
        }));
        const registerLocalDiagram = vi.fn((_service, _diagram, title) => ({
            ...makeDiagram(),
            id: 'local-diagram',
            metadata: { title },
        }));
        const persistLocalIndex = vi.fn();

        const result = await executeAIChatDiagramSave({
            jsonContent: '{"nodes":[]}',
            target: 'local',
            title: '  Local Save  ',
            localStorage,
            now: () => 789,
            parseDiagram: vi.fn(() => makeDiagram({ id: 'input-id' })),
            getLocalDataService: () => ({ registerRemoteDiagram }),
            registerLocalDiagram,
            persistLocalIndex,
            loadUnifiedStorage: vi.fn(),
        });

        expect(registerLocalDiagram).toHaveBeenCalledOnce();
        expect(persistLocalIndex).toHaveBeenCalledWith(localStorage, expect.objectContaining({
            id: 'local-diagram',
            metadata: { title: 'Local Save' },
        }), 'Local Save');
        expect(result).toEqual({
            target: 'local',
            title: 'Local Save',
            diagramId: 'local-diagram',
        });
    });

    it('saves cloud AI diagrams with regenerated supabase ids when required', async () => {
        const saveDiagram = vi.fn<IStorageProvider['saveDiagram']>(async payload => payload);
        const provider: IStorageProvider = {
            id: 'supabase',
            name: 'Supabase Cloud',
            isConfigured: () => true,
            saveDiagram,
            listDiagrams: async () => [],
            loadDiagram: async id => ({
                id, title: '', content: {}, updated_at: '', user_id: '',
            }),
            deleteDiagram: async () => undefined,
        };
        const getProvider = vi.fn(() => provider);

        const result = await executeAIChatDiagramSave({
            jsonContent: '{"nodes":[]}',
            target: 'supabase',
            title: 'Cloud Save',
            userId: 'user-1',
            localStorage,
            now: () => 1000,
            createUuid: () => '75b1e7be-efcb-4b32-a868-5bb7c7b6070f',
            parseDiagram: vi.fn(() => makeDiagram({ id: 'non-uuid-id' })),
            getLocalDataService: vi.fn(),
            registerLocalDiagram: vi.fn(),
            persistLocalIndex: vi.fn(),
            loadUnifiedStorage: async () => ({ getProvider }),
        });

        expect(getProvider).toHaveBeenCalledWith('supabase');
        expect(saveDiagram).toHaveBeenCalledWith(expect.objectContaining({
            id: '75b1e7be-efcb-4b32-a868-5bb7c7b6070f',
            title: 'Cloud Save',
            user_id: 'user-1',
            content: expect.objectContaining({
                id: '75b1e7be-efcb-4b32-a868-5bb7c7b6070f',
                metadata: expect.objectContaining({
                    title: 'Cloud Save',
                }),
            }),
        }));
        expect(result).toEqual({
            target: 'supabase',
            title: 'Cloud Save',
            diagramId: '75b1e7be-efcb-4b32-a868-5bb7c7b6070f',
        });
    });

    it('rejects cloud saves when the provider is not configured', async () => {
        await expect(executeAIChatDiagramSave({
            jsonContent: '{"nodes":[]}',
            target: 's3',
            title: 'Cloud Save',
            localStorage,
            parseDiagram: vi.fn(() => makeDiagram({ id: '' })),
            getLocalDataService: vi.fn(),
            registerLocalDiagram: vi.fn(),
            persistLocalIndex: vi.fn(),
            loadUnifiedStorage: async () => ({
                getProvider: () => ({
                    id: 's3' as const,
                    name: 'S3 Compatible Storage',
                    isConfigured: () => false,
                    saveDiagram: vi.fn<IStorageProvider['saveDiagram']>(async payload => payload),
                    listDiagrams: async () => [],
                    loadDiagram: async id => ({
                        id, title: '', content: {}, updated_at: '', user_id: '',
                    }),
                    deleteDiagram: async () => undefined,
                }),
            }),
        })).rejects.toThrow('S3 Compatible Storage 未配置');
    });
});

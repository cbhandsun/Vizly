import { describe, expect, it } from 'vitest';
import type { StandardDiagramData } from '../../core/models/DiagramModels';
import {
    coerceFilterView,
    coerceWorkspaceMindMapRootTopic,
    createTemplateSeed,
    detectDiagramType,
    filterAndSortItems,
    getWorkspaceInventoryScope,
    getNodeCount,
    mergeWorkspaceItemsByScope,
    type UnifiedDiagramItem,
} from '../diagramManagementPage.helpers';
import {
    formatWorkspaceTimeAgo,
    resolveWorkspaceLocalModifiedAt,
    WORKSPACE_UNKNOWN_TIMESTAMP,
} from '../workspaceModifiedAt';

const NOW = Date.parse('2026-08-21T12:00:00.000Z');
const storageWith = (raw: string | null): Pick<Storage, 'getItem'> => ({ getItem: () => raw });

const createItem = (overrides: Partial<UnifiedDiagramItem> = {}): UnifiedDiagramItem => ({
    id: 'local-diagram-1',
    title: 'Flow Diagram',
    updatedAt: 100,
    source: 'local',
    role: 'owner',
    raw: {
        id: 'diagram-1',
        name: 'Flow Diagram',
        type: 'flowchart',
        version: '2.0',
        nodes: [],
        edges: [],
        metadata: { title: 'Flow Diagram', updatedAt: new Date(100).toISOString() },
        layout: { type: 'custom', direction: 'TB', spacing: { horizontal: 80, vertical: 60 }, padding: { horizontal: 24, vertical: 16 } },
        theme: { name: 'light', displayName: 'Light Theme', domains: {} },
    },
    ...overrides,
});

describe('diagramManagementPage helpers', () => {
    it('coerces unsupported filter views back to recent', () => {
        expect(coerceFilterView('templates')).toBe('templates');
        expect(coerceFilterView('unknown-view')).toBe('recent');
        expect(coerceFilterView(null)).toBe('recent');
    });

    it('detects local diagram type from metadata hints and title fallbacks', () => {
        expect(detectDiagramType(createItem({
            title: '系统架构总览',
            raw: {
                ...createItem().raw,
                type: '' as StandardDiagramData['type'],
                metadata: { title: '系统架构总览' },
            },
        }))).toBe('architecture');

        expect(detectDiagramType(createItem({
            title: 'Product Mind',
            raw: {
                ...createItem().raw,
                type: 'mindmap',
                metadata: { title: 'Product Mind' },
            },
        }))).toBe('mindmap');
    });

    it('returns node counts only for local diagrams', () => {
        expect(getNodeCount(createItem({
            raw: {
                ...createItem().raw,
                nodes: [
                    { id: 'n1', description: '', type: 'process', domain: 'test' },
                    { id: 'n2', description: '', type: 'process', domain: 'test' },
                ],
            },
        }))).toBe(2);

        expect(getNodeCount(createItem({
            source: 'supabase',
            raw: {
                id: 'remote-1',
                title: 'Remote',
            } as UnifiedDiagramItem['raw'],
        }))).toBeNull();
    });

    it('filters and sorts workspace items by view, search term, and type', () => {
        const items: UnifiedDiagramItem[] = [
            createItem({
                id: 'template-1',
                title: 'Cloud Template',
                updatedAt: 5,
                source: 'template',
                role: 'template',
                raw: { id: 'template-1', title: 'Cloud Template' } as UnifiedDiagramItem['raw'],
            }),
            createItem({
                id: 'remote-1',
                title: 'Zeta Shared',
                updatedAt: 10,
                source: 'supabase',
                role: 'viewer',
                raw: { id: 'remote-1', title: 'Zeta Shared' } as UnifiedDiagramItem['raw'],
            }),
            createItem({
                id: 'local-2',
                title: 'Architecture Board',
                updatedAt: 30,
                raw: {
                    ...createItem().raw,
                    id: 'diagram-2',
                    name: 'Architecture Board',
                    type: 'architecture',
                    metadata: { title: 'Architecture Board' },
                },
            }),
            createItem({
                id: 'local-3',
                title: 'Alpha Flow',
                updatedAt: 20,
                raw: {
                    ...createItem().raw,
                    id: 'diagram-3',
                    name: 'Alpha Flow',
                    type: 'flowchart',
                    metadata: { title: 'Alpha Flow' },
                },
            }),
        ];

        expect(filterAndSortItems(items, 'recent', '', 'updated').map(item => item.id)).toEqual([
            'local-2',
            'local-3',
            'remote-1',
        ]);

        expect(filterAndSortItems(items, 'shared', 'zeta', 'updated').map(item => item.id)).toEqual([
            'remote-1',
        ]);

        expect(filterAndSortItems(items, 'local', '', 'type').map(item => item.id)).toEqual([
            'local-2',
            'local-3',
        ]);
    });

    it('selects the newest 30 recent documents before applying presentation sorting', () => {
        const items = Array.from({ length: 35 }, (_, index) => createItem({
            id: `local-${index}`,
            title: index === 34 ? 'A newest document' : `Document ${String(index).padStart(2, '0')}`,
            updatedAt: index === 34 ? 10_000 : index,
            raw: {
                ...createItem().raw,
                id: `diagram-${index}`,
            },
        }));

        const recentByUpdated = filterAndSortItems(items, 'recent', '', 'updated');
        expect(recentByUpdated).toHaveLength(30);
        expect(recentByUpdated[0]?.id).toBe('local-34');
        expect(recentByUpdated.map(item => item.id)).not.toContain('local-0');

        const recentByName = filterAndSortItems(items, 'recent', '', 'name');
        expect(recentByName).toHaveLength(30);
        expect(recentByName[0]?.id).toBe('local-34');
        expect(recentByName.map(item => item.id)).not.toContain('local-0');
    });

    it('keeps equal modification times deterministic', () => {
        const items = [
            createItem({ id: 'local-b', title: 'Same', updatedAt: 100 }),
            createItem({ id: 'local-a', title: 'Same', updatedAt: 100 }),
            createItem({ id: 'local-invalid', title: 'Unknown', updatedAt: Number.NaN }),
        ];
        expect(filterAndSortItems(items, 'recent', '', 'updated').map(item => item.id))
            .toEqual(['local-a', 'local-b', 'local-invalid']);
    });

    it('preserves the other inventory scope when one scope refreshes', () => {
        const local = createItem({ id: 'local-kept' });
        const oldTemplate = createItem({
            id: 'template-old',
            source: 'template',
            role: 'template',
        });
        const newTemplate = createItem({
            id: 'template-new',
            source: 'general_template',
            role: 'template',
        });
        const wrongScopeItem = createItem({ id: 'local-must-not-leak' });

        expect(getWorkspaceInventoryScope('recent')).toBe('documents');
        expect(getWorkspaceInventoryScope('templates')).toBe('templates');
        expect(mergeWorkspaceItemsByScope(
            [local, oldTemplate],
            [newTemplate, wrongScopeItem],
            'templates',
        ).map(item => item.id)).toEqual(['local-kept', 'template-new']);
        expect(mergeWorkspaceItemsByScope(
            [local, oldTemplate],
            [],
            'documents',
        ).map(item => item.id)).toEqual(['template-old']);
    });

    it('creates stable starter seeds for each local template type', () => {
        const blank = createTemplateSeed('blank');
        expect(blank).toMatchObject({
            name: 'Blank Canvas',
            type: 'flowchart',
            nodes: [],
            edges: [],
        });
        expect(blank?.id).toEqual(expect.any(String));

        const timeline = createTemplateSeed('timeline');
        expect(timeline).toMatchObject({
            name: 'Project Timeline',
            type: 'timeline',
        });
        expect(timeline?.nodes[0]).toMatchObject({
            id: 'root',
            type: 'timelineNode',
            domain: 'timeline',
        });

        const mindMap = createTemplateSeed('mindmap', { mindMapRootTopic: '中心主题' });
        expect(mindMap?.nodes[0]).toMatchObject({
            description: '中心主题',
            data: expect.objectContaining({ label: '中心主题' }),
        });
    });

    it('sanitizes localized mind-map root topics at the creation boundary', () => {
        expect(coerceWorkspaceMindMapRootTopic('  Quarterly\n plan  ')).toBe('Quarterly plan');
        expect(coerceWorkspaceMindMapRootTopic('<img src=x onerror=alert(1)> 中心\u0000\u202E主题'))
            .toBe('中心 主题');
        expect(coerceWorkspaceMindMapRootTopic('x'.repeat(400))).toHaveLength(200);
        expect(coerceWorkspaceMindMapRootTopic(null)).toBe('Central Topic');
        expect(coerceWorkspaceMindMapRootTopic('   ')).toBe('Central Topic');
    });

    it('resolves the newest trusted local modification timestamp', () => {
        const autosaveTime = NOW - 60_000;
        const storage = storageWith(JSON.stringify({
            diagramId: 'diagram-1', nodes: [], edges: [], timestamp: autosaveTime, version: '1.0',
        }));
        expect(resolveWorkspaceLocalModifiedAt({
            id: 'diagram-1',
            metadata: {
                createdAt: new Date(NOW - 180_000).toISOString(),
                updatedAt: new Date(NOW - 120_000).toISOString(),
            },
        }, storage, NOW)).toBe(autosaveTime);
    });

    it('falls back through metadata without inventing the current time', () => {
        const createdAt = NOW - 86_400_000;
        expect(resolveWorkspaceLocalModifiedAt({
            id: 'diagram-1',
            metadata: { updatedAt: 'invalid', createdAt: new Date(createdAt).toISOString() },
        }, null, NOW)).toBe(createdAt);
        expect(resolveWorkspaceLocalModifiedAt({ id: 'diagram-1', metadata: {} }, null, NOW))
            .toBe(WORKSPACE_UNKNOWN_TIMESTAMP);
    });

    it('rejects malformed, mismatched, extreme, and future timestamp inputs', () => {
        const invalidAutosaves = [
            '{',
            JSON.stringify({ diagramId: 'other', nodes: [], edges: [], timestamp: NOW - 1, version: '1.0' }),
            JSON.stringify({ diagramId: 'diagram-1', nodes: [], edges: [], timestamp: null, version: '1.0' }),
            'x'.repeat(2 * 1024 * 1024 + 1),
        ];
        for (const raw of invalidAutosaves) {
            expect(resolveWorkspaceLocalModifiedAt({
                id: 'diagram-1',
                metadata: { updatedAt: new Date(NOW + 10 * 60_000).toISOString(), createdAt: 0 },
            }, storageWith(raw), NOW)).toBe(WORKSPACE_UNKNOWN_TIMESTAMP);
        }
        expect(resolveWorkspaceLocalModifiedAt(null, null, NOW)).toBe(WORKSPACE_UNKNOWN_TIMESTAMP);
        expect(resolveWorkspaceLocalModifiedAt({ id: '@@@' }, storageWith(null), NOW))
            .toBe(WORKSPACE_UNKNOWN_TIMESTAMP);
    });

    it('survives unavailable storage and formats unknown times honestly', () => {
        const updatedAt = NOW - 5_000;
        const storage: Pick<Storage, 'getItem'> = {
            getItem: () => { throw new Error('blocked'); },
        };
        expect(resolveWorkspaceLocalModifiedAt({ id: 'diagram-1', metadata: { updatedAt } }, storage, NOW))
            .toBe(updatedAt);
        expect(formatWorkspaceTimeAgo(0, 'en', 'Unknown', NOW)).toBe('Unknown');
        expect(formatWorkspaceTimeAgo(-1, 'en', 'Unknown', NOW)).toBe('Unknown');
        expect(formatWorkspaceTimeAgo(Number.NaN, 'en', 'Unknown', NOW)).toBe('Unknown');
        expect(formatWorkspaceTimeAgo(NOW + 10 * 60_000, 'en', 'Unknown', NOW)).toBe('Unknown');
        expect(formatWorkspaceTimeAgo(NOW - 120_000, 'en', 'Unknown', NOW)).toBe('2 minutes ago');
    });
});

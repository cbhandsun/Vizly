import { describe, expect, it } from 'vitest';
import type { StandardDiagramData } from '../../core/models/DiagramModels';
import {
    coerceFilterView,
    coerceWorkspaceMindMapRootTopic,
    createTemplateSeed,
    detectDiagramType,
    filterAndSortItems,
    getNodeCount,
    type UnifiedDiagramItem,
} from '../diagramManagementPage.helpers';

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
});

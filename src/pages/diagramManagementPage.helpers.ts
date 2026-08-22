import type { DiagramMetadata } from '../services/storage/types';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import type { ManageStorageProvider } from '@/components/ui/ManageTopToolbar';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { coerceRemoteTemplateMetadata, type RemoteTemplateMetadata } from '@/core/utils/remoteTemplateMetadata';

let supabaseModulePromise: Promise<typeof import('@/services/supabase')> | null = null;
let shareServiceModulePromise: Promise<typeof import('../services/ShareService')> | null = null;
let dataRegistryModulePromise: Promise<typeof import('../data/DataRegistry')> | null = null;
let unifiedStorageModulePromise: Promise<typeof import('../services/UnifiedStorageService')> | null = null;

const STORAGE_PROVIDER_KEY = 'DiagramView.StorageProvider';

export type DataSourceType = 'local' | 'supabase' | 's3' | 'template' | 'general_template';
export type FilterViewType = 'recent' | 'local' | 'cloud' | 'shared' | 'templates' | 'general_templates';
export type ViewMode = 'grid' | 'list';
export type SortKey = 'updated' | 'name' | 'type';
export type TemplateKey = 'flowchart' | 'architecture' | 'mindmap' | 'timeline' | 'blank';

export interface TemplateSeedOptions {
    mindMapRootTopic?: unknown;
}

export interface UnifiedDiagramItem {
    id: string;
    title: string;
    updatedAt: number;
    source: DataSourceType;
    role: string;
    raw: StandardDiagramData | DiagramMetadata | RemoteTemplateMetadata;
}

const FILTER_VIEW_TYPES = new Set<FilterViewType>(['recent', 'local', 'cloud', 'shared', 'templates', 'general_templates']);

export const loadSupabaseClient = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        return null;
    }
    supabaseModulePromise ??= import('@/services/supabase');
    const { supabase } = await supabaseModulePromise;
    return supabase;
};

export const loadShareService = async () => {
    shareServiceModulePromise ??= import('../services/ShareService');
    const { shareService } = await shareServiceModulePromise;
    return shareService;
};

export const loadDataRegistry = async () => {
    dataRegistryModulePromise ??= import('../data/DataRegistry');
    const { dataRegistry } = await dataRegistryModulePromise;
    return dataRegistry;
};

export const loadUnifiedStorage = async () => {
    unifiedStorageModulePromise ??= import('../services/UnifiedStorageService');
    const { unifiedStorage } = await unifiedStorageModulePromise;
    return unifiedStorage;
};

export const isTemplateLibraryView = (view: FilterViewType) => view === 'templates' || view === 'general_templates';

export const readStoredCloudProvider = (): ManageStorageProvider => {
    try {
        const stored = localStorage.getItem(STORAGE_PROVIDER_KEY);
        return stored === 's3' || stored === 'supabase' ? stored : 'supabase';
    } catch {
        return 'supabase';
    }
};

export const coerceFilterView = (value: unknown): FilterViewType => (
    typeof value === 'string' && FILTER_VIEW_TYPES.has(value as FilterViewType)
        ? value as FilterViewType
        : 'recent'
);

export function detectDiagramType(item: UnifiedDiagramItem): string {
    if (item.source !== 'local') return 'default';
    const raw = item.raw as StandardDiagramData;
    const type = ((raw.metadata as { type?: string } | undefined)?.type || raw.type || '').toLowerCase();
    if (type.includes('mind')) return 'mindmap';
    if (type.includes('time') || type.includes('gantt')) return 'timeline';
    if (type.includes('arch') || type.includes('infra') || type.includes('system')) return 'architecture';

    const title = (item.title || '').toLowerCase();
    if (title.includes('架构') || title.includes('architecture')) return 'architecture';
    if (title.includes('脑图') || title.includes('mind')) return 'mindmap';
    if (title.includes('时间') || title.includes('甘特') || title.includes('timeline')) return 'timeline';
    return 'flowchart';
}

export function getNodeCount(item: UnifiedDiagramItem): number | null {
    if (item.source !== 'local') return null;
    const raw = item.raw as StandardDiagramData;
    return raw.nodes?.length || null;
}

export const isTemplateItem = (item: UnifiedDiagramItem) =>
    item.source === 'template' || item.source === 'general_template';

export const filterAndSortItems = (
    unifiedItems: UnifiedDiagramItem[],
    activeView: FilterViewType,
    searchTerm: string,
    sortKey: SortKey
) => {
    let viewFiltered = unifiedItems;
    switch (activeView) {
        case 'recent':
            viewFiltered = unifiedItems.filter(item => !isTemplateItem(item)).slice(0, 30);
            break;
        case 'local':
            viewFiltered = unifiedItems.filter(item => item.source === 'local');
            break;
        case 'cloud':
            viewFiltered = unifiedItems.filter(item => item.source === 's3' || item.source === 'supabase');
            break;
        case 'shared':
            viewFiltered = unifiedItems.filter(item => item.role === 'viewer');
            break;
        case 'templates':
            viewFiltered = unifiedItems.filter(item => item.source === 'template');
            break;
        case 'general_templates':
            viewFiltered = unifiedItems.filter(item => item.source === 'general_template');
            break;
    }

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        viewFiltered = viewFiltered.filter(item => (item.title || '').toLowerCase().includes(term));
    }

    const sorted = [...viewFiltered];
    switch (sortKey) {
        case 'name':
            sorted.sort((left, right) => left.title.localeCompare(right.title));
            break;
        case 'type':
            sorted.sort((left, right) => detectDiagramType(left).localeCompare(detectDiagramType(right)));
            break;
        case 'updated':
        default:
            sorted.sort((left, right) => right.updatedAt - left.updatedAt);
            break;
    }

    return sorted;
};

const MIND_MAP_TOPIC_MAX_LENGTH = 200;

const replaceUnsafeMindMapTopicCharacters = (value: string): string => (
    Array.from(value, (character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        const isControl = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
        const isBidiOverride = codePoint >= 0x202a && codePoint <= 0x202e;
        const isBidiIsolate = codePoint >= 0x2066 && codePoint <= 0x2069;
        return isControl || isBidiOverride || isBidiIsolate ? ' ' : character;
    }).join('')
);

export const coerceWorkspaceMindMapRootTopic = (value: unknown): string => {
    if (typeof value !== 'string') return 'Central Topic';
    const normalized = replaceUnsafeMindMapTopicCharacters(value
        .normalize('NFKC')
        .replace(/<[^>]*>/g, ' '));
    const topic = normalized
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MIND_MAP_TOPIC_MAX_LENGTH);
    return topic || 'Central Topic';
};

export const createTemplateSeed = (
    templateKey: TemplateKey,
    options: TemplateSeedOptions = {},
): StandardDiagramData | null => {
    switch (templateKey) {
        case 'flowchart':
            return {
                id: crypto.randomUUID(),
                name: 'New Flowchart',
                type: 'flowchart',
                version: '2.0',
                nodes: [],
                edges: [],
                layout: { type: 'custom', direction: 'TB', spacing: { horizontal: 80, vertical: 60 }, padding: { horizontal: 24, vertical: 16 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        case 'architecture':
            return {
                id: crypto.randomUUID(),
                name: 'New Architecture Diagram',
                type: 'architecture',
                version: '2.0',
                nodes: [],
                edges: [],
                layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 120, vertical: 80 }, padding: { horizontal: 24, vertical: 16 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        case 'mindmap': {
            const rootTopic = coerceWorkspaceMindMapRootTopic(options.mindMapRootTopic);
            return {
                id: crypto.randomUUID(),
                name: 'Mind Map Pro',
                type: 'mindmap',
                version: '2.0',
                nodes: [{
                    id: 'root',
                    type: 'mindmap',
                    domain: 'mindmap',
                    description: rootTopic,
                    position: { x: 0, y: 0 },
                    data: { label: rootTopic, direction: 'LR' }
                }],
                edges: [],
                layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 50, vertical: 20 }, padding: { horizontal: 20, vertical: 20 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        }
        case 'timeline':
            return {
                id: crypto.randomUUID(),
                name: 'Project Timeline',
                type: 'timeline',
                version: '2.0',
                nodes: [{
                    id: 'root',
                    type: 'timelineNode',
                    domain: 'timeline',
                    description: 'Project Launch',
                    position: { x: 0, y: 0 },
                    data: { label: 'Project Launch', type: 'gantt' }
                }],
                edges: [],
                layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 50, vertical: 20 }, padding: { horizontal: 20, vertical: 20 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        case 'blank':
            return {
                id: crypto.randomUUID(),
                name: 'Blank Canvas',
                type: 'flowchart',
                version: '2.0',
                nodes: [],
                edges: [],
                layout: { type: 'custom', direction: 'TB', spacing: { horizontal: 50, vertical: 50 }, padding: { horizontal: 20, vertical: 20 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        default:
            return null;
    }
};

export const loadWorkspaceItems = async (activeView: FilterViewType, cloudProvider: ManageStorageProvider, user: unknown) => {
    const items: UnifiedDiagramItem[] = [];
    const templateView = isTemplateLibraryView(activeView);

    if (!templateView) {
        const [dataRegistry, unifiedStorage] = await Promise.all([
            loadDataRegistry(),
            loadUnifiedStorage(),
        ]);

        await dataRegistry.initialize();
        const localService = dataRegistry.getDataService();
        const localResult = localService.queryDiagrams({});
        localResult.data.forEach((diagram) => {
            items.push({
                id: `local_${diagram.id}`,
                title: diagram.name || diagram.metadata?.title || 'Untitled',
                updatedAt: new Date(diagram.metadata?.updatedAt || Date.now()).getTime(),
                source: 'local',
                role: 'owner',
                raw: diagram
            });
        });

        const cloudStorageProvider = unifiedStorage.getProvider(cloudProvider);
        if (cloudStorageProvider.isConfigured() && (cloudProvider !== 'supabase' || user)) {
            try {
                const cloudResults = await unifiedStorage.listDiagrams();
                cloudResults.forEach((diagram) => {
                    items.push({
                        id: `${cloudProvider}_${diagram.id}`,
                        title: diagram.title || 'Untitled',
                        updatedAt: diagram.updatedAt?.getTime() || 0,
                        source: cloudProvider,
                        role: diagram.role || 'owner',
                        raw: diagram
                    });
                });
            } catch (error) {
                safeLog.error('Cloud fetch failed', redactSensitiveLogValue(error));
            }
        }

        if (cloudProvider === 'supabase' && user) {
            try {
                const shareService = await loadShareService();
                const sharedResults = await shareService.listSharedWithMe();
                sharedResults.forEach((diagram) => {
                    if (!items.find(item => item.id === `supabase_${diagram.id}`)) {
                        items.push({
                            id: `supabase_shared_${diagram.id}`,
                            title: diagram.title || 'Untitled',
                            updatedAt: diagram.updatedAt?.getTime() || 0,
                            source: 'supabase',
                            role: 'viewer',
                            raw: diagram
                        });
                    }
                });
            } catch (error) {
                safeLog.error('Shared fetch failed', redactSensitiveLogValue(error));
            }
        }
    }

    if (templateView) {
        const supabase = await loadSupabaseClient();
        if (supabase) {
            try {
                const { data } = await supabase
                    .from('system_templates')
                    .select('id, title, category, tags, sort_order, thumbnail_url')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: false });

                if (data) {
                    data.forEach((template) => {
                        const isGeneral = template.category === 'general';
                        items.push({
                            id: `template_${template.id}`,
                            title: template.title,
                            updatedAt: 0,
                            source: isGeneral ? 'general_template' : 'template',
                            role: 'template',
                            raw: coerceRemoteTemplateMetadata(template)
                        });
                    });
                }
            } catch (error) {
                safeLog.error('Templates fetch failed', redactSensitiveLogValue(error));
            }
        }
    }

    items.sort((left, right) => right.updatedAt - left.updatedAt);
    return items;
};

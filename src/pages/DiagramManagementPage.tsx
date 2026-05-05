import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Button, Modal, Dropdown, MenuProps, Avatar, App } from 'antd';
import {
    CloudOutlined,
    LaptopOutlined,
    DeleteOutlined,
    ApiOutlined,
    SearchOutlined,
    UserOutlined,
    SettingOutlined,
    ShareAltOutlined,
    MoreOutlined,
    BlockOutlined,
    DeploymentUnitOutlined,
    ClockCircleOutlined,
    GatewayOutlined,
    FolderOpenOutlined,
    PlusOutlined,
    ApartmentOutlined,
    NodeIndexOutlined,
    ThunderboltOutlined,
    EditOutlined,
    ExportOutlined,
    BgColorsOutlined,
    GlobalOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
    SortAscendingOutlined,
    DownOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { dataRegistry } from '../data/DataRegistry';
import { unifiedStorage } from '../services/UnifiedStorageService';
import { shareService } from '../services/ShareService';
import { DiagramMetadata } from '../services/storage/types';
import { StandardDiagramData } from '@/core';
import { useTranslation } from 'react-i18next';
import { ManageStorageProvider } from '@/components/ui/ManageTopToolbar';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { coerceToStandardDiagramDataWithReport } from '@/core';
import RemoteDiagramCover from '@/components/shared/RemoteDiagramCover';
import { PRESET_MAP } from '@/data/standardized';
import { TemplateCascaderMenu } from '@/components/diagrams/ui/TemplateCascaderMenu';

import './WorkspaceDashboard.css';
import { appMessage } from '@/core/utils/antdStaticBridge';


// --- Unified Data Types ---
type DataSourceType = 'local' | 'supabase' | 's3';
type FilterViewType = 'recent' | 'local' | 'cloud' | 'shared';
type ViewMode = 'grid' | 'list';
type SortKey = 'updated' | 'name' | 'type';

interface UnifiedDiagramItem {
    id: string;
    title: string;
    updatedAt: number;
    source: DataSourceType;
    role: string;
    raw: StandardDiagramData | DiagramMetadata; 
}

// --- Helpers ---
function getGreeting(): { text: string; emoji: string } {
    const h = new Date().getHours();
    if (h < 6) return { text: 'Night owl mode', emoji: '🦉' };
    if (h < 12) return { text: 'Good morning', emoji: '☀️' };
    if (h < 18) return { text: 'Good afternoon', emoji: '🚀' };
    return { text: 'Good evening', emoji: '🌙' };
}

function detectDiagramType(item: UnifiedDiagramItem): string {
    if (item.source !== 'local') return 'default';
    const raw = item.raw as StandardDiagramData;
    const t = ((raw.metadata as any)?.type || raw.type || '').toLowerCase();
    if (t.includes('mind')) return 'mindmap';
    if (t.includes('time') || t.includes('gantt')) return 'timeline';
    if (t.includes('arch') || t.includes('infra') || t.includes('system')) return 'architecture';
    // Check title for hints
    const title = (item.title || '').toLowerCase();
    if (title.includes('架构') || title.includes('architecture')) return 'architecture';
    if (title.includes('脑图') || title.includes('mind')) return 'mindmap';
    if (title.includes('时间') || title.includes('甘特') || title.includes('timeline')) return 'timeline';
    return 'flowchart';
}

function getNodeCount(item: UnifiedDiagramItem): number | null {
    if (item.source !== 'local') return null;
    const raw = item.raw as StandardDiagramData;
    return raw.nodes?.length || null;
}

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
    flowchart: <DeploymentUnitOutlined />,
    mindmap: <GatewayOutlined />,
    timeline: <ClockCircleOutlined />,
    architecture: <BlockOutlined />,
    default: <ApartmentOutlined />,
};

const WorkspaceDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useTranslation();
    const { user } = useAuth();
    const { message, modal } = App.useApp();
    
    // --- State ---
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [activeView, setActiveView] = useState<FilterViewType>('recent');
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortKey, setSortKey] = useState<SortKey>('updated');
    
    const [unifiedItems, setUnifiedItems] = useState<UnifiedDiagramItem[]>([]);
    const [cloudProvider, setCloudProvider] = useState<ManageStorageProvider>(() => {
        const p = searchParams.get('provider');
        if (p === 's3' || p === 'supabase') return p;
        return unifiedStorage.currentProviderId;
    });

    // --- Context Menu State (Phase 1.3) ---
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: UnifiedDiagramItem } | null>(null);
    const ctxMenuRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = useCallback((e: React.MouseEvent, item: UnifiedDiagramItem) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY, item });
    }, []);

    // Dismiss on click outside or Escape
    useEffect(() => {
        if (!ctxMenu) return;
        const dismiss = () => setCtxMenu(null);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
        document.addEventListener('click', dismiss);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', onKey);
        };
    }, [ctxMenu]);

    // --- Data Loading ---
    const loadAllData = async () => {
        setLoading(true);
        try {
            const newItems: UnifiedDiagramItem[] = [];

            // 1. Load Local
            const localService = dataRegistry.getDataService();
            const localResult = localService.queryDiagrams({});
            localResult.data.forEach(d => {
                newItems.push({
                    id: `local_${d.id}`,
                    title: d.name || d.metadata?.title || 'Untitled',
                    updatedAt: new Date(d.metadata?.updatedAt || Date.now()).getTime(),
                    source: 'local',
                    role: 'owner',
                    raw: d
                });
            });

            // 2. Load Cloud
            if (cloudProvider !== 'supabase' || user) {
                try {
                    const cloudResults = await unifiedStorage.listDiagrams();
                    cloudResults.forEach(d => {
                        newItems.push({
                            id: `${cloudProvider}_${d.id}`,
                            title: d.title || 'Untitled',
                            updatedAt: d.updatedAt?.getTime() || 0,
                            source: cloudProvider,
                            role: d.role || 'owner',
                            raw: d
                        });
                    });
                } catch (e) {
                    console.error("Cloud fetch failed", e);
                }
            }

            // 3. Load Shared (Supabase)
            if (cloudProvider === 'supabase' && user) {
                try {
                    const sharedResults = await shareService.listSharedWithMe();
                    sharedResults.forEach(d => {
                        if (!newItems.find(item => item.id === `supabase_${d.id}`)) {
                            newItems.push({
                                id: `supabase_shared_${d.id}`,
                                title: d.title || 'Untitled',
                                updatedAt: d.updatedAt?.getTime() || 0,
                                source: 'supabase',
                                role: 'viewer',
                                raw: d
                            });
                        }
                    });
                } catch (e) {
                    console.error("Shared fetch failed", e);
                }
            }

            // Sort by most recent
            newItems.sort((a, b) => b.updatedAt - a.updatedAt);
            setUnifiedItems(newItems);
        } catch (error) {
            console.error("Failed to load dashboard data", error);
            appMessage.error("Failed to load workspace data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllData();
    }, [cloudProvider, user?.id]);

    // --- Actions ---
    const handleOpenDiagram = async (item: UnifiedDiagramItem) => {
        if (item.source === 'local') {
            const raw = item.raw as StandardDiagramData;
            navigate(`/?diagram=${raw.id}`);
            return;
        }

        if (item.source === 'supabase' && !user) {
            setIsAuthModalOpen(true);
            return;
        }

        const hide = appMessage.loading("Loading diagram from cloud...", 0);
        try {
            const rawObj = item.raw as DiagramMetadata;
            const savedDiagram = await unifiedStorage.loadDiagram(rawObj.id);
            if (savedDiagram) {
                const localService = dataRegistry.getDataService();
                const report = coerceToStandardDiagramDataWithReport(savedDiagram.content, { id: savedDiagram.id, title: savedDiagram.title });
                
                if (report.issues.some(x => x.level === 'error')) {
                    appMessage.error("Diagram format error. Cannot load.");
                    return;
                }
                
                const normalized: StandardDiagramData = {
                    ...report.diagram,
                    id: savedDiagram.id,
                    name: savedDiagram.title || report.diagram.name,
                    metadata: {
                        ...(report.diagram.metadata || {}),
                        title: savedDiagram.title || report.diagram.metadata?.title,
                        updatedAt: savedDiagram.updated_at,
                        cloud: {
                            provider: item.source,
                            id: savedDiagram.id,
                            title: savedDiagram.title,
                            openedAt: new Date().toISOString()
                        }
                    },
                    isReadonly: item.role === 'viewer'
                };
                localService.registerDiagram(normalized);
                navigate(`/?diagram=${savedDiagram.id}`);
            } else {
                appMessage.error("Diagram not found in cloud storage.");
            }
        } catch (error: any) {
            appMessage.error("Failed to open diagram: " + error.message);
        } finally {
            hide();
        }
    };

    const handleDeleteDiagram = async (e: React.MouseEvent, item: UnifiedDiagramItem) => {
        e.stopPropagation();
        modal.confirm({
            title: 'Delete Document',
            content: 'Are you sure you want to completely erase this document? This cannot be undone.',
            okText: 'Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    if (item.source === 'local') {
                        const localService = dataRegistry.getDataService();
                        const rawObj = item.raw as StandardDiagramData;
                        localService.deleteDiagram(rawObj.id);
                    } else {
                        const rawObj = item.raw as DiagramMetadata;
                        await unifiedStorage.deleteDiagram(rawObj.id);
                    }
                    appMessage.success('Deleted successfully');
                    loadAllData();
                } catch (error) {
                    appMessage.error("Failed to delete diagram.");
                }
            }
        });
    };

    // Advanced Creation Router mapping to correct domains
    const handleCreateTemplate = (templateKey: 'flowchart' | 'architecture' | 'mindmap' | 'timeline' | 'blank') => {
        let templateData: StandardDiagramData | null = null;
        
        // Strict domain separation
        if (templateKey === 'flowchart') {
            templateData = PRESET_MAP['SupplyChainReceivingFlow'];
        } else if (templateKey === 'architecture') {
            templateData = PRESET_MAP['ArchitectureStandardData'];
        } else if (templateKey === 'mindmap') {
            templateData = {
                id: crypto.randomUUID(),
                name: 'Mind Map Pro',
                type: 'mindmap',
                version: '2.0',
                nodes: [{ 
                    id: 'root', 
                    type: 'mindmap', 
                    domain: 'mindmap',
                    description: 'Central Idea',
                    position: { x: 0, y: 0 }, 
                    data: { label: 'Central Idea', direction: 'LR' } 
                }],
                edges: [],
                layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 50, vertical: 20 }, padding: { horizontal: 20, vertical: 20 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        } else if (templateKey === 'timeline') {
            templateData = {
                id: crypto.randomUUID(),
                name: 'Project Timeline',
                type: 'timeline',
                version: '2.0',
                nodes: [{ 
                    id: 'root', 
                    type: 'timeline', 
                    domain: 'timeline',
                    description: 'Project Launch',
                    position: { x: 0, y: 0 }, 
                    data: { label: 'Project Launch', type: 'gantt' } 
                }],
                edges: [],
                layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 50, vertical: 20 }, padding: { horizontal: 20, vertical: 20 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        } else if (templateKey === 'blank') {
             templateData = {
                id: crypto.randomUUID(),
                name: 'Blank Canvas',
                type: 'flowchart',
                version: '2.0',
                nodes: [],
                edges: [],
                layout: { type: 'custom', direction: 'TB', spacing: { horizontal: 50, vertical: 50 }, padding: { horizontal: 20, vertical: 20 } },
                theme: { name: 'light', displayName: 'Light Theme', domains: {} }
            };
        }

        if (templateData) {
            const localService = dataRegistry.getDataService();
            const cloned = JSON.parse(JSON.stringify(templateData));
            cloned.id = crypto.randomUUID(); // ensure fresh ID
            // Ensure type is always set for consistent plugin routing
            if (!cloned.type) {
                const TYPE_DEFAULTS: Record<string, string> = {
                    flowchart: 'flowchart', architecture: 'architecture',
                    mindmap: 'mindmap', timeline: 'timeline', blank: 'flowchart'
                };
                cloned.type = TYPE_DEFAULTS[templateKey] || 'flowchart';
            }
            localService.registerDiagram(cloned);
            // Persist diagram type index to localStorage so DiagramViewer
            // can resolve the correct plugin even after a page refresh.
            try {
                const configsRaw = localStorage.getItem('vizly_diagram_configs');
                const configs: Record<string, any> = configsRaw ? JSON.parse(configsRaw) : {};
                configs[cloned.id] = { id: cloned.id, type: cloned.type, name: cloned.name, updatedAt: Date.now() };
                localStorage.setItem('vizly_diagram_configs', JSON.stringify(configs));
            } catch { /* ignore storage errors */ }
            navigate(`/?diagram=${cloned.id}`);
        }
    };

    const handleTemplateMenuChange = async (val: string[], leafKey: string, rootGroup: string) => {
        if (!leafKey) return;

        const seedAutoSaveAndNavigate = (normalized: any, id: string) => {
            const localService = dataRegistry.getDataService();
            const cloned = JSON.parse(JSON.stringify(normalized));
            cloned.id = crypto.randomUUID(); // ensure fresh ID for new creations from template
            localService.registerDiagram(cloned);
            
            try {
                const configsRaw = localStorage.getItem('vizly_diagram_configs');
                const configs: Record<string, any> = configsRaw ? JSON.parse(configsRaw) : {};
                configs[cloned.id] = { id: cloned.id, type: cloned.type || 'flowchart', name: cloned.name, updatedAt: Date.now() };
                localStorage.setItem('vizly_diagram_configs', JSON.stringify(configs));
            } catch { /* ignore storage errors */ }
            
            try {
                localStorage.removeItem(`flowchart-autosave-v2-${cloned.id}`);
            } catch (e) {}

            navigate(`/?diagram=${cloned.id}`);
        };

        if (rootGroup === 'system-templates') {
            const messageKey = appMessage.loading('正在加载云端模板...', 0);
            try {
                const { supabase } = await import('@/services/supabase');
                if (supabase) {
                    const { data, error } = await supabase.from('system_templates').select('content, title, id').eq('id', leafKey).single();
                    if (!error && data && data.content) {
                        const baseData = {
                            ...data.content,
                            id: data.id,
                            name: data.title || data.content.name,
                            metadata: {
                                ...(data.content.metadata || {}),
                                title: data.title
                            }
                        };
                        const { coerceToStandardDiagramData } = await import('@/core/utils/coerceDiagram');
                        const normalized = coerceToStandardDiagramData(baseData, { id: data.id, title: data.title });
                        seedAutoSaveAndNavigate(normalized, data.id);
                    } else {
                        appMessage.error('模板内容为空');
                    }
                }
            } catch (e: any) {
                appMessage.error(`加载失败: ${e.message}`);
            } finally {
                messageKey();
            }
        } else if (rootGroup === 'gallery' || rootGroup === 'by-tags' || rootGroup === 'all-demos') {
            const preset = PRESET_MAP[leafKey];
            if (preset) {
                const trueId = preset.id || leafKey;
                seedAutoSaveAndNavigate({
                    ...preset,
                    id: trueId,
                    metadata: { ...preset.metadata, title: preset.name }
                }, trueId);
            }
        } else if (rootGroup === 'local-workspace') {
            const d = localStorage.getItem('diagram-custom-presets');
            if (d) {
                try {
                    const maps = JSON.parse(d);
                    const found = maps[leafKey];
                    if (found) {
                        seedAutoSaveAndNavigate(found, found.id || leafKey);
                    }
                } catch (e) { }
            }
        }
    };

    // --- Computed Views ---
    const filteredItems = useMemo(() => {
        let viewFiltered = unifiedItems;
        switch (activeView) {
            case 'recent':
                viewFiltered = unifiedItems.slice(0, 30);
                break;
            case 'local':
                viewFiltered = unifiedItems.filter(i => i.source === 'local');
                break;
            case 'cloud':
                viewFiltered = unifiedItems.filter(i => i.source === 's3' || i.source === 'supabase');
                break;
            case 'shared':
                viewFiltered = unifiedItems.filter(i => i.role === 'viewer');
                break;
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            viewFiltered = viewFiltered.filter(i => (i.title || '').toLowerCase().includes(term));
        }

        // Apply sorting
        const sorted = [...viewFiltered];
        switch (sortKey) {
            case 'name':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'type':
                sorted.sort((a, b) => detectDiagramType(a).localeCompare(detectDiagramType(b)));
                break;
            case 'updated':
            default:
                sorted.sort((a, b) => b.updatedAt - a.updatedAt);
                break;
        }
        return sorted;
    }, [unifiedItems, activeView, searchTerm, sortKey]);

    // --- Settings Menu ---
    const settingsMenu: MenuProps['items'] = [
        {
            key: 's3',
            label: 'Use S3 Cloud Storage',
            icon: <CloudOutlined />,
            onClick: () => {
                unifiedStorage.setProvider('s3');
                setCloudProvider('s3');
                appMessage.info('Switched purely to S3 Backend');
            }
        },
        {
            key: 'supabase',
            label: 'Use Supabase (Social)',
            icon: <ApiOutlined />,
            onClick: () => {
                unifiedStorage.setProvider('supabase');
                setCloudProvider('supabase');
                appMessage.info('Switched purely to Supabase');
            }
        },
        { type: 'divider' },
        {
            key: 'login',
            label: user ? `Logged in as ${user.email}` : 'Login via Supabase',
            icon: <UserOutlined />,
            onClick: () => !user && setIsAuthModalOpen(true)
        }
    ];

    const getCardMenu = (item: UnifiedDiagramItem): MenuProps['items'] => {
        const items: MenuProps['items'] = [
            { key: 'open_new', label: 'Open in new tab', icon: <ShareAltOutlined /> }
        ];
        if (item.role === 'owner') {
            items.push({ type: 'divider' });
            items.push({ key: 'delete', danger: true, label: 'Delete', icon: <DeleteOutlined /> });
        }
        return items;
    };

    const handleMenuClick = (e: any, item: UnifiedDiagramItem) => {
        e.domEvent.stopPropagation();
        if (e.key === 'delete') {
            handleDeleteDiagram(e.domEvent, item);
        } else if (e.key === 'open_new') {
            const rawId = (item.raw as any).id;
            window.open(`/?diagram=${rawId}`, '_blank');
        }
    };

    const formatTimeAgo = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hr ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} days ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    // --- Renderers ---
    const DiagramCardSkeleton = () => (
        <div className="skeleton-card">
            <div className="skeleton-cover" />
            <div className="skeleton-info">
                <div className="skeleton-title" />
                <div className="skeleton-meta" />
            </div>
        </div>
    );

    const CustomEmptyState = () => (
        <div className="workspace-empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
            <div className="workspace-empty-art" style={{ width: 48, height: 48, border: '1px dashed var(--vz-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <PlusOutlined style={{ color: 'var(--vz-text-secondary)', fontSize: 16 }} />
            </div>
            <div className="workspace-empty-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--vz-text-primary)', marginBottom: 4 }}>
                No diagrams
            </div>
            <div className="workspace-empty-desc" style={{ fontSize: 13, color: 'var(--vz-text-tertiary)', marginBottom: 24, maxWidth: 300 }}>
                Get started by creating a new document or pressing Ctrl+K.
            </div>
            <button className="create-btn-primary" onClick={() => handleCreateTemplate('blank')}>
                <PlusOutlined className="plus-icon" /> New Diagram
            </button>
        </div>
    );

    // --- Computed Counts ---
    const localCount = useMemo(() => unifiedItems.filter(i => i.source === 'local').length, [unifiedItems]);
    const cloudCount = useMemo(() => unifiedItems.filter(i => i.source !== 'local' && i.role !== 'viewer').length, [unifiedItems]);
    const sharedCount = useMemo(() => unifiedItems.filter(i => i.role === 'viewer').length, [unifiedItems]);

    return (
        <div className="workspace-dashboard">
            {/* Global Top Navigation */}
            <header className="workspace-global-header">
                <div className="workspace-header-brand" onClick={() => navigate('/manage')}>
                    <div className="workspace-header-logo">
                        <div style={{
                            width: 28,
                            height: 28,
                            background: 'var(--vz-brand-gradient)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '16px',
                            fontWeight: '800',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                        }}>V</div>
                    </div>
                    <div className="workspace-header-title">Vizly</div>
                </div>
                
                <div className="workspace-header-search-container">
                    <div className="workspace-search">
                        <SearchOutlined style={{ color: 'var(--vz-brand-from)', opacity: 0.7 }}/>
                        <input 
                            placeholder="Find your ideas..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="workspace-header-actions">
                    <button
                        className="workspace-icon-btn"
                        onClick={() => {
                            const html = document.documentElement;
                            const isDark = html.getAttribute('data-theme') === 'dark';
                            html.setAttribute('data-theme', isDark ? 'light' : 'dark');
                        }}
                        aria-label="Toggle theme"
                        title="Toggle theme"
                    >
                        <BgColorsOutlined />
                    </button>
                    <Dropdown
                        menu={{
                            items: [
                                { key: 'en', label: '🇬🇧 English', onClick: () => {} },
                                { key: 'zh', label: '🇨🇳 中文', onClick: () => {} },
                            ]
                        }}
                        trigger={['click']}
                        placement="bottomRight"
                    >
                        <button className="workspace-icon-btn" aria-label="Language" title="Language">
                            <GlobalOutlined />
                        </button>
                    </Dropdown>
                    <Dropdown menu={{ items: settingsMenu }} trigger={['click']} placement="bottomRight">
                        <button className="workspace-settings-trigger" aria-label="Settings">
                            {user ? <Avatar size={24} src={user.user_metadata?.avatar_url} icon={<UserOutlined />} /> : <SettingOutlined />}
                        </button>
                    </Dropdown>
                </div>
            </header>

            {/* Main Content Viewport */}
            <main className="workspace-main">
                
                {/* Hero Creation Matrix */}
                {!searchTerm && (
                    <div className="workspace-header-compact">
                        <div className="workspace-title">
                            Workspace
                            <span className="workspace-count">{unifiedItems.length} documents</span>
                        </div>

                        <div className="workspace-actions-compact" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <TemplateCascaderMenu 
                                templatesOnly={true} 
                                onChange={handleTemplateMenuChange} 
                                placeholder="选择模板..." 
                                style={{ width: 160 }} 
                            />
                            <Dropdown
                                menu={{
                                    items: [
                                        { key: 'flowchart', label: 'Flowchart', onClick: () => handleCreateTemplate('flowchart') },
                                        { key: 'mindmap', label: 'Mind Map', onClick: () => handleCreateTemplate('mindmap') },
                                        { key: 'timeline', label: 'Timeline', onClick: () => handleCreateTemplate('timeline') },
                                        { key: 'architecture', label: 'Architecture', onClick: () => handleCreateTemplate('architecture') },
                                    ]
                                }}
                                trigger={['hover']}
                                placement="bottomRight"
                            >
                                <button className="create-btn-primary" onClick={() => handleCreateTemplate('blank')}>
                                    <PlusOutlined className="plus-icon" />
                                    New Diagram <DownOutlined style={{ fontSize: '10px', marginLeft: '4px' }} />
                                </button>
                            </Dropdown>
                        </div>
                    </div>
                )}

                {/* Content Area with inner wrapper */}
                <div className="workspace-main-inner">
                    {/* Filter Tabs with Counts */}
                    <div className="workspace-matrix-header">
                        <div className="workspace-filter-tabs">
                            <div className={`filter-tab ${activeView === 'recent' ? 'active' : ''}`} onClick={() => setActiveView('recent')}>
                                <ClockCircleOutlined /> Recent
                                <span className="filter-tab-count">{unifiedItems.length}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'local' ? 'active' : ''}`} onClick={() => setActiveView('local')}>
                                <LaptopOutlined /> Local
                                <span className="filter-tab-count">{localCount}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'cloud' ? 'active' : ''}`} onClick={() => setActiveView('cloud')}>
                                <CloudOutlined /> Cloud
                                <span className="filter-tab-count">{cloudCount}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'shared' ? 'active' : ''}`} onClick={() => setActiveView('shared')}>
                                <ShareAltOutlined /> Shared
                                <span className="filter-tab-count">{sharedCount}</span>
                            </div>
                        </div>

                        <div className="workspace-view-controls">
                            <Dropdown
                                menu={{
                                    items: [
                                        { key: 'updated', label: '📅 Last modified', onClick: () => setSortKey('updated') },
                                        { key: 'name', label: '🔤 Name', onClick: () => setSortKey('name') },
                                        { key: 'type', label: '📊 Type', onClick: () => setSortKey('type') },
                                    ],
                                    selectedKeys: [sortKey]
                                }}
                                trigger={['click']}
                            >
                                <button className="workspace-icon-btn" title="Sort by">
                                    <SortAscendingOutlined />
                                </button>
                            </Dropdown>
                            <div className="view-toggle">
                                <button
                                    className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid view"
                                >
                                    <AppstoreOutlined />
                                </button>
                                <button
                                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                    title="List view"
                                >
                                    <UnorderedListOutlined />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Grid */}
                    {loading ? (
                        <div className="diagram-grid">
                            {Array(8).fill(0).map((_, i) => <DiagramCardSkeleton key={i} />)}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <CustomEmptyState />
                    ) : (
                        <div className={viewMode === 'grid' ? 'diagram-grid' : 'diagram-list'}>
                            {filteredItems.map(item => {
                                const diagramType = detectDiagramType(item);
                                const nodeCount = getNodeCount(item);

                                if (viewMode === 'list') {
                                    return (
                                        <div className="diagram-list-row" key={item.id} onClick={() => handleOpenDiagram(item)} onContextMenu={(e) => handleContextMenu(e, item)}>
                                            <div className={`list-row-icon type-${diagramType}`}>
                                                {TYPE_ICON_MAP[diagramType] || TYPE_ICON_MAP.default}
                                            </div>
                                            <div className="list-row-title">{item.title}</div>
                                            <span className={`type-badge ${diagramType}`}>{diagramType}</span>
                                            <span className="list-row-time">{formatTimeAgo(item.updatedAt)}</span>
                                            {nodeCount != null && (
                                                <span className="node-count-chip"><NodeIndexOutlined /> {nodeCount}</span>
                                            )}
                                            <div className="diagram-card-actions" style={{ position: 'relative', opacity: 1 }}>
                                                <Dropdown
                                                    menu={{ items: getCardMenu(item), onClick: (e) => handleMenuClick(e, item) }}
                                                    trigger={['click']}
                                                    placement="bottomRight"
                                                >
                                                    <button className="action-btn-glass" onClick={e => e.stopPropagation()}>
                                                        <MoreOutlined />
                                                    </button>
                                                </Dropdown>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="diagram-card" key={item.id} onClick={() => handleOpenDiagram(item)} onContextMenu={(e) => handleContextMenu(e, item)}>
                                        {item.source !== 'local' && (
                                            <div className={`source-badge ${item.source}`}>
                                                {item.source === 's3' ? <CloudOutlined /> : <ApiOutlined />}
                                                {item.source}
                                            </div>
                                        )}
                                        
                                        <div className="diagram-card-actions">
                                            <Dropdown 
                                                menu={{ items: getCardMenu(item), onClick: (e) => handleMenuClick(e, item) }} 
                                                trigger={['click']}
                                                placement="bottomRight"
                                            >
                                                <button className="action-btn-glass" onClick={e => e.stopPropagation()}>
                                                    <MoreOutlined />
                                                </button>
                                            </Dropdown>
                                        </div>

                                        <div className="diagram-card-cover">
                                            <div className="diagram-card-cover-inner">
                                                {item.source === 'local' ? (
                                                    <div className={`diagram-card-type-cover type-${diagramType}`}>
                                                        <span className="type-cover-icon">
                                                            {TYPE_ICON_MAP[diagramType] || TYPE_ICON_MAP.default}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <RemoteDiagramCover 
                                                        storageId={(item.raw as DiagramMetadata).id} 
                                                        alt={item.title} 
                                                        cacheBuster={item.updatedAt} 
                                                        height={150}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                        <div className="diagram-card-info">
                                            <div className="diagram-card-title">{item.title}</div>
                                            <div className="diagram-card-meta">
                                                <div className="diagram-card-meta-left">
                                                    <span className={`type-badge ${diagramType}`}>
                                                        {diagramType}
                                                    </span>
                                                    <span>{formatTimeAgo(item.updatedAt)}</span>
                                                </div>
                                                {nodeCount != null && (
                                                    <span className="node-count-chip">
                                                        <NodeIndexOutlined /> {nodeCount}
                                                    </span>
                                                )}
                                                {item.role === 'viewer' && <span style={{ color: '#8b5cf6', fontWeight: 600, fontSize: 11 }}>Shared</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            {/* Context Menu (Phase 1.3) */}
            {ctxMenu && (
                <div
                    ref={ctxMenuRef}
                    className="diagram-context-menu"
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                    onClick={e => e.stopPropagation()}
                >
                    <button className="ctx-menu-item" onClick={() => { handleOpenDiagram(ctxMenu.item); setCtxMenu(null); }}>
                        <EditOutlined /> Open
                    </button>
                    <button className="ctx-menu-item" onClick={() => {
                        const rawId = (ctxMenu.item.raw as any).id;
                        window.open(`/?diagram=${rawId}`, '_blank');
                        setCtxMenu(null);
                    }}>
                        <ExportOutlined /> Open in new tab
                    </button>
                    {ctxMenu.item.role === 'owner' && (
                        <>
                            <div className="ctx-menu-divider" />
                            <button className="ctx-menu-item danger" onClick={(e) => { handleDeleteDiagram(e as any, ctxMenu.item); setCtxMenu(null); }}>
                                <DeleteOutlined /> Delete
                            </button>
                        </>
                    )}
                </div>
            )}

            <AuthModal open={isAuthModalOpen} onCancel={() => setIsAuthModalOpen(false)} />
        </div>
    );
};

export default WorkspaceDashboardPage;

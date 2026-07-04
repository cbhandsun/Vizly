import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import App from 'antd/es/app';
import Avatar from 'antd/es/avatar';
import Dropdown from 'antd/es/dropdown';
import type { MenuProps } from 'antd/es/menu';
import { coerceDiagramId, getQueryOrHashParamFromLocation, type LocationLike } from '@/core/utils/inputBoundary';
import {
    ArrowUpAZ,
    Blocks,
    Boxes,
    Building2,
    ChevronDown,
    Cloud,
    Clock,
    Copy,
    Database,
    Ellipsis,
    ExternalLink,
    Globe,
    Laptop,
    LayoutGrid,
    List,
    Palette,
    Pencil,
    Plus,
    Search,
    Settings,
    Share2,
    Trash2,
    User,
    Waypoints,
    Workflow,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DiagramMetadata } from '../services/storage/types';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import type { ManageStorageProvider } from '@/components/ui/ManageTopToolbar';
import { useAuth } from '@/context/useAuth';
import {
    coerceFilterView,
    createTemplateSeed,
    detectDiagramType,
    filterAndSortItems,
    getNodeCount,
    isTemplateItem,
    loadDataRegistry,
    loadSupabaseClient,
    loadUnifiedStorage,
    loadWorkspaceItems,
    readStoredCloudProvider,
    type FilterViewType,
    type SortKey,
    type TemplateKey,
    type UnifiedDiagramItem,
    type ViewMode,
} from './diagramManagementPage.helpers';
// PRESET_MAP 已迁移到 Supabase system_templates，仅在 handleCreateTemplate 中保留最小依赖

import './WorkspaceDashboard.css';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { upsertDiagramConfigIndex } from '@/core/utils/diagramTypeStorage';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

const RemoteDiagramCover = React.lazy(() => import('@/components/shared/RemoteDiagramCover'));

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
    flowchart: <Workflow size={18} strokeWidth={2} />,
    mindmap: <Waypoints size={18} strokeWidth={2} />,
    timeline: <Clock size={18} strokeWidth={2} />,
    architecture: <Blocks size={18} strokeWidth={2} />,
    default: <Building2 size={18} strokeWidth={2} />,
};

const WorkspaceDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const browserLocation = typeof window === 'undefined' ? null : window.location as LocationLike;
    const { user } = useAuth();
    const { modal } = App.useApp();
    const initialView = coerceFilterView(searchParams.get('view') || getQueryOrHashParamFromLocation(browserLocation, 'view'));
    
    // --- State ---
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [activeView, setActiveView] = useState<FilterViewType>(initialView);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortKey, setSortKey] = useState<SortKey>('updated');
    
    const [unifiedItems, setUnifiedItems] = useState<UnifiedDiagramItem[]>([]);
    const [cloudProvider, setCloudProvider] = useState<ManageStorageProvider>(() => {
        const p = searchParams.get('provider');
        if (p === 's3' || p === 'supabase') return p;
        return readStoredCloudProvider();
    });

    // --- Context Menu State (Phase 1.3) ---
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: UnifiedDiagramItem } | null>(null);
    const ctxMenuRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = useCallback((e: React.MouseEvent, item: UnifiedDiagramItem) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY, item });
    }, []);

    const openDiagramInNewTab = useCallback((item: UnifiedDiagramItem) => {
        const rawId = item.id || (item.raw as { id?: unknown })?.id;
        const diagramId = coerceDiagramId(rawId);
        if (!diagramId) {
            appMessage.error('Unable to open diagram: missing diagram id.');
            return;
        }
        window.open(`/?diagram=${encodeURIComponent(diagramId)}`, '_blank', 'noopener,noreferrer');
    }, []);

    const navigateToDiagram = useCallback((id: unknown) => {
        const diagramId = coerceDiagramId(id);
        if (!diagramId) {
            appMessage.error('Unable to open diagram: missing diagram id.');
            return;
        }
        navigate(`/?diagram=${encodeURIComponent(diagramId)}`);
    }, [navigate]);

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
    const loadAllData = useCallback(async () => {
        setLoading(true);
        try {
            const nextItems = await loadWorkspaceItems(activeView, cloudProvider, user);
            setUnifiedItems(nextItems);
        } catch (error) {
            safeLog.error('Failed to load dashboard data', redactSensitiveLogValue(error));
            appMessage.error("Failed to load workspace data");
        } finally {
            setLoading(false);
        }
    }, [activeView, cloudProvider, user]);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // --- Actions ---
    const handleOpenDiagram = async (item: UnifiedDiagramItem) => {
        if (item.source === 'local') {
            const raw = item.raw as StandardDiagramData;
            navigateToDiagram(raw.id);
            return;
        }

        if (item.source === 'supabase' && !user) {
            setIsAuthModalOpen(true);
            return;
        }

        // template 和 general_template 都来自 Supabase system_templates，统一处理
        if (item.source === 'template' || item.source === 'general_template') {
            const rawObj = item.raw as any;
            const messageKey = appMessage.loading('正在加载模版...', 0);
            try {
                const supabase = await loadSupabaseClient();
                if (supabase) {
                    const { data, error } = await supabase
                        .from('system_templates')
                        .select('content, title, id')
                        .eq('id', rawObj.id)
                        .single();
                    if (!error && data && data.content) {
                        const dataRegistry = await loadDataRegistry();
                        await dataRegistry.initialize();
                        const localService = dataRegistry.getDataService();
                        const clonedId = crypto.randomUUID();
                        const cloned = localService.registerRemoteDiagram(data.content, {
                            id: clonedId,
                            title: data.title,
                        }, true, {
                            id: clonedId,
                            name: data.title,
                            metadata: { title: data.title },
                        });
                        try {
                            upsertDiagramConfigIndex(localStorage, {
                                id: cloned.id,
                                type: cloned.type || 'flowchart',
                                name: cloned.name,
                                updatedAt: Date.now(),
                            });
                        } catch { /* ignore */ }
                        try { localStorage.removeItem(`flowchart-autosave-v2-${cloned.id}`); } catch (_e) {}
                        navigateToDiagram(cloned.id);
                    } else {
                        appMessage.error('模版内容为空，请确认 Supabase 数据已迁移。');
                    }
                }
            } catch (e: any) {
                appMessage.error(`加载模版失败: ${e.message}`);
            } finally {
                messageKey();
            }
            return;
        }


        const hide = appMessage.loading("Loading diagram from cloud...", 0);
        try {
            const [unifiedStorage, dataRegistry] = await Promise.all([
                loadUnifiedStorage(),
                loadDataRegistry(),
            ]);
            await dataRegistry.initialize();
            const rawObj = item.raw as DiagramMetadata;
            const savedDiagram = await unifiedStorage.loadDiagram(rawObj.id);
            if (savedDiagram) {
                const localService = dataRegistry.getDataService();
                const normalized = localService.registerRemoteDiagram(savedDiagram.content, {
                    id: savedDiagram.id,
                    title: savedDiagram.title,
                }, true, {
                    id: savedDiagram.id,
                    name: savedDiagram.title,
                    metadata: {
                        title: savedDiagram.title,
                        updatedAt: savedDiagram.updated_at,
                        cloud: {
                            provider: item.source,
                            id: savedDiagram.id,
                            title: savedDiagram.title,
                            openedAt: new Date().toISOString()
                        }
                    },
                    isReadonly: item.role === 'viewer'
                });
                // 回写 type 索引，防止刷新后设计器无法识别图表类型
                try {
                    upsertDiagramConfigIndex(localStorage, {
                        id: savedDiagram.id,
                        type: normalized.type || 'flowchart',
                        name: normalized.name,
                        updatedAt: Date.now()
                    });
                } catch { /* ignore */ }
                navigateToDiagram(savedDiagram.id);
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
                        const dataRegistry = await loadDataRegistry();
                        await dataRegistry.initialize();
                        const localService = dataRegistry.getDataService();
                        const rawObj = item.raw as StandardDiagramData;
                        localService.deleteDiagram(rawObj.id);
                    } else {
                        const unifiedStorage = await loadUnifiedStorage();
                        const rawObj = item.raw as DiagramMetadata;
                        await unifiedStorage.deleteDiagram(rawObj.id);
                    }
                    appMessage.success('Deleted successfully');
                    loadAllData();
                } catch (_error) {
                    appMessage.error("Failed to delete diagram.");
                }
            }
        });
    };

    // Advanced Creation Router mapping to correct domains
    const handleCreateTemplate = async (templateKey: TemplateKey) => {
        const templateData = createTemplateSeed(templateKey);

        if (templateData) {
            const dataRegistry = await loadDataRegistry();
            await dataRegistry.initialize();
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
                upsertDiagramConfigIndex(localStorage, {
                    id: cloned.id,
                    type: cloned.type,
                    name: cloned.name,
                    updatedAt: Date.now(),
                });
            } catch { /* ignore storage errors */ }
            navigateToDiagram(cloned.id);
        }
    };

    // --- Computed Views ---
    const filteredItems = useMemo(
        () => filterAndSortItems(unifiedItems, activeView, searchTerm, sortKey),
        [unifiedItems, activeView, searchTerm, sortKey]
    );

    // --- Settings Menu ---
    const settingsMenu: MenuProps['items'] = [
        {
            key: 's3',
            label: 'Use S3 Cloud Storage',
            icon: <Cloud size={16} strokeWidth={2} />,
            onClick: async () => {
                const unifiedStorage = await loadUnifiedStorage();
                unifiedStorage.setProvider('s3');
                setCloudProvider('s3');
                appMessage.info('Switched purely to S3 Backend');
            }
        },
        {
            key: 'supabase',
            label: 'Use Supabase (Social)',
            icon: <Database size={16} strokeWidth={2} />,
            onClick: async () => {
                const unifiedStorage = await loadUnifiedStorage();
                unifiedStorage.setProvider('supabase');
                setCloudProvider('supabase');
                appMessage.info('Switched purely to Supabase');
            }
        },
        { type: 'divider' },
        {
            key: 'login',
            label: user ? `Logged in as ${user.email}` : 'Login via Supabase',
            icon: <User size={16} strokeWidth={2} />,
            onClick: () => !user && setIsAuthModalOpen(true)
        }
    ];

    const getCardMenu = (item: UnifiedDiagramItem): MenuProps['items'] => {
        // 模版专用菜单
        if (isTemplateItem(item)) {
            return [
                { key: 'apply_template', label: '🚀 应用此模版', icon: <Copy size={16} strokeWidth={2} /> },
            ];
        }
        // 普通图表菜单
        const items: MenuProps['items'] = [
            { key: 'open_new', label: 'Open in new tab', icon: <Share2 size={16} strokeWidth={2} /> }
        ];
        if (item.role === 'owner') {
            items.push({ type: 'divider' });
            items.push({ key: 'delete', danger: true, label: 'Delete', icon: <Trash2 size={16} strokeWidth={2} /> });
        }
        return items;
    };

    const handleMenuClick = (e: any, item: UnifiedDiagramItem) => {
        e.domEvent.stopPropagation();
        if (e.key === 'apply_template') {
            handleOpenDiagram(item); // 应用模版 = 基于模版新建图表
        } else if (e.key === 'delete') {
            handleDeleteDiagram(e.domEvent, item);
        } else if (e.key === 'open_new') {
            openDiagramInNewTab(item);
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
                <Plus size={16} strokeWidth={2} style={{ color: 'var(--vz-text-secondary)' }} />
            </div>
            <div className="workspace-empty-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--vz-text-primary)', marginBottom: 4 }}>
                No diagrams
            </div>
            <div className="workspace-empty-desc" style={{ fontSize: 13, color: 'var(--vz-text-tertiary)', marginBottom: 24, maxWidth: 300 }}>
                Get started by creating a new document or pressing Ctrl+K.
            </div>
            <button className="create-btn-primary" onClick={() => handleCreateTemplate('blank')}>
                <Plus className="plus-icon" size={16} strokeWidth={2} /> New Diagram
            </button>
        </div>
    );

    // --- Computed Counts ---
    const localCount = useMemo(() => unifiedItems.filter(i => i.source === 'local').length, [unifiedItems]);
    const cloudCount = useMemo(() => unifiedItems.filter(i => i.source === 's3' || i.source === 'supabase').length, [unifiedItems]);
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
                        <Search size={16} strokeWidth={2} style={{ color: 'var(--vz-brand-from)', opacity: 0.7 }}/>
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
                        <Palette size={16} strokeWidth={2} />
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
                            <Globe size={16} strokeWidth={2} />
                        </button>
                    </Dropdown>
                    <Dropdown menu={{ items: settingsMenu }} trigger={['click']} placement="bottomRight">
                        <button className="workspace-settings-trigger" aria-label="Settings">
                            {user ? <Avatar size={24} src={user.user_metadata?.avatar_url} icon={<User size={14} strokeWidth={2} />} /> : <Settings size={16} strokeWidth={2} />}
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
                                    <Plus className="plus-icon" size={16} strokeWidth={2} />
                                    New Diagram <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: '4px' }} />
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
                                <Clock size={14} strokeWidth={2} /> Recent
                                <span className="filter-tab-count">{unifiedItems.filter(i => i.source !== 'template' && i.source !== 'general_template').length}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'local' ? 'active' : ''}`} onClick={() => setActiveView('local')}>
                                <Laptop size={14} strokeWidth={2} /> Local
                                <span className="filter-tab-count">{localCount}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'cloud' ? 'active' : ''}`} onClick={() => setActiveView('cloud')}>
                                <Cloud size={14} strokeWidth={2} /> Cloud
                                <span className="filter-tab-count">{cloudCount}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'shared' ? 'active' : ''}`} onClick={() => setActiveView('shared')}>
                                <Share2 size={14} strokeWidth={2} /> Shared
                                <span className="filter-tab-count">{sharedCount}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'templates' ? 'active' : ''}`} onClick={() => setActiveView('templates')}>
                                <LayoutGrid size={14} strokeWidth={2} /> 行业模板库
                                <span className="filter-tab-count">{unifiedItems.filter(i => i.source === 'template').length}</span>
                            </div>
                            <div className={`filter-tab ${activeView === 'general_templates' ? 'active' : ''}`} onClick={() => setActiveView('general_templates')}>
                                <Blocks size={14} strokeWidth={2} /> 通用模版
                                <span className="filter-tab-count">{unifiedItems.filter(i => i.source === 'general_template').length}</span>
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
                                    <ArrowUpAZ size={16} strokeWidth={2} />
                                </button>
                            </Dropdown>
                            <div className="view-toggle">
                                <button
                                    className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid view"
                                >
                                    <LayoutGrid size={16} strokeWidth={2} />
                                </button>
                                <button
                                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                    title="List view"
                                >
                                    <List size={16} strokeWidth={2} />
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
                                                <span className="node-count-chip"><Boxes size={14} strokeWidth={2} /> {nodeCount}</span>
                                            )}
                                            <div className="diagram-card-actions" style={{ position: 'relative', opacity: 1 }}>
                                                <Dropdown
                                                    menu={{ items: getCardMenu(item), onClick: (e) => handleMenuClick(e, item) }}
                                                    trigger={['click']}
                                                    placement="bottomRight"
                                                >
                                                    <button className="action-btn-glass" onClick={e => e.stopPropagation()}>
                                                        <Ellipsis size={16} strokeWidth={2} />
                                                    </button>
                                                </Dropdown>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="diagram-card" key={item.id}
                                        onClick={() => !isTemplateItem(item) && handleOpenDiagram(item)}
                                        style={{ cursor: isTemplateItem(item) ? 'default' : 'pointer' }}
                                        onContextMenu={(e) => handleContextMenu(e, item)}
                                    >
                                        {/* Source badge */}
                                        {item.source !== 'local' && (
                                            <div className={`source-badge ${item.source}`}>
                                                {isTemplateItem(item)
                                                    ? <><LayoutGrid size={14} strokeWidth={2} /> TEMPLATE</>
                                                    : item.source === 's3'
                                                        ? <><Cloud size={14} strokeWidth={2} /> S3</>
                                                        : <><Database size={14} strokeWidth={2} /> CLOUD</>
                                                }
                                            </div>
                                        )}

                                        <div className="diagram-card-actions">
                                            <Dropdown
                                                menu={{ items: getCardMenu(item), onClick: (e) => handleMenuClick(e, item) }}
                                                trigger={['click']}
                                                placement="bottomRight"
                                            >
                                                <button className="action-btn-glass" onClick={e => e.stopPropagation()}>
                                                    <Ellipsis size={16} strokeWidth={2} />
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
                                                ) : (item.source === 'template' || item.source === 'general_template') ? (
                                                    (() => {
                                                        const thumbnailUrl = (item.raw as any)?.thumbnail_url;
                                                        if (thumbnailUrl) {
                                                            return (
                                                                <img
                                                                    src={thumbnailUrl}
                                                                    alt={item.title}
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                                    onError={(e) => {
                                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                                        (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                                                                    }}
                                                                />
                                                            );
                                                        }
                                                        // 无预览图时显示彩色图标占位
                                                        const cat = (item.raw as any)?.category || 'default';
                                                        const catColorMap: Record<string, string> = {
                                                            '仓储': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                            '运输': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                                            '计划': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                                            '架构': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                                                            '系统': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                                                            'general': 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                                                            'default': 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
                                                        };
                                                        const gradient = catColorMap[cat] || catColorMap.default;
                                                        return (
                                                            <div style={{
                                                                width: '100%', height: '100%',
                                                                background: gradient,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: 36, opacity: 0.85
                                                            }}>
                                                                <span>{TYPE_ICON_MAP[diagramType] || TYPE_ICON_MAP.default}</span>
                                                            </div>
                                                        );
                                                    })()
                                                ) : (
                                                    <React.Suspense fallback={null}>
                                                        <RemoteDiagramCover
                                                            storageId={(item.raw as DiagramMetadata).id}
                                                            alt={item.title}
                                                            cacheBuster={item.updatedAt}
                                                            height={150}
                                                        />
                                                    </React.Suspense>
                                                )}
                                                {/* 模版封面 hover 遮罩：显示「应用」按钮 */}
                                                {isTemplateItem(item) && (
                                                    <div className="template-apply-overlay" onClick={() => handleOpenDiagram(item)}>
                                                        <button className="template-apply-btn">
                                                            <Copy size={16} strokeWidth={2} /> 应用模版
                                                        </button>
                                                    </div>
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
                                                        <Boxes size={14} strokeWidth={2} /> {nodeCount}
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
                        <Pencil size={14} strokeWidth={2} /> Open
                    </button>
                    <button className="ctx-menu-item" onClick={() => {
                        openDiagramInNewTab(ctxMenu.item);
                        setCtxMenu(null);
                    }}>
                        <ExternalLink size={14} strokeWidth={2} /> Open in new tab
                    </button>
                    {ctxMenu.item.role === 'owner' && (
                        <>
                            <div className="ctx-menu-divider" />
                            <button className="ctx-menu-item danger" onClick={(e) => { handleDeleteDiagram(e as any, ctxMenu.item); setCtxMenu(null); }}>
                                <Trash2 size={14} strokeWidth={2} /> Delete
                            </button>
                        </>
                    )}
                </div>
            )}

            {isAuthModalOpen && (
                <React.Suspense fallback={null}>
                    <AuthModal open={isAuthModalOpen} onCancel={() => setIsAuthModalOpen(false)} />
                </React.Suspense>
            )}
        </div>
    );
};

export default WorkspaceDashboardPage;

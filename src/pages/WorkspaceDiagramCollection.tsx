import React from 'react';
import Dropdown from 'antd/es/dropdown';
import type { MenuProps } from 'antd/es/menu';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpAZ,
  Blocks,
  Boxes,
  Building2,
  Cloud,
  Clock,
  Copy,
  Database,
  Ellipsis,
  Laptop,
  LayoutGrid,
  List,
  Share2,
  Trash2,
  Waypoints,
  Workflow,
} from 'lucide-react';

import { coerceDiagramId } from '@/core/utils/inputBoundary';
import { coerceRemoteTemplateMetadata } from '@/core/utils/remoteTemplateMetadata';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import {
  detectDiagramType,
  getNodeCount,
  isTemplateItem,
  type FilterViewType,
  type SortKey,
  type UnifiedDiagramItem,
  type ViewMode,
} from './diagramManagementPage.helpers';
import { DiagramCardSkeleton } from './DiagramCardSkeleton';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { focusWorkspaceTarget } from './workspaceMenuInteraction';

const RemoteDiagramCover = React.lazy(() => import('@/components/shared/RemoteDiagramCover'));
const LocalDiagramCover = React.lazy(() => import('./LocalDiagramCover'));

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  flowchart: <Workflow size={18} strokeWidth={2} />,
  mindmap: <Waypoints size={18} strokeWidth={2} />,
  timeline: <Clock size={18} strokeWidth={2} />,
  architecture: <Blocks size={18} strokeWidth={2} />,
  default: <Building2 size={18} strokeWidth={2} />,
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

interface WorkspaceDiagramCollectionProps {
  activeView: FilterViewType;
  onActiveViewChange: (view: FilterViewType) => void;
  unifiedItems: UnifiedDiagramItem[];
  filteredItems: UnifiedDiagramItem[];
  sortKey: SortKey;
  onSortKeyChange: (sortKey: SortKey) => void;
  viewMode: ViewMode;
  onViewModeChange: (viewMode: ViewMode) => void;
  loading: boolean;
  onOpenDiagram: (item: UnifiedDiagramItem) => void | Promise<void>;
  onOpenDiagramInNewTab: (item: UnifiedDiagramItem) => void;
  onContextMenu: (event: React.MouseEvent, item: UnifiedDiagramItem) => void;
  onDeleteDiagram: (
    event: { stopPropagation: () => void },
    item: UnifiedDiagramItem,
    returnFocusTarget?: HTMLElement | null,
  ) => void;
  onCreateBlank: () => void;
  searchQuery: string;
  onClearSearch: () => void;
}

const formatTimeAgo = (
  timestamp: number,
  locale: string,
  unknownLabel: string,
): string => {
  if (!Number.isFinite(timestamp) || timestamp < 0) return unknownLabel;
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 1) return relative.format(0, 'minute');
  if (minutes < 60) return relative.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return relative.format(-days, 'day');
  return new Date(timestamp).toLocaleDateString(locale);
};

export const WorkspaceDiagramCollection = ({
  activeView,
  onActiveViewChange,
  unifiedItems,
  filteredItems,
  sortKey,
  onSortKeyChange,
  viewMode,
  onViewModeChange,
  loading,
  onOpenDiagram,
  onOpenDiagramInNewTab,
  onContextMenu,
  onDeleteDiagram,
  onCreateBlank,
  searchQuery,
  onClearSearch,
}: WorkspaceDiagramCollectionProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const unknownTime = t('workspace.unknownTime');
  const localCount = unifiedItems.filter(item => item.source === 'local').length;
  const cloudCount = unifiedItems.filter(item => item.source === 's3' || item.source === 'supabase').length;
  const sharedCount = unifiedItems.filter(item => item.role === 'viewer').length;
  const [openCardMenuKey, setOpenCardMenuKey] = React.useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const cardMenuTriggerRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const recentFilterRef = React.useRef<HTMLButtonElement>(null);
  const sortTriggerRef = React.useRef<HTMLButtonElement>(null);
  const restoreSortFocusRef = React.useRef(false);
  const currentSortLabel = {
    updated: t('workspace.lastModified'),
    name: t('workspace.name'),
    type: t('workspace.type'),
  } satisfies Record<SortKey, string>;
  const activeViewLabel = {
    recent: t('workspace.recent'),
    local: t('workspace.local'),
    cloud: t('workspace.cloud'),
    shared: t('workspace.shared'),
    templates: t('workspace.industryTemplates'),
    general_templates: t('workspace.generalTemplates'),
  } satisfies Record<FilterViewType, string>;

  const getCardMenuKey = (item: UnifiedDiagramItem): string => `${item.source}:${item.id}`;

  const setCardMenuTriggerRef = React.useCallback((
    key: string,
    trigger: HTMLButtonElement | null,
  ) => {
    if (trigger) cardMenuTriggerRefs.current.set(key, trigger);
    else cardMenuTriggerRefs.current.delete(key);
  }, []);

  const handleCardMenuOpenChange = (key: string, open: boolean) => {
    setOpenCardMenuKey(open ? key : null);
    if (!open) {
      queueMicrotask(() => focusWorkspaceTarget(cardMenuTriggerRefs.current.get(key)));
    }
  };

  const handleSortMenuOpenChange = (open: boolean) => {
    setSortMenuOpen(open);
    if (open) {
      requestAnimationFrame(() => {
        const firstItem = document.querySelector<HTMLElement>(
          '.workspace-sort-dropdown [role="menuitem"]',
        );
        focusWorkspaceTarget(firstItem);
      });
      return;
    }
    if (restoreSortFocusRef.current) {
      restoreSortFocusRef.current = false;
      queueMicrotask(() => focusWorkspaceTarget(sortTriggerRef.current));
    }
  };

  const handleSortTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    handleSortMenuOpenChange(true);
  };

  const handleSortMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') restoreSortFocusRef.current = true;
  };

  const handleSortMenuClick: NonNullable<MenuProps['onClick']> = event => {
    if (event.key !== 'updated' && event.key !== 'name' && event.key !== 'type') return;
    restoreSortFocusRef.current = true;
    onSortKeyChange(event.key);
  };

  const handleClearFilter = () => {
    onActiveViewChange('recent');
    queueMicrotask(() => focusWorkspaceTarget(recentFilterRef.current));
  };

  const getCardMenu = (item: UnifiedDiagramItem): MenuProps['items'] => {
    if (isTemplateItem(item)) {
      return [{ key: 'apply_template', label: t('workspace.applyTemplate'), icon: <Copy size={16} strokeWidth={2} /> }];
    }
    const items: MenuProps['items'] = [
      { key: 'open_new', label: t('workspace.openInNewTab'), icon: <Share2 size={16} strokeWidth={2} /> },
    ];
    if (item.role === 'owner') {
      items.push({ type: 'divider' });
      items.push({ key: 'delete', danger: true, label: t('common.delete'), icon: <Trash2 size={16} strokeWidth={2} /> });
    }
    return items;
  };

  const handleMenuClick = (
    event: Parameters<NonNullable<MenuProps['onClick']>>[0],
    item: UnifiedDiagramItem,
  ) => {
    event.domEvent.stopPropagation();
    const returnFocusTarget = cardMenuTriggerRefs.current.get(getCardMenuKey(item));
    if (event.key === 'apply_template') void onOpenDiagram(item);
    else if (event.key === 'delete') onDeleteDiagram(event.domEvent, item, returnFocusTarget);
    else if (event.key === 'open_new') onOpenDiagramInNewTab(item);
  };

  return (
                <div id="workspace-diagram-results" className="workspace-main-inner">
                    {/* Filter Tabs with Counts */}
                    <div className="workspace-matrix-header">
                        <div className="workspace-filter-tabs" role="group" aria-label={t('workspace.filterBy')}>
                            <button ref={recentFilterRef} type="button" className={`filter-tab ${activeView === 'recent' ? 'active' : ''}`} aria-pressed={activeView === 'recent'} onClick={() => onActiveViewChange('recent')}>
                                <Clock size={14} strokeWidth={2} /> {t('workspace.recent')}
                                <span className="filter-tab-count">{unifiedItems.filter(i => i.source !== 'template' && i.source !== 'general_template').length}</span>
                            </button>
                            <button type="button" className={`filter-tab ${activeView === 'local' ? 'active' : ''}`} aria-pressed={activeView === 'local'} onClick={() => onActiveViewChange('local')}>
                                <Laptop size={14} strokeWidth={2} /> {t('workspace.local')}
                                <span className="filter-tab-count">{localCount}</span>
                            </button>
                            <button type="button" className={`filter-tab ${activeView === 'cloud' ? 'active' : ''}`} aria-pressed={activeView === 'cloud'} onClick={() => onActiveViewChange('cloud')}>
                                <Cloud size={14} strokeWidth={2} /> {t('workspace.cloud')}
                                <span className="filter-tab-count">{cloudCount}</span>
                            </button>
                            <button type="button" className={`filter-tab ${activeView === 'shared' ? 'active' : ''}`} aria-pressed={activeView === 'shared'} onClick={() => onActiveViewChange('shared')}>
                                <Share2 size={14} strokeWidth={2} /> {t('workspace.shared')}
                                <span className="filter-tab-count">{sharedCount}</span>
                            </button>
                            <button type="button" className={`filter-tab ${activeView === 'templates' ? 'active' : ''}`} aria-pressed={activeView === 'templates'} onClick={() => onActiveViewChange('templates')}>
                                <LayoutGrid size={14} strokeWidth={2} /> {t('workspace.industryTemplates')}
                                <span className="filter-tab-count">{unifiedItems.filter(i => i.source === 'template').length}</span>
                            </button>
                            <button type="button" className={`filter-tab ${activeView === 'general_templates' ? 'active' : ''}`} aria-pressed={activeView === 'general_templates'} onClick={() => onActiveViewChange('general_templates')}>
                                <Blocks size={14} strokeWidth={2} /> {t('workspace.generalTemplates')}
                                <span className="filter-tab-count">{unifiedItems.filter(i => i.source === 'general_template').length}</span>
                            </button>
                        </div>

                        <div className="workspace-view-controls">
                            <Dropdown
                                menu={{
                                    items: [
                                        { key: 'updated', label: t('workspace.lastModified') },
                                        { key: 'name', label: t('workspace.name') },
                                        { key: 'type', label: t('workspace.type') },
                                    ],
                                    selectedKeys: [sortKey],
                                    'aria-label': t('workspace.sortBy'),
                                    onClick: handleSortMenuClick,
                                    onKeyDown: handleSortMenuKeyDown,
                                }}
                                trigger={['click']}
                                open={sortMenuOpen}
                                onOpenChange={handleSortMenuOpenChange}
                                classNames={{ root: 'workspace-sort-dropdown' }}
                            >
                                <button
                                    ref={sortTriggerRef}
                                    type="button"
                                    className="workspace-icon-btn workspace-sort-trigger"
                                    title={`${t('workspace.sortBy')}: ${currentSortLabel[sortKey]}`}
                                    aria-label={`${t('workspace.sortBy')}: ${currentSortLabel[sortKey]}`}
                                    aria-haspopup="menu"
                                    aria-expanded={sortMenuOpen}
                                    onKeyDown={handleSortTriggerKeyDown}
                                >
                                    <ArrowUpAZ size={16} strokeWidth={2} />
                                    <span className="workspace-sort-trigger-label">{currentSortLabel[sortKey]}</span>
                                </button>
                            </Dropdown>
                            <div className="view-toggle" role="group" aria-label={t('workspace.viewMode')}>
                                <button
                                    type="button"
                                    className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => onViewModeChange('grid')}
                                    title={t('workspace.gridView')}
                                    aria-label={t('workspace.gridView')}
                                    aria-pressed={viewMode === 'grid'}
                                >
                                    <LayoutGrid size={16} strokeWidth={2} />
                                </button>
                                <button
                                    type="button"
                                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => onViewModeChange('list')}
                                    title={t('workspace.listView')}
                                    aria-label={t('workspace.listView')}
                                    aria-pressed={viewMode === 'list'}
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
                        searchQuery ? (
                            <WorkspaceEmptyState
                                mode="search"
                                query={searchQuery}
                                onClearSearch={onClearSearch}
                            />
                        ) : activeView !== 'recent' ? (
                            <WorkspaceEmptyState
                                mode="filter"
                                viewLabel={activeViewLabel[activeView]}
                                onClearFilter={handleClearFilter}
                            />
                        ) : (
                            <WorkspaceEmptyState onCreate={onCreateBlank} />
                        )
                    ) : (
                        <div className={viewMode === 'grid' ? 'diagram-grid' : 'diagram-list'}>
                            {filteredItems.map(item => {
                                const diagramType = detectDiagramType(item);
                                const nodeCount = getNodeCount(item);
                                const cardMenuKey = getCardMenuKey(item);

                                if (viewMode === 'list') {
                                    return (
                                        <article className="diagram-list-row" key={item.id} onContextMenu={(e) => onContextMenu(e, item)}>
                                            <button
                                                type="button"
                                                className="diagram-list-primary-action"
                                                onClick={() => onOpenDiagram(item)}
                                                aria-label={t('workspace.openDiagram', { title: item.title })}
                                            />
                                            <div className={`list-row-icon type-${diagramType}`}>
                                                {TYPE_ICON_MAP[diagramType] || TYPE_ICON_MAP.default}
                                            </div>
                                            <div className="list-row-title">{item.title}</div>
                                            <span className={`type-badge ${diagramType}`}>{diagramType}</span>
                                            <span className="list-row-time">{formatTimeAgo(item.updatedAt, locale, unknownTime)}</span>
                                            {nodeCount != null && (
                                                <span className="node-count-chip"><Boxes size={14} strokeWidth={2} /> {nodeCount}</span>
                                            )}
                                            <div className="diagram-card-actions" style={{ position: 'relative', opacity: 1 }}>
                                                <Dropdown
                                                    menu={{ items: getCardMenu(item), onClick: (e) => handleMenuClick(e, item) }}
                                                    trigger={['click']}
                                                    placement="bottomRight"
                                                    open={openCardMenuKey === cardMenuKey}
                                                    onOpenChange={open => handleCardMenuOpenChange(cardMenuKey, open)}
                                                >
                                                    <button
                                                        ref={trigger => setCardMenuTriggerRef(cardMenuKey, trigger)}
                                                        type="button"
                                                        className="action-btn-glass"
                                                        onClick={e => e.stopPropagation()}
                                                        aria-label={t('workspace.moreActions', { title: item.title })}
                                                        aria-haspopup="menu"
                                                        aria-expanded={openCardMenuKey === cardMenuKey}
                                                    >
                                                        <Ellipsis size={16} strokeWidth={2} />
                                                    </button>
                                                </Dropdown>
                                            </div>
                                        </article>
                                    );
                                }

                                return (
                                    <article className="diagram-card" key={item.id}
                                        onContextMenu={(e) => onContextMenu(e, item)}
                                    >
                                        <button
                                            type="button"
                                            className="diagram-card-primary-action"
                                            onClick={() => onOpenDiagram(item)}
                                            aria-label={isTemplateItem(item)
                                                ? t('workspace.applyNamedTemplate', { title: item.title })
                                                : t('workspace.openDiagram', { title: item.title })}
                                        />
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
                                                open={openCardMenuKey === cardMenuKey}
                                                onOpenChange={open => handleCardMenuOpenChange(cardMenuKey, open)}
                                            >
                                                <button
                                                    ref={trigger => setCardMenuTriggerRef(cardMenuKey, trigger)}
                                                    type="button"
                                                    className="action-btn-glass"
                                                    onClick={e => e.stopPropagation()}
                                                    aria-label={t('workspace.moreActions', { title: item.title })}
                                                    aria-haspopup="menu"
                                                    aria-expanded={openCardMenuKey === cardMenuKey}
                                                >
                                                    <Ellipsis size={16} strokeWidth={2} />
                                                </button>
                                            </Dropdown>
                                        </div>

                                        <div className="diagram-card-cover">
                                            <div className="diagram-card-cover-inner">
                                                {item.source === 'local' ? (
                                                    <React.Suspense fallback={(
                                                        <div className={`diagram-card-type-cover type-${diagramType}`}>
                                                            <span className="type-cover-icon">
                                                                {TYPE_ICON_MAP[diagramType] || TYPE_ICON_MAP.default}
                                                            </span>
                                                        </div>
                                                    )}>
                                                        <LocalDiagramCover
                                                            diagram={item.raw as StandardDiagramData}
                                                            alt={item.title}
                                                            fallback={(
                                                                <div className={`diagram-card-type-cover type-${diagramType}`}>
                                                                    <span className="type-cover-icon">
                                                                        {TYPE_ICON_MAP[diagramType] || TYPE_ICON_MAP.default}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        />
                                                    </React.Suspense>
                                                ) : (item.source === 'template' || item.source === 'general_template') ? (
                                                    (() => {
                                                        const metadata = coerceRemoteTemplateMetadata(asRecord(item.raw));
                                                        const thumbnailUrl = metadata.thumbnail_url;
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
                                                        const cat = typeof metadata.category === 'string'
                                                            ? metadata.category
                                                            : 'default';
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
                                                ) : (() => {
                                                    const storageId = coerceDiagramId(asRecord(item.raw).id);
                                                    return storageId ? (
                                                        <React.Suspense fallback={null}>
                                                            <RemoteDiagramCover
                                                                storageId={storageId}
                                                                alt={item.title}
                                                                cacheBuster={item.updatedAt}
                                                                height={150}
                                                            />
                                                        </React.Suspense>
                                                    ) : null;
                                                })()}
                                                {/* 模版封面 hover 遮罩：显示「应用」按钮 */}
                                                {isTemplateItem(item) && (
                                                    <div className="template-apply-overlay" aria-hidden="true">
                                                        <span className="template-apply-btn">
                                                            <Copy size={16} strokeWidth={2} /> {t('workspace.applyTemplate')}
                                                        </span>
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
                                                    <span>{formatTimeAgo(item.updatedAt, locale, unknownTime)}</span>
                                                </div>
                                                {nodeCount != null && (
                                                    <span className="node-count-chip">
                                                        <Boxes size={14} strokeWidth={2} /> {nodeCount}
                                                    </span>
                                                )}
                                                {item.role === 'viewer' && <span style={{ color: '#8b5cf6', fontWeight: 600, fontSize: 11 }}>{t('workspace.shared')}</span>}
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>

  );
};

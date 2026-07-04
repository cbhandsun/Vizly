import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FaChevronRight,
  FaProjectDiagram,
  FaCogs,
  FaSitemap,
  FaTruck,
  FaEdit,
  FaChevronLeft,
  FaBook,
  FaSearch,
  FaChevronDown,
  FaAngleDoubleDown,
  FaAngleDoubleUp
} from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { Button as AntButton, Input, Popover, Tooltip, theme as antdTheme } from 'antd';
import type { InputRef } from 'antd';
import { MoreOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { DiagramDefinition } from '@/core/types/diagram-components';
import { useConfigIntegration } from '@/core/hooks/useConfigIntegration';
import { usePanelZoom, type PanelZoomApi } from '@/core/hooks/usePanelZoom';
import { AuthStatusCompact } from './auth/AuthStatus';
import { useDiagramFilter } from '@/core/hooks/useDiagramFilter';
import { useDiagramHostStorage } from '@/core/hooks/useDiagramHostStorage';
import {
  readCollapsedGroups,
  readMenuScrollTop,
  writeCollapsedGroups,
  writeMenuScrollTop,
} from '@/core/utils/diagramMenuStorage';
import {
  getDiagramDataSelector,
  getDiagramIcon,
  normalizeDiagramCategory,
  normalizeDiagramId,
  normalizeThemeId,
} from './modernDiagramMenuGuards';
import { logModernDiagramMenuFailure } from '@/core/utils/diagramMenuLogging';

interface ModernDiagramMenuProps {
  diagrams?: DiagramDefinition[];
  onSelectDiagram: (id: string) => void;
  selectedDiagram?: string;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  zoom?: PanelZoomApi;
}

const categoryLabelKeys: Record<string, string> = {
  'other': 'designer.menu.category.other',
  'architecture': 'designer.menu.category.architecture',
  'debug': 'designer.menu.category.debug',
  'business': 'designer.menu.category.business',
  'logistics': 'designer.menu.category.logistics',
  'sub-system': 'designer.menu.category.subSystem',
  'tool': 'designer.menu.category.tool',
};

const categoryColors: Record<string, string> = {
  'other': 'var(--color-primary-500)',
  'architecture': 'var(--color-primary-500)',
  'debug': 'var(--color-danger)',
  'business': 'var(--color-success)',
  'logistics': 'var(--color-warning)',
  'sub-system': '#8b5cf6',
  'tool': '#6366f1',
};

const categoryIcons: Record<string, IconType> = {
  'other': FaSitemap,
  'architecture': FaProjectDiagram,
  'debug': FaCogs,
  'business': FaSitemap,
  'logistics': FaTruck,
  'sub-system': FaSitemap,
  'tool': FaEdit,
};

const ModernDiagramMenu: React.FC<ModernDiagramMenuProps> = ({
  diagrams = [] as DiagramDefinition[],
  onSelectDiagram,
  selectedDiagram,
  onToggleCollapse,
  isCollapsed,
  zoom,
}) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const [integrationState] = useConfigIntegration({ autoInitialize: true });
  const tm = integrationState.integration?.getThemeManager?.();
  const themeMode = tm?.getCurrentTheme()?.id === 'dark' ? 'dark' : 'light';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  const focusSearchShortcutLabel = isMac ? '⌘⇧F' : 'Ctrl+Shift+F';


  const {
    searchTerm,
    setSearchTerm,
    selectedTags,
    setSelectedTags,
    matchMode,
    setMatchMode,
    filteredDiagrams,
    tagStats
  } = useDiagramFilter(diagrams);

  // Use storage hook for favorite diagrams
  // Note: ModernDiagramMenu seems to manage its own favorites inside but let's see if we can unify it later.
  // For now, keeping the internal state but syncing is better.
  // Actually, let's keep the hook usage separate for now to avoid breaking existing logic in this step too much
  // but we can replace the favorites state with the hook if possible.

  // Re-using the logic from the component but via hook if we were to fully refactor.
  // For this step, I will replace the filtering logic first.

  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [currentTheme, setCurrentTheme] = useState<string>('');
  const searchInputRef = useRef<InputRef>(null);

  // Favorites logic - using shared hook
  // Renaming favoriteDiagrams from hook to favoriteDiagramIds to avoid collision with local derived list
  const { favoriteDiagrams: favoriteDiagramIds, toggleFavorite, clearFavorites } = useDiagramHostStorage(selectedDiagram || '');
  const favoriteIds = favoriteDiagramIds;

  // 分组折叠状态
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    return readCollapsedGroups({ debug: true });
  });

  const listRef = useRef<HTMLDivElement | null>(null);
  const didInitialEnsureVisibleRef = useRef(false);
  const internalZoom = usePanelZoom({ storageKey: 'diagramMenu.zoom', defaultScale: 1, minScale: 0.75, maxScale: 1.35 });
  const menuZoom = zoom ?? internalZoom;


  useEffect(() => {
    const tm = integrationState.integration?.getThemeManager?.();
    if (!tm) return;
    const nextThemes = tm.getAvailablePresetIds().filter(id => !id.startsWith('custom-'));
    const nextCurrent = tm.getCurrentTheme()?.id || '';
    queueMicrotask(() => {
      setAvailableThemes(nextThemes);
      setCurrentTheme(nextCurrent);
    });
    const unsubscribe = tm.addThemeChangeListener?.((newTheme) => {
      setCurrentTheme(newTheme?.id || '');
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [integrationState.integration, integrationState.isReady]);

  useEffect(() => {
    const onFocusSearch = () => {
      if (isCollapsed) return;
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    };
    window.addEventListener('diagramMenuFocusSearch', onFocusSearch as EventListener);
    return () => window.removeEventListener('diagramMenuFocusSearch', onFocusSearch as EventListener);
  }, [isCollapsed]);

  const getThemeDisplayName = (themeId: string): string => {
    const themeNames: Record<string, string> = {
      'light': t('designer.menu.theme.light'),
      'dark': t('designer.menu.theme.dark'),
      'ocean': t('designer.menu.theme.ocean'),
      'forest': t('designer.menu.theme.forest'),
      'high-contrast': t('designer.menu.theme.highContrast'),
      'sunset': t('designer.menu.theme.sunset'),
      'mono': t('designer.menu.theme.mono'),
      'original': t('designer.menu.theme.original')
    };
    return themeNames[themeId] || themeId;
  };

  // 全部展开/收起逻辑
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    diagrams.forEach(d => {
      const category = normalizeDiagramCategory(d.category);
      if (category !== 'debug' && category !== 'other') {
        cats.add(category);
      }
    });
    return Array.from(cats);
  }, [diagrams]);

  const allGroupsExpanded = useMemo(() => {
    return allCategories.every(cat => !collapsedGroups[cat]);
  }, [allCategories, collapsedGroups]);

  const toggleAllGroups = () => {
    const shouldExpand = !allGroupsExpanded;
    const next: Record<string, boolean> = {};
    allCategories.forEach(cat => {
      next[cat] = !shouldExpand;
    });
    setCollapsedGroups(next);
  };

  // 搜索时自动展开匹配的分组
  useEffect(() => {
    if (searchTerm.trim()) {
      const catsToExpand = new Set<string>();
      filteredDiagrams.forEach(d => {
        catsToExpand.add(normalizeDiagramCategory(d.category));
      });

      if (catsToExpand.size > 0) {
        queueMicrotask(() => {
          setCollapsedGroups(prev => {
            const next = { ...prev };
            let changed = false;
            catsToExpand.forEach(cat => {
              if (next[cat] !== false) {
                next[cat] = false;
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        });
      }
    }
  }, [searchTerm, filteredDiagrams]);

  // 按类别分组
  const groupedDiagrams = useMemo(() => {
    const groups: Record<string, DiagramDefinition[]> = {};
    filteredDiagrams.forEach((d: DiagramDefinition) => {
      const cat = normalizeDiagramCategory(d.category);
      if (cat === 'debug') return; // 二次保险，排除测试项
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    });
    // 对类别进行排序：architecture 优先
    return Object.keys(groups).sort((a, b) => {
      if (a === 'architecture') return -1;
      if (b === 'architecture') return 1;
      return a.localeCompare(b);
    }).reduce((obj, key) => {
      obj[key] = groups[key];
      return obj;
    }, {} as Record<string, DiagramDefinition[]>);
  }, [filteredDiagrams]);

  // Removed persistFavorites and toggleFavorite internal logic in favor of hook
  // But wait, the hook uses `favoriteDiagrams` (string[]) and the component uses `favoriteIds` (string[]).
  // I aliased them above.
  // Need to remove the old implementation of toggleFavorite.

  const handleSelect = (id: string) => {
    const sid = normalizeDiagramId(id);
    if (sid) onSelectDiagram(sid);
  };

  // Removed clearFavorites local function as it is imported from hook


  const favoriteDiagrams = useMemo(() => {
    const set = new Set(favoriteIds.map(String));
    return diagrams.filter(d => set.has(String(d.id)));
  }, [diagrams, favoriteIds]);

  const renderDiagramRow = (diagram: DiagramDefinition, size: 'md' | 'sm') => {
    const IconComponent = getDiagramIcon(diagram);
    const displayName = diagram.titleKey ? t(diagram.titleKey) : diagram.name;
    const isSelected = diagram.id === selectedDiagram;
    const isFav = favoriteIds.includes(String(diagram.id));

    const baseClasses = "flex items-center gap-2.5 px-2.5 py-2 mx-1.5 my-0.5 rounded-xl cursor-pointer transition-all duration-200 relative border border-transparent group";
    const hoverClasses = "hover:bg-black/5 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400";
    const selectedClasses = "bg-indigo-500/10 text-slate-900 dark:bg-indigo-500/20 dark:text-white border-indigo-500/20 dark:border-indigo-500/30 font-semibold";
    const leafClasses = size === 'sm' ? "mx-2 px-3" : "";
    const itemClass = `${baseClasses} ${isSelected ? selectedClasses : hoverClasses} ${leafClasses}`;

    return (
      <div
        key={diagram.id}
        title={displayName}
        onClick={() => handleSelect(diagram.id)}
        data-diagram-id={normalizeDiagramId(diagram.id) ?? undefined}
        className={itemClass}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(diagram.id); } }}
      >
        {isSelected && <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-sm bg-indigo-600 dark:bg-indigo-400" />}
        <div className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${isSelected ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/30 dark:text-indigo-400' : 'bg-transparent text-slate-500 dark:text-slate-400'}`}>
          <IconComponent size={size === 'md' ? 16 : 14} aria-hidden="true" />
        </div>
        <span className={`flex-1 overflow-hidden overflow-ellipsis whitespace-nowrap mb-0 pl-1 ${isSelected ? 'font-semibold' : 'font-medium'} ${size === 'md' ? 'text-[14px]' : 'text-[13px]'}`}>{displayName}</span>
        <span className={`ml-auto inline-flex items-center transition-opacity duration-150 group-hover:opacity-100 ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
          <AntButton
            type="text"
            className="w-6 h-6 p-0 hover:bg-black/5 dark:hover:bg-white/10"
            size="small"
            aria-label={isFav ? t('designer.menu.unfavorite') : t('designer.menu.favorite')}
            icon={isFav ? <StarFilled style={{ color: token.colorWarning, fontSize: 13 }} /> : <StarOutlined style={{ fontSize: 13 }} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const diagramId = normalizeDiagramId(diagram.id);
              if (diagramId) toggleFavorite(diagramId);
            }}
          />
        </span>
      </div>
    );
  };

  const toggleGroup = (cat: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  useEffect(() => {
    writeCollapsedGroups(collapsedGroups || {});
  }, [collapsedGroups]);

  useEffect(() => {
    try {
      const el = listRef.current;
      if (!el) return;
      const scrollTop = readMenuScrollTop();
      if (scrollTop !== null) el.scrollTop = scrollTop;
    } catch (error) {
      logModernDiagramMenuFailure('restoreScrollTop', error);
    }
  }, []);

  useEffect(() => {
    try {
      const selectedCat = normalizeDiagramCategory(diagrams.find(d => d.id === selectedDiagram)?.category);
      if (!didInitialEnsureVisibleRef.current && selectedCat && selectedCat !== 'other') {
        didInitialEnsureVisibleRef.current = true;
        if (collapsedGroups[selectedCat]) {
          queueMicrotask(() => {
            setCollapsedGroups(prev => ({ ...prev, [selectedCat]: false }));
          });
        }
      }
    } catch (error) {
      logModernDiagramMenuFailure('expandSelectedCategory', error);
    }
  }, [diagrams, selectedDiagram, collapsedGroups]);

  useEffect(() => {
    try {
      const el = listRef.current;
      if (!el) return;
      if (!selectedDiagram) return;
      const selector = getDiagramDataSelector(selectedDiagram);
      if (!selector) return;
      const target = el.querySelector(selector);
      if (target) target.scrollIntoView({ block: 'nearest' });
    } catch (error) {
      logModernDiagramMenuFailure('ensureSelectedVisible', error);
    }
  }, [selectedDiagram]);

  const navigateToDocsPreview = () => {
    window.open('/docs', '_blank', 'noopener,noreferrer');
  };

  const renderFilterContent = () => (
    <div className="p-3 min-w-[280px]">
      <h4 className="mt-0 mb-2 font-semibold text-[13px] text-slate-800 dark:text-slate-200">{t('designer.menu.tagFilter')}</h4>
      <div className="flex gap-2 mb-3">
        <AntButton size="small" type={matchMode === 'any' ? 'primary' : 'default'} onClick={() => setMatchMode('any')}>{t('designer.menu.matchAny')}</AntButton>
        <AntButton size="small" type={matchMode === 'all' ? 'primary' : 'default'} onClick={() => setMatchMode('all')}>{t('designer.menu.matchAll')}</AntButton>
        <AntButton size="small" danger onClick={() => setSelectedTags([])} disabled={selectedTags.length === 0}>{t('designer.menu.clear')}</AntButton>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
        {tagStats.allTags.map(tag => (
          <AntButton
            key={tag}
            size="small"
            type={selectedTags.includes(tag) ? 'primary' : 'default'}
            onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
            className="rounded-xl px-2.5"
          >
            {tag} ({tagStats.counts.get(tag)})
          </AntButton>
        ))}
      </div>
    </div>
  );

  const renderThemeMenu = () => {
    const tm = integrationState.integration?.getThemeManager?.();
    if (!tm) return null;
    return (
      <div className="p-2 min-w-[180px]">
        <h4 className="mt-0 mb-2 font-semibold text-[13px] text-slate-800 dark:text-slate-200">{t('designer.menu.switchTheme')}</h4>
        <div className="flex flex-col gap-1">
          {availableThemes.map(themeId => (
            <AntButton
              key={themeId}
              type={currentTheme === themeId ? 'primary' : 'text'}
              onClick={() => {
                const normalizedThemeId = normalizeThemeId(themeId);
                if (normalizedThemeId) tm.setTheme(normalizedThemeId);
              }}
              className="text-left flex items-center gap-2 w-full px-2 py-1"
            >
              <span className="inline-block w-4 h-4 rounded-full border border-black/10 dark:border-white/10" style={{ backgroundColor: tm.getThemeColor(themeId, 'primary') || '#ccc' }} />
              {getThemeDisplayName(themeId)}
            </AntButton>
          ))}
        </div>
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div
        className={`flex flex-col gap-2 justify-start pt-3 pb-3 px-2 w-[64px] items-center bg-white/60 dark:bg-[#0f172a]/60 backdrop-blur-xl backdrop-saturate-[180%] border-r border-black/5 dark:border-white/5 h-full transition-all duration-300 overflow-hidden ${themeMode}`}
      >
        <Tooltip title={t('designer.menu.expandMenu')} placement="right">
          <AntButton
            type="text"
            aria-label={t('designer.menu.expandMenu')}
            icon={<FaChevronRight size={18} />}
            onClick={onToggleCollapse}
            style={{ color: token.colorTextSecondary }}
          />
        </Tooltip>
        <Tooltip title={t('designer.menu.docsPreview')} placement="right">
          <AntButton
            type="text"
            aria-label={t('designer.menu.docsPreview')}
            icon={<FaBook size={16} />}
            onClick={navigateToDocsPreview}
            style={{ color: token.colorTextSecondary }}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={`flex flex-col flex-1 h-full bg-white/60 dark:bg-[#0f172a]/60 backdrop-blur-xl backdrop-saturate-[180%] border-r border-black/5 dark:border-white/5 py-4 px-3 overflow-hidden transition-all duration-300 text-slate-800 dark:text-slate-300 ${themeMode}`}>
      <div className="flex items-center mb-3 pr-2 border-b border-black/5 pb-2.5">
        <FaSitemap className="text-sm mr-2.5 text-slate-600 dark:text-slate-400" />
        <h3 className="text-sm font-semibold tracking-tight m-0 text-slate-800 dark:text-slate-200">{t('designer.menu.title')}</h3>
        <div style={{ flex: 1 }} />
        <div className="flex items-center gap-0.5">
          <AuthStatusCompact />
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div className="menu-more-popover">
                <div className="menu-more-actions">
                  <AntButton
                    size="small"
                    type="text"
                    onClick={toggleAllGroups}
                    icon={allGroupsExpanded ? <FaAngleDoubleUp /> : <FaAngleDoubleDown />}
                  >
                    {allGroupsExpanded ? t('designer.menu.collapseAll') : t('designer.menu.expandAll')}
                  </AntButton>
                  <AntButton size="small" type="text" onClick={navigateToDocsPreview} icon={<FaBook />}>
                    {t('designer.menu.docsPreview')}
                  </AntButton>
                </div>
                <div className="menu-more-section">{renderFilterContent()}</div>
                <div className="menu-more-section">{renderThemeMenu()}</div>
              </div>
            }
          >
            <AntButton type="text" className="menu-action-btn" icon={<MoreOutlined />} title={t('designer.menu.more')} aria-label={t('designer.menu.more')} />
          </Popover>
          <AntButton type="text" className="text-slate-500 hover:text-indigo-600 hover:bg-black/5 px-2" icon={<FaChevronLeft />} onClick={onToggleCollapse} title={t('designer.menu.collapseMenu')} aria-label={t('designer.menu.collapseMenu')} />
        </div>
      </div>

      <div className="relative mb-2.5">
        <Input
          ref={searchInputRef}
          placeholder={t('designer.menu.searchPlaceholder', { shortcut: focusSearchShortcutLabel })}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
          prefix={<FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />}
          className="w-full py-2.5 px-3 pl-9 bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)] hover:border-black/10 focus-within:bg-white focus-within:border-indigo-400 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
        />
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-slate-400/30 [&::-webkit-scrollbar-thumb]:rounded-md"
        onWheel={menuZoom.onWheel}
        onScroll={(e) => {
          try {
            const el = e.currentTarget as HTMLDivElement;
            writeMenuScrollTop(el.scrollTop || 0);
          } catch (error) {
            logModernDiagramMenuFailure('persistScrollTop', error);
          }
        }}
      >
        <div style={{ zoom: menuZoom.scale } as React.CSSProperties}>
          {favoriteDiagrams.length > 0 && (
            <div className="mx-1.5 mb-2.5 pb-2.5 border-b border-black/5 dark:border-white/5">
              {favoriteDiagrams.length > 0 && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between px-2.5 mb-1.5">
                    <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center">{t('designer.menu.favorites')}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">{favoriteDiagrams.length}</span>
                      <AntButton type="text" className="h-[22px] px-1.5 text-[11px] text-slate-500 hover:bg-black/5 dark:hover:bg-white/10 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0" onClick={clearFavorites}>
                        {t('designer.menu.clear')}
                      </AntButton>
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {favoriteDiagrams.slice(0, 6).map(d => renderDiagramRow(d, 'sm'))}
                  </div>
                </div>
              )}
            </div>
          )}

          {Object.entries(groupedDiagrams).map(([cat, items]) => {
            const isCollapsed = collapsedGroups[cat];
            const normalizedCat = normalizeDiagramCategory(cat);
            const GroupIcon = categoryIcons[normalizedCat] || FaProjectDiagram;
            const groupColor = categoryColors[normalizedCat] || 'var(--color-primary-500)';
            const isExpanded = !isCollapsed;

            return (
              <div key={cat} className="mb-2">
                <div
                  className={`flex items-center px-3 py-2 mx-1 cursor-pointer rounded-lg transition-colors duration-200 select-none hover:bg-black/5 dark:hover:bg-white/5 ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleGroup(cat)}
                  style={{ '--group-color': groupColor } as React.CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(cat); } }}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <GroupIcon className={`text-[12px] transition-colors duration-200 ${isExpanded ? 'text-[var(--group-color)]' : 'text-slate-400'}`} aria-hidden="true" />
                    <span className={`text-[13px] font-semibold transition-colors duration-200 ${isExpanded ? 'text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}>{t(categoryLabelKeys[normalizedCat] || normalizedCat)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-[10px] bg-black/5 dark:bg-white/10 text-slate-400 font-semibold">{items.length}</span>
                    <span className="text-slate-400 flex items-center">
                      {isCollapsed ? <FaChevronRight size={10} aria-hidden="true" /> : <FaChevronDown size={10} aria-hidden="true" />}
                    </span>
                  </div>
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col gap-0.5 py-1 px-0">
                    {items.map(diagram => renderDiagramRow(diagram, 'sm'))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ModernDiagramMenu;

import type { MenuProps } from 'antd/es/menu';
import Avatar from 'antd/es/avatar';
import Dropdown from 'antd/es/dropdown';
import { Palette, Search, Settings, User, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { useTheme } from '@/core/themes/useCoreTheme';
import { toSafeImageUrl } from '@/core/utils/sanitizeHtml';
import { focusWorkspaceTarget } from './workspaceMenuInteraction';
import { getWorkspaceSearchFeedback, MAX_WORKSPACE_SEARCH_LENGTH } from './workspaceSearch';

const WORKSPACE_SETTINGS_MENU_ID = 'workspace-settings-menu';

interface WorkspaceGlobalHeaderProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchResultCount: number;
  onClearSearch: () => void;
  onNavigateToResults?: () => boolean;
  onNavigateHome: () => void;
  settingsMenu: MenuProps['items'];
  onSettingsMenuClick?: MenuProps['onClick'];
  settingsTriggerRef?: RefObject<HTMLButtonElement | null>;
  isAuthenticated: boolean;
  avatarUrl?: string;
}

export const WorkspaceGlobalHeader = ({
  searchTerm,
  onSearchTermChange,
  searchInputRef,
  searchResultCount,
  onClearSearch,
  onNavigateToResults,
  onNavigateHome,
  settingsMenu,
  onSettingsMenuClick,
  settingsTriggerRef: externalSettingsTriggerRef,
  isAuthenticated,
  avatarUrl,
}: WorkspaceGlobalHeaderProps) => {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const internalSettingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = externalSettingsTriggerRef ?? internalSettingsTriggerRef;
  const restoreSettingsFocusRef = useRef(false);
  const search = getWorkspaceSearchFeedback(searchTerm, searchResultCount);
  const searchStatus = search.isActive
    ? search.resultCount === 0
      ? t('workspace.searchNoResultsStatus', { query: search.query })
      : t('workspace.searchResultsStatus', { count: search.resultCount })
    : '';
  const isDarkTheme = theme?.mode === 'dark';
  const darkThemeLabel = t('designer.menu.theme.dark');
  const nextThemeLabel = t(isDarkTheme ? 'designer.menu.theme.light' : 'designer.menu.theme.dark');
  const themeToggleLabel = `${t('workspace.toggleTheme')}: ${darkThemeLabel}`;
  const themeActionTitle = `${t('workspace.toggleTheme')}: ${nextThemeLabel}`;

  const handleSettingsMenuOpenChange = (open: boolean) => {
    setSettingsMenuOpen(open);
    if (open) {
      requestAnimationFrame(() => {
        const firstItem = document.querySelector<HTMLElement>(
          `#${WORKSPACE_SETTINGS_MENU_ID} [role="menuitem"]`,
        );
        focusWorkspaceTarget(firstItem);
      });
      return;
    }

    if (restoreSettingsFocusRef.current) {
      restoreSettingsFocusRef.current = false;
      queueMicrotask(() => focusWorkspaceTarget(settingsTriggerRef.current));
    }
  };

  const handleSettingsTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && settingsMenuOpen) {
      event.preventDefault();
      restoreSettingsFocusRef.current = true;
      handleSettingsMenuOpenChange(false);
      return;
    }
    if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    handleSettingsMenuOpenChange(true);
  };

  const handleSettingsMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') restoreSettingsFocusRef.current = true;
  };

  return (
  <header className="workspace-global-header">
    <button
      type="button"
      className="workspace-header-brand"
      onClick={onNavigateHome}
      aria-label={t('workspace.goHome')}
    >
      <div className="workspace-header-logo">
        <div style={{
          width: 28,
          height: 28,
          background: 'var(--vz-brand-gradient)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 16,
          fontWeight: 800,
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
        }}>V</div>
      </div>
      <div className="workspace-header-title">Vizly</div>
    </button>

    <div className="workspace-header-search-container">
      <div className="workspace-search">
        <Search size={16} strokeWidth={2} style={{ color: 'var(--vz-brand-from)', opacity: 0.7 }} />
        <input
          ref={searchInputRef}
          type="search"
          aria-label={t('workspace.search')}
          aria-controls="workspace-diagram-results"
          aria-describedby="workspace-search-status"
          aria-keyshortcuts="ArrowDown Escape"
          placeholder={t('workspace.searchPlaceholder')}
          value={searchTerm}
          maxLength={MAX_WORKSPACE_SEARCH_LENGTH}
          autoComplete="off"
          spellCheck={false}
          onChange={event => onSearchTermChange(event.target.value)}
          onKeyDown={event => {
            if (
              event.key === 'ArrowDown'
              && search.isActive
              && search.resultCount > 0
              && onNavigateToResults?.()
            ) {
              event.preventDefault();
              return;
            }
            if (event.key === 'Escape' && search.value.length > 0) {
              event.preventDefault();
              onClearSearch();
            }
          }}
        />
        {search.value.length > 0 && (
          <button
            type="button"
            className="workspace-search-clear"
            onClick={onClearSearch}
            aria-label={t('workspace.clearSearch')}
            title={t('workspace.clearSearch')}
          >
            <X size={15} strokeWidth={2} />
          </button>
        )}
      </div>
      <span
        id="workspace-search-status"
        className="workspace-visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {searchStatus}
      </span>
    </div>

    <div className="workspace-header-actions">
      <button
        type="button"
        className="workspace-icon-btn"
        onClick={() => void setTheme(isDarkTheme ? 'light' : 'dark')}
        aria-label={themeToggleLabel}
        aria-pressed={isDarkTheme}
        title={themeActionTitle}
      >
        <Palette size={16} strokeWidth={2} />
      </button>
      <LanguageSwitcher variant="icon" className="workspace-icon-btn" />
      <Dropdown
        menu={{
          id: WORKSPACE_SETTINGS_MENU_ID,
          items: settingsMenu,
          'aria-label': t('workspace.settings'),
          onClick: event => {
            restoreSettingsFocusRef.current = true;
            onSettingsMenuClick?.(event);
          },
          onKeyDown: handleSettingsMenuKeyDown,
        }}
        trigger={['click']}
        open={settingsMenuOpen}
        onOpenChange={handleSettingsMenuOpenChange}
        placement="bottomRight"
      >
        <button
          ref={settingsTriggerRef}
          type="button"
          className="workspace-settings-trigger"
          aria-label={t('workspace.settings')}
          aria-haspopup="menu"
          aria-expanded={settingsMenuOpen}
          aria-controls={WORKSPACE_SETTINGS_MENU_ID}
          title={t('workspace.settings')}
          onKeyDown={handleSettingsTriggerKeyDown}
        >
          {isAuthenticated
            ? <Avatar size={24} src={avatarUrl ? toSafeImageUrl(avatarUrl) ?? undefined : undefined} icon={<User size={14} strokeWidth={2} />} />
            : <Settings size={16} strokeWidth={2} />}
        </button>
      </Dropdown>
    </div>
  </header>
  );
};

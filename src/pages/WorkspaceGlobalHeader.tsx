import type { MenuProps } from 'antd/es/menu';
import Avatar from 'antd/es/avatar';
import Dropdown from 'antd/es/dropdown';
import { Palette, Search, Settings, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { toSafeImageUrl } from '@/core/utils/sanitizeHtml';
interface WorkspaceGlobalHeaderProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onNavigateHome: () => void;
  settingsMenu: MenuProps['items'];
  isAuthenticated: boolean;
  avatarUrl?: string;
}

export const WorkspaceGlobalHeader = ({
  searchTerm,
  onSearchTermChange,
  onNavigateHome,
  settingsMenu,
  isAuthenticated,
  avatarUrl,
}: WorkspaceGlobalHeaderProps) => {
  const { t } = useTranslation();

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
          aria-label={t('workspace.search')}
          placeholder={t('workspace.searchPlaceholder')}
          value={searchTerm}
          onChange={event => onSearchTermChange(event.target.value)}
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
        aria-label={t('workspace.toggleTheme')}
        title={t('workspace.toggleTheme')}
      >
        <Palette size={16} strokeWidth={2} />
      </button>
      <LanguageSwitcher variant="icon" className="workspace-icon-btn" />
      <Dropdown menu={{ items: settingsMenu }} trigger={['click']} placement="bottomRight">
        <button
          type="button"
          className="workspace-settings-trigger"
          aria-label={t('workspace.settings')}
          title={t('workspace.settings')}
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

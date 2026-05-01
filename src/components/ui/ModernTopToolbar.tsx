// @ts-nocheck
import React, { useState } from 'react';
import { Button, Flex, Grid, Select, Typography, Space, Tooltip, Popover, theme } from 'antd';
import { SearchOutlined, HomeOutlined, RightOutlined, MoreOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ExportTools from '../ExportTools';
import { EnhancedThemeSelector } from './EnhancedThemeSelector';
import EnhancedStyleSwitcher from '../shared/EnhancedStyleSwitcher';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { TopToolbarProps } from './TopToolbar';

export type { TopToolbarProps };

const { Text } = Typography;

/**
 * ModernTopToolbar
 * 
 * A Figma-style unified toolbar with glassmorphism, brand identity,
 * and clean grouping. Designed to match the Vizly Dashboard aesthetic.
 */
export const ModernTopToolbar: React.FC<TopToolbarProps> = ({
  diagramId,
  diagramName,
  edgeMode,
  onEdgeModeChange,
  isFullscreen,
  onToggleFullscreen,
  showThemeSelector = true,
  showStyleSwitcher = true,
  showExport = true,
  leftChildren,
  rightChildren,
  title,
  setIsCommandOpen,
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const compact = !screens.xl;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  const commandShortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  const [moreOpen, setMoreOpen] = useState(false);

  /* ── More menu — Edge Mode + Language ── */
  const moreContent = (
    <div className="min-w-[220px] py-2 flex flex-col font-sans">
      <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          {t('header.edgeMode')}
        </div>
        <Select
          variant="filled"
          value={edgeMode}
          onChange={(value) => { onEdgeModeChange(value as 'advanced-smart' | 'native'); }}
          style={{ width: '100%', fontSize: '13px' }}
          popupMatchSelectWidth={false}
          options={[
            { value: 'advanced-smart', label: t('header.smart') },
            { value: 'native', label: t('header.native') },
          ]}
          styles={{ popup: { root: { borderRadius: '8px', padding: '4px' } } }}
        />
      </div>
      
      <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-2 my-1" />
      
      <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          {t('common.language', 'Language')}
        </div>
        <LanguageSwitcher />
      </div>
    </div>
  );

  return (
    <div className="flex items-start justify-between w-full px-4 mt-4 z-[100] relative box-border transition-all pointer-events-none">
      {/* ── Left Island: Brand + Breadcrumb + Title + Save Status + Search ── */}
      <div className="flex items-center gap-2 flex-shrink-0 h-[48px] px-3 bg-white/90 dark:bg-[#0f172a]/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/80 rounded-[10px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] pointer-events-auto">
        {/* Vizly Brand → Home */}
        <a
          className="flex items-center justify-center px-2 py-1 rounded-md no-underline cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          onClick={(e) => { e.preventDefault(); window.location.href = '#/manage'; }}
          href="#/manage"
          title="Back to Home"
        >
          <span className="font-extrabold text-[16px] tracking-tight whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-[#6366f1] to-[#a855f7]">
            {compact ? 'V' : 'Vizly'}
          </span>
        </a>

        {/* Breadcrumb chevron */}
        <RightOutlined className="text-[10px] text-slate-600 dark:text-slate-400 opacity-40 mx-1 flex-shrink-0" />

        {/* Current file title */}
        {title && (
          <div className="group flex items-center gap-2 ml-1 px-2.5 py-1 rounded-md cursor-default transition-colors hover:bg-black/5 dark:hover:bg-white/5">
            <span className="font-semibold text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] lg:max-w-[160px] xl:max-w-[240px]">{title}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 dark:text-emerald-400 opacity-70 ml-1 transition-opacity group-hover:opacity-100">
              <CheckCircleOutlined /> Saved
            </span>
          </div>
        )}

        {/* Left slot (Home, flow direction, etc) */}
        {leftChildren}
      </div>

      {/* ── Right Island: Styling + Controls + Actions ── */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 h-[48px] px-2 bg-white/90 dark:bg-[#0f172a]/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/80 rounded-[10px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] pointer-events-auto">
          {/* Styling Group */}
          {showStyleSwitcher && (
            <EnhancedStyleSwitcher
              style={{
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                padding: '0 8px',
              }}
              className="hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors"
            />
          )}
          {showThemeSelector && (
            <EnhancedThemeSelector
              style={{
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                padding: '0 8px',
              }}
            />
          )}

          <div className="w-[1px] h-4 bg-black/10 dark:bg-white/20 mx-1" />

          {/* Plugin Portal Target: This allows diagram plugins to inject their tools right into the global island */}
          <div id="vizly-plugin-right-island-portal" className="flex items-center gap-1" />

          {/* Export */}
          {showExport && (
            <div className="flex items-center gap-1.5 [&_.ant-btn]:border-none [&_.ant-btn]:shadow-none [&_.ant-btn]:bg-transparent [&_.ant-btn]:text-slate-600 dark:[&_.ant-btn]:text-slate-400 [&_.ant-btn:hover]:bg-indigo-500/10 [&_.ant-btn:hover]:text-indigo-500 [&_.ant-btn]:h-[30px] [&_.ant-btn]:rounded-md [&_.ant-btn]:text-[13px] [&_.ant-btn]:font-medium [&_.ant-btn-icon-only]:w-[30px] [&_.ant-btn-icon-only]:px-0">
              <ExportTools
                diagramId={diagramId}
                diagramName={diagramName || 'diagram'}
                variant="inline"
                showControls={false}
                isFullscreen={isFullscreen}
                onToggleFullscreen={onToggleFullscreen}
              />
            </div>
          )}

          {/* More menu — Edge Mode + Language */}
          <Popover
            content={moreContent}
            trigger="click"
            placement="bottomRight"
            open={moreOpen}
            onOpenChange={setMoreOpen}
            styles={{ root: {}, container: { padding: 0, borderRadius: '12px' } }}
          >
            <button className="inline-flex items-center justify-center w-[30px] h-[30px] border-none rounded-md bg-transparent text-slate-600 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-500 active:bg-indigo-500/20 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 cursor-pointer" title="More options">
              <MoreOutlined />
            </button>
          </Popover>

          {/* Right slot (Settings gear, etc) */}
          {rightChildren}
        </div>
      </div>
    </div>
  );
};

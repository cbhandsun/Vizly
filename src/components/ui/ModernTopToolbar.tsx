// @ts-nocheck
import React, { useState } from 'react';
import { Button, Flex, Grid, Select, Typography, Space, Tooltip, Popover, theme } from 'antd';
import { SearchOutlined, HomeOutlined, RightOutlined, MoreOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ExportTools from '../ExportTools';
import { EnhancedThemeSelector } from './EnhancedThemeSelector';
import EnhancedStyleSwitcher from '../shared/EnhancedStyleSwitcher';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { AuthStatusCompact } from '../auth/AuthStatus';
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
    <div 
        className="grid items-start w-full px-4 mt-4 z-[100] relative box-border transition-all pointer-events-none gap-4"
        style={{ 
            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
            paddingRight: 'calc(16px + var(--right-sidebar-offset, 0px))' 
        }}
    >
      {/* ── Left Island Group ── */}
      <div className="flex items-center justify-start gap-2 justify-self-start flex-nowrap overflow-hidden">
        
        {/* Pill 1: Brand + Breadcrumb + Title + Save Status */}
        <div className="flex items-center gap-2 h-[48px] bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[14px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] pointer-events-auto" style={{ paddingLeft: '14px', paddingRight: '14px', flexShrink: 0 }}>
          {/* Vizly Brand → Home */}
          <a
            className="flex items-center justify-center py-1 rounded-md no-underline cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
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
            <div className="group flex items-center gap-2 mr-1 px-2.5 py-1 rounded-md cursor-default transition-colors hover:bg-black/5 dark:hover:bg-white/5">
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] lg:max-w-[160px] xl:max-w-[240px]">{title}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 dark:text-emerald-400 opacity-70 ml-1 transition-opacity group-hover:opacity-100">
                <CheckCircleOutlined /> Saved
              </span>
            </div>
          )}
        </div>

        {/* Pill 2: Left slot (Home, flow direction, search etc) */}
        {leftChildren && (
          <div className="flex items-center gap-3 h-[48px] bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[14px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] pointer-events-auto" style={{ paddingLeft: '14px', paddingRight: '14px', flexShrink: 0 }}>
            {leftChildren}
          </div>
        )}
      </div>

      {/* ── Center Island Group: Action Tools & Context Tools ── */}
      <div className="flex flex-col items-center pointer-events-none gap-2 z-10 justify-self-center">
        <div 
          id="vizly-plugin-center-island-portal" 
          className="flex items-center h-[48px] bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[14px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] pointer-events-auto px-[8px] transition-all empty:hidden" 
          style={{ zIndex: 100 }} 
        />
        <div 
          id="vizly-plugin-context-toolbar-portal" 
          className="flex items-center h-[42px] bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(40,40,55,0.85)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.6)] dark:border-[rgba(255,255,255,0.15)] rounded-[12px] shadow-[0_10px_30px_-5px_rgba(0,0,0,0.12)] pointer-events-auto px-[6px] transition-all empty:hidden" 
          style={{ zIndex: 99 }} 
        />
      </div>

      {/* ── Right Island Group ── */}
      <div className="flex items-center justify-end gap-2 justify-self-end flex-nowrap overflow-hidden">
          
        {/* Unified Pill: Tools, Settings, Theme, Language, Auth */}
        <div className="flex items-center h-[48px] bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[14px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] pointer-events-auto" style={{ paddingLeft: '14px', paddingRight: '14px', flexShrink: 0 }}>
          <div className="flex items-center gap-2">

            {/* Group 1: Export + More */}
            <div className="flex items-center gap-1.5">

              {/* Export */}
              {showExport && (
                <div className="flex items-center gap-1.5 [&_.ant-btn]:border-none [&_.ant-btn]:shadow-none [&_.ant-btn]:bg-transparent [&_.ant-btn]:text-slate-600 dark:[&_.ant-btn]:text-slate-400 [&_.ant-btn:hover]:bg-indigo-500/10 [&_.ant-btn:hover]:text-indigo-500 [&_.ant-btn]:h-[30px] [&_.ant-btn]:rounded-[8px] [&_.ant-btn]:text-[13px] [&_.ant-btn]:font-medium [&_.ant-btn-icon-only]:w-[30px] [&_.ant-btn-icon-only]:px-0">
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

              {/* More menu — Edge Mode */}
              <Popover
                content={
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
                    </div>
                }
                trigger="click"
                placement="bottomRight"
                open={moreOpen}
                onOpenChange={setMoreOpen}
                styles={{ root: {}, container: { padding: 0, borderRadius: '12px' } }}
              >
                <button className="inline-flex items-center justify-center w-[30px] h-[30px] border-none rounded-[8px] bg-transparent text-slate-600 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-500 active:bg-indigo-500/20 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 cursor-pointer" title="More options">
                  <MoreOutlined />
                </button>
              </Popover>
            </div>

            {/* Divider */}
            {((showExport || moreOpen !== undefined) || (rightChildren)) && (
                <div className="w-[1px] h-[20px] bg-slate-200 dark:bg-slate-700 mx-1" />
            )}

            {/* Group 2: Settings */}
            {rightChildren && (
              <div className="flex items-center">
                {rightChildren}
              </div>
            )}

            {/* Divider for System Utilities */}
            <div className="w-[1px] h-[20px] bg-slate-200 dark:bg-slate-700 mx-1" />

            {/* Group 3: Theme, Language, Auth */}
            <div className="flex items-center gap-2 pl-1">
              {showThemeSelector && (
                <EnhancedThemeSelector
                  variant="icon"
                  className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-[8px] bg-transparent border-none text-slate-600 dark:text-slate-300 hover:text-indigo-500 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-all cursor-pointer shadow-none"
                />
              )}
              
              <LanguageSwitcher 
                  variant="icon" 
                  className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-[8px] bg-transparent border-none text-slate-600 dark:text-slate-300 hover:text-indigo-500 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-all cursor-pointer shadow-none"
              />

              <div className="ml-1 flex items-center justify-center w-[32px] h-[32px] rounded-[8px] bg-white/80 dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:border-indigo-500/30 transition-all shadow-sm overflow-hidden cursor-pointer [&_.ant-btn]:border-none [&_.ant-btn]:w-full [&_.ant-btn]:h-full [&_.ant-btn]:p-0 [&_.ant-btn:hover]:bg-indigo-50/80 dark:[&_.ant-btn:hover]:bg-indigo-500/20 [&_.ant-btn:hover]:text-indigo-500 [&_.ant-avatar]:w-full [&_.ant-avatar]:h-full [&_.ant-avatar]:rounded-none">
                <AuthStatusCompact />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

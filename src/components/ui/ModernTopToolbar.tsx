// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { Button, Grid, Select, Typography, Space, Tooltip, Popover, theme, Dropdown } from 'antd';
import { SearchOutlined, HomeOutlined, RightOutlined, MoreOutlined, CheckCircleOutlined, EllipsisOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ExportTools from '../ExportTools';
import { EnhancedThemeSelector } from './EnhancedThemeSelector';
import EnhancedStyleSwitcher from '../shared/EnhancedStyleSwitcher';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { AuthStatusCompact } from '../auth/AuthStatus';
import { FaChevronDown, FaEllipsisV } from 'react-icons/fa';
import { TopToolbarProps } from './TopToolbar';
import { motion, AnimatePresence } from 'framer-motion';

export type { TopToolbarProps };

const { Text } = Typography;

/**
 * ModernTopToolbar (Hyper-Glass V3.1 - Indestructible Layout)
 * 
 * A Figma-style unified toolbar with glassmorphism and robust space management.
 * Solves the overlap/occlusion issue by enforcing island boundaries and responsive scaling.
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
  centerChildren,
  rightChildren,
  title,
  setIsCommandOpen,
}) => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  
  // Responsive flags
  const isCompact = !screens.xl; // < 1200px
  const isMobile = !screens.md;  // < 768px
  
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  const commandShortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  const islandBaseClass = "flex items-center h-[40px] bg-white dark:bg-[#2d2d2d] border border-[rgba(0,0,0,0.12)] dark:border-[rgba(255,255,255,0.12)] rounded-[10px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200 pointer-events-auto";

  /* ── Menu Content ── */
  const moreContent = useMemo(() => (
    <div className="min-w-[220px] py-2 flex flex-col font-sans">
      <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          {t('header.edgeMode', '连线模式')}
        </div>
        <Select
          variant="filled"
          value={edgeMode}
          onChange={(value) => { onEdgeModeChange(value as 'advanced-smart' | 'native'); }}
          style={{ width: '100%', fontSize: '13px' }}
          options={[
            { value: 'advanced-smart', label: t('header.smart') },
            { value: 'native', label: t('header.native') },
          ]}
        />
      </div>
      
      <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-2 my-1" />
      
      <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          {t('common.language', '语言 / Language')}
        </div>
        <LanguageSwitcher />
      </div>
    </div>
  ), [edgeMode, onEdgeModeChange, t]);

  return (
    <div className="fixed top-3 left-3 right-3 z-[1000] flex items-center justify-between pointer-events-none h-[40px] gap-3">
      
      {/* ── LEFT SECTION: Brand + Project + Search (unified pill) ── */}
      <div className="flex-[0_1_auto] flex items-center min-w-0">
        <div className={`${islandBaseClass} gap-1 shrink-0`} style={{ paddingLeft: '14px', paddingRight: '14px' }}>
          <a 
            href="#/manage" 
            className="flex items-center gap-2 px-1.5 py-1 rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-all no-underline active:scale-95"
            onClick={(e) => { e.preventDefault(); window.location.hash = '#/manage'; }}
          >
            <div className="w-[22px] h-[22px] bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-md flex items-center justify-center shadow-sm">
              <span className="text-[11px] font-black text-white italic">V</span>
            </div>
            {!isMobile && (
              <span className="text-[14.5px] font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-500">
                Vizly
              </span>
            )}
          </a>

          {title && (
            <div className="flex items-center min-w-0">
              <RightOutlined className="text-[10px] text-slate-300 dark:text-slate-600 mx-1.5 flex-shrink-0" />
              <Popover
                content={
                  <div className="w-[360px] p-1">
                    <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-white/5 mb-2 flex items-center justify-between">
                      <span>{t('diagramViewer.switchDiagram', '切换图表')}</span>
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto">{leftChildren}</div>
                  </div>
                }
                trigger="click"
                placement="bottomLeft"
              >
                <Tooltip title={t('diagramViewer.switchDiagram', '切换图表')} mouseEnterDelay={0.6}>
                  <div className="flex items-center gap-1.5 px-2.5 h-[32px] rounded-[6px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer transition-colors active:scale-[0.97] min-w-0 group">
                    <span className="font-semibold text-[14px] text-slate-700 dark:text-slate-200 truncate max-w-[80px] sm:max-w-[160px] lg:max-w-[240px]">
                      {title}
                    </span>
                    <FaChevronDown className="text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors flex-shrink-0" />
                  </div>
                </Tooltip>
              </Popover>
            </div>
          )}

          {/* Search — integrated into the same pill */}
          {!isMobile && setIsCommandOpen && (
            <>
              <div className="w-[1px] h-[18px] bg-slate-200 dark:bg-white/10 mx-1.5 flex-shrink-0" />
              <div 
                className="flex items-center gap-2 px-2 h-[32px] rounded-[6px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer transition-colors group"
                onClick={() => setIsCommandOpen(true)}
              >
                <SearchOutlined className="text-[15px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                <div className="flex items-center px-1.5 py-[3px] bg-black/[0.04] dark:bg-white/[0.06] rounded-[4px] border border-black/[0.02] dark:border-white/[0.04]">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider leading-none">{commandShortcutLabel}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── CENTER SECTION: Tools ── */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <div className="flex items-center gap-2 max-w-full">
          {/* Core Tools Pill */}
          <div className={`${islandBaseClass} px-2 shrink-0`}>
            {centerChildren}
            <div id="vizly-plugin-center-island-portal" className="flex items-center gap-0.5 empty:hidden" />
          </div>

          {/* Contextual Toolbar Pill (Dynamic Actions) */}
          <div 
            id="vizly-plugin-context-toolbar-portal" 
            className={`${islandBaseClass} px-2 empty:hidden`}
          />
        </div>
      </div>

      {/* ── RIGHT SECTION: System ── */}
      <div className="flex-[0_1_auto] flex items-center justify-end gap-2 min-w-0">
        <div id="vizly-plugin-right-island-portal" className={`${islandBaseClass} px-2 empty:hidden`} />
        
        <div className={`${islandBaseClass} px-2 shrink-0`}>
          {rightChildren}
          
          <div className="flex items-center gap-0.5">
            {showExport && (
              <ExportTools
                diagramId={diagramId}
                diagramName={diagramName}
                onToggleFullscreen={onToggleFullscreen}
                isFullscreen={isFullscreen}
                variant="compact"
              />
            )}
            
            <Popover content={moreContent} trigger="click" placement="bottomRight">
              <div className="w-8 h-8 flex items-center justify-center hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] cursor-pointer text-slate-500 dark:text-slate-400 transition-colors">
                <FaEllipsisV className="text-[13px]" />
              </div>
            </Popover>
          </div>

          <div className="w-[1px] h-4 bg-slate-200/80 dark:bg-white/10 mx-0.5 flex-shrink-0" />
          <div className="flex items-center gap-1">
            {showThemeSelector && (
              <EnhancedThemeSelector variant="icon" />
            )}
            <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700 flex-shrink-0 cursor-pointer active:scale-95">
              <AuthStatusCompact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernTopToolbar;

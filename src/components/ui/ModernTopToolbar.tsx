import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Grid, Select, Tooltip, Popover } from 'antd';
import { SearchOutlined, RightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ExportTools from '../ExportTools';
import { EnhancedThemeSelector } from './EnhancedThemeSelector';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { AuthStatusCompact } from '../auth/AuthStatus';
import { FaChevronDown, FaEllipsisV, FaHome } from 'react-icons/fa';
import type { TopToolbarProps } from './TopToolbar';
import { getToolbarPopupContainer, isToolbarEdgeMode } from './topToolbarGuards';
import { DiagramTitleEditor } from './DiagramTitleEditor';
import { focusDialogEntry, trapDialogTab } from '@/core/components/diagrams/dialogFocus';
import './ModernTopToolbar.css';

export type { TopToolbarProps };

const MOBILE_TOUCH_TARGET_STYLE: React.CSSProperties = {
  minWidth: 'var(--commercial-touch-target, 44px)',
  minHeight: 'var(--commercial-touch-target, 44px)',
};

const MOBILE_SQUARE_TOUCH_TARGET_STYLE: React.CSSProperties = {
  ...MOBILE_TOUCH_TARGET_STYLE,
  width: 'var(--commercial-touch-target, 44px)',
  height: 'var(--commercial-touch-target, 44px)',
};

/**
 * ModernTopToolbar (Hyper-Glass V3.1 - Indestructible Layout)
 * 
 * A Figma-style unified toolbar with glassmorphism and robust space management.
 * Solves the overlap/occlusion issue by enforcing island boundaries and responsive scaling.
 */
export const ModernTopToolbar: React.FC<TopToolbarProps> = ({
  diagramId,
  diagramName,
  onRenameDiagram,
  edgeMode,
  onEdgeModeChange,
  isFullscreen,
  onToggleFullscreen,
  showThemeSelector = true,
  showExport = true,
  leftChildren,
  centerChildren,
  rightChildren,
  title,
  setIsCommandOpen,
  hideCenterIsland = false,
}) => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isDiagramSwitcherOpen, setIsDiagramSwitcherOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreContentRef = useRef<HTMLDivElement>(null);
  const diagramSwitcherTriggerRef = useRef<HTMLButtonElement>(null);
  const diagramSwitcherContentRef = useRef<HTMLDivElement>(null);
  const morePopoverInstanceId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const diagramSwitcherInstanceId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const morePopoverId = `toolbar-system-settings-${morePopoverInstanceId}`;
  const diagramSwitcherId = `toolbar-diagram-switcher-${diagramSwitcherInstanceId}`;
  
  // Responsive flags
  const isMobile = !screens.md;  // < 768px
  
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  const commandShortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  const islandBaseClass = `flex items-center ${isMobile ? 'min-h-[44px]' : 'h-[40px]'} bg-white dark:bg-[#2d2d2d] border border-[rgba(0,0,0,0.12)] dark:border-[rgba(255,255,255,0.12)] rounded-[10px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200 pointer-events-auto`;
  const moreDialogLabel = isMobile
    ? t('common.systemActions')
    : t('common.settings');
  const moreSettingsSummary = `${moreDialogLabel}：${[
    ...(isMobile && showExport ? [t('common.export')] : []),
    ...(isMobile && showThemeSelector ? [t('common.theme')] : []),
    t('header.edgeMode', '连线模式'),
    t('common.language', '语言'),
    ...(isMobile ? [t('designer.manage.title', '工作台')] : []),
  ].join('、')}`;
  const diagramSwitcherLabel = title
    ? `${t('diagramViewer.switchDiagram', '切换图表')}：${title}`
    : t('diagramViewer.switchDiagram', '切换图表');
  const commandSearchLabel = t('designer.commandPalette.open', 'Open command search');

  const closeMoreAndRestoreFocus = useCallback(() => {
    setIsMoreOpen(false);
    window.requestAnimationFrame(() => moreTriggerRef.current?.focus());
  }, []);

  const handleMoreContentKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      trapDialogTab(event, event.currentTarget);
      return;
    }
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopPropagation();
    closeMoreAndRestoreFocus();
  }, [closeMoreAndRestoreFocus]);

  const handleMoreAfterOpenChange = useCallback((open: boolean) => {
    if (!open) return;
    if (moreContentRef.current) focusDialogEntry(moreContentRef.current);
  }, []);

  const closeDiagramSwitcherAndRestoreFocus = useCallback(() => {
    setIsDiagramSwitcherOpen(false);
    window.requestAnimationFrame(() => diagramSwitcherTriggerRef.current?.focus());
  }, []);

  const handleDiagramSwitcherOpenChange = useCallback((open: boolean) => {
    setIsDiagramSwitcherOpen(open);
  }, []);

  const handleDiagramSwitcherAfterOpenChange = useCallback((open: boolean) => {
    if (!open) return;

    const focusTarget = diagramSwitcherContentRef.current?.querySelector<HTMLElement>(
      '[role="combobox"], input, button, [tabindex]:not([tabindex="-1"])',
    );
    focusTarget?.focus();
  }, []);

  const handleDiagramSwitcherKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopPropagation();
    closeDiagramSwitcherAndRestoreFocus();
  }, [closeDiagramSwitcherAndRestoreFocus]);

  /* ── Menu Content ── */
  const moreContent = useMemo(() => (
    <div
      ref={moreContentRef}
      id={morePopoverId}
      role="dialog"
      aria-label={moreDialogLabel}
      tabIndex={-1}
      className="toolbar-system-actions-dialog min-w-[220px] py-2 flex flex-col font-sans"
      onKeyDown={handleMoreContentKeyDown}
    >
      {isMobile && (
        <div className="px-4 pb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
          {moreDialogLabel}
        </div>
      )}
      {isMobile && showExport && (
        <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            {t('designer.toolbar.fileGroup', '文件操作')}
          </div>
          <ExportTools
            diagramId={diagramId}
            diagramName={diagramName ?? 'diagram'}
            onToggleFullscreen={onToggleFullscreen}
            isFullscreen={isFullscreen}
            showControls={false}
            variant="inline"
            commercialTouchTarget
          />
        </div>
      )}

      {isMobile && showThemeSelector && (
        <>
          <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-2 my-1" />
          <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              {t('common.theme')}
            </div>
            <EnhancedThemeSelector variant="default" borderless />
          </div>
        </>
      )}

      {isMobile && (showExport || showThemeSelector) && (
        <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-2 my-1" />
      )}

      <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          {t('header.edgeMode', '连线模式')}
        </div>
        <Select
          aria-label={t('header.edgeMode', '连线模式')}
          variant="filled"
          value={edgeMode}
          onChange={(value) => {
            if (isToolbarEdgeMode(value)) onEdgeModeChange(value);
          }}
          style={{ width: '100%', fontSize: isMobile ? '16px' : '13px' }}
          getPopupContainer={getToolbarPopupContainer}
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
        <LanguageSwitcher ariaLabel={t('common.language', '语言 / Language')} />
      </div>

      {isMobile && (
        <>
          <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-2 my-1" />
          <div className="px-4 py-2">
            <button
              type="button"
              className="w-full min-h-[44px] flex items-center gap-2 px-3 appearance-none border-0 bg-transparent rounded-[6px] text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
              style={{ minHeight: 'var(--commercial-touch-target, 44px)' }}
              onClick={() => {
                setIsMoreOpen(false);
                window.location.hash = '#/manage';
              }}
              aria-label={t('designer.manage.title', '工作台')}
            >
              <FaHome aria-hidden="true" />
              <span>{t('designer.manage.title', '工作台')}</span>
            </button>
          </div>
        </>
      )}
    </div>
  ), [
    diagramId,
    diagramName,
    edgeMode,
    handleMoreContentKeyDown,
    isFullscreen,
    isMobile,
    morePopoverId,
    moreDialogLabel,
    onEdgeModeChange,
    onToggleFullscreen,
    showExport,
    showThemeSelector,
    t,
  ]);

  return (
    <>
      <div
        data-designer-top-toolbar="true"
        className={`fixed top-3 left-3 right-3 z-[1000] flex justify-between pointer-events-none ${
          isMobile ? 'items-start h-auto gap-2' : 'items-center h-[40px] gap-3'
        }`}
      >
      
      {/* ── LEFT SECTION: Brand + Project + Search (unified pill) ── */}
      <div className="flex-[0_1_auto] flex items-center min-w-0">
        <div
          data-toolbar-left-island
          className={`${islandBaseClass} gap-1 ${isMobile ? 'min-w-0 max-w-full' : 'shrink-0'}`}
          style={{ paddingLeft: '14px', paddingRight: '14px' }}
        >
          {!isMobile && (
            <a
              href="#/manage"
              className="flex items-center gap-2 px-1.5 py-1 rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-all no-underline active:scale-95"
              onClick={(e) => { e.preventDefault(); window.location.hash = '#/manage'; }}
            >
              <div className="w-[22px] h-[22px] bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-md flex items-center justify-center shadow-sm">
                <span className="text-[11px] font-black text-white italic">V</span>
              </div>
              <span className="text-[14.5px] font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-500">
                Vizly
              </span>
            </a>
          )}

          {title && (
            <div className="flex items-center min-w-0">
              <RightOutlined className="text-[10px] text-slate-300 dark:text-slate-600 mx-1.5 flex-shrink-0" />
              <Popover
                content={
                  <div
                    ref={diagramSwitcherContentRef}
                    id={diagramSwitcherId}
                    role="dialog"
                    aria-label={diagramSwitcherLabel}
                    className="w-[360px] max-w-[calc(100vw-24px)] p-1"
                    onKeyDownCapture={handleDiagramSwitcherKeyDown}
                  >
                    <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-white/5 mb-2 flex items-center justify-between">
                      <span>{t('diagramViewer.switchDiagram', '切换图表')}</span>
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto">
                      {typeof leftChildren === 'function'
                        ? leftChildren(isDiagramSwitcherOpen)
                        : leftChildren}
                    </div>
                  </div>
                }
                trigger="click"
                placement="bottomLeft"
                open={isDiagramSwitcherOpen}
                onOpenChange={handleDiagramSwitcherOpenChange}
                afterOpenChange={handleDiagramSwitcherAfterOpenChange}
              >
                <Tooltip title={t('diagramViewer.switchDiagram', '切换图表')} mouseEnterDelay={0.6}>
                  <button
                    ref={diagramSwitcherTriggerRef}
                    type="button"
                    onClick={() => setIsDiagramSwitcherOpen((open) => !open)}
                    className={`flex items-center gap-1.5 px-2.5 appearance-none border-0 bg-transparent rounded-[6px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer transition-colors active:scale-[0.97] min-w-0 group ${isMobile ? 'h-[44px] min-h-[44px]' : 'h-[32px]'}`}
                    style={isMobile ? { minHeight: 'var(--commercial-touch-target, 44px)' } : undefined}
                    aria-label={diagramSwitcherLabel}
                    aria-haspopup="dialog"
                    aria-expanded={isDiagramSwitcherOpen}
                    aria-controls={isDiagramSwitcherOpen ? diagramSwitcherId : undefined}
                  >
                    <span className="font-semibold text-[14px] text-slate-700 dark:text-slate-200 truncate max-w-[80px] sm:max-w-[160px] lg:max-w-[240px]">
                      {title}
                    </span>
                    <FaChevronDown aria-hidden="true" className="text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors flex-shrink-0" />
                  </button>
                </Tooltip>
              </Popover>
              {onRenameDiagram && (
                <DiagramTitleEditor
                  title={title}
                  onRename={onRenameDiagram}
                  commercialTouchTarget={isMobile}
                />
              )}
            </div>
          )}

          {/* Search — integrated into the same pill */}
          {!isMobile && setIsCommandOpen && (
            <>
              <div className="w-[1px] h-[18px] bg-slate-200 dark:bg-white/10 mx-1.5 flex-shrink-0" />
              <button
                type="button"
                data-command-palette-focus-return
                className="flex items-center gap-2 px-2 h-[32px] appearance-none border-0 bg-transparent rounded-[6px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer transition-colors group"
                onClick={() => setIsCommandOpen(true)}
                aria-label={commandSearchLabel}
                aria-haspopup="dialog"
                aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
                title={`${commandSearchLabel} (${commandShortcutLabel})`}
              >
                <SearchOutlined aria-hidden="true" className="text-[15px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                <div className="flex items-center px-1.5 py-[3px] bg-black/[0.04] dark:bg-white/[0.06] rounded-[4px] border border-black/[0.02] dark:border-white/[0.04]">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider leading-none">{commandShortcutLabel}</span>
                </div>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── CENTER SECTION: Tools ── */}
      <div className={
        isMobile
          ? 'absolute top-[48px] left-0 right-0 flex items-center justify-center min-w-0'
          : 'flex-1 flex items-center justify-center min-w-0'
      } data-designer-top-toolbar-center="true">
        <div className={`flex items-center gap-2 max-w-full ${
          isMobile ? 'w-full justify-center overflow-x-auto px-1' : ''
        }`}>
          {/* Core Tools Pill */}
          {!hideCenterIsland && (
            <div className={`${islandBaseClass} px-2 shrink-0`}>
              {centerChildren}
              <div id="vizly-plugin-center-island-portal" className="flex items-center gap-0.5 empty:hidden" />
            </div>
          )}

          {/* Contextual Toolbar Pill (Dynamic Actions) */}
          <div 
            id="vizly-plugin-context-toolbar-portal" 
            className={`${islandBaseClass} min-w-0 max-w-full px-2 empty:hidden ${isMobile ? 'flex-1 w-full' : ''}`}
          />
        </div>
      </div>

      {/* ── RIGHT SECTION: System ── */}
      <div className="flex-[0_1_auto] flex items-center justify-end gap-2 min-w-0">
        <div id="vizly-plugin-right-island-portal" className={`${islandBaseClass} px-2 empty:hidden`} />
        
        <div className={`${islandBaseClass} px-2 shrink-0`}>
          {rightChildren}
          
          <div className="flex items-center gap-0.5">
            {!isMobile && showExport && (
              <ExportTools
                diagramId={diagramId}
                diagramName={diagramName ?? 'diagram'}
                onToggleFullscreen={onToggleFullscreen}
                isFullscreen={isFullscreen}
                showControls={!isMobile}
                variant="compact"
              />
            )}
            
            <Popover
              content={moreContent}
              trigger="click"
              placement="bottomRight"
              open={isMoreOpen}
              onOpenChange={setIsMoreOpen}
              afterOpenChange={handleMoreAfterOpenChange}
            >
              <button
                ref={moreTriggerRef}
                type="button"
                className={`${isMobile ? 'w-[44px] min-w-[44px] h-[44px] min-h-[44px]' : 'w-8 h-8'} flex items-center justify-center appearance-none border-0 bg-transparent p-0 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] cursor-pointer text-slate-500 dark:text-slate-400 transition-colors`}
                style={isMobile ? MOBILE_SQUARE_TOUCH_TARGET_STYLE : undefined}
                aria-label={moreDialogLabel}
                aria-haspopup="dialog"
                aria-expanded={isMoreOpen}
                aria-controls={morePopoverId}
                title={moreSettingsSummary}
              >
                <FaEllipsisV className="text-[13px]" />
              </button>
            </Popover>
          </div>

          <div className="w-[1px] h-4 bg-slate-200/80 dark:bg-white/10 mx-0.5 flex-shrink-0" />
          <div className="flex items-center gap-1">
            {!isMobile && showThemeSelector && (
              <EnhancedThemeSelector variant="icon" />
            )}
            <div
              className={`${isMobile ? 'w-[44px] h-[44px]' : 'w-7 h-7'} rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700 flex-shrink-0 cursor-pointer active:scale-95`}
              style={isMobile ? MOBILE_SQUARE_TOUCH_TARGET_STYLE : undefined}
            >
              <AuthStatusCompact commercialTouchTarget={isMobile} />
            </div>
          </div>
        </div>
      </div>
      </div>
      {!isMobile && (
        <div
          data-designer-bottom-toolbar="true"
          className="fixed bottom-[58px] left-1/2 z-[1000] -translate-x-1/2 pointer-events-none"
        >
          <div
            id="vizly-plugin-bottom-island-portal"
            className={`${islandBaseClass} px-2 empty:hidden`}
          />
        </div>
      )}
    </>
  );
};

export default ModernTopToolbar;

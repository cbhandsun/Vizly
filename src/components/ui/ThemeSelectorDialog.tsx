import React, { useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaCog, FaPalette, FaThLarge, FaSlidersH } from 'react-icons/fa';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

export type ThemeSelectorTab = 'themes' | 'presets' | 'custom' | 'settings';

interface ThemeSelectorDialogProps {
  activeTab: ThemeSelectorTab;
  children: React.ReactNode;
  closeLabel: string;
  customLabel: string;
  onClose: () => void;
  onTabChange: (tab: ThemeSelectorTab) => void;
  presetsLabel: string;
  settingsLabel: string;
  showCustomThemes: boolean;
  showPresets: boolean;
  themesLabel: string;
  title: string;
}

const ACTIVE_TAB_CLASS = 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-xs rounded-lg font-bold transition-all duration-200 border border-slate-200/80 dark:border-white/10';
const INACTIVE_TAB_CLASS = 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-lg font-medium transition-all duration-200 border border-transparent';

export const ThemeSelectorDialog: React.FC<ThemeSelectorDialogProps> = ({
  activeTab,
  children,
  closeLabel,
  customLabel,
  onClose,
  onTabChange,
  presetsLabel,
  settingsLabel,
  showCustomThemes,
  showPresets,
  themesLabel,
  title,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<ThemeSelectorTab, HTMLButtonElement>>>({});
  const titleId = useId();
  const tabListLabelId = useId();
  const panelId = useId();

  const tabs = useMemo(() => [
    { id: 'themes' as const, label: themesLabel, icon: FaPalette },
    ...(showPresets ? [{ id: 'presets' as const, label: presetsLabel, icon: FaThLarge }] : []),
    ...(showCustomThemes ? [{ id: 'custom' as const, label: customLabel, icon: FaSlidersH }] : []),
    { id: 'settings' as const, label: settingsLabel, icon: FaCog, iconOnly: true },
  ], [customLabel, presetsLabel, settingsLabel, showCustomThemes, showPresets, themesLabel]);

  const { containerRef: dialogRef, handleKeyDown: handleDialogKeyDown } = useModalFocusTrap<HTMLDivElement>({
    active: true,
    initialFocusRef: closeButtonRef,
    onClose,
  });

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id);
    queueMicrotask(() => tabRefs.current[nextTab.id]?.focus());
  };

  const activeTabItem = tabs.find((t) => t.id === activeTab) || tabs[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 dark:bg-black/65 backdrop-blur-md transition-opacity duration-200"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        data-theme-selector-dialog
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="relative flex flex-col w-full max-w-[1040px] xl:max-w-[1080px] max-h-[calc(100dvh-24px)] sm:max-h-[88dvh] rounded-2xl bg-white/98 dark:bg-[#121317]/98 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.28)] overflow-hidden pointer-events-auto"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* ── Dialog Header ── */}
        <div className="flex-none bg-slate-50/60 dark:bg-white/[0.02] border-b border-slate-200/70 dark:border-white/5 flex items-center justify-between shrink-0" style={{ padding: "20px 44px" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500/15 via-violet-500/10 to-indigo-500/5 dark:from-indigo-400/20 dark:to-purple-400/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-2xs shrink-0">
              <FaPalette className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <h2 id={titleId} className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                {title}
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 font-normal leading-normal">
                实时预览并切换画布主题风格与色彩系统
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            data-theme-selector-close
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors border-none outline-none cursor-pointer"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Segmented Control Tab Navigation ── */}
        <div className="flex-none border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.01]" style={{ padding: "12px 44px" }}>
          <span id={tabListLabelId} className="sr-only">{title}</span>
          <div
            role="tablist"
            aria-labelledby={tabListLabelId}
            className="inline-flex items-center gap-1 p-1 rounded-xl max-w-full overflow-x-auto shadow-2xs bg-slate-100/90 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-white/10"
          >
            {tabs.map((tab, index) => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  ref={(element) => { tabRefs.current[tab.id] = element ?? undefined; }}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={panelId}
                  aria-label={tab.iconOnly ? tab.label : undefined}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  className={`flex-none min-h-[44px] px-3.5 text-[13px] whitespace-nowrap cursor-pointer rounded-lg inline-flex items-center gap-2 ${activeTab === tab.id ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS}`}
                  style={{ outline: 'none' }}
                  onClick={() => onTabChange(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {IconComponent && <IconComponent aria-hidden="true" className="w-3.5 h-3.5 shrink-0 opacity-80" />}
                  {!tab.iconOnly && <span>{tab.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab Content Area ── */}
        <div
          id={panelId}
          role="tabpanel"
          aria-label={activeTabItem.label}
          tabIndex={0}
          className="flex-1 overflow-y-auto focus-visible:outline-none" style={{ padding: "28px 44px 44px 44px" }}
        >
          {children}
        </div>
        {/* ── Commercial Status & Keyboard Hint Footer ── */}
        <div
          className="flex-none bg-slate-50/80 dark:bg-white/[0.02] border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 select-none"
          style={{ padding: '12px 44px' }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-slate-600 dark:text-slate-300">实时主题引擎已就绪</span>
            <span className="text-slate-300 dark:text-zinc-700">·</span>
            <span>单击任意卡片即时生效</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 text-[10px] font-mono text-slate-500 dark:text-slate-400 shadow-2xs">↑↓←→</kbd>
              <span>方向键导航</span>
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-zinc-700">·</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 text-[10px] font-mono text-slate-500 dark:text-slate-400 shadow-2xs">/</kbd>
              <span>聚焦搜索</span>
            </span>
            <span className="text-slate-300 dark:text-zinc-700">·</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 text-[10px] font-mono text-slate-500 dark:text-slate-400 shadow-2xs">Esc</kbd>
              <span>关闭面板</span>
            </span>
          </div>
        </div>
      </div>
    </div>,

    document.body
  );
};


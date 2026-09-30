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

const ACTIVE_TAB_CLASS = 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] rounded-lg font-semibold transition-all duration-200 ring-1 ring-black/[0.04] dark:ring-white/[0.06]';
const INACTIVE_TAB_CLASS = 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-lg font-medium transition-all duration-200';

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
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 dark:bg-black/60 backdrop-blur-md transition-opacity duration-200"
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
        className="relative flex flex-col w-full max-w-4xl max-h-[calc(100dvh-32px)] sm:max-h-[88dvh] rounded-2xl bg-white/98 dark:bg-[#111216]/98 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25)] overflow-hidden pointer-events-auto"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* ── Dialog Header ── */}
        <div className="flex-none px-6 py-4.5 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-200/70 dark:border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500/15 via-violet-500/10 to-indigo-500/5 dark:from-indigo-400/20 dark:to-purple-400/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
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
        <div className="flex-none px-6 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.01]">
          <span id={tabListLabelId} className="sr-only">{title}</span>
          <div
            role="tablist"
            aria-labelledby={tabListLabelId}
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl border border-slate-200/50 dark:border-white/[0.04] max-w-full overflow-x-auto"
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
                  style={{
                    border: 'none',
                    outline: 'none',
                  }}
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
          className="flex-1 overflow-y-auto px-6 py-5 focus-visible:outline-none"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

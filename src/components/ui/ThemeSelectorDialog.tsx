import React, { useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaCog, FaPalette } from 'react-icons/fa';
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

const ACTIVE_TAB_CLASS = 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] rounded-[6px] font-semibold transform transition-all duration-300 ring-1 ring-black/[0.04] dark:ring-white/[0.05]';
const INACTIVE_TAB_CLASS = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-[6px] font-medium transition-all duration-300 opacity-80 hover:opacity-100';

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
    { id: 'themes' as const, label: themesLabel },
    ...(showPresets ? [{ id: 'presets' as const, label: presetsLabel }] : []),
    ...(showCustomThemes ? [{ id: 'custom' as const, label: customLabel }] : []),
    { id: 'settings' as const, label: settingsLabel, iconOnly: true },
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

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="relative flex flex-col w-full max-w-3xl max-h-[calc(100dvh-32px)] sm:max-h-[85dvh] rounded-[var(--glass-radius)] bg-slate-50/90 dark:bg-[#111113]/95 backdrop-blur-2xl backdrop-saturate-[180%] border border-white/40 dark:border-white/10 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.15)] overflow-hidden pointer-events-auto"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex-none px-4 sm:px-8 py-3 sm:py-5 bg-white/40 dark:bg-black/20 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-[16px] font-semibold text-gray-800 dark:text-gray-100 tracking-tight">
            <FaPalette className="text-indigo-500" aria-hidden="true" />
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[6px] bg-transparent hover:bg-black/5 dark:bg-transparent dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors border-none outline-none cursor-pointer"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-none px-4 sm:px-8 py-3 sm:py-5 overflow-x-auto custom-scrollbar">
          <span id={tabListLabelId} className="sr-only">{title}</span>
          <div role="tablist" aria-labelledby={tabListLabelId} className="flex items-center gap-1 p-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-[8px] w-max min-w-full sm:min-w-0 border border-black/[0.02] dark:border-white/[0.02]">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                ref={(element) => { tabRefs.current[tab.id] = element ?? undefined; }}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={panelId}
                aria-label={tab.iconOnly ? tab.label : undefined}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={`flex-none min-h-[44px] px-4 text-[14px] whitespace-nowrap cursor-pointer ${tab.iconOnly ? 'flex items-center justify-center min-w-[44px]' : ''} ${activeTab === tab.id ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS}`}
                onClick={() => onTabChange(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tab.iconOnly ? <FaCog aria-hidden="true" /> : tab.label}
              </button>
            ))}
          </div>
        </div>

        <div id={panelId} role="tabpanel" aria-label={tabs.find(tab => tab.id === activeTab)?.label} className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 sm:pb-8 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  );
};

import { lazy, Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaPalette } from 'react-icons/fa';

import type { EnhancedThemeSelectorProps } from './EnhancedThemeSelector';

let enhancedThemeSelectorModule: Promise<typeof import('./EnhancedThemeSelector')> | undefined;
const loadEnhancedThemeSelector = () => {
  enhancedThemeSelectorModule ??= import('./EnhancedThemeSelector');
  return enhancedThemeSelectorModule;
};
const LazyEnhancedThemeSelector = lazy(async () => {
  const module = await loadEnhancedThemeSelector();
  return { default: module.EnhancedThemeSelector };
});

export const DeferredEnhancedThemeSelector = (props: EnhancedThemeSelectorProps) => {
  const { t } = useTranslation();
  const [activated, setActivated] = useState(false);
  const triggerLabel = props.ariaLabel || t('theme.selector.title');
  const preload = useCallback(() => {
    void loadEnhancedThemeSelector();
  }, []);

  if (activated) {
    return (
      <Suspense fallback={null}>
        <LazyEnhancedThemeSelector {...props} initialOpen />
      </Suspense>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={false}
      aria-haspopup="dialog"
      aria-label={triggerLabel}
      className={props.variant === 'icon'
        ? (props.className || 'inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[6px] border-none text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2')
        : `flex items-center justify-center gap-1.5 ${props.borderless ? 'min-h-[44px]' : 'h-8'} px-2.5 text-[13px] transition-colors rounded-[6px] ${props.borderless ? 'bg-transparent border-none' : 'bg-white dark:bg-[#1C1C1E] border border-[#d9d9d9] dark:border-white/15 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm'} text-gray-700 dark:text-gray-200 pointer-events-auto w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${props.className ?? ''}`}
      data-theme-selector-trigger
      onClick={() => setActivated(true)}
      onFocus={preload}
      onPointerEnter={preload}
      style={props.style}
      title={triggerLabel}
    >
      <FaPalette aria-hidden="true" className="text-[13px]" />
      {props.variant !== 'icon' && <span className="truncate font-medium">{triggerLabel}</span>}
    </button>
  );
};

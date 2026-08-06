import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Dropdown } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import {
    logLanguageSwitcherConfigManagerInitFailure,
    logLanguageSwitcherConfigSyncFailure,
} from '@/components/configurationLogging';
import { LayeredConfigManager, ConfigLayer } from '@/core/config/LayeredConfigManager';
import type { LayeredConfigChangeEvent } from '@/core/config/LayeredConfigTypes';
import { useKeyboardAccessibleDropdown } from '@/core/components/diagrams/hooks/useKeyboardAccessibleDropdown';
import { parseSupportedLanguage } from '@/core/utils/languagePreference';

interface LanguageSwitcherProps {
    variant?: 'select' | 'icon';
    className?: string;
    ariaLabel?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ variant = 'select', className, ariaLabel }) => {
    const { i18n, t } = useTranslation();
    const currentLanguage = i18n.resolvedLanguage || i18n.language;
    const selectedLanguage = parseSupportedLanguage(currentLanguage) ?? 'en';
    const languageLabel = ariaLabel ?? t('common.language');
    const menuInstanceId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const menuId = `language-switcher-menu-${menuInstanceId}`;
    const overlayClassName = `language-switcher-overlay-${menuInstanceId}`;
    const {
        open,
        triggerRef,
        handleMenuKeyDown,
        handleOpenChange,
        handleTriggerKeyDown,
    } = useKeyboardAccessibleDropdown({
        overlayClassName,
        preferredItemSelector: '[role="menuitemradio"][aria-checked="true"]',
    });

    // Listen to LayeredConfigManager for cloud sync updates
    useEffect(() => {
        try {
            const configManager = LayeredConfigManager.getInstance();
            
            // Check initial synced value
            const savedLanguage = parseSupportedLanguage(configManager.get('i18n.language'));
            if (savedLanguage && savedLanguage !== i18n.language) {
                void i18n.changeLanguage(savedLanguage);
            }

            const handleConfigChange = (e: LayeredConfigChangeEvent<unknown>) => {
                const nextLanguage = parseSupportedLanguage(e.effectiveValue);
                if (e.key === 'i18n.language' && nextLanguage && nextLanguage !== i18n.language) {
                    void i18n.changeLanguage(nextLanguage);
                }
            };

            configManager.addListener('i18n.language', handleConfigChange);
            return () => {
                configManager.removeListener('i18n.language', handleConfigChange);
            };
        } catch (e) {
            logLanguageSwitcherConfigManagerInitFailure(e);
        }
    }, [i18n]);

    const handleChange = (value: unknown) => {
        const language = parseSupportedLanguage(value);
        if (!language) return;

        void i18n.changeLanguage(language);
        try {
            LayeredConfigManager.getInstance().set('i18n.language', language, ConfigLayer.USER);
        } catch (e) {
            logLanguageSwitcherConfigSyncFailure(e);
        }
    };

    const options = [
        { key: 'en', languageLabel: 'English', flag: '🇬🇧' },
        { key: 'zh', languageLabel: '中文', flag: '🇨🇳' },
    ];

    if (variant === 'icon') {
        const currentOption = options.find(option => option.key === selectedLanguage) ?? options[0];
        const triggerLabel = `${languageLabel}: ${currentOption.languageLabel}`;

        return (
            <Dropdown
                menu={{
                    id: menuId,
                    'aria-label': languageLabel,
                    items: options.map(option => ({
                        key: option.key,
                        role: 'menuitemradio',
                        'aria-checked': option.key === selectedLanguage,
                        label: (
                            <div className="flex items-center gap-2">
                                <span aria-hidden="true">{option.flag}</span>
                                {option.languageLabel}
                            </div>
                        ),
                    })),
                    onClick: ({ key }) => handleChange(key),
                    onKeyDown: handleMenuKeyDown,
                    selectedKeys: [selectedLanguage],
                }}
                trigger={['click']}
                open={open}
                onOpenChange={handleOpenChange}
                overlayClassName={overlayClassName}
                getPopupContainer={(triggerNode) => (document.fullscreenElement as HTMLElement) || triggerNode.parentNode || document.body}
            >
                <button
                    ref={triggerRef}
                    type="button"
                    className={className || "inline-flex items-center justify-center w-8 h-8 rounded-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-500 hover:border-indigo-500/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition-all cursor-pointer shadow-sm"}
                    aria-label={triggerLabel}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={menuId}
                    title={triggerLabel}
                    onKeyDown={handleTriggerKeyDown}
                >
                    <GlobalOutlined />
                </button>
            </Dropdown>
        );
    }

    return (
        <Select
            aria-label={languageLabel}
            variant="filled"
            value={selectedLanguage}
            onChange={handleChange}
            style={{ width: '100%', fontSize: '13px' }}
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { borderRadius: '8px', padding: '4px' } } }}
            getPopupContainer={(triggerNode) => (document.fullscreenElement as HTMLElement) || triggerNode.parentNode || document.body}
            options={options.map(option => ({
                value: option.key,
                label: (
                    <div className="flex items-center gap-2">
                        <span aria-hidden="true">{option.flag}</span>
                        {option.languageLabel}
                    </div>
                ),
            }))}
        />
    );
};

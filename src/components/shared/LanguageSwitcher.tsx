import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Dropdown } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import {
    logLanguageSwitcherConfigManagerInitFailure,
    logLanguageSwitcherConfigSyncFailure,
} from '@/components/configurationLogging';
import { LayeredConfigManager, ConfigLayer } from '@/core/config/LayeredConfigManager';

export const LanguageSwitcher: React.FC<{ variant?: 'select' | 'icon', className?: string }> = ({ variant = 'select', className }) => {
    const { i18n } = useTranslation();
    const currentLanguage = i18n.resolvedLanguage || i18n.language;

    // Listen to LayeredConfigManager for cloud sync updates
    useEffect(() => {
        try {
            const configManager = LayeredConfigManager.getInstance();
            
            // Check initial synced value
            const savedLng = configManager.get('i18n.language');
            if (savedLng && typeof savedLng === 'string' && savedLng !== i18n.language) {
                i18n.changeLanguage(savedLng);
            }

            const handleConfigChange = (e: any) => {
                if (e.key === 'i18n.language' && e.effectiveValue && e.effectiveValue !== i18n.language) {
                    i18n.changeLanguage(e.effectiveValue);
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

    const handleChange = (value: string) => {
        i18n.changeLanguage(value);
        try {
            LayeredConfigManager.getInstance().set('i18n.language', value, ConfigLayer.USER);
        } catch (e) {
            logLanguageSwitcherConfigSyncFailure(e);
        }
    };

    const options = [
        { key: 'en', label: <div className="flex items-center gap-2"><span>🇬🇧</span> English</div> },
        { key: 'zh', label: <div className="flex items-center gap-2"><span>🇨🇳</span> 中文</div> }
    ];

    if (variant === 'icon') {
        return (
            <Dropdown
                menu={{
                    items: options,
                    onClick: ({ key }) => handleChange(key),
                    selectedKeys: [currentLanguage?.startsWith('zh') ? 'zh' : 'en']
                }}
                trigger={['click']}
                getPopupContainer={(triggerNode) => (document.fullscreenElement as HTMLElement) || triggerNode.parentNode || document.body}
            >
                <button className={className || "inline-flex items-center justify-center w-8 h-8 rounded-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-500 hover:border-indigo-500/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition-all cursor-pointer shadow-sm"}>
                    <GlobalOutlined />
                </button>
            </Dropdown>
        );
    }

    return (
        <Select
            variant="filled"
            value={currentLanguage?.startsWith('zh') ? 'zh' : 'en'}
            onChange={handleChange}
            style={{ width: '100%', fontSize: '13px' }}
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { borderRadius: '8px', padding: '4px' } } }}
            getPopupContainer={(triggerNode) => (document.fullscreenElement as HTMLElement) || triggerNode.parentNode || document.body}
            options={options.map(opt => ({ value: opt.key, label: opt.label }))}
        />
    );
};

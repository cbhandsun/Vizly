import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, theme } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';

export const LanguageSwitcher: React.FC = () => {
    const { i18n } = useTranslation();
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
    const { token } = theme.useToken();

    // Sync state when language changes (e.g. from detection)
    useEffect(() => {
        setCurrentLanguage(i18n.language);
        const handleLanguageChanged = (lng: string) => {
            setCurrentLanguage(lng);
        };
        i18n.on('languageChanged', handleLanguageChanged);
        return () => {
            i18n.off('languageChanged', handleLanguageChanged);
        };
    }, [i18n]);

    const handleChange = (value: string) => {
        i18n.changeLanguage(value);
    };

    return (
        <Select
            variant="filled"
            value={currentLanguage.startsWith('zh') ? 'zh' : 'en'}
            onChange={handleChange}
            style={{ width: '100%', fontSize: '13px' }}
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { borderRadius: '8px', padding: '4px' } } }}
            options={[
                { value: 'en', label: <div className="flex items-center gap-2"><span>🇬🇧</span> English</div> },
                { value: 'zh', label: <div className="flex items-center gap-2"><span>🇨🇳</span> 中文</div> }
            ]}
        />
    );
};

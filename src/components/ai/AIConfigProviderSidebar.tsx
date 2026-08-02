import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from 'antd/es/button';
import Input from 'antd/es/input';
import Switch from 'antd/es/switch';
import Typography from 'antd/es/typography';
import { AppstoreOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';

import type { AIProviderConfig } from './aiConfigStorage';
import { getAIProviderConnectionReadiness } from './aiProviderConnectionReadiness';

const { Text } = Typography;

interface AIConfigProviderSidebarProps {
    providers: AIProviderConfig[];
    selectedProviderId: string;
    searchText: string;
    onSearchTextChange: (value: string) => void;
    onSelectProvider: (providerId: string) => void;
    onToggleProvider: (providerId: string, checked: boolean) => void;
    onAddCustomProvider: () => void;
}

const readinessLabelKey = (provider: AIProviderConfig): string | null => {
    if (!provider.enabled) return null;
    const readiness = getAIProviderConnectionReadiness(provider);
    return readiness.ready ? null : `aiConfig.connection.${readiness.issue}`;
};

export const AIConfigProviderSidebar: React.FC<AIConfigProviderSidebarProps> = ({
    providers,
    selectedProviderId,
    searchText,
    onSearchTextChange,
    onSelectProvider,
    onToggleProvider,
    onAddCustomProvider,
}) => {
    const { t } = useTranslation();

    return (
        <aside className="ai-config-provider-sidebar" aria-label={t('aiConfig.providerList')}>
            <div className="ai-config-provider-tools">
                <Input.Search
                    aria-label={t('aiConfig.searchLabel')}
                    placeholder={t('aiConfig.searchPlaceholder')}
                    allowClear
                    value={searchText}
                    onChange={event => onSearchTextChange(event.target.value)}
                />
                <button
                    type="button"
                    className={`ai-config-provider-select ai-config-global-select ${selectedProviderId === 'global_settings' ? 'is-selected' : ''}`}
                    aria-pressed={selectedProviderId === 'global_settings'}
                    onClick={() => onSelectProvider('global_settings')}
                >
                    <SettingOutlined aria-hidden="true" />
                    <span>{t('aiConfig.globalSettings')}</span>
                </button>
            </div>

            <div className="ai-config-provider-list">
                <Text type="secondary" className="ai-config-provider-list-label">
                    {t('aiConfig.providerList')}
                </Text>
                <div className="ai-config-provider-items">
                    {providers.map(provider => {
                        const issueKey = readinessLabelKey(provider);
                        return (
                            <div
                                key={provider.id}
                                className={`ai-config-provider-row ${selectedProviderId === provider.id ? 'is-selected' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="ai-config-provider-select"
                                    aria-pressed={selectedProviderId === provider.id}
                                    onClick={() => onSelectProvider(provider.id)}
                                >
                                    <AppstoreOutlined
                                        aria-hidden="true"
                                        className={provider.enabled ? 'is-enabled' : ''}
                                    />
                                    <span className="ai-config-provider-name">{provider.name}</span>
                                    {issueKey && (
                                        <span
                                            className="ai-config-provider-status"
                                            aria-label={t(issueKey)}
                                            title={t(issueKey)}
                                        >
                                            {t('aiConfig.connection.needsSetup')}
                                        </span>
                                    )}
                                </button>
                                <Switch
                                    className="ai-config-provider-switch"
                                    checked={provider.enabled}
                                    aria-label={t('aiConfig.providerToggleLabel', { name: provider.name })}
                                    onChange={checked => onToggleProvider(provider.id, checked)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="ai-config-provider-footer">
                <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={onAddCustomProvider}
                >
                    {t('aiConfig.addCustomProvider')}
                </Button>
            </div>
        </aside>
    );
};

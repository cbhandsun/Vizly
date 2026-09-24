import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Button from 'antd/es/button';
import Typography from 'antd/es/typography';
import { DeleteOutlined } from '@ant-design/icons';

import type { AIModel, AIProviderConfig } from './aiConfigStorage';

interface ProviderHeaderProps {
    selectedProviderId: string;
    provider: AIProviderConfig | undefined;
    onRequestDeletion: (provider: AIProviderConfig, event: MouseEvent<HTMLElement>) => void;
}

export const AIConfigProviderHeader = ({
    selectedProviderId,
    provider,
    onRequestDeletion,
}: ProviderHeaderProps) => {
    const { t } = useTranslation();
    return (
        <div className="ai-config-content-header">
            <Typography.Title level={4}>{selectedProviderId === 'global_settings'
                ? t('aiConfig.globalSettings')
                : provider?.name}</Typography.Title>
            {provider?.id.startsWith('custom_') && (
                <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={event => onRequestDeletion(provider, event)}
                >
                    {t('aiConfig.deleteProvider')}
                </Button>
            )}
        </div>
    );
};

interface ModelDeleteButtonProps {
    provider: AIProviderConfig;
    model: AIModel;
    isActive: boolean;
    onRequestDeletion: (
        providerId: string,
        model: AIModel,
        isActive: boolean,
        event: MouseEvent<HTMLElement>,
    ) => void;
}

export const AIConfigModelDeleteButton = ({
    provider,
    model,
    isActive,
    onRequestDeletion,
}: ModelDeleteButtonProps) => {
    const { t } = useTranslation();
    if (!model.isCustom && !provider.id.startsWith('custom_')) return null;

    return (
        <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={t('aiConfig.deleteModelLabel', { name: model.name || model.id })}
            onClick={event => onRequestDeletion(provider.id, model, isActive, event)}
        />
    );
};

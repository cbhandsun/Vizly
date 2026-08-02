import React from 'react';
import { Button, Input, Select, Space, Tag } from 'antd';
import { CloudOutlined, DatabaseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import type { StorageProviderType } from '@/services/UnifiedStorageService';
import type { CloudStorageManagerTab } from './cloudStorageManagerScope';

interface CloudStorageManagerTitleProps {
    activeTab: CloudStorageManagerTab;
    currentProvider: StorageProviderType;
    loading: boolean;
    operationBusy: boolean;
    onProviderChange: (provider: StorageProviderType) => void;
    onRefresh: () => void;
}

export const CloudStorageManagerTitle: React.FC<CloudStorageManagerTitleProps> = ({
    activeTab,
    currentProvider,
    loading,
    operationBusy,
    onProviderChange,
    onRefresh,
}) => {
    const { t } = useTranslation();

    return (
        <div className="cloud-storage-manager-title">
            <span>{t('storage.manager.title')}</span>
            {activeTab === 'mine' ? (
                <Space className="cloud-storage-manager-title-actions">
                    <Select<StorageProviderType>
                        className="cloud-storage-manager-provider"
                        value={currentProvider}
                        onChange={onProviderChange}
                        disabled={operationBusy}
                        aria-label={t('storage.manager.providerLabel')}
                        options={[
                            { value: 'supabase', label: <span><DatabaseOutlined /> Supabase</span> },
                            { value: 's3', label: <span><CloudOutlined /> S3</span> },
                        ]}
                    />
                    <Button
                        className="cloud-storage-manager-refresh"
                        icon={<ReloadOutlined />}
                        onClick={onRefresh}
                        loading={loading}
                        disabled={operationBusy}
                        aria-label={t('storage.manager.refresh')}
                    />
                </Space>
            ) : (
                <Tag color="green">Supabase</Tag>
            )}
        </div>
    );
};

interface CloudStorageManagerSearchProps {
    value: string;
    onChange: (value: string) => void;
}

export const CloudStorageManagerSearch: React.FC<CloudStorageManagerSearchProps> = ({ value, onChange }) => {
    const { t } = useTranslation();

    return (
        <div className="cloud-storage-manager-search">
            <Input.Search
                value={value}
                placeholder={t('storage.manager.searchPlaceholder')}
                aria-label={t('storage.manager.searchLabel')}
                allowClear
                onSearch={onChange}
                onChange={event => onChange(event.target.value)}
            />
        </div>
    );
};

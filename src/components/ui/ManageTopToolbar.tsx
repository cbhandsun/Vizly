import React from 'react';
import { Button, Divider, Flex, Input, Select, Space, Typography, theme } from 'antd';
import { CloudOutlined, DatabaseOutlined, HomeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { EnhancedThemeSelector } from './EnhancedThemeSelector';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import { AuthStatusCompact } from '../auth/AuthStatus';

export type ManageStorageProvider = 'supabase' | 's3';

export const ManageTopToolbar: React.FC<{
  provider: ManageStorageProvider;
  onProviderChange: (provider: ManageStorageProvider) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onBack: () => void;
  onOpenStorageConfig: () => void;
}> = ({ provider, onProviderChange, searchTerm, onSearchTermChange, onBack, onOpenStorageConfig }) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();

  return (
    <Flex
      align="center"
      justify="space-between"
      style={{
        padding: '8px 16px',
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorder}`,
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: token.boxShadowTertiary,
        zIndex: 100,
        position: 'relative'
      }}
    >
      <Flex align="center" gap={12} style={{ minWidth: 0 }}>
        <Button
          type="text"
          icon={<HomeOutlined />}
          aria-label={t('designer.manage.back')}
          onClick={onBack}
        />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 15, lineHeight: '1.2', color: token.colorTextHeading }}>
            {t('designer.manage.title')}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 10, opacity: 0.6 }}>
            {t('designer.title')}
          </Typography.Text>
        </div>
      </Flex>

      <Flex align="center" gap={12} style={{ minWidth: 0 }}>
        <Select
          value={provider}
          onChange={(v) => onProviderChange(v as ManageStorageProvider)}
          style={{ width: 140 }}
          size="small"
          options={[
            { value: 'supabase', label: <span><DatabaseOutlined /> Supabase</span> },
            { value: 's3', label: <span><CloudOutlined /> S3</span> }
          ]}
        />

        <Input
          value={searchTerm}
          allowClear
          placeholder={t('designer.manage.searchPlaceholder')}
          onChange={(e) => onSearchTermChange(e.target.value)}
          style={{ width: 260, borderRadius: 12 }}
        />

        <Space size={10} split={<Divider orientation="vertical" style={{ height: 12, borderColor: token.colorBorderSecondary }} />}>
          <Space size={10}>
            <EnhancedThemeSelector />
            <LanguageSwitcher />
          </Space>
          <Space size={8}>
            <Button type="text" icon={<CloudOutlined />} onClick={onOpenStorageConfig}>
              {t('designer.manage.storageConfig')}
            </Button>
            <AuthStatusCompact />
          </Space>
        </Space>
      </Flex>
    </Flex>
  );
};

export default ManageTopToolbar;

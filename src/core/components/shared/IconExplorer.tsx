import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Input, Button, Space, Card, Empty, Pagination, Spin, Tag, Typography } from 'antd';
import { Icon } from '@iconify/react';
import { FaSearch } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface IconExplorerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
  initialValue?: string;
}

const CATEGORIES = [
  { key: 'mdi', label: 'Material Design' },
  { key: 'aws', label: 'AWS' },
  { key: 'azure', label: 'Azure' },
  { key: 'logos', label: 'Logos' },
  { key: 'lucide', label: 'Lucide' },
  { key: 'carbon', label: 'IBM Carbon' },
  { key: 'ant-design', label: 'Ant Design' },
];

export const IconExplorer: React.FC<IconExplorerProps> = ({
  visible,
  onClose,
  onSelect,
  initialValue
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [icons, setIcons] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 40;

  const searchIcons = async (query: string, category: string | null, pageNum: number) => {
    setLoading(true);
    try {
      // Iconify Search API
      const collectionParam = category ? `&collection=${category}` : '';
      const start = (pageNum - 1) * pageSize;
      const response = await fetch(
        `https://api.iconify.design/search?query=${query || 'cloud'}${collectionParam}&limit=${pageSize}&start=${start}`
      );
      const data = await response.json();
      setIcons(data.icons || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to search icons:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      searchIcons(searchTerm, selectedCategory, page);
    }
  }, [visible, searchTerm, selectedCategory, page]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleCategoryChange = (category: string | null) => {
    setSelectedCategory(category === selectedCategory ? null : category);
    setPage(1);
  };

  return (
    <Modal
      title={t('iconExplorer.title', '图标浏览器')}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      styles={{ body: { height: '600px', display: 'flex', flexDirection: 'column', gap: '16px' } }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input
          placeholder={t('iconExplorer.searchPlaceholder', '搜索图标 (例如: server, database, cloud...)')}
          prefix={<FaSearch style={{ color: '#bfbfbf' }} />}
          allowClear
          onPressEnter={(e) => handleSearch(e.currentTarget.value)}
          onChange={(e) => !e.target.value && handleSearch('')}
          size="large"
        />

        <Space wrap>
          <Tag 
            color={selectedCategory === null ? 'blue' : 'default'} 
            onClick={() => handleCategoryChange(null)}
            style={{ cursor: 'pointer' }}
          >
            All
          </Tag>
          {CATEGORIES.map(cat => (
            <Tag 
              key={cat.key}
              color={selectedCategory === cat.key ? 'blue' : 'default'}
              onClick={() => handleCategoryChange(cat.key)}
              style={{ cursor: 'pointer' }}
            >
              {cat.label}
            </Tag>
          ))}
        </Space>
      </Space>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : icons.length > 0 ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', 
            gap: '12px' 
          }}>
            {icons.map(iconName => (
              <Card
                key={iconName}
                hoverable
                size="small"
                styles={{ body: { 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: '12px 4px',
                  height: '100%'
                } }}
                className={initialValue === iconName ? 'selected-icon-card' : ''}
                onClick={() => {
                  onSelect(iconName);
                  onClose();
                }}
                style={initialValue === iconName ? { border: '1px solid #1890ff', backgroundColor: '#e6f7ff' } : {}}
              >
                <Icon icon={iconName} width="32" height="32" />
                <Text ellipsis style={{ fontSize: '10px', marginTop: '8px', width: '100%', textAlign: 'center' }}>
                  {iconName.split(':').pop()}
                </Text>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description={t('iconExplorer.noData', '没有找到图标')} />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
        <Pagination
          current={page}
          total={total}
          pageSize={pageSize}
          onChange={(p) => setPage(p)}
          showSizeChanger={false}
          size="small"
        />
      </div>
    </Modal>
  );
};

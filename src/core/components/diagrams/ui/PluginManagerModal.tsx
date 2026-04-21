import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Tabs, Switch, Tag, Button, Typography, Space, Tooltip, Empty, Badge, Skeleton } from 'antd';
import { 
  ApiOutlined, 
  SearchOutlined, 
  ThunderboltOutlined,
  UserOutlined,
  BlockOutlined,
  GlobalOutlined,
  CloudDownloadOutlined,
  CheckCircleFilled,
  StarFilled
} from '@ant-design/icons';
import { PluginRegistry } from '../../../services/PluginRegistry';
import { DiagramTypePlugin } from '../../../types';
import './PluginMarketplace.css';

const { Text, Title, Paragraph } = Typography;
const { TabPane } = Tabs;

interface PluginManagerModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 🌟 [GAP-12] Vizly 插件市场与交付中心
 * 提供 Premium 级的插件发现与管理体验
 */
export const PluginManagerModal: React.FC<PluginManagerModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [plugins, setPlugins] = useState<DiagramTypePlugin[]>([]);
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const registry = PluginRegistry.getInstance();

  const refresh = () => {
    setLoading(true);
    setTimeout(() => {
        const all = registry.getAllPlugins();
        setPlugins(all);
        const m: Record<string, boolean> = {};
        all.forEach(p => {
          m[p.id] = registry.isPluginActive(p.id);
        });
        setActiveMap(m);
        setLoading(false);
    }, 400);
  };

  useEffect(() => {
    let cancelled = false;
    if (visible) {
      setLoading(true);
      const timer = setTimeout(() => {
        if (cancelled) return; // [Fix] prevent setState after unmount / close
        const all = registry.getAllPlugins();
        setPlugins(all);
        const m: Record<string, boolean> = {};
        all.forEach(p => { m[p.id] = registry.isPluginActive(p.id); });
        setActiveMap(m);
        setLoading(false);
      }, 400);
      return () => { cancelled = true; clearTimeout(timer); };
    }
  }, [visible]);

  const togglePlugin = (id: string, active: boolean) => {
    registry.setPluginActive(id, active);
    setActiveMap(prev => ({ ...prev, [id]: active }));
  };

  const filteredPlugins = useMemo(() => {
    return plugins.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchTab = activeTab === 'all' || 
                       (activeTab === 'installed' && activeMap[p.id]) ||
                       (activeTab === 'core' && p.category === 'Core') ||
                       (activeTab === 'productivity' && (p.category === 'Productivity' || p.category === 'Integration'));
      
      return matchSearch && matchTab;
    });
  }, [plugins, searchQuery, activeTab, activeMap]);

  const renderPluginCard = (plugin: DiagramTypePlugin) => {
    const isActive = activeMap[plugin.id];
    const brandColor = plugin.brandColor || '#1890ff';

    return (
      <div 
        key={plugin.id} 
        className="plugin-card" 
        style={{ '--brand-color': brandColor } as React.CSSProperties}
      >
        <div className="plugin-card-header">
          <div className="plugin-card-icon" style={{ color: brandColor }}>
            {plugin.icon || <BlockOutlined />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text className="plugin-card-title" ellipsis>{plugin.name}</Text>
              {plugin.category === 'Core' && <Badge status="processing" />}
            </div>
            <Space size={4} wrap>
              <Tag className="plugin-tag" color="default">{plugin.version}</Tag>
              {plugin.category === 'Core' && <Tag className="plugin-tag" color="gold">OFFICIAL</Tag>}
            </Space>
          </div>
        </div>

        <div className="plugin-card-body">
          <Paragraph className="plugin-card-desc">
            {plugin.description || t('pluginMarketplace.defaultDesc')}
          </Paragraph>
          
          <Space size={16} style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8c8c8c' }}>
              <UserOutlined /> {plugin.author || 'Vizly Community'}
            </div>
            {plugin.tags && plugin.tags.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8c8c8c' }}>
                <StarFilled style={{ color: '#fadb14' }} /> {plugin.tags[0]}
              </div>
            )}
          </Space>
        </div>

        <div className="plugin-card-footer">
          <Space>
            {isActive ? (
              <Text type="success" style={{ fontSize: 12 }}><CheckCircleFilled /> {t('pluginMarketplace.statusActive')}</Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>{t('pluginMarketplace.statusInactive')}</Text>
            )}
          </Space>
          <Switch 
            size="small"
            checked={isActive} 
            onChange={(checked) => togglePlugin(plugin.id, checked)}
          />
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={860}
      centered
      styles={{ body: { padding: 0 }, mask: { backdropFilter: 'blur(4px)' } }}
    >
      <div className="marketplace-container">
        {/* Banner Section */}
        <div style={{ height: 160, position: 'relative', overflow: 'hidden', padding: 24, display: 'flex', alignItems: 'center' }}>
            <img 
                src="/assets/marketplace_banner.png" 
                alt="Marketplace Banner"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -1 }}
            />
            <div style={{ 
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                background: 'linear-gradient(90deg, rgba(0,0,0,0.6) 0%, transparent 60%)',
                zIndex: 0 
            }} />
            
            <div style={{ position: 'relative', zIndex: 1, color: '#fff' }}>
                <Title level={2} style={{ color: '#fff', margin: 0, letterSpacing: -0.5 }}>{t('pluginMarketplace.title')}</Title>
                <Paragraph style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>
                    {t('pluginMarketplace.subtitle')}
                </Paragraph>
            </div>

            <Button 
                type="primary" 
                icon={<GlobalOutlined />} 
                style={{ position: 'absolute', bottom: 24, right: 24, borderRadius: 20 }}
            >
                {t('pluginMarketplace.discoverMore')}
            </Button>
        </div>

        <div style={{ padding: '0 24px 32px' }}>
            {/* Search and Tabs */}
            <div className="marketplace-search-wrapper">
                <Space size={20} style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Tabs 
                        className="marketplace-tabs" 
                        activeKey={activeTab} 
                        onChange={setActiveTab}
                        tabBarStyle={{ marginBottom: 0 }}
                    >
                        <TabPane tab={t('pluginMarketplace.tabAll')} key="all" />
                        <TabPane tab={t('pluginMarketplace.tabCore')} key="core" />
                        <TabPane tab={t('pluginMarketplace.tabProductivity')} key="productivity" />
                        <TabPane tab={t('pluginMarketplace.tabInstalled')} key="installed" />
                    </Tabs>
                    <Input
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder={t('pluginMarketplace.searchPlaceholder')}
                        style={{ width: 240, borderRadius: 20 }}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        allowClear
                    />
                </Space>
            </div>

            {/* Plugin Grid */}
            {loading ? (
                <div className="plugin-grid">
                    {[1, 2, 3, 4].map(i => (
                        <CardSkeleton key={i} />
                    ))}
                </div>
            ) : filteredPlugins.length > 0 ? (
                <div className="plugin-grid">
                    {filteredPlugins.map(renderPluginCard)}
                </div>
            ) : (
                <Empty 
                    image={Empty.PRESENTED_IMAGE_SIMPLE} 
                    description={searchQuery 
                        ? t('pluginMarketplace.emptySearch', { query: searchQuery })
                        : t('pluginMarketplace.emptyCategory')}
                    style={{ padding: 48 }}
                />
            )}

            {/* Delivery Section Simulation */}
            <div style={{ 
                marginTop: 32, 
                padding: '20px 24px', 
                background: 'rgba(24, 144, 255, 0.04)', 
                borderRadius: 16,
                border: '1px dashed rgba(24, 144, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <Space size={16}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(24, 144, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#1890ff' }}>
                        <CloudDownloadOutlined />
                    </div>
                    <div>
                        <Text strong>{t('pluginMarketplace.deliveryTitle')}</Text>
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>{t('pluginMarketplace.deliveryDesc')}</div>
                    </div>
                </Space>
                <Button type="link">{t('pluginMarketplace.configDevUrl')}</Button>
            </div>
        </div>
      </div>
    </Modal>
  );
};

const CardSkeleton = () => (
    <div className="plugin-card" style={{ cursor: 'wait' }}>
        <Skeleton active avatar paragraph={{ rows: 2 }} />
    </div>
);

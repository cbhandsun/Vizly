import React, { useState, useEffect, useMemo } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [plugins, setPlugins] = useState<DiagramTypePlugin[]>([]);
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const registry = PluginRegistry.getInstance();

  const refresh = () => {
    setLoading(true);
    // 模拟从注册表获取数据（实际是同步但为了动效加个延迟）
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
    if (visible) refresh();
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
            {plugin.description || '由专业团队开发的扩展组件，提升绘图效率与感知力。'}
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
              <Text type="success" style={{ fontSize: 12 }}><CheckCircleFilled /> 已激活</Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>未启用</Text>
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
                <Title level={2} style={{ color: '#fff', margin: 0, letterSpacing: -0.5 }}>Vizly 插件市场</Title>
                <Paragraph style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>
                    通过精心挑选的插件，将您的画布转化为专业的工作引擎。
                </Paragraph>
            </div>

            <Button 
                type="primary" 
                icon={<GlobalOutlined />} 
                style={{ position: 'absolute', bottom: 24, right: 24, borderRadius: 20 }}
            >
                发现更多在线扩展
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
                        <TabPane tab="全部插件" key="all" />
                        <TabPane tab="官方推荐" key="core" />
                        <TabPane tab="效率工具" key="productivity" />
                        <TabPane tab="我安装的" key="installed" />
                    </Tabs>
                    <Input
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        placeholder="搜索名称、ID 或标签..."
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
                    description={searchQuery ? `未找到匹配 "${searchQuery}" 的插件` : "还没有发现符合该分类的插件"}
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
                        <Text strong>从远程交付中心加载 (Delivery)</Text>
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>输入第三方插件的 Manifest URL 进行动态加载。</div>
                    </div>
                </Space>
                <Button type="link">配置开发者 URL</Button>
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

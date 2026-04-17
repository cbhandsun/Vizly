import React, { useState, useEffect } from 'react';
import { Modal, List, Switch, Tag, Button, Typography, Space, Tooltip, Divider } from 'antd';
import { 
  ApiOutlined, 
  CheckCircleOutlined, 
  StopOutlined, 
  InfoCircleOutlined,
  ThunderboltOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { PluginRegistry } from '../../../services/PluginRegistry';
import { DiagramTypePlugin } from '../../../types';

const { Text, Title, Paragraph } = Typography;

interface PluginManagerModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 插件管理中心 (Phase 10)
 * 允许用户启用/禁用特定图表类型的支持插件，管理扩展能力
 */
export const PluginManagerModal: React.FC<PluginManagerModalProps> = ({ visible, onClose }) => {
  const [plugins, setPlugins] = useState<DiagramTypePlugin[]>([]);
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
  const registry = PluginRegistry.getInstance();

  const refresh = () => {
    const all = registry.getAllPlugins();
    setPlugins(all);
    const m: Record<string, boolean> = {};
    all.forEach(p => {
      m[p.id] = registry.isPluginActive(p.id);
    });
    setActiveMap(m);
  };

  useEffect(() => {
    if (visible) refresh();
  }, [visible]);

  const togglePlugin = (id: string, active: boolean) => {
    registry.setPluginActive(id, active);
    setActiveMap(prev => ({ ...prev, [id]: active }));
  };

  return (
    <Modal
      title={<span><ApiOutlined /> 插件管理中心</span>}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          完成
        </Button>
      ]}
      width={600}
    >
      <div style={{ marginBottom: 20 }}>
        <Paragraph>
          在这里管理 Vizly 的扩展功能。禁用不常用的插件可以优化侧边栏显示和加载性能。
        </Paragraph>
      </div>

      <List
        dataSource={plugins}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Switch 
                checked={activeMap[item.id]} 
                onChange={(checked) => togglePlugin(item.id, checked)}
                checkedChildren="已开启"
                unCheckedChildren="已关闭"
              />
            ]}
          >
            <List.Item.Meta
              avatar={
                <div style={{ 
                  width: 40, 
                  height: 40, 
                  background: activeMap[item.id] ? '#e6f7ff' : '#f5f5f5',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: activeMap[item.id] ? '#1890ff' : '#bfbfbf'
                }}>
                  {item.icon || <ThunderboltOutlined />}
                </div>
              }
              title={
                <Space>
                  <Text strong>{item.name}</Text>
                  <Tag color={activeMap[item.id] ? 'blue' : 'default'}>v{item.version}</Tag>
                  {item.id === 'flowchart' && <Tag color="gold">核心插件</Tag>}
                </Space>
              }
              description={
                <div>
                  <Text type="secondary">ID: {item.id}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Tooltip title="具有完整生命周期钩子">
                      <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                    </Tooltip>
                    <Tooltip title="支持一键布局">
                      <ThunderboltOutlined style={{ color: '#faad14', marginRight: 8 }} />
                    </Tooltip>
                    <Tooltip title="支持属性编辑器扩展">
                      <SettingOutlined style={{ color: '#1890ff' }} />
                    </Tooltip>
                  </div>
                </div>
              }
            />
          </List.Item>
        )}
      />

      <Divider />

      <div style={{ padding: '12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8 }}>
        <Space align="start">
          <InfoCircleOutlined style={{ color: '#faad14', marginTop: 3 }} />
          <div style={{ fontSize: 13 }}>
            <Text strong>提示：</Text>
            部分插件状态变更后，可能需要重新加图表以完全应用（如侧边栏工具箱的刷新）。
          </div>
        </Space>
      </div>
    </Modal>
  );
};

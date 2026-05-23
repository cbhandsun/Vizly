import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GatewayOutlined, 
  ClockCircleOutlined, 
  BlockOutlined, 
  ApartmentOutlined, 
  DeploymentUnitOutlined, 
  ApiOutlined, 
  ArrowLeftOutlined, 
  ThunderboltOutlined 
} from '@ant-design/icons';
import { PluginRegistry } from '@/core/services/PluginRegistry';

interface PluginDisabledFallbackProps {
  pluginId: string;
  onEnable: () => void;
}

export const PluginDisabledFallback: React.FC<PluginDisabledFallbackProps> = ({ pluginId, onEnable }) => {
  const navigate = useNavigate();
  const [hoverBtn, setHoverBtn] = useState<string | null>(null);

  const registry = PluginRegistry.getInstance();
  const plugin = registry.getPlugin(pluginId);
  const pluginName = plugin ? plugin.name : pluginId;

  // 根据插件ID获取对应图标
  const getIcon = () => {
    const iconStyle = { fontSize: 44, color: plugin?.brandColor || '#1890ff' };
    switch (pluginId) {
      case 'mindmap':
        return <GatewayOutlined style={iconStyle} />;
      case 'timeline-diagram':
        return <ClockCircleOutlined style={iconStyle} />;
      case 'architecture-diagram':
        return <BlockOutlined style={iconStyle} />;
      case 'swimlane-diagram':
        return <ApartmentOutlined style={iconStyle} />;
      case 'flowchart':
        return <DeploymentUnitOutlined style={iconStyle} />;
      default:
        return <ApiOutlined style={iconStyle} />;
    }
  };

  const brandColor = plugin?.brandColor || '#1890ff';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      background: 'var(--designer-background, #f5f7fa)',
      position: 'absolute',
      top: 0,
      left: 0,
      zIndex: 10,
      padding: 24,
    }}>
      {/* 渐变微光背景 */}
      <div style={{
        position: 'absolute',
        width: 350,
        height: 350,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${brandColor}1a 0%, transparent 70%)`,
        filter: 'blur(40px)',
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      {/* 玻璃化拦截卡片 */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: 480,
        width: '100%',
        padding: '48px 32px',
        textAlign: 'center',
        background: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.72))',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 16,
        border: '1px solid var(--designer-border, rgba(255, 255, 255, 0.45))',
        boxShadow: 'var(--designer-shadow, 0 20px 40px -10px rgba(0, 0, 0, 0.08))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* 图标容器 */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: `${brandColor}12`,
          border: `1px solid ${brandColor}2b`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          boxShadow: `0 8px 16px -4px ${brandColor}1a`,
        }}>
          {getIcon()}
        </div>

        {/* 标题 */}
        <h2 style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--designer-foreground, #1e293b)',
          margin: '0 0 12px 0',
          letterSpacing: '-0.02em',
        }}>
          {pluginName} 插件未启用
        </h2>

        {/* 描述 */}
        <p style={{
          fontSize: 14,
          lineHeight: '1.6',
          color: 'var(--designer-foreground-muted, #64748b)',
          margin: '0 0 32px 0',
        }}>
          此图表属于【{pluginName}】类型，当前对应的插件处于关闭状态。您需要开启该插件来查看、编辑以及进行协作。
        </p>

        {/* 按钮区域 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: '100%',
        }}>
          {/* 一键启用按钮 */}
          <button
            onClick={onEnable}
            onMouseEnter={() => setHoverBtn('enable')}
            onMouseLeave={() => setHoverBtn(null)}
            style={{
              width: '100%',
              padding: '12px 24px',
              borderRadius: 10,
              background: hoverBtn === 'enable' 
                ? `linear-gradient(135deg, ${brandColor}e6, ${brandColor})` 
                : `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)`,
              color: '#ffffff',
              border: 'none',
              fontWeight: 500,
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: hoverBtn === 'enable' ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow: hoverBtn === 'enable' 
                ? `0 8px 20px -6px ${brandColor}80` 
                : `0 4px 12px -4px ${brandColor}66`,
            }}
          >
            <ThunderboltOutlined />
            一键启用插件
          </button>

          {/* 返回工作区按钮 */}
          <button
            onClick={() => navigate('/')}
            onMouseEnter={() => setHoverBtn('back')}
            onMouseLeave={() => setHoverBtn(null)}
            style={{
              width: '100%',
              padding: '12px 24px',
              borderRadius: 10,
              background: hoverBtn === 'back' ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
              color: 'var(--designer-foreground, #475569)',
              border: '1px solid var(--designer-border, rgba(0, 0, 0, 0.15))',
              fontWeight: 500,
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
            }}
          >
            <ArrowLeftOutlined />
            返回工作区
          </button>
        </div>
      </div>
    </div>
  );
};

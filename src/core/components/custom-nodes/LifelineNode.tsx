import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { UserOutlined, DesktopOutlined } from '@ant-design/icons';
import { useTheme } from '../../themes/useCoreTheme';

export interface ActivationBox {
  id?: string;
  y: number;
  height: number;
  level?: number; // Supports nested activations
}

export const LifelineNode = memo(({ data, selected }: NodeProps) => {
  const [theme] = useTheme();
  
  const isDark = theme?.mode === 'dark';
  const primaryColor = theme?.palette?.primary?.main || '#1890ff';
  const bgColor = isDark ? '#1f1f1f' : '#ffffff';
  const borderColor = selected ? primaryColor : (isDark ? '#434343' : '#d9d9d9');
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : '#262626';

  const { label, type = 'system', activations = [] } = data;
  const safeActivations = Array.isArray(activations) ? activations : [];

  return (
    <div style={{ position: 'relative', width: 120, height: 40 }}>
      {/* 垂直生命线引导线 */}
      <div style={{
          position: 'absolute',
          top: 40,
          left: '50%',
          width: 0,
          height: 1200, 
          borderLeft: '2px dashed #d9d9d9',
          transform: 'translateX(-1px)',
          zIndex: -1,
          opacity: 0.6,
          pointerEvents: 'none'
      }} />

      {/* UML Activation Boxes (激活条) */}
      {safeActivations.map((act: ActivationBox, idx: number) => (
          <div 
            key={act.id || idx}
            style={{
                position: 'absolute',
                top: 40 + act.y,
                left: '50%',
                width: 12,
                height: act.height,
                background: bgColor,
                border: `1px solid ${primaryColor}`,
                transform: `translateX(-50%) translateX(${(act.level || 0) * 4}px)`,
                zIndex: 1,
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
          />
      ))}

      {/* 顶部标识框 */}
      <div style={{
          padding: '8px 12px',
          background: bgColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: selected ? `0 0 0 2px ${primaryColor}20` : '0 2px 8px rgba(0,0,0,0.05)',
          zIndex: 10,
          position: 'relative'
      }}>
        {type === 'actor' ? <UserOutlined style={{ color: primaryColor }} /> : <DesktopOutlined style={{ color: primaryColor }} />}
        <span style={{ fontWeight: 600, fontSize: 13, color: textColor }}>{label}</span>
      </div>

      {/* 消息连接点 */}
      <Handle type="source" position={Position.Left} style={{ opacity: 0, top: '1000%' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, top: '1000%' }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, top: '1000%' }} />
      <Handle type="target" position={Position.Right} style={{ opacity: 0, top: '1000%' }} />
    </div>
  );
});

LifelineNode.displayName = 'LifelineNode';

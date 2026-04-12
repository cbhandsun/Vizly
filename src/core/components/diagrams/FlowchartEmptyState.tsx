import React from 'react';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { FaPlus, FaMousePointer, FaKeyboard } from 'react-icons/fa';

const { Text, Title } = Typography;

export const FlowchartEmptyState: React.FC<{
  visible: boolean;
}> = ({ visible }) => {
  const { t } = useTranslation();
  
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 400,
        pointerEvents: 'none', // 允许透传双击事件到底层画布
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        padding: '36px 56px',
        borderRadius: '24px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.03), inset 0 0 0 1px rgba(255,255,255,0.8)',
        border: '1px solid rgba(0,0,0,0.04)',
      }}
    >
      <Title level={4} style={{ color: '#334155', margin: 0, fontWeight: 600, letterSpacing: '0.5px' }}>
        {t('designer.flowchart.emptyState.title', '画布空空如也')}
      </Title>
      <Text type="secondary" style={{ marginTop: 8, fontSize: 14 }}>
        右键空白处唤出菜单，或从左侧面板拖入组件开始您的设计
      </Text>
      
      <div style={{ display: 'flex', gap: 32, marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaMousePointer size={14} color="#64748b" />
          </div>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>右键唤出菜单</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaKeyboard size={14} color="#64748b" />
          </div>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Space + 拖动画布</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaPlus size={14} color="#64748b" />
          </div>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Alt + 拖动复制</Text>
        </div>
      </div>
    </div>
  );
};

export default FlowchartEmptyState;

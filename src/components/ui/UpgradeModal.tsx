import React, { useState } from 'react';
import { Modal, Button, Typography, Space, Divider, message } from 'antd';
import { CrownOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useSubscription } from '@/context/SubscriptionContext';
import { AuthModal } from '@/components/auth/AuthModal';

const { Title, Text, Paragraph } = Typography;

export const UpgradeModal: React.FC = () => {
  const { isUpgradeModalVisible, hideUpgradeModal, upgradeFeatureContext, jwtToken } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);

  const handleUpgradeClick = async () => {
    if (!jwtToken || jwtToken === 'guest') {
      message.warning('⚠️ 请先登录您的账号再进行订阅操作。');
      setIsAuthModalVisible(true);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'price_mock_123',
          successUrl: `${window.location.origin}?success=true`,
          cancelUrl: `${window.location.origin}?canceled=true`,
        })
      });

      if (!response.ok) {
         let errorText = '';
         try {
             const errJson = await response.json();
             errorText = errJson.error || response.statusText;
         } catch {
             errorText = response.statusText;
         }
         throw new Error(`请求失败: ${errorText}`);
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url; // 重定向至 Stripe 网关
      } else {
        message.error('创建结账会话失败：' + (data.error || '未知错误'));
      }
    } catch (e: any) {
       message.error('请求网关失败：' + e.message);
    } finally {
       setLoading(false);
    }
  };

  return (
    <>
      <Modal
        open={isUpgradeModalVisible}
        onCancel={hideUpgradeModal}
        footer={null}
        centered
        width={480}
        styles={{ body: { padding: '24px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <CrownOutlined style={{ fontSize: 64, color: '#faad14', marginBottom: 16 }} />
          <Title level={3} style={{ margin: 0 }}>解锁高级功能</Title>
          {upgradeFeatureContext && (
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              正在尝试使用：<Text strong>{upgradeFeatureContext}</Text>
            </Text>
          )}
        </div>

        <Paragraph style={{ fontSize: 16, textAlign: 'center' }}>
          升级至 <strong>Pro 版本</strong>，提升体验与效能！
        </Paragraph>

        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginTop: 24 }}>
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> 多页高清 PDF 及 SVG 无损导出</Text>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> 云端多人实时协同编辑</Text>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> 无限制的云端全量历史记录追溯</Text>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> 云端智能 AI 架构生成库</Text>
          </Space>
        </div>

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Button size="large" onClick={hideUpgradeModal} disabled={loading}>暂不升级</Button>
          <Button type="primary" size="large" style={{ background: '#faad14', borderColor: '#faad14' }} onClick={handleUpgradeClick} loading={loading}>
            立即订阅 Pro
          </Button>
        </div>
      </Modal>
      
      <AuthModal
        open={isAuthModalVisible}
        onCancel={() => setIsAuthModalVisible(false)}
      />
    </>
  );
};


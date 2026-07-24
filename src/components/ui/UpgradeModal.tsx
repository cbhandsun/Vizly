import React, { Suspense, useState } from 'react';
import { Modal, Button, Typography, Space, Divider } from 'antd';
import { CrownOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useSubscription } from '@/context/useSubscription';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { createCheckoutSession } from '@/services/checkoutSessionClient';


const { Title, Text, Paragraph } = Typography;
const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then((module) => ({
  default: module.AuthModal
})));

export const UpgradeModal: React.FC = () => {
  const { t } = useTranslation();
  const { isUpgradeModalVisible, hideUpgradeModal, upgradeFeatureContext, jwtToken } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);

  const handleUpgradeClick = async () => {
    if (!jwtToken || jwtToken === 'guest') {
      appMessage.warning(t('upgrade.loginFirst'));
      setIsAuthModalVisible(true);
      return;
    }

    setLoading(true);
    try {
      const { url } = await createCheckoutSession({
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
        jwtToken,
        origin: window.location.origin,
      });
      window.location.href = url;
    } catch (error: unknown) {
       const message = error instanceof Error ? error.message : t('upgrade.unknownError');
       appMessage.error(t('upgrade.gatewayFail', { error: message }));
    } finally {
       setLoading(false);
    }
  };

  return (
    <>
      <Modal
        open={isUpgradeModalVisible}
        onCancel={hideUpgradeModal}
        getContainer={() => document.getElementById('app-root-layout') || document.body}
        footer={null}
        centered
        width={480}
        styles={{ body: { padding: '24px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <CrownOutlined style={{ fontSize: 64, color: '#faad14', marginBottom: 16 }} />
          <Title level={3} style={{ margin: 0 }}>{t('upgrade.title')}</Title>
          {upgradeFeatureContext && (
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              {t('upgrade.featureContext')}<Text strong>{upgradeFeatureContext}</Text>
            </Text>
          )}
        </div>

        <Paragraph style={{ fontSize: 16, textAlign: 'center' }}>
          {t('upgrade.subtitle')}
        </Paragraph>

        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginTop: 24 }}>
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> {t('upgrade.features.pdf')}</Text>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> {t('upgrade.features.collab')}</Text>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> {t('upgrade.features.history')}</Text>
            <Text><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} /> {t('upgrade.features.ai')}</Text>
          </Space>
        </div>

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Button size="large" onClick={hideUpgradeModal} disabled={loading}>{t('upgrade.later')}</Button>
          <Button type="primary" size="large" style={{ background: '#faad14', borderColor: '#faad14' }} onClick={handleUpgradeClick} loading={loading}>
            {t('upgrade.subscribe')}
          </Button>
        </div>
      </Modal>

      {isAuthModalVisible && (
        <Suspense fallback={null}>
          <AuthModal
            open={isAuthModalVisible}
            onCancel={() => setIsAuthModalVisible(false)}
          />
        </Suspense>
      )}
    </>
  );
};

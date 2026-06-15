import React, { Suspense, useState } from 'react';
import { Modal, Button, Typography, Space, Divider } from 'antd';
import { CrownOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useSubscription } from '@/context/useSubscription';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { buildSupabaseFunctionUrl, normalizeStripePriceId } from '@/services/runtimeEnv';
import { isSafeCheckoutRedirectUrl } from './checkoutRedirect';


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
      const checkoutUrl = buildSupabaseFunctionUrl(
        import.meta.env.VITE_SUPABASE_URL,
        'create-checkout-session'
      );
      const priceId = normalizeStripePriceId(import.meta.env.VITE_STRIPE_PRO_PRICE_ID);

      if (!checkoutUrl || !priceId) {
        throw new Error(t('upgrade.checkoutConfigMissing', { defaultValue: 'Checkout is not configured.' }));
      }

      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          priceId,
          successUrl: `${window.location.origin}?success=true`,
          cancelUrl: `${window.location.origin}?canceled=true`,
        })
      });

      if (!response.ok) {
         let errorText = '';
         try {
             const rawText = await response.text();
             try {
                 const errJson = JSON.parse(rawText);
                 errorText = errJson.error || errJson.message || rawText;
             } catch {
                 errorText = rawText;
             }
         } catch {
             errorText = response.statusText || t('upgrade.unknownResponse');
         }
         throw new Error(t('upgrade.statusError', { status: response.status, message: errorText }));
      }

      const data = await response.json();

      if (isSafeCheckoutRedirectUrl(data.url)) {
        window.location.href = data.url; // 重定向至 Stripe 网关
      } else {
        appMessage.error(t('upgrade.checkoutFail', { error: data.error || t('upgrade.unknownError') }));
      }
    } catch (e: any) {
       appMessage.error(t('upgrade.gatewayFail', { error: e.message }));
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

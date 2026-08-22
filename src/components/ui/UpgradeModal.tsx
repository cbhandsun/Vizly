import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Button, Typography, Space, Divider } from 'antd';
import { CrownOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useSubscription } from '@/context/useSubscription';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { createCheckoutSession } from '@/services/checkoutSessionClient';
import {
  COMMERCIAL_VIEWPORT_MODAL_CLASS,
  COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
  getViewportOverlayContainer,
} from '@/core/components/ui/viewportOverlayPortal';
import { normalizeUpgradeCheckoutError } from './upgradeCheckoutBoundary';
import './UpgradeModal.css';


const { Text, Paragraph } = Typography;
const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then((module) => ({
  default: module.AuthModal
})));

type UpgradeRecoveryState =
  | { kind: 'idle' }
  | { kind: 'auth-required' }
  | { kind: 'auth-complete' }
  | { kind: 'checkout-failed'; message: string };

export const UpgradeModal: React.FC = () => {
  const { t } = useTranslation();
  const { isUpgradeModalVisible, hideUpgradeModal, upgradeFeatureContext, jwtToken } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [recoveryState, setRecoveryState] = useState<UpgradeRecoveryState>({ kind: 'idle' });
  const checkoutControllerRef = useRef<AbortController | null>(null);
  const subscribeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreUpgradeFocusRef = useRef(false);

  useEffect(() => () => checkoutControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!isUpgradeModalVisible || isAuthModalVisible || !restoreUpgradeFocusRef.current) return;

    const focusFrame = window.requestAnimationFrame(() => {
      subscribeButtonRef.current?.focus();
      restoreUpgradeFocusRef.current = false;
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isAuthModalVisible, isUpgradeModalVisible]);

  const resetTransientState = () => {
    checkoutControllerRef.current?.abort();
    checkoutControllerRef.current = null;
    setLoading(false);
    setIsAuthModalVisible(false);
    setRecoveryState({ kind: 'idle' });
    restoreUpgradeFocusRef.current = false;
  };

  const handleClose = () => {
    resetTransientState();
    hideUpgradeModal();
  };

  const handleUpgradeClick = async () => {
    if (loading) return;
    if (!jwtToken || jwtToken === 'guest') {
      appMessage.warning(t('upgrade.loginFirst'));
      setRecoveryState({ kind: 'auth-required' });
      restoreUpgradeFocusRef.current = true;
      setIsAuthModalVisible(true);
      return;
    }

    const controller = new AbortController();
    checkoutControllerRef.current?.abort();
    checkoutControllerRef.current = controller;
    setLoading(true);
    setRecoveryState({ kind: 'idle' });
    try {
      const { url } = await createCheckoutSession({
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
        jwtToken,
        origin: window.location.origin,
        signal: controller.signal,
      });
      window.location.href = url;
    } catch (error: unknown) {
       if (controller.signal.aborted) return;
       const message = normalizeUpgradeCheckoutError(error, t('upgrade.unknownError'));
       setRecoveryState({ kind: 'checkout-failed', message });
       appMessage.error(t('upgrade.gatewayFail', { error: message }));
    } finally {
       if (checkoutControllerRef.current === controller) {
         checkoutControllerRef.current = null;
         setLoading(false);
       }
    }
  };

  const handleAuthenticated = () => {
    setIsAuthModalVisible(false);
    setRecoveryState({ kind: 'auth-complete' });
  };

  const handleUpgradeAfterClose = () => {
    if (!isUpgradeModalVisible) resetTransientState();
  };

  const recoveryAlert = recoveryState.kind === 'auth-required' ? (
    <Alert
      className="upgrade-modal__recovery"
      type="info"
      showIcon
      message={t('upgrade.authRequiredTitle')}
      description={t('upgrade.authRequiredDescription')}
    />
  ) : recoveryState.kind === 'auth-complete' ? (
    <Alert
      className="upgrade-modal__recovery"
      type="success"
      showIcon
      message={t('upgrade.authCompleteTitle')}
      description={t('upgrade.authCompleteDescription')}
    />
  ) : recoveryState.kind === 'checkout-failed' ? (
    <Alert
      className="upgrade-modal__recovery"
      type="error"
      showIcon
      message={t('upgrade.checkoutFailedTitle')}
      description={recoveryState.message}
      action={(
        <Button size="small" onClick={handleUpgradeClick} disabled={loading}>
          {t('upgrade.retryCheckout')}
        </Button>
      )}
    />
  ) : null;
  const featureContextPrefix = t('upgrade.featureContext');
  const featureContextSeparator = /[\s:：]$/u.test(featureContextPrefix) ? '' : ' ';

  return (
    <>
      {!isAuthModalVisible && (
        <Modal
          open={isUpgradeModalVisible}
          onCancel={handleClose}
          afterClose={handleUpgradeAfterClose}
          getContainer={getViewportOverlayContainer}
          rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} upgrade-viewport-modal`}
          zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}
          footer={null}
          centered
          width={480}
          title={<span id="upgrade-modal-title">{t('upgrade.title')}</span>}
        >
          <div className="upgrade-modal__hero">
            <CrownOutlined className="upgrade-modal__crown" aria-hidden="true" />
            {upgradeFeatureContext && (
              <Text type="secondary" className="upgrade-modal__feature-context">
                {featureContextPrefix}{featureContextSeparator}<Text strong>{upgradeFeatureContext}</Text>
              </Text>
            )}
          </div>

          <Paragraph className="upgrade-modal__subtitle">
            {t('upgrade.subtitle')}
          </Paragraph>

          <div className="upgrade-modal__features">
            <Space orientation="vertical" size="small" style={{ width: '100%' }}>
              <Text><CheckCircleFilled className="upgrade-modal__feature-icon" aria-hidden="true" /> {t('upgrade.features.pdf')}</Text>
              <Text><CheckCircleFilled className="upgrade-modal__feature-icon" aria-hidden="true" /> {t('upgrade.features.collab')}</Text>
              <Text><CheckCircleFilled className="upgrade-modal__feature-icon" aria-hidden="true" /> {t('upgrade.features.history')}</Text>
              <Text><CheckCircleFilled className="upgrade-modal__feature-icon" aria-hidden="true" /> {t('upgrade.features.ai')}</Text>
            </Space>
          </div>

          {recoveryAlert}

          <Divider />

          <div className="upgrade-modal__actions">
            <Button size="large" onClick={handleClose}>{t('upgrade.later')}</Button>
            <Button
              ref={subscribeButtonRef}
              type="primary"
              size="large"
              className="upgrade-modal__subscribe"
              onClick={handleUpgradeClick}
              loading={loading}
            >
              {recoveryState.kind === 'checkout-failed'
                ? t('upgrade.retryCheckout')
                : t('upgrade.subscribe')}
            </Button>
          </div>
        </Modal>
      )}

      {isAuthModalVisible && (
        <Suspense fallback={null}>
          <AuthModal
            open={isAuthModalVisible}
            onCancel={() => setIsAuthModalVisible(false)}
            onAuthenticated={handleAuthenticated}
            zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX + 20}
          />
        </Suspense>
      )}
    </>
  );
};

import React, { useState, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from '@/context/useAuth';
import { SubscriptionContext, type UserTier } from './SubscriptionContextValue';

const FREE_FEATURES = ['ai-assistant'];
const PRO_FEATURES = [...FREE_FEATURES, 'export-hd-svg', 'export-pdf', 'cloud-sync', 'cloud-history', 'premium-templates'];
const ENTERPRISE_FEATURES = [...PRO_FEATURES, 'sso', 'whitelabel', 'rbac'];

const TIER_FEATURES: Record<UserTier, string[]> = {
  free: FREE_FEATURES,
  pro: PRO_FEATURES,
  enterprise: ENTERPRISE_FEATURES
};

const coerceUserTier = (value: unknown): UserTier => {
  return value === 'pro' || value === 'enterprise' ? value : 'free';
};

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();
  const [isUpgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgradeFeatureContext, setUpgradeFeatureContext] = useState<string | undefined>();

  // Subscription tier must come from server-controlled app metadata.
  const tier = coerceUserTier(user?.app_metadata?.tier);
  const jwtToken = session?.access_token;

  const hasFeature = useCallback((featureName: string) => {
    return TIER_FEATURES[tier].includes(featureName);
  }, [tier]);

  const showUpgradeModal = useCallback((featureName?: string) => {
    setUpgradeFeatureContext(featureName);
    setUpgradeModalVisible(true);
  }, []);

  const hideUpgradeModal = useCallback(() => {
    setUpgradeModalVisible(false);
    setUpgradeFeatureContext(undefined);
  }, []);

  const value = useMemo(() => ({
      tier,
      hasFeature,
      isUpgradeModalVisible,
      showUpgradeModal,
      hideUpgradeModal,
      upgradeFeatureContext,
      jwtToken
    }), [tier, hasFeature, isUpgradeModalVisible, showUpgradeModal, hideUpgradeModal, upgradeFeatureContext, jwtToken]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};


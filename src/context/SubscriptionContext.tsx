import React, { useState, ReactNode } from 'react';
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

  const hasFeature = (featureName: string) => {
    return TIER_FEATURES[tier].includes(featureName);
  };

  const showUpgradeModal = (featureName?: string) => {
    setUpgradeFeatureContext(featureName);
    setUpgradeModalVisible(true);
  };

  const hideUpgradeModal = () => {
    setUpgradeModalVisible(false);
    setUpgradeFeatureContext(undefined);
  };

  return (
    <SubscriptionContext.Provider value={{
      tier,
      hasFeature,
      isUpgradeModalVisible,
      showUpgradeModal,
      hideUpgradeModal,
      upgradeFeatureContext,
      jwtToken
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};


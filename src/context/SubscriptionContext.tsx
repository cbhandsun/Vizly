import React, { createContext, useContext, useState, ReactNode } from 'react';

export type UserTier = 'free' | 'pro' | 'enterprise';

interface SubscriptionContextType {
  tier: UserTier;
  setTier: (tier: UserTier) => void;
  hasFeature: (featureName: string) => boolean;
  isUpgradeModalVisible: boolean;
  showUpgradeModal: (featureName?: string) => void;
  hideUpgradeModal: () => void;
  upgradeFeatureContext?: string;
  jwtToken?: string;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

import { useAuth } from '@/context/AuthContext';

const FREE_FEATURES = ['ai-assistant'];
const PRO_FEATURES = [...FREE_FEATURES, 'export-hd-svg', 'export-pdf', 'cloud-sync', 'cloud-history', 'premium-templates'];
const ENTERPRISE_FEATURES = [...PRO_FEATURES, 'sso', 'whitelabel', 'rbac'];

const TIER_FEATURES: Record<UserTier, string[]> = {
  free: FREE_FEATURES,
  pro: PRO_FEATURES,
  enterprise: ENTERPRISE_FEATURES
};

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();
  const [internalTier, setInternalTier] = useState<UserTier>('free');
  const [isUpgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgradeFeatureContext, setUpgradeFeatureContext] = useState<string | undefined>();

  // 计算最终的 tier:
  // 如果服务端通过 JWT 的 app_metadata 传递了 tier 优先，否则使用 fallback 的内部状态
  const tier: UserTier = user?.app_metadata?.tier as UserTier || internalTier || 'free';
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
      setTier: setInternalTier,
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

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    console.warn('[HMR Warning] useSubscription was called outside of a SubscriptionProvider. Returning temporary fallback context.');
    return {
      tier: 'free' as UserTier,
      setTier: () => {},
      hasFeature: () => false,
      isUpgradeModalVisible: false,
      showUpgradeModal: () => {},
      hideUpgradeModal: () => {},
      upgradeFeatureContext: undefined,
      jwtToken: undefined
    };
  }
  return context;
};


import { useContext } from 'react';
import { SubscriptionContext } from './SubscriptionContextValue';
import type { UserTier } from './SubscriptionContextValue';
import { logSubscriptionProviderFallbackContext } from './authLogging';

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    logSubscriptionProviderFallbackContext();
    return {
      tier: 'free' as UserTier,
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

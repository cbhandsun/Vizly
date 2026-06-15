import { useContext } from 'react';
import { SubscriptionContext } from './SubscriptionContextValue';
import type { UserTier } from './SubscriptionContextValue';

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    console.warn('[HMR Warning] useSubscription was called outside of a SubscriptionProvider. Returning temporary fallback context.');
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

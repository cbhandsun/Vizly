import { createContext } from 'react';

export type UserTier = 'free' | 'pro' | 'enterprise';

export interface SubscriptionContextType {
  tier: UserTier;
  hasFeature: (featureName: string) => boolean;
  isUpgradeModalVisible: boolean;
  showUpgradeModal: (featureName?: string) => void;
  hideUpgradeModal: () => void;
  upgradeFeatureContext?: string;
  jwtToken?: string;
}

export const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

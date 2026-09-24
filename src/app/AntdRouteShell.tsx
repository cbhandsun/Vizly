import React, { Suspense } from 'react';
import { useSubscription } from '@/context/useSubscription';
import AntdThemeBridge from './AntdThemeBridge';

const UpgradeModal = React.lazy(() => import('@/components/ui/UpgradeModal').then((module) => ({
  default: module.UpgradeModal
})));

const UpgradeModalGate: React.FC = () => {
  const { isUpgradeModalVisible } = useSubscription();

  if (!isUpgradeModalVisible) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <UpgradeModal />
    </Suspense>
  );
};

const AntdRouteShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AntdThemeBridge>
      {children}
      <UpgradeModalGate />
    </AntdThemeBridge>
  );
};

export default AntdRouteShell;

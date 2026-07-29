import React from 'react';
import { HashRouter } from 'react-router';
import { AuthProvider } from '@/context/AuthContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';

interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * 应用程序提供者组件
 * 统一管理全局上下文提供者。画布专用 provider 在对应路由内按需加载。
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <HashRouter>
      <AuthProvider>
        <SubscriptionProvider>
          {children}
        </SubscriptionProvider>
      </AuthProvider>
    </HashRouter>
  );
};

export default AppProviders;

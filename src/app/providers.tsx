// @ts-nocheck
import React, { Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';

const AntdThemeBridge = React.lazy(() => import('./AntdThemeBridge'));

interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * 应用程序提供者组件
 * 统一管理所有的上下文提供者，包括 ReactFlow、主题、状态管理等
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <ReactFlowProvider>
      <HashRouter>
        <AuthProvider>
          <SubscriptionProvider>
            <Suspense fallback={<div style={{ padding: 16 }}>加载应用...</div>}>
              <AntdThemeBridge>
                {children}
              </AntdThemeBridge>
            </Suspense>
          </SubscriptionProvider>
        </AuthProvider>
      </HashRouter>
    </ReactFlowProvider>
  );
};

export default AppProviders;

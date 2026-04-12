// @ts-nocheck
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { HashRouter } from 'react-router-dom';
import { useConfigIntegration } from '@/core';
import { AuthProvider } from '@/context/AuthContext';
import AntdThemeBridge from './AntdThemeBridge';

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
          <ConfigIntegrationBootstrap>
            <AntdThemeBridge>
              {children}
            </AntdThemeBridge>
          </ConfigIntegrationBootstrap>
        </AuthProvider>
      </HashRouter>
    </ReactFlowProvider>
  );
};

export default AppProviders;

/**
 * ConfigIntegrationBootstrap 组件
 * 函数级注释：
 * - 在应用最外层统一初始化配置集成，避免各处使用时出现“ConfigIntegration not initialized”。
 * - 使用 useConfigIntegration 的 autoInitialize，确保在挂载后自动创建并准备好全局集成实例。
 * - 不阻塞子树渲染；仅承担一次性的初始化职责。
 */
const ConfigIntegrationBootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state] = useConfigIntegration({ autoInitialize: true });
  return <>{children}</>;
};

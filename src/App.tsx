import React from 'react';
import { ErrorBoundary } from '@/core/components/shared/ErrorBoundary';
import { AppProviders, AppRoutes } from '@/app/index';
import { logAppBoundaryError } from '@/core/utils/errorBoundaryLogging';

/**
 * 主应用组件
 * 使用现代化的应用结构，分离提供者和路由管理
 * 确保整个应用受100vh严格约束
 * 包含全局错误边界保护
 */
const App: React.FC = () => {
  return (
    <ErrorBoundary 
      level="page"
      enableReporting={true}
      maxRetries={3}
      onError={(error, _errorInfo, errorDetails) => {
        logAppBoundaryError(error, errorDetails);
      }}
    >
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-900 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] transition-colors duration-300">
        <AppProviders>
            <AppRoutes />
          </AppProviders>
      </div>
    </ErrorBoundary>
  );
};

export default App;

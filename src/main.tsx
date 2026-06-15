// src/main.tsx

import * as React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css'; // Tailwind CSS
import './main.css'; // 保留您项目全局的基础CSS
// 导入console清理工具，在生产环境中自动清理console输出
import { initDevConsoleFilters } from '@/core/utils/consoleCleanup';
import { performanceMonitor } from '@/core/utils/performanceMonitor';
// 导入全局错误处理
import { initGlobalErrorHandling } from '@/core/utils/globalErrorHandler';

// 初始化开发环境日志过滤器（屏蔽非关键的网络噪音）
initDevConsoleFilters();

// Initialize i18n
import './i18n';

// 初始化全局错误处理
initGlobalErrorHandling();

// 初始化性能监控
if (process.env.NODE_ENV === 'production') {
  performanceMonitor.setEnabled(true);
} else {
  // 开发环境也启用，但会有更详细的日志
  performanceMonitor.setEnabled(true);
}

const DATA_REGISTRY_BACKGROUND_WARMUP_DELAY_MS = 8000;

const initializeDataRegistryAfterPaint = () => {
  const run = () => {
    import('./data/DataRegistry')
      .then(({ initializeDataRegistry }) => initializeDataRegistry())
      .catch((error) => {
        console.error('❌ 数据注册中心初始化失败:', error);
      });
  };

  if (typeof window !== 'undefined') {
    const scheduleIdle = () => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(run, { timeout: 15000 });
      } else {
        window.setTimeout(run, 5000);
      }
    };

    if (document.readyState === 'complete') {
      window.setTimeout(scheduleIdle, DATA_REGISTRY_BACKGROUND_WARMUP_DELAY_MS);
    } else {
      window.addEventListener('load', () => window.setTimeout(scheduleIdle, DATA_REGISTRY_BACKGROUND_WARMUP_DELAY_MS), { once: true });
    }
  } else {
    run();
  }
};

/**
 * 函数级注释：应用入口渲染
 * - 使用 ESM 命名导入（createRoot），避免默认导出在生产包中出现空对象的兼容问题
 * - 在 root 容器上挂载 React 严格模式包裹的应用
 */
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

initializeDataRegistryAfterPaint();

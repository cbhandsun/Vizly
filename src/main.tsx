// src/main.tsx

import * as React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css'; // Tailwind CSS
import './main.css'; // 保留您项目全局的基础CSS
// 导入console清理工具，在生产环境中自动清理console输出
import { initDevConsoleFilters } from '@/core';
import { performanceMonitor } from '@/core';
// 导入全局错误处理
import { initGlobalErrorHandling } from '@/core';

// 初始化开发环境日志过滤器（屏蔽非关键的网络噪音）
initDevConsoleFilters();

// Initialize i18n
import './i18n';

// 导入数据注册中心和测试工具
import { initializeDataRegistry } from './data/DataRegistry';

// 显式注册所有布局策略
import { LayoutStrategyManager } from '@/core';
import { GridLayoutStrategy } from '@/core';
import { HorizontalLayoutStrategy } from '@/core';
import { VerticalLayoutStrategy } from '@/core';
import { CenteredLayoutStrategy } from '@/core';
import { DagreLayoutStrategy } from '@/core';
import { DomainVerticalLayoutStrategy } from '@/core';
// 已统一：移除 DomainStacked 与 DomainMinimal，保留统一的 DomainVertical

/**
 * 初始化并注册所有布局策略到全局的 LayoutStrategyManager 实例。
 * 说明：
 * - 使用统一的别名导入（`@/strategies/LayoutStrategyManager`），避免因相对路径与别名混用导致多实例问题。
 * - 在应用启动时显式注册策略，确保组件切换布局时能正确获取对应策略。
 */
function initializeLayoutStrategies(): void {
  const layoutStrategyManager = LayoutStrategyManager.getShared();

  layoutStrategyManager.register(new GridLayoutStrategy());
  layoutStrategyManager.register(new HorizontalLayoutStrategy());
  layoutStrategyManager.register(new VerticalLayoutStrategy());
  layoutStrategyManager.register(new CenteredLayoutStrategy());
  layoutStrategyManager.register(new DagreLayoutStrategy());
  layoutStrategyManager.register(new DomainVerticalLayoutStrategy());

}

initializeLayoutStrategies();

// 初始化全局错误处理
initGlobalErrorHandling();

// 初始化性能监控
if (process.env.NODE_ENV === 'production') {
  performanceMonitor.setEnabled(true);
} else {
  // 开发环境也启用，但会有更详细的日志
  performanceMonitor.setEnabled(true);
}

// 初始化数据注册中心
initializeDataRegistry().then(() => {

}).catch((error) => {
  console.error('❌ 数据注册中心初始化失败:', error);
});

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

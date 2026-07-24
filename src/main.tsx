// src/main.tsx

import * as React from 'react';
import { createRoot } from 'react-dom/client';

import './main/configureCoreRuntimes';
import './main/configureAuthRuntime';
import { initializeApplicationRuntime } from './main/bootstrapApplication';
import App from './App';
import './index.css'; // Tailwind CSS
import './main.css'; // 保留您项目全局的基础CSS

// Initialize i18n
import './i18n';

initializeApplicationRuntime();

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

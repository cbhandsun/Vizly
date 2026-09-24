import i18n from '@/i18n';

const enDebug = {
  panel: {
    title: 'Canvas Routing Session',
    close: 'Close',
    toggleHint: 'Toggle with {{shortcut}}',
  },
};

const zhDebug = {
  panel: {
    title: '画布路由会话',
    close: '关闭',
    toggleHint: '使用 {{shortcut}} 开关调试面板',
  },
};

export const registerRoutingDebugTranslations = (): void => {
  i18n.addResourceBundle('en', 'translation', { designer: { debug: enDebug } }, true, true);
  i18n.addResourceBundle('zh', 'translation', { designer: { debug: zhDebug } }, true, true);
};

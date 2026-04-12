/**
 * AntdApiBridge 组件
 * 
 * 在 Ant Design <App> 组件内部挂载，利用 App.useApp() 获取上下文感知的
 * message/modal/notification 实例，并注册到全局桥接模块中。
 * 
 * 必须作为 <AntdApp> 的子组件使用。
 */

import React, { useEffect } from 'react';
import { App } from 'antd';
import { registerAntdApi } from '../../utils/antdStaticBridge';

export const AntdApiBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { message, modal, notification } = App.useApp();

  useEffect(() => {
    registerAntdApi(message, modal, notification);
  }, [message, modal, notification]);

  return <>{children}</>;
};

export default AntdApiBridge;

/**
 * Ant Design 静态 API 桥接模块
 * 
 * 解决 `message.success()`、`Modal.confirm()` 等静态调用丢失上下文的问题。
 * 
 * 原理：
 * - Ant Design v5+ 的静态方法（如 `message.success`、`Modal.confirm`）无法消费 React 上下文，
 *   导致主题不生效、回调可能失效。
 * - 本模块通过 `AntdApiBridge` 组件在 `<AntdApp>` 内部调用 `App.useApp()`，
 *   捕获上下文感知的 API 实例，并导出为模块级的可直接调用对象。
 * 
 * 使用方式：
 * ```ts
 * // 替换: import { message, Modal, notification } from 'antd';
 * import { appMessage, appModal, appNotification } from './antdStaticBridge';
 * 
 * // 然后直接使用：
 * appMessage.success('操作成功');
 * appModal.confirm({ title: '确认', content: '...' });
 * ```
 */

import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import type { NotificationInstance } from 'antd/es/notification/interface';

// 模块级存储，在 Bridge 组件挂载后填充
let _message: MessageInstance | null = null;
let _modal: Omit<ModalStaticFunctions, 'warn'> | null = null;
let _notification: NotificationInstance | null = null;

/**
 * 注册上下文感知的 API 实例。
 * 由 AntdApiBridge 组件在首次渲染时调用。
 */
export function registerAntdApi(
  msg: MessageInstance,
  mdl: Omit<ModalStaticFunctions, 'warn'>,
  ntf: NotificationInstance
): void {
  _message = msg;
  _modal = mdl;
  _notification = ntf;
}

// ── Proxy 导出 ──────────────────────────────────────────────
// 使用 Proxy 确保即使在 Bridge 尚未挂载时调用也不会崩溃（降级为 console.warn）

const createFallback = (name: string) => (...args: unknown[]) => {
  console.warn(`[antdStaticBridge] ${name} 尚未初始化，调用被忽略。参数:`, args);
};

/**
 * 上下文感知的 message API
 * 替代 `import { message } from 'antd'`
 */
export const appMessage = new Proxy({} as MessageInstance, {
  get(_target, prop: string) {
    if (_message && prop in _message) {
      return (_message as unknown as Record<string, unknown>)[prop];
    }
    return createFallback(`message.${prop}`);
  }
});

/**
 * 上下文感知的 modal API
 * 替代 `Modal.confirm()` / `Modal.info()` 等静态调用
 */
export const appModal = new Proxy({} as Omit<ModalStaticFunctions, 'warn'>, {
  get(_target, prop: string) {
    if (_modal && prop in _modal) {
      return (_modal as unknown as Record<string, unknown>)[prop];
    }
    return createFallback(`modal.${prop}`);
  }
});

/**
 * 上下文感知的 notification API
 * 替代 `import { notification } from 'antd'`
 */
export const appNotification = new Proxy({} as NotificationInstance, {
  get(_target, prop: string) {
    if (_notification && prop in _notification) {
      return (_notification as unknown as Record<string, unknown>)[prop];
    }
    return createFallback(`notification.${prop}`);
  }
});

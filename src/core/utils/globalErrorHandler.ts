/**
 * 全局错误处理初始化
 * 捕获未处理的Promise拒绝和全局错误
 */

import { safeLog } from './consoleCleanup';
import { errorLogger } from './errorLogger';
import { redactSensitiveLogValue } from './logSecurity';

const notifyDevelopmentError = async (message: string): Promise<void> => {
    if (process.env.NODE_ENV !== 'development') return;

    try {
        const { errorNotification } = await import('./errorNotification');
        errorNotification.toast(message);
    } catch (error) {
        safeLog.warn('Failed to show development error notification:', redactSensitiveLogValue(error));
    }
};

let activeCleanup: (() => void) | undefined;

/**
 * 初始化全局错误处理。重复调用不会注册重复监听器。
 */
export function initGlobalErrorHandling(): () => void {
    if (activeCleanup) return activeCleanup;

    // 捕获未处理的Promise拒绝
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const error = event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));

        const message = error.message || '';
        // Ignore benign errors
        if (
            message.includes('ResizeObserver loop limit exceeded') ||
            message.includes('ResizeObserver loop completed with undelivered notifications') ||
            message.includes('signal is aborted without reason') ||
            message.includes('AbortError')
        ) {
            event.preventDefault(); // <-- 防止浏览器原生抛出红字 Uncaught (in promise)
            return;
        }

        safeLog.error('Unhandled promise rejection:', redactSensitiveLogValue(event.reason));

        errorLogger.log(error, {
            level: 'error',
            source: 'unhandledRejection',
        });

        void notifyDevelopmentError(`Promise错误: ${error.message}`);

        // 阻止默认的错误提示
        event.preventDefault();
    };

    // 捕获全局错误
    const handleGlobalError = (event: ErrorEvent) => {
        // 1. 过滤资源加载错误（如 img, script, link 加载失败）
        // 这些错误 event.target 是具体的 DOM 元素，而不是 window
        if (event.target !== window) {
            return;
        }

        // 2. 过滤 WebSocket 或其他非 ErrorEvent 的通用事件噪音
        // WebSocket 的 error 事件通常只是一个通用的 Event 对象，没有具体的 invalid message
        if (!(event instanceof ErrorEvent)) {
            // 可选：如果是开发环境，可以低调输出一下，或者直接忽略
            return;
        }

        // 3. 过滤 Worker 抛出的通用 Event 错误对象
        // 当 Worker 内部通过 throw new Event('error') 或者通过 postMessage 传递非 Error 对象导致的错误
        if (event.error && (event.error instanceof Event || (typeof event.error === 'object' && event.error.type === 'error' && event.error.target))) {
            if (process.env.NODE_ENV === 'development') {
                safeLog.warn('Suppressed generic Worker error:', redactSensitiveLogValue(event.error));
            }
            return;
        }

        const error = event.error instanceof Error
            ? event.error
            : new Error(event.message || 'Unknown global error');

        const message = error.message || '';
        // Ignore benign errors
        if (
            message.includes('ResizeObserver loop limit exceeded') ||
            message.includes('ResizeObserver loop completed with undelivered notifications') ||
            message.includes('signal is aborted without reason') ||
            message.includes('AbortError')
        ) {
            event.preventDefault();
            return;
        }

        safeLog.error('Global error:', redactSensitiveLogValue(error));

        errorLogger.log(error, {
            level: 'error',
            source: 'globalError',
        });

        void notifyDevelopmentError(`全局错误: ${error.message}`);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);

    // 在开发环境中，提供控制台命令查看错误日志
    if (process.env.NODE_ENV === 'development') {
        (window as unknown as { __errorLogger: typeof errorLogger }).__errorLogger = errorLogger;
        safeLog.info('错误日志工具已挂载到 window.__errorLogger');
        safeLog.info('使用 window.__errorLogger.getLogs() 查看所有错误日志');
        safeLog.info('使用 window.__errorLogger.export() 导出错误日志');
        safeLog.info('使用 window.__errorLogger.clear() 清除错误日志');
    }

    let cleanedUp = false;
    activeCleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        window.removeEventListener('error', handleGlobalError);
        if (
            process.env.NODE_ENV === 'development'
            && (window as unknown as { __errorLogger?: typeof errorLogger }).__errorLogger === errorLogger
        ) {
            delete (window as unknown as { __errorLogger?: typeof errorLogger }).__errorLogger;
        }
        activeCleanup = undefined;
    };

    return activeCleanup;
}

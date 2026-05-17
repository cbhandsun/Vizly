/**
 * 错误通知系统
 * 用户友好的错误提示
 */

import { appMessage, appNotification } from './antdStaticBridge';
import type { ArgsProps as NotificationArgsProps } from 'antd/es/notification';

export interface ErrorNotificationOptions {
    title?: string;
    description?: string;
    duration?: number;
    placement?: NotificationArgsProps['placement'];
}

class ErrorNotification {
    /**
     * 简短的Toast提示
     */
    toast(msg: string, duration: number = 3) {
        appMessage.error({
            content: msg,
            duration,
        });
    }

    /**
     * 成功提示
     */
    success(msg: string, duration: number = 3) {
        appMessage.success({
            content: msg,
            duration,
        });
    }

    /**
     * 警告提示
     */
    warning(msg: string, duration: number = 3) {
        appMessage.warning({
            content: msg,
            duration,
        });
    }

    /**
     * 详细的错误通知
     */
    notify(options: ErrorNotificationOptions) {
        appNotification.error({
            message: options.title || '错误',
            description: options.description,
            duration: options.duration || 5,
            placement: options.placement || 'topRight',
        });
    }

    /**
     * 网络错误
     */
    networkError(customMessage?: string) {
        this.toast(customMessage || '网络连接失败，请检查网络设置');
    }

    /**
     * 服务器错误
     */
    serverError(customMessage?: string) {
        this.toast(customMessage || '服务器错误，请稍后重试');
    }

    /**
     * 权限错误
     */
    permissionError(customMessage?: string) {
        this.notify({
            title: '权限不足',
            description: customMessage || '您没有执行此操作的权限',
        });
    }

    /**
     * 数据验证错误
     */
    validationError(fields: string[], customMessage?: string) {
        this.notify({
            title: '数据验证失败',
            description: customMessage || `以下字段验证失败: ${fields.join(', ')}`,
        });
    }

    /**
     * 未知错误
     */
    unknownError() {
        this.toast('发生未知错误，请稍后重试');
    }

    /**
     * 操作超时
     */
    timeoutError(customMessage?: string) {
        this.toast(customMessage || '操作超时，请重试');
    }

    /**
     * 文件上传错误
     */
    uploadError(filename?: string) {
        const msg = filename
            ? `文件 "${filename}" 上传失败`
            : '文件上传失败';
        this.toast(msg);
    }

    /**
     * 数据加载错误
     */
    loadError(resource?: string) {
        const msg = resource
            ? `${resource}加载失败`
            : '数据加载失败';
        this.toast(msg);
    }

    /**
     * 保存失败
     */
    saveError(customMessage?: string) {
        this.toast(customMessage || '保存失败，请重试');
    }

    /**
     * 删除失败
     */
    deleteError(customMessage?: string) {
        this.toast(customMessage || '删除失败，请重试');
    }
}

// 单例导出
export const errorNotification = new ErrorNotification();

// 便捷导出
export const {
    toast,
    success,
    warning,
    notify,
    networkError,
    serverError,
    permissionError,
    validationError,
    unknownError,
    timeoutError,
    uploadError,
    loadError,
    saveError,
    deleteError,
} = errorNotification;

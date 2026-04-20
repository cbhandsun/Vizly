/**
 * 错误日志系统
 * 本地存储和管理错误日志
 */

export interface ErrorLog {
    id: string;
    timestamp: number;
    message: string;
    stack?: string;
    componentStack?: string;
    userAgent: string;
    url: string;
    userId?: string;
    level: 'error' | 'warning' | 'info';
    source?: string;
}

class ErrorLogger {
    private logs: ErrorLog[] = [];
    private readonly maxLogs = 50;
    private readonly storageKey = 'app_error_logs';

    constructor() {
        this.loadFromStorage();
    }

    /**
     * 记录错误日志
     */
    log(error: Error | string, options?: {
        level?: ErrorLog['level'];
        source?: string;
        componentStack?: string;
    }) {
        const message = typeof error === 'string' ? error : error.message;

        // Ignore benign errors
        if (
            message.includes('ResizeObserver loop completed with undelivered notifications') ||
            message.includes('signal is aborted without reason') ||
            message.includes('AbortError') ||
            message.includes('Lock broken by another request')  // Web Locks steal — benign during tab switching
        ) {
            return 'ignored';
        }

        const errorLog: ErrorLog = {
            id: this.generateId(),
            timestamp: Date.now(),
            message,
            stack: typeof error === 'object' ? error.stack : undefined,
            componentStack: options?.componentStack,
            userAgent: navigator.userAgent,
            url: window.location.href,
            level: options?.level || 'error',
            source: options?.source,
        };

        this.logs.push(errorLog);

        // 保持最近maxLogs条
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // 持久化到localStorage
        this.persist();

        // 在开发环境打印
        if (process.env.NODE_ENV === 'development') {
            console.error('[ErrorLogger]', errorLog);
        }

        return errorLog.id;
    }

    /**
     * 获取所有日志
     */
    getLogs(filter?: {
        level?: ErrorLog['level'];
        since?: number;
        limit?: number;
    }): ErrorLog[] {
        let filtered = [...this.logs];

        if (filter?.level) {
            filtered = filtered.filter(log => log.level === filter.level);
        }

        if (filter?.since) {
            filtered = filtered.filter(log => log.timestamp >= filter.since!);
        }

        if (filter?.limit) {
            filtered = filtered.slice(-filter.limit);
        }

        return filtered;
    }

    /**
     * 获取最近的错误
     */
    getRecent(count: number = 10): ErrorLog[] {
        return this.logs.slice(-count);
    }

    /**
     * 清除所有日志
     */
    clear() {
        this.logs = [];
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            console.warn('Failed to clear error logs from localStorage');
        }
    }

    /**
     * 导出日志（用于调试）
     */
    export(): string {
        return JSON.stringify(this.logs, null, 2);
    }

    /**
     * 从localStorage加载日志
     */
    private loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.logs = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load error logs from localStorage');
        }
    }

    /**
     * 持久化到localStorage
     */
    private persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (e) {
            console.warn('Failed to persist error logs to localStorage');
        }
    }

    /**
     * 生成唯一ID
     */
    private generateId(): string {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// 单例导出
export const errorLogger = new ErrorLogger();

// 便捷函数
export const logError = (error: Error | string, source?: string) => {
    return errorLogger.log(error, { level: 'error', source });
};

export const logWarning = (message: string, source?: string) => {
    return errorLogger.log(message, { level: 'warning', source });
};

export const logInfo = (message: string, source?: string) => {
    return errorLogger.log(message, { level: 'info', source });
};

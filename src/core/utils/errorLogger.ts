/**
 * 错误日志系统
 * 本地存储和管理错误日志
 */

import { redactSensitiveLogValue, sanitizeUrlForLog } from './logSecurity';
import { safeLog } from './consoleCleanup';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

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

const MAX_ERROR_LOGS = 50;
const MAX_ERROR_LOG_STRING_LENGTH = 4000;
const MAX_ERROR_LOG_ID_LENGTH = 120;
const MAX_ERROR_LOGS_JSON_LENGTH = 2 * 1024 * 1024;

const ERROR_LOG_LEVELS = new Set<ErrorLog['level']>(['error', 'warning', 'info']);

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return !!value && typeof value === 'object' && !Array.isArray(value);
};

const cleanString = (value: unknown, maxLength: number, fallback = ''): string => {
    return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
};

const cleanOptionalString = (value: unknown, maxLength: number): string | undefined => {
    const cleaned = cleanString(value, maxLength);
    return cleaned ? cleaned : undefined;
};

const cleanTimestamp = (value: unknown): number => {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now();
};

const cleanErrorLog = (value: unknown): ErrorLog | null => {
    if (!isRecord(value)) return null;

    const id = cleanString(value.id, MAX_ERROR_LOG_ID_LENGTH);
    const message = cleanString(value.message, MAX_ERROR_LOG_STRING_LENGTH);
    if (!id || !message) return null;

    const level = ERROR_LOG_LEVELS.has(value.level as ErrorLog['level'])
        ? value.level as ErrorLog['level']
        : 'error';

    const redacted = redactSensitiveLogValue({
        id,
        timestamp: cleanTimestamp(value.timestamp),
        message,
        stack: cleanOptionalString(value.stack, MAX_ERROR_LOG_STRING_LENGTH),
        componentStack: cleanOptionalString(value.componentStack, MAX_ERROR_LOG_STRING_LENGTH),
        userAgent: cleanString(value.userAgent, MAX_ERROR_LOG_STRING_LENGTH),
        url: sanitizeUrlForLog(cleanString(value.url, MAX_ERROR_LOG_STRING_LENGTH)),
        userId: cleanOptionalString(value.userId, MAX_ERROR_LOG_ID_LENGTH),
        level,
        source: cleanOptionalString(value.source, MAX_ERROR_LOG_ID_LENGTH),
    }) as ErrorLog;

    return {
        ...redacted,
        id: cleanString(redacted.id, MAX_ERROR_LOG_ID_LENGTH),
        message: cleanString(redacted.message, MAX_ERROR_LOG_STRING_LENGTH),
        stack: cleanOptionalString(redacted.stack, MAX_ERROR_LOG_STRING_LENGTH),
        componentStack: cleanOptionalString(redacted.componentStack, MAX_ERROR_LOG_STRING_LENGTH),
        userAgent: cleanString(redacted.userAgent, MAX_ERROR_LOG_STRING_LENGTH),
        url: sanitizeUrlForLog(cleanString(redacted.url, MAX_ERROR_LOG_STRING_LENGTH)),
        userId: cleanOptionalString(redacted.userId, MAX_ERROR_LOG_ID_LENGTH),
        source: cleanOptionalString(redacted.source, MAX_ERROR_LOG_ID_LENGTH),
    };
};

export const coerceErrorLogs = (value: unknown, maxLogs: number = MAX_ERROR_LOGS): ErrorLog[] => {
    if (!Array.isArray(value)) return [];
    const limit = Math.max(0, Math.min(maxLogs, MAX_ERROR_LOGS));
    return value
        .slice(-limit)
        .map(cleanErrorLog)
        .filter((log): log is ErrorLog => log !== null);
};

class ErrorLogger {
    private logs: ErrorLog[] = [];
    private readonly maxLogs = MAX_ERROR_LOGS;
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

        const errorLog = redactSensitiveLogValue({
            id: this.generateId(),
            timestamp: Date.now(),
            message,
            stack: typeof error === 'object' ? error.stack : undefined,
            componentStack: options?.componentStack,
            userAgent: navigator.userAgent,
            url: sanitizeUrlForLog(window.location.href),
            level: options?.level || 'error',
            source: options?.source,
        }) as ErrorLog;

        this.logs.push(errorLog);

        // 保持最近maxLogs条
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // 持久化到localStorage
        this.persist();

        // 在开发环境打印
        if (process.env.NODE_ENV === 'development') {
            safeLog.error('[ErrorLogger]', errorLog);
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
        } catch (error) {
            logUiStorageWriteFailure('ErrorLogger.clear', this.storageKey, error);
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
                if (stored.length > MAX_ERROR_LOGS_JSON_LENGTH) {
                    this.logs = [];
                    return;
                }
                this.logs = coerceErrorLogs(JSON.parse(stored), this.maxLogs);
            }
        } catch (error) {
            logUiStorageReadFailure('ErrorLogger.loadFromStorage', this.storageKey, error);
            this.logs = [];
        }
    }

    /**
     * 持久化到localStorage
     */
    private persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (error) {
            logUiStorageWriteFailure('ErrorLogger.persist', this.storageKey, error);
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

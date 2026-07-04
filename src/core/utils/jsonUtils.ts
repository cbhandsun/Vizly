/**
 * jsonUtils.ts — 安全 JSON 解析工具
 *
 * 标准库 JSON.parse 在输入损坏时会直接 throw，导致整个调用栈崩溃。
 * 本模块提供带有类型守卫的安全解析函数，作为全局统一模式。
 *
 * 使用场景：所有读取 localStorage / sessionStorage / 网络响应的 JSON.parse 调用。
 */
import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

type SafeJsonParseWithLimitOptions = {
    maxLength?: number;
    onFailure?: (error: unknown) => void;
    buildOversizeError?: () => Error;
};

/**
 * 安全解析 JSON 字符串为任意类型。
 * @param raw    原始字符串（可能为 null / undefined / 损坏数据）
 * @param fallback  解析失败时返回的默认值
 * @returns 解析结果或 fallback
 *
 * @example
 * const nodes = safeJsonParse<Node[]>(localStorage.getItem('nodes'), []);
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        return parsed as T;
    } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            safeLog.warn('[safeJsonParse] Failed to parse JSON, returning fallback.', redactSensitiveLogValue(e));
        }
        return fallback;
    }
}

export function safeJsonParseWithLimit<T>(
    raw: string | null | undefined,
    fallback: T,
    options: SafeJsonParseWithLimitOptions = {}
): T {
    if (!raw) return fallback;

    const { maxLength, onFailure, buildOversizeError } = options;
    if (typeof maxLength === 'number' && maxLength > 0 && raw.length > maxLength) {
        const error = buildOversizeError?.() ?? new Error('JSON payload is too large.');
        if (onFailure) {
            onFailure(error);
        } else if (process.env.NODE_ENV !== 'production') {
            safeLog.warn('[safeJsonParseWithLimit] JSON exceeded max length, returning fallback.', redactSensitiveLogValue(error));
        }
        return fallback;
    }

    try {
        return JSON.parse(raw) as T;
    } catch (error) {
        if (onFailure) {
            onFailure(error);
        } else if (process.env.NODE_ENV !== 'production') {
            safeLog.warn('[safeJsonParseWithLimit] Failed to parse JSON, returning fallback.', redactSensitiveLogValue(error));
        }
        return fallback;
    }
}

/**
 * 安全解析 JSON 字符串，期望结果为数组。
 * 额外校验解析结果是否为 Array，防止非数组数据导致后续 .map/.filter 崩溃。
 *
 * @example
 * const items = safeJsonParseArray<Item>(localStorage.getItem('items'));
 */
export function safeJsonParseArray<T>(raw: string | null | undefined): T[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as T[];
        safeLog.warn('[safeJsonParseArray] Expected Array but got:', typeof parsed);
        return [];
    } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            safeLog.warn('[safeJsonParseArray] Failed to parse JSON, returning [].', redactSensitiveLogValue(e));
        }
        return [];
    }
}

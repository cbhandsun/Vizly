/**
 * jsonUtils.ts — 安全 JSON 解析工具
 *
 * 标准库 JSON.parse 在输入损坏时会直接 throw，导致整个调用栈崩溃。
 * 本模块提供带有类型守卫的安全解析函数，作为全局统一模式。
 *
 * 使用场景：所有读取 localStorage / sessionStorage / 网络响应的 JSON.parse 调用。
 */

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
            console.warn('[safeJsonParse] Failed to parse JSON, returning fallback.', e);
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
        console.warn('[safeJsonParseArray] Expected Array but got:', typeof parsed);
        return [];
    } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[safeJsonParseArray] Failed to parse JSON, returning [].', e);
        }
        return [];
    }
}

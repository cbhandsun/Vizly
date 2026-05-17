/**
 * Handle Direction Utilities
 *
 * [OPT-P2⑦] 统一提取自 EdgeRouter.ts 中三处散落的重复实现：
 *   - expandHandle (内联)
 *   - normalizeHandle (内联)
 *   - normH / normV (C 形修复块内联)
 *
 * 所有路由模块统一从此处导入，避免逻辑漂移。
 *
 * [CLEANUP] parseHandlePosition: canonical handle ID → Position 解析器。
 *   替代 useSmartEdgeContext 和 calcHandlePos 中的内联重复实现。
 */

import { Position } from '@xyflow/react';

/**
 * Canonical Handle ID → Position parser.
 *
 * 解析优先级：exact match → substring includes。
 * 解决了 compound ID（如 't-right'）被 startsWith('t') 误判为 Top 的问题。
 *
 * 这是整个代码库中唯一的 handleId→Position 解析函数，
 * 其他文件应全部导入此函数，不要内联实现。
 */
export function parseHandlePosition(handleId?: string | null): Position | undefined {
    if (!handleId) return undefined;
    const s = handleId.toLowerCase();
    // Priority 1: exact match
    if (s === 'top' || s === 't') return Position.Top;
    if (s === 'bottom' || s === 'b') return Position.Bottom;
    if (s === 'left' || s === 'l') return Position.Left;
    if (s === 'right' || s === 'r') return Position.Right;
    // Priority 2: substring includes (catches 'source-right', 't-right', 'col-0-left', etc.)
    if (s.includes('right')) return Position.Right;
    if (s.includes('left')) return Position.Left;
    if (s.includes('bottom')) return Position.Bottom;
    if (s.includes('top')) return Position.Top;
    return undefined;
}

/** 将简写 (r/l/t/b) 展开为 React Flow Handle 全称 */
export function expandHandle(h: string): string {
    const s = String(h).toLowerCase();
    if (s === 'r') return 'right';
    if (s === 'l') return 'left';
    if (s === 't') return 'top';
    if (s === 'b') return 'bottom';
    // 已经是全称或自定义 ID，原样返回
    return h;
}

/** 将全称或变体归一化为内部简写 (l/r/t/b) */
export function normalizeHandle(h?: string | null): 'l' | 'r' | 't' | 'b' | undefined {
    if (!h) return undefined;
    const s = String(h).toLowerCase();
    // Priority 1: exact single-char match
    if (s === 'l' || s === 'left')   return 'l';
    if (s === 'r' || s === 'right')  return 'r';
    if (s === 't' || s === 'top')    return 't';
    if (s === 'b' || s === 'bottom') return 'b';
    // Priority 2: substring match (handles compound IDs like 'source-right', 'col-0-left')
    if (s.includes('left'))   return 'l';
    if (s.includes('right'))  return 'r';
    if (s.includes('top'))    return 't';
    if (s.includes('bottom')) return 'b';
    // Priority 3: single-char prefix (only for shorthand like 'l', 'r', 't', 'b')
    // NOTE: This is now safe because compound IDs like 't-right' are caught above by includes('right')
    if (s.length === 1) {
        if (s === 'l') return 'l';
        if (s === 'r') return 'r';
        if (s === 't') return 't';
        if (s === 'b') return 'b';
    }
    return undefined;
}

/** 判断 handle 是否为水平方向 (left / right) */
export function isHorizontalHandle(h: string): boolean {
    const s = h.toLowerCase();
    return s === 'r' || s === 'right' || s === 'l' || s === 'left';
}

/** 判断 handle 是否为垂直方向 (top / bottom) */
export function isVerticalHandle(h: string): boolean {
    const s = h.toLowerCase();
    return s === 't' || s === 'top' || s === 'b' || s === 'bottom';
}

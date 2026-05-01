/**
 * Handle Direction Utilities
 *
 * [OPT-P2⑦] 统一提取自 EdgeRouter.ts 中三处散落的重复实现：
 *   - expandHandle (内联)
 *   - normalizeHandle (内联)
 *   - normH / normV (C 形修复块内联)
 *
 * 所有路由模块统一从此处导入，避免逻辑漂移。
 */

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
    if (s === 'l' || s.startsWith('l') || s.includes('left'))   return 'l';
    if (s === 'r' || s.startsWith('r') || s.includes('right'))  return 'r';
    if (s === 't' || s.startsWith('t') || s.includes('top'))    return 't';
    if (s === 'b' || s.startsWith('b') || s.includes('bottom')) return 'b';
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

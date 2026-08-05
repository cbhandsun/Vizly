/**
 * useFloatingPosition.ts — 浮动工具栏智能定位 Hook
 *
 * 统一三种定位策略：
 *   1. 节点选中 → 世界坐标 bounds → 屏幕坐标
 *   2. 边选中 → 源/目标中点 → 屏幕坐标
 *   3. DOM 元素 → getBoundingClientRect → 屏幕坐标
 *
 * 核心逻辑：
 *   - 自动判断上方/下方放置（避免遮挡顶部 UI）
 *   - 水平边界溢出防护
 *   - 拖拽/连接时自动隐藏
 */
import { useMemo } from 'react';
import { useViewport, useStore } from '@xyflow/react';

// ─── 类型定义 ────────────────────────────────────────────────────────────────
export interface WorldBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface UseFloatingPositionConfig {
    /** 世界坐标中的目标区域 */
    worldBounds: WorldBounds | null;
    /** 首选方向：auto 会根据屏幕位置自动选择 */
    placement?: 'top' | 'bottom' | 'auto';
    /** 工具栏与目标的间距 (px) */
    offset?: number;
    /** 顶部安全区高度（用于判断是否该放到下方） */
    topSafeZone?: number;
    /** 移动端左侧常驻控件占用的安全区宽度 */
    mobileLeftInset?: number;
    /** 隐藏条件（拖拽中、连接中等） */
    hidden?: boolean;
}

export interface FloatingPositionResult {
    /** 应用到容器的 CSS style */
    style: React.CSSProperties;
    /** 是否应该渲染 */
    visible: boolean;
    /** 实际放置方向 */
    actualPlacement: 'top' | 'bottom';
}

export const resolveFloatingToolbarHorizontalPosition = ({
    screenCenterX,
    viewportWidth,
    mobileLeftInset = 0,
}: {
    screenCenterX: number;
    viewportWidth: number;
    mobileLeftInset?: number;
}): number | string => {
    const toolbarEdgeAllowance = 176;
    if (viewportWidth <= 768) {
        if (mobileLeftInset === 0) {
            const maximumCenter = viewportWidth - toolbarEdgeAllowance;
            if (maximumCenter < toolbarEdgeAllowance) return viewportWidth / 2;
            return Math.min(
                maximumCenter,
                Math.max(toolbarEdgeAllowance, screenCenterX),
            );
        }
        const viewportGutter = 16;
        const availableWidth = Math.max(
            0,
            viewportWidth - mobileLeftInset - viewportGutter * 2,
        );
        const effectiveHalfWidth = Math.min(toolbarEdgeAllowance, availableWidth / 2);
        const minimumCenter = mobileLeftInset + viewportGutter + effectiveHalfWidth;
        const maximumCenter = viewportWidth - viewportGutter - effectiveHalfWidth;
        return Math.min(
            maximumCenter,
            Math.max(minimumCenter, screenCenterX),
        );
    }
    return `clamp(calc(var(--left-sidebar-offset, 0px) + ${toolbarEdgeAllowance}px), ${screenCenterX}px, calc(100vw - var(--right-sidebar-offset, 340px) - ${toolbarEdgeAllowance}px))`;
};

// ─── 从 ReactFlow Store 计算选中节点的 bounds ─────────────────────────────────
export function useSelectedNodeBounds(selectedNodeIds: string[]): WorldBounds | null {
    return useStore(s => {
        if (selectedNodeIds.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of selectedNodeIds) {
            const n = s.nodeLookup.get(id);
            if (!n) continue;
            const abs = n.internals.positionAbsolute || n.position;
            const x = abs?.x ?? 0;
            const y = abs?.y ?? 0;
            const w = n.measured?.width ?? n.width ?? 0;
            const h = n.measured?.height ?? n.height ?? 0;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + (typeof w === 'number' ? w : 0));
            maxY = Math.max(maxY, y + (typeof h === 'number' ? h : 0));
        }

        if (minX === Infinity) return null;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    });
}

// ─── 判断是否在拖拽中 ────────────────────────────────────────────────────────
type DragStateNode = { dragging?: boolean };

export const hasDraggingNode = (
    nodes: readonly DragStateNode[],
    nodeLookup?: Map<string, DragStateNode>,
): boolean => {
    if (nodeLookup) {
        for (const node of nodeLookup.values()) {
            if (node.dragging) return true;
        }
    }
    return nodes.some(node => node.dragging);
};

export function useNodesDragging(): boolean {
    return useStore(s => hasDraggingNode(s.nodes, s.nodeLookup));
}

// ─── 核心定位 Hook ───────────────────────────────────────────────────────────
export function useFloatingPosition({
    worldBounds,
    placement = 'auto',
    offset = 20,
    topSafeZone = 140,
    mobileLeftInset = 0,
    hidden = false,
}: UseFloatingPositionConfig): FloatingPositionResult {
    const { x: vX, y: vY, zoom } = useViewport();

    return useMemo(() => {
        if (!worldBounds || hidden) {
            return {
                style: {},
                visible: false,
                actualPlacement: 'top' as const,
            };
        }

        // 世界坐标 → 屏幕坐标
        const screenCenterX = (worldBounds.x + worldBounds.width / 2) * zoom + vX;
        const screenTopY = worldBounds.y * zoom + vY;
        const screenBottomY = (worldBounds.y + worldBounds.height) * zoom + vY;

        // 自动方向判断
        let actualPlacement: 'top' | 'bottom';
        if (placement === 'auto') {
            actualPlacement = screenTopY < topSafeZone ? 'bottom' : 'top';
        } else {
            actualPlacement = placement;
        }

        const placeBelow = actualPlacement === 'bottom';

        // 响应式水平限位：避免工具栏溢出屏幕或被左右侧面板遮挡
        const safeX = resolveFloatingToolbarHorizontalPosition({
            screenCenterX,
            viewportWidth: window.innerWidth,
            mobileLeftInset,
        });

        const style: React.CSSProperties = {
            left: safeX,
            top: placeBelow
                ? screenBottomY + offset
                : screenTopY - offset,
            transform: `translate(-50%, ${placeBelow ? '0%' : '-100%'})`,
            transformOrigin: placeBelow ? 'top center' : 'bottom center',
        };

        return {
            style,
            visible: true,
            actualPlacement,
        };
    }, [worldBounds, vX, vY, zoom, placement, offset, topSafeZone, mobileLeftInset, hidden]);
}

// ─── 边中点定位变体 ──────────────────────────────────────────────────────────
export interface UseEdgeMidpointConfig {
    sourcePos: { x: number; y: number; width: number; height: number } | null;
    targetPos: { x: number; y: number; width: number; height: number } | null;
    hidden?: boolean;
}

export function useEdgeMidpointPosition({
    sourcePos,
    targetPos,
    hidden = false,
}: UseEdgeMidpointConfig): FloatingPositionResult {
    const { x: vX, y: vY, zoom } = useViewport();

    return useMemo(() => {
        if (!sourcePos || !targetPos || hidden) {
            return { style: {}, visible: false, actualPlacement: 'top' as const };
        }

        const sx = sourcePos.x + sourcePos.width / 2;
        const sy = sourcePos.y + sourcePos.height / 2;
        const tx = targetPos.x + targetPos.width / 2;
        const ty = targetPos.y + targetPos.height / 2;

        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;

        const screenX = mx * zoom + vX;
        const screenY = my * zoom + vY;

        return {
            style: {
                left: screenX,
                top: screenY,
                transform: 'translate(-50%, -100%)',
            },
            visible: true,
            actualPlacement: 'top' as const,
        };
    }, [sourcePos, targetPos, vX, vY, zoom, hidden]);
}

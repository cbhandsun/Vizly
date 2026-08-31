import React, { useMemo, useState, useEffect } from 'react';
import type { Theme } from '../../themes/types/ThemeTypes';
import { getThemeManager } from '../../themes/EnhancedThemeManagerRefactored';
import { EdgeThemeContext, EdgeUpdateContext } from './edgeUpdateContextState';
import { logEdgeUpdateContextFailure } from './edgeUpdateLogging';

export interface Waypoint {
    x: number;
    y: number;
}

export interface EdgeUpdateCallbacks {
    onLabelOffsetChange: (edgeId: string, offset: { x: number; y: number }) => void;
    onLabelStyleChange: (edgeId: string, style: Record<string, unknown>) => void;
    onWaypointsChange: (edgeId: string, waypoints: Waypoint[]) => void;
    onLabelChange: (edgeId: string, label: string) => void;
}

/**
 * 🚀 P3 性能优化：通过 Context 传递边回调，替代 .map() 逐个注入
 *
 * 原来 enhancedEdges 在每次边变化时通过 .map() 创建 N 个新对象，
 * 导致所有边组件的 props 浅比较失败。
 * 现在回调通过 Context 获取，边数组引用保持稳定。
 */
export const EdgeUpdateProvider: React.FC<{
    callbacks: EdgeUpdateCallbacks;
    children: React.ReactNode;
}> = ({ callbacks, children }) => {
    // ⭐ 只在回调引用真正变化时重建 value
    const value = useMemo(() => ({
        onLabelOffsetChange: callbacks.onLabelOffsetChange,
        onLabelStyleChange: callbacks.onLabelStyleChange,
        onWaypointsChange: callbacks.onWaypointsChange,
        onLabelChange: callbacks.onLabelChange,
    }), [
        callbacks.onLabelOffsetChange,
        callbacks.onLabelStyleChange,
        callbacks.onWaypointsChange,
        callbacks.onLabelChange,
    ]);

    // P3: 统一主题订阅 — 一个 Provider 一个 listener
    const [currentTheme, setCurrentTheme] = useState<Theme | null>(() => {
        try {
            const tm = getThemeManager();
            return tm.getCurrentTheme?.() || null;
        } catch (error) {
            logEdgeUpdateContextFailure('getCurrentTheme', error);
            return null;
        }
    });

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        try {
            const tm = getThemeManager();
            unsubscribe = tm.addThemeChangeListener((theme: Theme | null) => {
                setCurrentTheme(theme || null);
            });
        } catch (error) {
            logEdgeUpdateContextFailure('subscribeThemeChange', error);
            unsubscribe = undefined;
        }
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    return (
        <EdgeUpdateContext.Provider value={value}>
            <EdgeThemeContext.Provider value={currentTheme}>
                {children}
            </EdgeThemeContext.Provider>
        </EdgeUpdateContext.Provider>
    );
};

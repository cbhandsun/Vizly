import { useContext } from 'react';
import type { Theme } from '../../themes/types/ThemeTypes';
import type { EdgeUpdateCallbacks } from './EdgeUpdateContext';
import {
    EdgeThemeContext,
    EdgeUpdateContext,
    noopEdgeUpdateCallbacks,
} from './edgeUpdateContextState';

/**
 * 边组件内部使用此 hook 获取回调
 */
export function useEdgeUpdate(): EdgeUpdateCallbacks {
    const ctx = useContext(EdgeUpdateContext);
    return ctx || noopEdgeUpdateCallbacks;
}

/**
 * P3: 边组件使用此 hook 获取当前主题（从 Provider 统一订阅）
 */
export function useEdgeTheme(): Theme | null {
    return useContext(EdgeThemeContext);
}

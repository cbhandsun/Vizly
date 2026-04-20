import React, { useEffect, useRef } from 'react';
import { useTheme } from './useCoreTheme';
import { themeToCSSVariables, applyCSSVariables, removeCSSVariables } from './ThemeUtils';
import './TactileFeedback.css';

export interface DiagramThemeProviderProps {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 核心图表全局属性主题解析提供者 (Design Token Provider)
 *
 * 这将作为顶级引擎连接器，将 EnhancedThemeManager 中的 JSON ThemeToken，
 * 动态转换为全局 CSS Variables (例如 --theme-primary-main), 
 * 并挂载到内部的一层容器上。让内部的所有的图表UI无需重新渲染即可实现全局一键变色。
 */
export const DiagramThemeProvider: React.FC<DiagramThemeProviderProps> = ({ 
    children, 
    className = "",
    style 
}) => {
    const [theme] = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const prevTokensRef = useRef<Record<string, string> | null>(null);

    useEffect(() => {
        if (!containerRef.current || !theme) return;

        // 1. 生成 Design Tokens 
        const nextTokens = themeToCSSVariables(theme);
        
        // 2. 将当前容器模式(暗/亮) 以 Data Attributes 的形式附加，兼容之前的 data-theme=dark 逻辑
        containerRef.current.setAttribute('data-theme', theme.mode);

        // 3. 特殊扩充兼容性 Token - 将主要的 primary main 映射到通用蓝绿硬编码位置
        const tokensWithCompatibility = {
            ...nextTokens,
            '--node-main': nextTokens['--theme-primary-main'] || '#2196F3',
            '--node-radius': `${theme.borderRadius?.lg || 10}px`,
        };

        // 4. 清理旧变量 (可选，保障不会有残留垃圾变量)
        if (prevTokensRef.current) {
            removeCSSVariables(containerRef.current, prevTokensRef.current);
        }

        // 5. 注入新变量
        applyCSSVariables(containerRef.current, tokensWithCompatibility);
        prevTokensRef.current = tokensWithCompatibility;

    }, [theme]);

    return (
        <div 
            ref={containerRef} 
            className={`diagram-theme-provider-root ${className}`}
            style={{ width: '100%', height: '100%', ...style }}
        >
            {children}
        </div>
    );
};

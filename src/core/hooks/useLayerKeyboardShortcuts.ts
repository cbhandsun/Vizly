import { useEffect } from 'react';
import { MessageInstance } from 'antd/es/message/interface';

export interface KeyboardShortcutsCallbacks {
    // 帮助与系统
    onHelp?: () => void;

    // 图层操作
    onLayerSwitch?: (layerIndex: number, layerName: string) => void;
    onLayerToggleVisibility?: (layerIndex: number, layerName: string, visible: boolean) => void;

    // 对齐操作
    onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;

    // 分布操作
    onDistribute?: (type: 'horizontal' | 'vertical') => void;
}

export interface KeyboardShortcutsOptions {
    enabled?: boolean;
    messageApi?: MessageInstance;
    layers?: Array<{ id: string; name: string; visible: boolean }>;
    canAlign?: boolean;
    canDistribute?: boolean;
    callbacks: KeyboardShortcutsCallbacks;
}

/**
 * 图层与对齐快捷键处理 Hook
 * 
 * @description
 * 从 FlowchartDesigner 提取的图层和对齐相关快捷键逻辑,支持:
 * - 帮助面板 (? / F1)
 * - 图层切换 (Ctrl+1-5)
 * - 图层可见性 (Ctrl+Shift+1-3)
 * - 对齐操作 (Ctrl+Shift+L/C/R/T/M/B)
 * - 分布操作 (Ctrl+Shift+H/V)
 * 
 * @example
 * ```tsx
 * useLayerKeyboardShortcuts({
 *   messageApi,
 *   layers,
 *   canAlign,
 *   canDistribute,
 *   callbacks: {
 *     onHelp: () => setShortcutHelpVisible(true),
 *     onLayerSwitch: (index, name) => {
 *       setActiveLayerId(layers[index].id);
 *     },
 *     onAlign: handleAlign,
 *     onDistribute: handleDistribute,
 *   }
 * });
 * ```
 */
export function useLayerKeyboardShortcuts(options: KeyboardShortcutsOptions) {
    const {
        enabled = true,
        messageApi,
        layers = [],
        canAlign = false,
        canDistribute = false,
        callbacks,
    } = options;

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // 忽略输入框中的按键
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // ============================================================
            // 帮助系统
            // ============================================================

            // ? 或 F1: 显示快捷键帮助
            if (e.key === '?' || e.key === 'F1') {
                callbacks.onHelp?.();
                e.preventDefault();
                return;
            }

            // ============================================================
            // 图层操作
            // ============================================================

            // Ctrl+1/2/3/4/5: 切换图层
            if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '5') {
                const layerIndex = parseInt(e.key) - 1;
                if (layers[layerIndex]) {
                    const layer = layers[layerIndex];
                    callbacks.onLayerSwitch?.(layerIndex, layer.name);
                    messageApi?.success(`已切换到图层: ${layer.name}`);
                    e.preventDefault();
                }
                return;
            }

            // Ctrl+Shift+1/2/3: 切换图层可见性
            if (e.ctrlKey && e.shiftKey && e.key >= '1' && e.key <= '3') {
                const layerIndex = parseInt(e.key) - 1;
                if (layers[layerIndex]) {
                    const layer = layers[layerIndex];
                    callbacks.onLayerToggleVisibility?.(layerIndex, layer.name, layer.visible);
                    messageApi?.info(`图层 "${layer.name}" ${layer.visible ? '隐藏' : '显示'}`);
                    e.preventDefault();
                }
                return;
            }

            // ============================================================
            // 对齐与分布操作 (需要Ctrl+Shift组合)
            // ============================================================

            if (e.ctrlKey && e.shiftKey) {
                // Ctrl+Shift+L: 左对齐
                if (e.key === 'L' && canAlign) {
                    callbacks.onAlign?.('left');
                    messageApi?.success('已左对齐');
                    e.preventDefault();
                    return;
                }

                // Ctrl+Shift+C: 水平居中
                if (e.key === 'C' && canAlign) {
                    callbacks.onAlign?.('center');
                    messageApi?.success('已水平居中');
                    e.preventDefault();
                    return;
                }

                // Ctrl+Shift+R: 右对齐
                if (e.key === 'R' && canAlign) {
                    callbacks.onAlign?.('right');
                    messageApi?.success('已右对齐');
                    e.preventDefault();
                    return;
                }

                // Ctrl+Shift+T: 顶部对齐
                if (e.key === 'T' && canAlign) {
                    callbacks.onAlign?.('top');
                    messageApi?.success('已顶部对齐');
                    e.preventDefault();
                    return;
                }

                // Ctrl+Shift+M: 垂直居中
                if (e.key === 'M' && canAlign) {
                    callbacks.onAlign?.('middle');
                    messageApi?.success('已垂直居中');
                    e.preventDefault();
                    return;
                }

                // Ctrl+Shift+B: 底部对齐
                if (e.key === 'B' && canAlign) {
                    callbacks.onAlign?.('bottom');
                    messageApi?.success('已底部对齐');
                    e.preventDefault();
                    return;
                }

                // Ctrl+Shift+H: 水平分布
                if (e.key === 'H' && canDistribute) {
                    callbacks.onDistribute?.('horizontal');
                    messageApi?.success('已水平分布');
                    e.preventDefault();
                    return;
                }

                // Ctrl+Shift+V: 垂直分布
                if (e.key === 'V' && canDistribute) {
                    callbacks.onDistribute?.('vertical');
                    messageApi?.success('已垂直分布');
                    e.preventDefault();
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        enabled,
        messageApi,
        layers,
        canAlign,
        canDistribute,
        callbacks,
    ]);
}

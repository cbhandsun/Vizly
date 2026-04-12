// @ts-nocheck
/**
 * 增强版风格方案选择器
 * 采用弹出面板设计，支持分类展示、迷你预览和悬停预览功能
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaPalette, FaCheck, FaTimes } from 'react-icons/fa';
import {
    diagramStyleManager,
    useDiagramStylePreset,
    FlowStylePreset,
    StylePresetCategory,
    STYLE_CATEGORIES,
} from '@/core';
import { theme } from 'antd';

export interface EnhancedStyleSwitcherProps {
    size?: 'sm' | 'md';
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 迷你预览渲染器
 * 渲染边线 + 节点示意图
 */
const StylePreviewMini: React.FC<{ preset: FlowStylePreset; size?: 'sm' | 'md' }> = ({
    preset,
    size = 'sm',
}) => {
    const width = size === 'sm' ? 32 : 80;
    const height = size === 'sm' ? 18 : 52;
    const nodeWidth = size === 'sm' ? 10 : 24;
    const nodeHeight = size === 'sm' ? 7 : 16;

    const mainEdge = preset.edges.main;
    const statusEdge = preset.edges.status;
    const nodeStyle = preset.node;

    // 计算节点位置
    const node1 = { x: size === 'sm' ? 4 : 8, y: height / 2 - nodeHeight / 2 };
    const node2 = { x: width - nodeWidth - (size === 'sm' ? 4 : 8), y: height / 2 - nodeHeight / 2 };

    // 获取阴影样式
    const getShadow = (shadow: string) => {
        switch (shadow) {
            case 'soft':
                return '0 1px 2px rgba(0,0,0,0.1)';
            case 'medium':
                return '0 2px 4px rgba(0,0,0,0.15)';
            case 'strong':
                return '0 3px 6px rgba(0,0,0,0.2)';
            default:
                return 'none';
        }
    };

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ borderRadius: 4, background: '#f8f9fa' }}
        >
            {/* 主连线 */}
            <line
                x1={node1.x + nodeWidth}
                y1={height / 2}
                x2={node2.x}
                y2={height / 2}
                stroke={mainEdge.color}
                strokeWidth={Math.min(mainEdge.width, 2.5)}
                markerEnd="url(#arrow-main)"
            />
            {/* 状态连线（虚线，偏移） */}
            <line
                x1={node1.x + nodeWidth}
                y1={height / 2 - (size === 'sm' ? 3 : 6)}
                x2={node2.x}
                y2={height / 2 - (size === 'sm' ? 3 : 6)}
                stroke={statusEdge.color}
                strokeWidth={Math.min(statusEdge.width, size === 'sm' ? 1 : 1.5)}
                strokeDasharray={statusEdge.dash || (size === 'sm' ? '2 1' : '4 2')}
                opacity={0.7}
            />
            {/* 节点1 */}
            <rect
                x={node1.x}
                y={node1.y}
                width={nodeWidth}
                height={nodeHeight}
                rx={Math.min(nodeStyle.radius, 4)}
                fill="#fff"
                stroke={mainEdge.color}
                strokeWidth={Math.min(nodeStyle.borderWidth, 2)}
                style={{ filter: getShadow(nodeStyle.shadow) !== 'none' ? `drop-shadow(${getShadow(nodeStyle.shadow)})` : undefined }}
            />
            {/* 节点2 */}
            <rect
                x={node2.x}
                y={node2.y}
                width={nodeWidth}
                height={nodeHeight}
                rx={Math.min(nodeStyle.radius, 4)}
                fill="#fff"
                stroke={statusEdge.color}
                strokeWidth={Math.min(nodeStyle.borderWidth, 2)}
            />
            {/* 箭头定义 */}
            <defs>
                <marker
                    id="arrow-main"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                >
                    <polygon points="0 0, 6 3, 0 6" fill={mainEdge.color} />
                </marker>
            </defs>
        </svg>
    );
};

/**
 * 预设卡片组件
 */
const PresetCard: React.FC<{
    preset: FlowStylePreset;
    isActive: boolean;
    onClick: () => void;
    onHover?: () => void;
    onLeave?: () => void;
}> = ({ preset, isActive, onClick, onHover, onLeave }) => {
    const { t } = useTranslation();
    return (
        <div
            className={`relative flex flex-col gap-3 p-4 transition-all duration-200 rounded-xl cursor-pointer border ${isActive ? 'bg-white/60 dark:bg-black/40 border-blue-500/50 shadow-md shadow-blue-500/10' : 'bg-white/30 dark:bg-black/20 border-black/5 dark:border-white/5 hover:bg-white/50 dark:hover:bg-black/30'} group`}
            onClick={onClick}
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
            title={preset.description}
        >
            <div className="flex items-center justify-center p-2 rounded-lg bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                <StylePreviewMini preset={preset} size="md" />
            </div>
            <div className="flex flex-col">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t(`style.preset.${preset.name}`)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{preset.description}</div>
            </div>
            {isActive && (
                <div className="absolute top-2 right-2 text-blue-500 p-1 bg-white/80 dark:bg-black/50 rounded-full shadow-sm">
                    <FaCheck size={12} />
                </div>
            )}
        </div>
    );
};

/**
 * 增强版风格方案选择器组件
 */
export const EnhancedStyleSwitcher: React.FC<EnhancedStyleSwitcherProps> = ({
    size = 'md',
    className = '',
    style,
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const currentPreset = useDiagramStylePreset();
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredPreset, setHoveredPreset] = useState<FlowStylePreset | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // 获取所有分类及其预设
    const categories = useMemo(() => {
        return diagramStyleManager.getCategories().map((cat) => ({
            id: cat,
            ...diagramStyleManager.getCategoryMeta(cat),
            presets: diagramStyleManager.getPresetsByCategory(cat),
        }));
    }, []);

    const handlePresetChange = useCallback((preset: FlowStylePreset) => {
        diagramStyleManager.setPreset(preset.name);
        setIsOpen(false);
    }, []);

    // 悬停预览时临时应用样式（可选，暂不实现，仅高亮）
    const handlePresetHover = useCallback((preset: FlowStylePreset) => {
        setHoveredPreset(preset);
    }, []);

    const handlePresetLeave = useCallback(() => {
        setHoveredPreset(null);
    }, []);

    // 点击外部关闭面板
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const fontSize = size === 'sm' ? 13 : 14;
    const padding = size === 'sm' ? '6px 10px' : '8px 12px';

    return (
        <>
            {/* 触发按钮 */}
            <button
                className={`flex items-center gap-2 h-8 px-3 text-sm transition-colors rounded-[8px] bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border border-black/5 dark:border-white/10 hover:bg-white dark:hover:bg-[#2C2C2E]/90 text-gray-700 dark:text-gray-200 shadow-sm shadow-black/5 pointer-events-auto ${className}`}
                onClick={() => setIsOpen(!isOpen)}
                style={style}
            >
                <StylePreviewMini preset={currentPreset} size="sm" />
                <span>{t(`style.preset.${currentPreset.name}`)}</span>
            </button>

            {/* 弹出面板 */}
            {isOpen &&
                createPortal(
                    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsOpen(false)}>
                        <div
                            className="relative flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 pointer-events-auto"
                            ref={panelRef}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* 面板头部 */}
                            <div className="flex-none px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between">
                                <div className="flex items-center gap-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
                                    <FaPalette className="text-blue-500" />
                                    <h2>{t('style.switcher.title')}</h2>
                                </div>
                                <button
                                    className="p-2 text-gray-500 transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-100 cursor-pointer"
                                    onClick={() => setIsOpen(false)}
                                    title="Close"
                                >
                                    <FaTimes />
                                </button>
                            </div>

                            {/* 内容区 */}
                            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 flex flex-col gap-6">
                                {categories.map((category) => (
                                    <div key={category.id} className="flex flex-col gap-3">
                                        <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">{t(`style.category.${category.id}`)}</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                            {category.presets.map((preset) => (
                                                <PresetCard
                                                    key={preset.name}
                                                    preset={preset}
                                                    isActive={currentPreset.name === preset.name}
                                                    onClick={() => handlePresetChange(preset)}
                                                    onHover={() => handlePresetHover(preset)}
                                                    onLeave={handlePresetLeave}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>,
                    (document.fullscreenElement as HTMLElement | null) || document.body
                )}

        </>
    );
};

export default EnhancedStyleSwitcher;

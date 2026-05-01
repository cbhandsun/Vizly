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
    FlowStylePreset,
    StylePresetCategory,
    STYLE_CATEGORIES,
} from '@/core';
import { useDiagramStylePreset_v2 } from '@/core/hooks/useDiagramStylePreset_v2';
import { theme } from 'antd';

export interface EnhancedStyleSwitcherProps {
    size?: 'sm' | 'md';
    className?: string;
    style?: React.CSSProperties;
    borderless?: boolean;
}

/**
 * 迷你预览渲染器
 */
const StylePreviewMini: React.FC<{ preset: FlowStylePreset; size?: 'sm' | 'md' }> = ({
    preset,
    size = 'sm',
}) => {
    const width = size === 'sm' ? 42 : 100;
    const height = size === 'sm' ? 22 : 60;
    
    const nodeStyle = preset.node;
    const mainEdge = preset.edges.main;
    const statusEdge = preset.edges.status;

    const nodeWidth = size === 'sm' ? 10 : 28;
    const nodeHeight = size === 'sm' ? 8 : 20;
    const nodeRadius = Math.min(nodeStyle.radius / (size === 'sm' ? 4 : 2), nodeHeight / 2);
    const strokeWidth = Math.max(nodeStyle.borderWidth / (size === 'sm' ? 2.5 : 1.5), 0.5);

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="overflow-visible"
        >
            <defs>
                <filter id={`shadow-${preset.name}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation={nodeStyle.shadow === 'strong' ? 2 : 1} result="blur" />
                    <feOffset dx="0" dy="1" result="offsetBlur" />
                    <feComponentTransfer><feFuncA type="linear" slope={nodeStyle.shadow === 'none' ? 0 : 0.15} /></feComponentTransfer>
                    <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
            
            <path
                d={`M ${width * 0.2} ${height * 0.5} L ${width * 0.8} ${height * 0.5}`}
                stroke={mainEdge.color}
                strokeWidth={mainEdge.width / (size === 'sm' ? 2 : 1.5)}
                strokeLinecap="round"
            />
            
            <path
                d={`M ${width * 0.2} ${height * 0.5 - (size === 'sm' ? 4 : 10)} L ${width * 0.8} ${height * 0.5 - (size === 'sm' ? 4 : 10)}`}
                stroke={statusEdge.color}
                strokeWidth={statusEdge.width / (size === 'sm' ? 2.5 : 2)}
                strokeDasharray={statusEdge.dash ? (size === 'sm' ? "2 2" : "3 2") : "none"}
                opacity="0.5"
            />

            {[0.2, 0.8].map((pos, idx) => {
                const x = width * pos - nodeWidth / 2;
                const y = height * 0.5 - nodeHeight / 2;
                const color = idx === 0 ? mainEdge.color : statusEdge.color;
                
                return (
                    <g key={idx} filter={`url(#shadow-${preset.name})`}>
                        <rect
                            x={x} y={y} width={nodeWidth} height={nodeHeight} rx={nodeRadius}
                            fill="white" stroke={color} strokeWidth={strokeWidth}
                        />
                        {nodeStyle.accentBar && size === 'md' && (
                            <rect
                                x={x} y={y} 
                                width={nodeStyle.accentBar.position === 'left' ? 3 : nodeWidth}
                                height={nodeStyle.accentBar.position === 'left' ? nodeHeight : 3}
                                rx={1} fill={color} opacity={nodeStyle.accentBar.alpha}
                            />
                        )}
                    </g>
                );
            })}
        </svg>
    );
};

/**
 * 预设卡片组件 - 采用横向布局，解决视觉重心不稳问题
 */
const PresetCard: React.FC<{
    preset: FlowStylePreset;
    isActive: boolean;
    onClick: () => void;
}> = ({ preset, isActive, onClick }) => {
    const { t } = useTranslation();
    return (
        <div
            className={`group relative flex flex-row items-center gap-6 p-5 transition-all duration-400 rounded-2xl cursor-pointer border ${
                isActive 
                ? 'glass-pulse-glow bg-white/80 dark:bg-black/60 border-blue-500/50 shadow-lg' 
                : 'bg-white/30 dark:bg-white/5 border-white/20 dark:border-white/10 hover:bg-white/50 dark:hover:bg-white/10 hover:border-blue-400/30 hover:translate-x-1 hover:shadow-xl'
            }`}
            onClick={onClick}
        >
            {/* 左侧图例区 */}
            <div className="flex-none flex items-center justify-center w-24 h-20 rounded-xl bg-gray-50/80 dark:bg-black/30 border border-black/[0.03] dark:border-white/[0.05] overflow-hidden transition-all group-hover:scale-105">
                <StylePreviewMini preset={preset} size="md" />
            </div>
            
            {/* 右侧信息区 */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold text-gray-900 dark:text-gray-100 tracking-tight truncate">
                        {t(`style.preset.${preset.name}`)}
                    </span>
                    {isActive && <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center"><FaCheck className="text-white w-2 h-2" /></div>}
                </div>
                <div className="text-[13px] leading-snug text-gray-500 dark:text-gray-400 font-medium line-clamp-2 opacity-80">
                    {preset.description}
                </div>
            </div>
            
            {/* 激活时的背景微光 */}
            {isActive && <div className="absolute inset-0 bg-blue-500/[0.03] rounded-2xl pointer-events-none" />}
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
    borderless = false,
}) => {
    const { t } = useTranslation();
    const currentPreset = useDiagramStylePreset_v2();
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <>
            {/* 触发按钮 */}
            <button
                className={`flex items-center justify-between gap-2.5 h-10 px-3.5 text-[13px] font-semibold transition-all rounded-xl ${
                    borderless 
                    ? 'bg-transparent border-none' 
                    : 'bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 hover:border-blue-400/50 hover:bg-white/80 shadow-sm backdrop-blur-md'
                } text-gray-700 dark:text-gray-200 pointer-events-auto w-full ${className}`}
                onClick={() => setIsOpen(!isOpen)}
                style={style}
            >
                <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="flex-shrink-0 bg-gray-100/50 dark:bg-white/5 rounded-md p-0.5">
                        <StylePreviewMini preset={currentPreset} size="sm" />
                    </div>
                    <span className="truncate">{t(`style.preset.${currentPreset.name}`)}</span>
                </span>
                <svg className="flex-shrink-0 text-gray-400 w-3.5 h-3.5 transition-transform duration-300" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            {/* 弹出面板 - Hyper-Glass V3 */}
            {isOpen &&
                createPortal(
                    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 sm:p-8 bg-black/40 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setIsOpen(false)}>
                        <div
                            className="relative flex flex-col w-full max-w-6xl max-h-[85vh] rounded-[24px] bg-white/75 dark:bg-[#1C1C29]/70 backdrop-blur-3xl backdrop-saturate-150 border border-white/60 dark:border-white/10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.35)] overflow-hidden animate-in zoom-in-98 duration-500 pointer-events-auto"
                            ref={panelRef}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* 面板头部 */}
                            <div className="flex-none px-10 py-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                        <FaPalette className="text-white text-lg" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{t('style.switcher.title')}</h2>
                                        <p className="text-[12px] text-gray-400 font-bold opacity-60 uppercase tracking-widest">Visual Identity Schemes</p>
                                    </div>
                                </div>
                                <button
                                    className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all cursor-pointer group"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <FaTimes size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                                </button>
                            </div>

                            {/* 内容区 - 扎紧垂直间距 */}
                            <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col items-center">
                                <div className="w-full max-w-5xl px-20 py-12 flex flex-col gap-14">
                                    {categories.map((category) => (
                                        <div key={category.id} className="flex flex-col gap-6">
                                            <div className="flex items-center gap-6">
                                                <h4 className="text-[11px] font-black tracking-[0.4em] text-blue-500 uppercase whitespace-nowrap">{t(`style.category.${category.id}`)}</h4>
                                                <div className="h-[1px] w-full bg-gradient-to-r from-blue-500/20 via-blue-500/5 to-transparent" />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                                                {category.presets.map((preset) => (
                                                    <PresetCard
                                                        key={preset.name}
                                                        preset={preset}
                                                        isActive={currentPreset.name === preset.name}
                                                        onClick={() => handlePresetChange(preset)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>,
                    (document.getElementById('app-root-layout') || document.body)
                )}
        </>
    );
};

export default EnhancedStyleSwitcher;

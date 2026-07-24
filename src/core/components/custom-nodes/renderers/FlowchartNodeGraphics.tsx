import React, { useRef, useEffect, useMemo } from 'react';
import rough from 'roughjs';
import { hexToRgba } from '../../shared/layoutUtils';
import type { FlowchartShape } from '../FlowchartNode';
import type { FlowchartNodeData } from '../hooks/useFlowchartNodeStyleResolution';
import type { FlowStylePreset } from '../../shared/DiagramStyleManager';

export interface FlowchartNodeGraphicsProps {
    id: string;
    shape: FlowchartShape;
    data: FlowchartNodeData;
    preset: FlowStylePreset;
    selected: boolean;
    isHovered: boolean;
    nodeWidth: number;
    nodeHeight: number;
    computedRadius: number;
    mainColor: string;
    finalBorderColor: string;
    finalBgColor: string;
}

export const FlowchartNodeGraphics: React.FC<FlowchartNodeGraphicsProps> = ({
    id,
    shape,
    data,
    preset,
    selected,
    isHovered,
    nodeWidth,
    nodeHeight,
    computedRadius,
    mainColor,
    finalBorderColor,
    finalBgColor,
}) => {
    const accent = preset.node.accentBar;
    const sketchRef = useRef<SVGGElement>(null);

    const isSketch = preset.name === 'sketch';

    // roughjs 绘制参数（memo 化避免不必要的重绘）
    const roughOpts = useMemo(() => ({
        stroke: finalBorderColor,
        strokeWidth: selected ? preset.node.borderWidth + 1 : preset.node.borderWidth,
        fill: finalBgColor !== 'white' && finalBgColor !== '#FFFFFF' ? finalBgColor : 'rgba(0,0,0,0)',
        fillStyle: 'hachure' as const,
        roughness: 1.5,
        bowing: 1,
    }), [finalBorderColor, finalBgColor, selected, preset.node.borderWidth]);

    const thinLineOpts = useMemo(() => ({
        stroke: finalBorderColor,
        strokeWidth: 1,
        roughness: 1.5,
        bowing: 1,
    }), [finalBorderColor]);

    // ── Sketch 模式：使用 roughjs 直接生成 SVG 元素 ──
    useEffect(() => {
        if (!isSketch || !sketchRef.current) return;
        const g = sketchRef.current;
        // 需要一个临时的父 SVG 来初始化 rough.svg()
        const parentSvg = g.ownerSVGElement;
        if (!parentSvg) return;
        const rc = rough.svg(parentSvg);

        // 清空之前的内容
        while (g.firstChild) g.removeChild(g.firstChild);

        // 辅助：将 "50,0 100,50 ..." 格式的 points 转为 path d 字符串
        const pointsToPath = (pts: string): string => {
            const coords = pts.trim().split(/\s+/).map(p => p.split(',').map(Number));
            return 'M ' + coords.map(c => c.join(' ')).join(' L ') + ' Z';
        };

        switch (shape) {
            case 'diamond':
                g.appendChild(rc.path(pointsToPath('50,0 100,50 50,100 0,50'), roughOpts));
                break;
            case 'pill':
                g.appendChild(rc.rectangle(0, 0, 100, 100, roughOpts));
                break;
            case 'parallelogram':
                g.appendChild(rc.path(pointsToPath('20,100 100,100 80,0 0,0'), roughOpts));
                break;
            case 'database':
                g.appendChild(rc.path('M0,15 L0,85 C0,95 22,100 50,100 C78,100 100,95 100,85 L100,15', roughOpts));
                g.appendChild(rc.ellipse(50, 15, 100, 30, roughOpts));
                break;
            case 'ellipse':
                g.appendChild(rc.ellipse(50, 50, 100, 70, roughOpts));
                break;
            case 'circle':
                g.appendChild(rc.circle(50, 50, 90, roughOpts));
                break;
            case 'triangle':
                g.appendChild(rc.path(pointsToPath('50,0 100,100 0,100'), roughOpts));
                break;
            case 'hexagon':
            case 'preparation':
                g.appendChild(rc.path(pointsToPath('25,0 75,0 100,50 75,100 25,100 0,50'), roughOpts));
                break;
            case 'star':
                g.appendChild(rc.path(pointsToPath('50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35'), roughOpts));
                break;
            case 'document':
                g.appendChild(rc.path('M10,0 L90,0 L90,75 Q70,100 50,75 Q30,50 10,75 L10,0', roughOpts));
                break;
            case 'cloud':
                g.appendChild(rc.path('M25,60 A20,20 0 0,1 25,20 A15,15 0 0,1 45,20 A25,25 0 0,1 75,20 A20,20 0 0,1 95,40 A15,15 0 0,1 95,70 A15,15 0 0,1 75,80 L25,80 A20,20 0 0,1 25,60', roughOpts));
                break;
            case 'manual-input':
                g.appendChild(rc.path(pointsToPath('100,20 100,100 0,100 0,0'), roughOpts));
                break;
            case 'delay':
                g.appendChild(rc.path('M0,0 L70,0 A30,50 0 0,1 70,100 L0,100 L0,0', roughOpts));
                break;
            case 'display':
                g.appendChild(rc.path('M20,0 L80,0 A20,50 0 0,1 80,100 L20,100 L0,50 L20,0', roughOpts));
                break;
            case 'note':
                g.appendChild(rc.path('M0,0 L70,0 L100,30 L100,100 L0,100 Z', roughOpts));
                g.appendChild(rc.path('M70,0 L70,30 L100,30', thinLineOpts));
                break;
            case 'trapezoid':
                g.appendChild(rc.path(pointsToPath('10,0 90,0 100,100 0,100'), roughOpts));
                break;
            case 'predefined-process':
                g.appendChild(rc.rectangle(0, 0, 100, 100, roughOpts));
                g.appendChild(rc.line(12, 0, 12, 100, thinLineOpts));
                g.appendChild(rc.line(88, 0, 88, 100, thinLineOpts));
                break;
            case 'multi-document':
                g.appendChild(rc.path('M5,5 L85,5 L85,70 Q65,95 45,70 Q25,45 5,70 Z', { ...roughOpts, fill: undefined }));
                g.appendChild(rc.path('M10,10 L90,10 L90,75 Q70,100 50,75 Q30,50 10,75 Z', roughOpts));
                break;
            case 'off-page':
                g.appendChild(rc.path(pointsToPath('0,0 100,0 100,70 50,100 0,70'), roughOpts));
                break;
            case 'internal-storage':
                g.appendChild(rc.rectangle(0, 0, 100, 100, roughOpts));
                g.appendChild(rc.line(15, 0, 15, 100, thinLineOpts));
                g.appendChild(rc.line(0, 15, 100, 15, thinLineOpts));
                break;
            case 'rectangle':
            default:
                g.appendChild(rc.rectangle(0, 0, 100, 100, roughOpts));
                break;
        }
    }, [isSketch, shape, roughOpts, thinLineOpts]);

    // ── 风格预设：accentBar（强调条）──
    const renderAccentBar = () => {
        if (!accent) return null;
        const isNonRect = shape !== 'rectangle';
        if (isNonRect) return null; // 非矩形节点不渲染装饰条
        const widthPx = Math.round((accent.width || 6) * (selected ? 1.15 : isHovered ? 1.1 : 1));
        const baseAlpha = Math.max(0, Math.min(1, (accent.alpha ?? 0.3) * (selected ? 1.25 : isHovered ? 1.15 : 1)));
        const solidColor = hexToRgba(mainColor, baseAlpha);
        const gradient = `linear-gradient(${accent.position === 'left' ? '180deg' : '90deg'}, ${hexToRgba(mainColor, baseAlpha + 0.1)} 0%, ${hexToRgba(mainColor, Math.max(0, baseAlpha - 0.1))} 100%)`;
        const dashed = accent.position === 'left'
            ? `repeating-linear-gradient(180deg, ${solidColor} 0px, ${solidColor} 6px, transparent 6px, transparent 12px)`
            : `repeating-linear-gradient(90deg, ${solidColor} 0px, ${solidColor} 6px, transparent 6px, transparent 12px)`;
        const background = accent.variant === 'gradient' ? gradient : (accent.variant === 'dashed' ? dashed : solidColor);
        const r = preset.node.radius || 8;
        const style: React.CSSProperties = accent.position === 'left'
            ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${widthPx}px`, background, borderTopLeftRadius: `${r}px`, borderBottomLeftRadius: `${r}px`, pointerEvents: 'none', zIndex: 2 }
            : { position: 'absolute', left: 0, right: 0, top: 0, height: `${widthPx}px`, background, borderTopLeftRadius: `${r}px`, borderTopRightRadius: `${r}px`, pointerEvents: 'none', zIndex: 2 };
        return <div style={style} />;
    };

    // ── 风格预设：statusStripe（状态条）──
    const renderStatusStripe = () => {
        const stripe = preset.node.statusStripe;
        if (!stripe || accent) return null; // 与 accentBar 互斥
        const isNonRect = shape !== 'rectangle';
        if (isNonRect) return null;
        const r = preset.node.radius || 8;
        const alpha = Math.max(0, Math.min(1, stripe.alpha ?? 0.3));
        const style: React.CSSProperties = {
            position: 'absolute', left: 0, right: 0, top: 0,
            height: `${Math.max(2, stripe.height || 3)}px`,
            background: hexToRgba(mainColor, alpha),
            borderTopLeftRadius: `${r}px`, borderTopRightRadius: `${r}px`,
            pointerEvents: 'none', zIndex: 2,
        };
        return <div style={style} />;
    };

    // ── 非 Sketch 模式：标准 SVG 渲染 ──
    const renderStandardShape = () => {
        const gradient = data.style?.gradient;
        const gradientId = `gradient-${id}`;

        const commonProps = {
            className: "flowchart-shape",
            vectorEffect: 'non-scaling-stroke' as const,
            ...(gradient ? { fill: `url(#${gradientId})` } : {}),
        };

        const gradientCoords = gradient ? (() => {
            switch (gradient.direction) {
                case 'horizontal': return { x1: '0%', y1: '0%', x2: '100%', y2: '0%' };
                case 'diagonal': return { x1: '0%', y1: '0%', x2: '100%', y2: '100%' };
                case 'vertical':
                default: return { x1: '0%', y1: '0%', x2: '0%', y2: '100%' };
            }
        })() : null;

        const gradientDef = gradient && gradientCoords ? (
            <defs>
                <linearGradient id={gradientId} {...gradientCoords}>
                    <stop offset="0%" stopColor={gradient.from} />
                    <stop offset="100%" stopColor={gradient.to} />
                </linearGradient>
            </defs>
        ) : null;

        const rectRx = Math.max(0.1, (computedRadius / Math.max(nodeWidth, 1)) * 100);
        const rectRy = Math.max(0.1, (computedRadius / Math.max(nodeHeight, 1)) * 100);

        switch (shape) {
            case 'diamond':
                return <>{gradientDef}<polygon points="50,0 100,50 50,100 0,50" {...commonProps} /></>;
            case 'pill':
                return <>{gradientDef}<rect x="0" y="0" width="100" height="100" rx="50" ry="50" {...commonProps} /></>;
            case 'parallelogram':
                return <>{gradientDef}<polygon points="20,100 100,100 80,0 0,0" {...commonProps} /></>;
            case 'database':
                return (
                    <g className="flowchart-shape-group">
                        <path d="M0,15 L0,85 C0,95 22,100 50,100 C78,100 100,95 100,85 L100,15" className="flowchart-shape-bg" />
                        <path d="M0,15 L0,85 C0,95 22,100 50,100 C78,100 100,95 100,85 L100,15" fill="none" className="flowchart-shape-stroke" />
                        <ellipse cx="50" cy="15" rx="50" ry="15" className="flowchart-shape" />
                        <path d="M0,15 C0,25 22,30 50,30 C78,30 100,25 100,15" fill="none" className="flowchart-shape-stroke" />
                    </g>
                );
            case 'ellipse':
                return <>{gradientDef}<ellipse cx="50" cy="50" rx="50" ry="35" {...commonProps} /></>;
            case 'circle':
                return <>{gradientDef}<circle cx="50" cy="50" r="45" {...commonProps} /></>;
            case 'triangle':
                return <>{gradientDef}<polygon points="50,0 100,100 0,100" {...commonProps} /></>;
            case 'hexagon':
            case 'preparation':
                return <>{gradientDef}<polygon points="25,0 75,0 100,50 75,100 25,100 0,50" {...commonProps} /></>;
            case 'star':
                return <>{gradientDef}<polygon points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35" {...commonProps} /></>;
            case 'document':
                return <>{gradientDef}<path d="M10,0 L90,0 L90,75 Q70,100 50,75 Q30,50 10,75 L10,0" {...commonProps} /></>;
            case 'cloud':
                return <>{gradientDef}<path d="M25,60 A20,20 0 0,1 25,20 A15,15 0 0,1 45,20 A25,25 0 0,1 75,20 A20,20 0 0,1 95,40 A15,15 0 0,1 95,70 A15,15 0 0,1 75,80 L25,80 A20,20 0 0,1 25,60" {...commonProps} /></>;
            case 'manual-input':
                return <>{gradientDef}<polygon points="100,20 100,100 0,100 0,0" {...commonProps} /></>;
            case 'delay':
                return <>{gradientDef}<path d="M0,0 L70,0 A30,50 0 0,1 70,100 L0,100 L0,0" {...commonProps} /></>;
            case 'display':
                return <>{gradientDef}<path d="M20,0 L80,0 A20,50 0 0,1 80,100 L20,100 L0,50 L20,0" {...commonProps} /></>;
            case 'note':
                return (
                    <g className="flowchart-shape-group">
                        <path d="M0,0 L70,0 L100,30 L100,100 L0,100 L0,0" className="flowchart-shape-bg" vectorEffect="non-scaling-stroke" />
                        <path d="M70,0 L70,30 L100,30" fill="none" className="flowchart-shape-stroke" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    </g>
                );
            case 'trapezoid':
                return <>{gradientDef}<polygon points="10,0 90,0 100,100 0,100" {...commonProps} /></>;
            case 'predefined-process':
                return (
                    <g className="flowchart-shape-group">
                        {gradientDef}
                        <rect x="0" y="0" width="100" height="100" rx={rectRx} ry={rectRy} {...commonProps} />
                        <line x1="12" y1="0" x2="12" y2="100" className="flowchart-shape-stroke" vectorEffect="non-scaling-stroke" />
                        <line x1="88" y1="0" x2="88" y2="100" className="flowchart-shape-stroke" vectorEffect="non-scaling-stroke" />
                    </g>
                );
            case 'multi-document':
                return (
                    <g className="flowchart-shape-group">
                        {gradientDef}
                        <path d="M10,10 L90,10 L90,75 Q70,100 50,75 Q30,50 10,75 L10,10" className="flowchart-shape-bg" vectorEffect="non-scaling-stroke" />
                        <path d="M5,5 L85,5 L85,70 Q65,95 45,70 Q25,45 5,70 L5,5" fill="none" className="flowchart-shape-stroke" vectorEffect="non-scaling-stroke" />
                        <path d="M10,10 L90,10 L90,75 Q70,100 50,75 Q30,50 10,75 L10,10" {...commonProps} />
                    </g>
                );
            case 'off-page':
                return <>{gradientDef}<polygon points="0,0 100,0 100,70 50,100 0,70" {...commonProps} /></>;
            case 'internal-storage':
                return (
                    <g className="flowchart-shape-group">
                        {gradientDef}
                        <rect x="0" y="0" width="100" height="100" rx={rectRx} ry={rectRy} {...commonProps} />
                        <line x1="15" y1="0" x2="15" y2="100" className="flowchart-shape-stroke" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1="15" x2="100" y2="15" className="flowchart-shape-stroke" vectorEffect="non-scaling-stroke" />
                    </g>
                );
            case 'rectangle':
            default:
                return <>{gradientDef}<rect x="0" y="0" width="100" height="100" rx={rectRx} ry={rectRy} {...commonProps} /></>;
        }
    };

    return (
        <>
            {renderAccentBar()}
            {renderStatusStripe()}
            <svg
                className="flowchart-svg-layer"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                {isSketch ? <g ref={sketchRef} /> : renderStandardShape()}
            </svg>
        </>
    );
};

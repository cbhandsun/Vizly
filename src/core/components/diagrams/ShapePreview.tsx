import React from 'react';
import type { FlowchartShape } from '../custom-nodes/FlowchartNode';

interface ShapePreviewProps {
    shape: FlowchartShape;
    size?: number;
    color?: string;
    strokeWidth?: number;
}

/**
 * Lightweight SVG shape thumbnail for the sidebar palette.
 * Reuses the same geometry as FlowchartNode's renderShape().
 */
export const ShapePreview: React.FC<ShapePreviewProps> = ({
    shape,
    size = 32,
    color = '#5B8DEF',
    strokeWidth = 1.5,
}) => {
    // 🎨 将 hex 转为低透明度 rgba 用于浅色填充
    const hexToFill = (hex: string) => {
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.08)`;
    };
    const fill = hexToFill(color);
    const common = { fill, stroke: color, strokeWidth, vectorEffect: 'non-scaling-stroke' as const };

    const renderPath = () => {
        switch (shape) {
            case 'rectangle':
                return <rect x="8" y="15" width="84" height="70" rx="6" ry="6" {...common} />;
            case 'pill':
                return <rect x="5" y="20" width="90" height="60" rx="30" ry="30" {...common} />;
            case 'diamond':
                return <polygon points="50,5 95,50 50,95 5,50" {...common} />;
            case 'parallelogram':
                return <polygon points="25,90 95,90 75,10 5,10" {...common} />;
            case 'database':
                return (
                    <g>
                        <path d="M10,25 L10,75 C10,85 30,92 50,92 C70,92 90,85 90,75 L90,25" {...common} />
                        <ellipse cx="50" cy="25" rx="40" ry="15" {...common} />
                    </g>
                );
            case 'ellipse':
                return <ellipse cx="50" cy="50" rx="45" ry="30" {...common} />;
            case 'circle':
                return <circle cx="50" cy="50" r="40" {...common} />;
            case 'triangle':
                return <polygon points="50,8 95,92 5,92" {...common} />;
            case 'hexagon':
            case 'preparation':
                return <polygon points="25,5 75,5 98,50 75,95 25,95 2,50" {...common} />;
            case 'star':
                return <polygon points="50,5 61,35 95,35 68,55 79,88 50,68 21,88 32,55 5,35 39,35" {...common} />;
            case 'document':
                return <path d="M10,8 L90,8 L90,72 Q70,98 50,72 Q30,46 10,72 L10,8 Z" {...common} />;
            case 'cloud':
                return <path d="M25,65 A20,20 0 0,1 25,25 A15,15 0 0,1 45,25 A25,25 0 0,1 75,25 A20,20 0 0,1 92,42 A15,15 0 0,1 92,68 A15,15 0 0,1 75,80 L25,80 A20,20 0 0,1 25,65" {...common} />;
            case 'manual-input':
                return <polygon points="95,22 95,92 5,92 5,5" {...common} />;
            case 'delay':
                return <path d="M8,8 L65,8 A35,42 0 0,1 65,92 L8,92 Z" {...common} />;
            case 'display':
                return <path d="M25,8 L75,8 A20,42 0 0,1 75,92 L25,92 L5,50 Z" {...common} />;
            case 'note':
                return (
                    <g>
                        <path d="M8,8 L70,8 L92,30 L92,92 L8,92 Z" {...common} />
                        <path d="M70,8 L70,30 L92,30" {...common} />
                    </g>
                );
            case 'trapezoid':
                return <polygon points="15,8 85,8 95,92 5,92" {...common} />;
            case 'predefined-process':
                return (
                    <g>
                        <rect x="5" y="15" width="90" height="70" rx="3" ry="3" {...common} />
                        <line x1="17" y1="15" x2="17" y2="85" {...common} />
                        <line x1="83" y1="15" x2="83" y2="85" {...common} />
                    </g>
                );
            case 'multi-document':
                return (
                    <g>
                        <path d="M5,5 L80,5 L80,65 Q63,88 46,65 Q29,42 12,65 L5,65 Z" {...common} opacity={0.4} />
                        <path d="M15,15 L90,15 L90,75 Q73,98 56,75 Q39,52 22,75 L15,75 Z" {...common} />
                    </g>
                );
            case 'off-page':
                return <polygon points="10,8 90,8 90,65 50,92 10,65" {...common} />;
            case 'internal-storage':
                return (
                    <g>
                        <rect x="8" y="8" width="84" height="84" rx="3" ry="3" {...common} />
                        <line x1="22" y1="8" x2="22" y2="92" {...common} />
                        <line x1="8" y1="22" x2="92" y2="22" {...common} />
                    </g>
                );
            default:
                return <rect x="8" y="15" width="84" height="70" rx="6" ry="6" {...common} />;
        }
    };

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            style={{ flexShrink: 0 }}
        >
            {renderPath()}
        </svg>
    );
};
